from datetime import datetime

from fastapi import APIRouter, Depends, Query
from pydantic import BaseModel, Field
from sqlalchemy import select
from sqlalchemy.orm import Session, joinedload

from .. import integrity
from ..db import get_db
from ..models import Lot, User, utcnow
from ..security import require_role
from ..services import external
from ..services.auction import MAX_CENTS, cancel_lot, create_lot
from ..views import lot_summary

router = APIRouter(prefix="/api/seller", tags=["seller"])


@router.get("/items")
def search_items(q: str = "", page: int = Query(1, ge=1, le=50), db: Session = Depends(get_db),
                 _: User = Depends(require_role("seller"))):
    return external.search_items(db, q, page)


class LotIn(BaseModel):
    external_id: str = Field(min_length=1, max_length=60)
    start_price_cents: int = Field(gt=0, le=MAX_CENTS)
    min_increment_cents: int = Field(gt=0, le=MAX_CENTS)
    starts_at: datetime
    ends_at: datetime
    title: str | None = Field(default=None, min_length=2, max_length=300)  # optional custom lot title


@router.post("/lots")
def new_lot(body: LotIn, db: Session = Depends(get_db), seller: User = Depends(require_role("seller"))):
    item = external.get_item(db, body.external_id)  # snapshot: taken from cache/API, never from the client
    if body.title:
        item.title = body.title.strip()
    lot = create_lot(db, seller, item, body.start_price_cents, body.min_increment_cents, body.starts_at, body.ends_at)
    return lot_summary(lot, utcnow()) | {"seller_name": seller.name}


@router.get("/lots")
def my_lots(db: Session = Depends(get_db), seller: User = Depends(require_role("seller"))):
    now = utcnow()
    lots = db.execute(select(Lot).options(joinedload(Lot.seller)).where(Lot.seller_id == seller.id)
                      .order_by(Lot.id.desc())).scalars().all()
    rows = []
    for l in lots:
        s = lot_summary(l, now)
        s["cancelled"] = l.cancelled_at is not None
        s["cancelled_with_refund"] = l.cancelled_with_refund
        s["winner_alias"] = integrity.alias(l.id, l.winner_id) if l.winner_id else None
        s["can_cancel"] = s["state"] in ("scheduled", "live") and not l.cancelled_at
        rows.append(s)
    total = sum(l.final_cents or 0 for l in lots)
    return {"server_time": now, "total_received_cents": total, "balance_cents": seller.balance_cents, "lots": rows}


@router.post("/lots/{lot_id}/cancel")
def cancel(lot_id: int, refund: bool = False, db: Session = Depends(get_db),
           seller: User = Depends(require_role("seller"))):
    lot = cancel_lot(db, seller, lot_id, refund=refund)
    return {"id": lot.id, "cancelled": True, "refunded": lot.cancelled_with_refund}
