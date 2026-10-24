"""External item catalogue: Cleveland Museum of Art Open Access API (public, CC0, no key required).
Docs: https://openaccess-api.clevelandart.org/

(The first choice, the Art Institute of Chicago API, sits behind a Cloudflare bot challenge that rejects server-side
requests with 403, so it cannot be used from a backend or a cloud deploy.)

Resilience (the brief: "the storefront, rooms, audit and receipt must keep working if the API is down"):
  1. A lot stores a full SNAPSHOT of its item, so nothing outside "search items / create lot" ever calls the API.
  2. Responses are cached in the database (fresh for a few minutes, served STALE when the API fails).
  3. Short timeout + one retry, and a circuit breaker that skips the API for 30 s after repeated failures.
  4. When there is no cache and the API is down, the seller sees a clear 503 message, nothing else breaks.
"""
import re
import time
from dataclasses import dataclass, field
from datetime import timedelta

import httpx
from sqlalchemy.orm import Session

from ..config import settings
from ..errors import ApiError
from ..models import ExternalCache, utcnow

BASE = "https://openaccess-api.clevelandart.org/api"
FIELDS = "id,title,creation_date,technique,type,culture,department,measurements,description,creators,images"
SOURCE = "cma"


@dataclass
class ItemDTO:
    external_id: str
    title: str
    image_url: str | None
    thumb_url: str | None
    description: str = ""
    attributes: dict = field(default_factory=dict)
    source: str = SOURCE

    def to_dict(self) -> dict:
        return self.__dict__.copy()


class _Breaker:
    failures = 0
    open_until = 0.0
    last_error = ""  # human-readable reason of the last failure (shown by the seed script)


def _plain(text: str | None, limit: int = 1000) -> str:
    return re.sub(r"\s+", " ", re.sub(r"<[^>]+>", " ", text or "")).strip()[:limit]


def _to_item(raw: dict) -> ItemDTO | None:
    web = ((raw.get("images") or {}).get("web") or {}).get("url")
    if not raw.get("id") or not raw.get("title") or not web:
        return None  # only items with a picture make good lots
    creators = "; ".join(c.get("description", "") for c in (raw.get("creators") or []) if c.get("description"))
    culture = raw.get("culture")
    attrs = {
        "Artista": creators, "Data": raw.get("creation_date"), "Técnica": raw.get("technique"),
        "Tipo": raw.get("type"), "Origem": ", ".join(culture) if isinstance(culture, list) else culture,
        "Dimensões": raw.get("measurements"), "Departamento": raw.get("department"),
    }
    return ItemDTO(external_id=str(raw["id"]), title=raw["title"].strip(), image_url=web, thumb_url=web,
                   description=_plain(raw.get("description")),
                   attributes={k: str(v) for k, v in attrs.items() if v})


def _fetch(path: str, params: dict) -> dict:
    if time.monotonic() < _Breaker.open_until:
        raise RuntimeError("circuit open")
    last: Exception | None = None
    for _ in range(2):
        try:
            r = httpx.get(f"{BASE}{path}", params=params, timeout=settings.external_timeout_seconds,
                          headers={"User-Agent": "leilao-verzel-test/1.0", "Accept": "application/json"})
            r.raise_for_status()
            _Breaker.failures = 0
            return r.json()
        except Exception as exc:  # timeouts, 429, 5xx, DNS...
            last = exc
    _Breaker.failures += 1
    _Breaker.last_error = f"{type(last).__name__}: {last}"
    if _Breaker.failures >= 2:
        _Breaker.open_until = time.monotonic() + 30
    raise RuntimeError(str(last))


def _cached(db: Session, key: str, loader):
    row = db.get(ExternalCache, key)
    fresh = row and utcnow() - row.fetched_at < timedelta(seconds=settings.external_cache_ttl_seconds)
    if fresh:
        return row.payload, False
    try:
        payload = loader()
    except Exception:
        if row:
            return row.payload, True  # stale beats nothing
        raise ApiError("external_unavailable",
                       "A API de itens está indisponível no momento. Tente novamente em instantes.", 503)
    if row:
        row.payload, row.fetched_at = payload, utcnow()
    else:
        db.add(ExternalCache(key=key, payload=payload, fetched_at=utcnow()))
    db.commit()
    return payload, False


def search_items(db: Session, q: str, page: int = 1, limit: int = 12) -> dict:
    q = (q or "").strip() or "painting"
    key = f"search:{SOURCE}:{q.lower()}:{page}:{limit}"

    def load():
        data = _fetch("/artworks/", {"q": q, "has_image": 1, "limit": limit, "skip": (page - 1) * limit, "fields": FIELDS})
        items = [i.to_dict() for raw in data.get("data", []) if (i := _to_item(raw))]
        return {"items": items, "total": data.get("info", {}).get("total", len(items))}

    payload, stale = _cached(db, key, load)
    for it in payload["items"]:  # remember each item so a lot can be created even if the API drops right after
        if not db.get(ExternalCache, f"item:{SOURCE}:{it['external_id']}"):
            db.add(ExternalCache(key=f"item:{SOURCE}:{it['external_id']}", payload=it, fetched_at=utcnow()))
    db.commit()
    return {**payload, "stale": stale, "page": page}


def get_item(db: Session, external_id: str) -> ItemDTO:
    def load():
        data = _fetch(f"/artworks/{external_id}", {"fields": FIELDS})
        item = _to_item(data.get("data", data))
        if not item:
            raise ValueError("item without image")
        return item.to_dict()

    # item snapshots are effectively immutable: prefer the cache regardless of age
    row = db.get(ExternalCache, f"item:{SOURCE}:{external_id}")
    payload = row.payload if row else _cached(db, f"item:{SOURCE}:{external_id}", load)[0]
    return ItemDTO(**payload)