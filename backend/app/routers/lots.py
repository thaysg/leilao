"""Public showcase + bidding + wallet + "my" pages for bidders."""
from datetime import datetime

from fastapi import APIRouter, Depends, Query, WebSocket, WebSocketDisconnect
from pydantic import BaseModel, Field
from sqlalchemy import Text, cast, func, select
from sqlalchemy.orm import Session, joinedload

from .. import integrity
from ..db import get_db
from ..errors import ApiError
from ..models import Bid, Lot, Receipt, User, WalletTransaction, utcnow
from ..realtime import hub
from ..security import current_user, optional_user, require_role
from ..services import audit
from ..services.auction import MAX_CENTS, place_bid, settle_lot
from ..views import lot_detail, lot_summary, wallet_view

router = APIRouter(prefix="/api", tags=["lots"])


def _load(db: Session, lot_id: int) -> Lot:
    lot = db.execute(select(Lot).options(joinedload(Lot.seller)).where(Lot.id == lot_id)).scalar_one_or_none()
    if not lot:
        raise ApiError("lot_not_found", "Lote não encontrado.", 404)
    return lot


@router.get("/lots")
def list_lots(state: str = Query("live", pattern="^(live|scheduled|ended)$"), q: str = "",
              min_price: int | None = None, max_price: int | None = None,
              sort: str = Query("default", pattern="^(default|price_asc|price_desc|newest)$"),
              db: Session = Depends(get_db)):
    now = utcnow()
    stmt = select(Lot).options(joinedload(Lot.seller)).where(Lot.cancelled_at.is_(None))  # cancelled never shown
    if state == "live":
        stmt = stmt.where(Lot.settled_at.is_(None), Lot.starts_at <= now, Lot.ends_at > now)
    elif state == "scheduled":
        stmt = stmt.where(Lot.starts_at > now)
    else:
        stmt = stmt.where((Lot.settled_at.is_not(None)) | (Lot.ends_at <= now))
    if q.strip():
        like = f"%{q.strip()}%"
        stmt = stmt.where(Lot.title.ilike(like) | cast(Lot.attributes, Text).ilike(like))
    price = func.coalesce(Lot.current_cents, Lot.start_price_cents)
    if min_price is not None:
        stmt = stmt.where(price >= min_price)
    if max_price is not None:
        stmt = stmt.where(price <= max_price)
    order = {"price_asc": price.asc(), "price_desc": price.desc(), "newest": Lot.created_at.desc()}.get(sort)
    if order is None:
        order = {"live": Lot.ends_at.asc(), "scheduled": Lot.starts_at.asc(), "ended": Lot.ends_at.desc()}[state]
    lots = db.execute(stmt.order_by(order, Lot.id).limit(100)).scalars().all()
    return {"server_time": now, "lots": [lot_summary(l, now) for l in lots]}


@router.get("/lots/{lot_id}")
def get_lot(lot_id: int, db: Session = Depends(get_db), user: User | None = Depends(optional_user)):
    lot = _load(db, lot_id)
    if lot.cancelled_at and not (user and user.id == lot.seller_id):
        raise ApiError("lot_not_found", "Lote não encontrado.", 404)  # cancelled lots are not in the showcase
    now = utcnow()
    if not lot.settled_at and not lot.cancelled_at and now >= lot.ends_at:
        db.rollback()
        settle_lot(db, lot.id, now)  # lazy settlement: never show a stale "live" lot
        lot = _load(db, lot_id)
    return lot_detail(db, lot, now, user)


class BidIn(BaseModel):
    amount_cents: int = Field(gt=0, le=MAX_CENTS)


@router.post("/lots/{lot_id}/bids")
def bid(lot_id: int, body: BidIn, db: Session = Depends(get_db), user: User = Depends(current_user)):
    place_bid(db, lot_id, user.id, body.amount_cents)
    lot = _load(db, lot_id)
    return lot_detail(db, lot, utcnow(), user)


@router.get("/lots/{lot_id}/audit")
def lot_audit(lot_id: int, db: Session = Depends(get_db)):
    """Public: no login. Never exposes e-mails, names or ids, only per-lot pseudonyms."""
    lot = _load(db, lot_id)
    now = utcnow()
    result = audit.verify_lot(db, lot)
    return {"lot": lot_summary(lot, now), "checked_at": now, **result}


