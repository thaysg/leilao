"""External item catalogue: Art Institute of Chicago public API (no key required).

Resilience (the brief: "the storefront, rooms, audit and receipt must keep working if the API is down"):
  1. A lot stores a full SNAPSHOT of its item, so nothing outside "search items / create lot" ever calls the API.
  2. Responses are cached in the database (fresh for a few minutes, served STALE when the API fails).
  3. Short timeout + one retry, and a circuit breaker that skips the API for 30 s after repeated failures.
  4. When there is no cache and the API is down, the seller sees a clear 503 message, nothing else breaks.
"""
import time
from dataclasses import dataclass, field
from datetime import timedelta

import httpx
from sqlalchemy.orm import Session

from ..config import settings
from ..errors import ApiError
from ..models import ExternalCache, utcnow

BASE = "https://api.artic.edu/api/v1"
FIELDS = ("id,title,artist_display,date_display,medium_display,place_of_origin,image_id,"
          "dimensions,classification_title,style_title,short_description")
SOURCE = "artic"


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


def _to_item(raw: dict, iiif: str) -> ItemDTO | None:
    if not raw.get("id") or not raw.get("title") or not raw.get("image_id"):
        return None  # only items with an image make good lots
    img = raw["image_id"]
    attrs = {
        "Artista": raw.get("artist_display"), "Data": raw.get("date_display"), "Técnica": raw.get("medium_display"),
        "Origem": raw.get("place_of_origin"), "Dimensões": raw.get("dimensions"),
        "Classificação": raw.get("classification_title"), "Estilo": raw.get("style_title"),
    }
    return ItemDTO(external_id=str(raw["id"]), title=raw["title"],
                   image_url=f"{iiif}/{img}/full/843,/0/default.jpg",
                   thumb_url=f"{iiif}/{img}/full/400,/0/default.jpg",
                   description=(raw.get("short_description") or "")[:1000],
                   attributes={k: v for k, v in attrs.items() if v})


def _fetch(path: str, params: dict) -> dict:
    if time.monotonic() < _Breaker.open_until:
        raise RuntimeError("circuit open")
    last: Exception | None = None
    for _ in range(2):
        try:
            r = httpx.get(f"{BASE}{path}", params=params, timeout=settings.external_timeout_seconds,
                          headers={"AIC-User-Agent": "leilao-verzel-test"})
            r.raise_for_status()
            _Breaker.failures = 0
            return r.json()
        except Exception as exc:  # timeouts, 429, 5xx, DNS...
            last = exc
    _Breaker.failures += 1
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
    key = f"search:{q.lower()}:{page}:{limit}"

    def load():
        data = _fetch("/artworks/search", {"q": q, "page": page, "limit": limit, "fields": FIELDS})
        iiif = data.get("config", {}).get("iiif_url", "https://www.artic.edu/iiif/2")
        items = [i.to_dict() for raw in data.get("data", []) if (i := _to_item(raw, iiif))]
        return {"items": items, "total": data.get("pagination", {}).get("total", len(items))}

    payload, stale = _cached(db, key, load)
    for it in payload["items"]:  # remember each item so a lot can be created even if the API drops right after
        if not db.get(ExternalCache, f"item:{it['external_id']}"):
            db.add(ExternalCache(key=f"item:{it['external_id']}", payload=it, fetched_at=utcnow()))
    db.commit()
    return {**payload, "stale": stale, "page": page}


def get_item(db: Session, external_id: str) -> ItemDTO:
    def load():
        data = _fetch(f"/artworks/{external_id}", {"fields": FIELDS})
        iiif = data.get("config", {}).get("iiif_url", "https://www.artic.edu/iiif/2")
        item = _to_item(data.get("data", {}), iiif)
        if not item:
            raise ValueError("item without image")
        return item.to_dict()

    # item snapshots are effectively immutable: prefer the cache regardless of age
    row = db.get(ExternalCache, f"item:{external_id}")
    payload = row.payload if row else _cached(db, f"item:{external_id}", load)[0]
    return ItemDTO(**payload)
