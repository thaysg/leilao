import asyncio
import logging
from contextlib import asynccontextmanager
from pathlib import Path

import anyio
from fastapi import FastAPI, Request
from fastapi.exceptions import RequestValidationError
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse, JSONResponse
from fastapi.staticfiles import StaticFiles

from .config import settings
from .db import Base, SessionLocal, engine
from .errors import ApiError
from .routers import auth, lots, seller
from .services.auction import settle_due

log = logging.getLogger("leilao")


def _settle_once() -> int:
    with SessionLocal() as db:
        return settle_due(db)


async def finalizer_loop() -> None:
    """Settles lots whose end time passed (also done lazily when a lot is opened)."""
    while True:
        try:
            await anyio.to_thread.run_sync(_settle_once)
        except Exception:
            log.exception("finalizer iteration failed")
        await asyncio.sleep(1)


@asynccontextmanager
async def lifespan(app: FastAPI):
    Base.metadata.create_all(engine)
    if settings.seed_on_start:
        from .seed import seed_if_empty
        await anyio.to_thread.run_sync(seed_if_empty)
    task = asyncio.create_task(finalizer_loop()) if settings.run_finalizer else None
    yield
    if task:
        task.cancel()


app = FastAPI(title="Casa de Leilões", lifespan=lifespan)
app.add_middleware(CORSMiddleware, allow_origins=[o.strip() for o in settings.cors_origins.split(",")],
                   allow_methods=["*"], allow_headers=["*"])


@app.exception_handler(ApiError)
async def api_error_handler(_: Request, exc: ApiError):
    return JSONResponse({"code": exc.code, "message": exc.message, **exc.extra}, status_code=exc.status)


@app.exception_handler(RequestValidationError)
async def validation_handler(_: Request, exc: RequestValidationError):
    first = exc.errors()[0] if exc.errors() else {}
    field = ".".join(str(p) for p in first.get("loc", []) if p != "body")
    return JSONResponse({"code": "validation", "message": f"Dado inválido ({field}): {first.get('msg', '')}"},
                        status_code=422)


@app.get("/api/health")
def health():
    return {"ok": True}


app.include_router(auth.router)
app.include_router(lots.router)
app.include_router(seller.router)

# Serve the built React app from the same process (single deploy, no CORS in production).
_dist = Path(settings.frontend_dist) if settings.frontend_dist else None
if _dist and (_dist / "index.html").exists():
    app.mount("/assets", StaticFiles(directory=_dist / "assets"), name="assets")

    @app.get("/{path:path}", include_in_schema=False)
    def spa(path: str):
        if path.startswith("api/"):
            return JSONResponse({"code": "not_found", "message": "Rota não encontrada."}, status_code=404)
        candidate = (_dist / path).resolve()
        if path and candidate.is_file() and _dist.resolve() in candidate.parents:
            return FileResponse(candidate)
        return FileResponse(_dist / "index.html")