@router.get("/receipts/{code}")
def get_receipt(code: str, db: Session = Depends(get_db)):
    rc = db.execute(select(Receipt).where(Receipt.code == code)).scalar_one_or_none()
    if not rc:
        raise ApiError("receipt_not_found", "Comprovante não encontrado.", 404)
    lot = _load(db, rc.lot_id)
    return {
        "code": rc.code, "lot_id": lot.id, "title": lot.title, "image_url": lot.image_url, "attributes": lot.attributes,
        "seller_name": lot.seller.name, "winner_alias": integrity.alias(lot.id, rc.winner_id),
        "amount_cents": rc.amount_cents, "bid_count": rc.bid_count, "head_hash": rc.head_hash,
        "issued_at": rc.issued_at,
    }


# ---------- bidder area ----------

class DepositIn(BaseModel):
    amount_cents: int = Field(ge=100, le=1_000_000_00)  # R$1,00 .. R$1.000.000,00 (simulated)


@router.get("/wallet")
def wallet(db: Session = Depends(get_db), user: User = Depends(current_user)):
    txs = db.execute(select(WalletTransaction).where(WalletTransaction.user_id == user.id)
                     .order_by(WalletTransaction.id.desc()).limit(50)).scalars().all()
    lots = {l.id: l.title for l in db.execute(select(Lot).where(Lot.id.in_([t.lot_id for t in txs if t.lot_id]))).scalars()} if txs else {}
    leading = db.execute(select(Lot).where(Lot.leader_id == user.id, Lot.settled_at.is_(None),
                                           Lot.cancelled_at.is_(None))).scalars().all()
    return {**wallet_view(db, user),
            "leading": [{"lot_id": l.id, "title": l.title, "amount_cents": l.current_cents} for l in leading],
            "transactions": [{"id": t.id, "kind": t.kind, "amount_cents": t.amount_cents, "lot_id": t.lot_id,
                              "lot_title": lots.get(t.lot_id), "created_at": t.created_at} for t in txs]}


@router.post("/wallet/deposit")
def deposit(body: DepositIn, db: Session = Depends(get_db), user: User = Depends(require_role("bidder"))):
    locked = db.execute(select(User).where(User.id == user.id).with_for_update()
                        .execution_options(populate_existing=True)).scalar_one()
    locked.balance_cents += body.amount_cents
    db.add(WalletTransaction(user_id=locked.id, kind="deposit", amount_cents=body.amount_cents))
    db.commit()
    return wallet_view(db, locked)


@router.get("/me/bids")
def my_bids(db: Session = Depends(get_db), user: User = Depends(require_role("bidder"))):
    """Lots where I placed bids (active and finished), newest activity first."""
    now = utcnow()
    ids = db.execute(select(Bid.lot_id).where(Bid.bidder_id == user.id).group_by(Bid.lot_id)
                     .order_by(func.max(Bid.id).desc())).scalars().all()
    out = []
    for lot_id in ids:
        lot = _load(db, lot_id)
        d = lot_detail(db, lot, now, user)
        d.pop("bids")
        out.append(d)
    return {"server_time": now, "lots": out}


@router.get("/me/wins")
def my_wins(db: Session = Depends(get_db), user: User = Depends(require_role("bidder"))):
    rows = db.execute(select(Receipt).where(Receipt.winner_id == user.id).order_by(Receipt.id.desc())).scalars().all()
    out = []
    for rc in rows:
        lot = _load(db, rc.lot_id)
        out.append({"code": rc.code, "lot_id": lot.id, "title": lot.title, "image_url": lot.image_url,
                    "amount_cents": rc.amount_cents, "issued_at": rc.issued_at})
    return {"wins": out}


# ---------- real time ----------

@router.websocket("/ws/lots/{lot_id}")
async def ws_lot(ws: WebSocket, lot_id: int):
    await hub.connect(lot_id, ws)
    try:
        while True:
            await ws.receive_text()  # keep-alive pings from the client
    except WebSocketDisconnect:
        pass
    finally:
        hub.disconnect(lot_id, ws)
