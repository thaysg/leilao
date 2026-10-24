"""Core auction rules: creating lots, bidding, settlement and cancellation.

Concurrency model: every mutation runs in one DB transaction and takes row locks in the SAME order
(lot first, then users by id), so concurrent bids are serialised per lot and cannot deadlock.
Funds "committed" to a leading bid are never stored: they are derived from the lots the user leads,
so they can never drift out of sync with the bids.
"""
import secrets
from datetime import datetime, timedelta

from sqlalchemy import func, select
from sqlalchemy.orm import Session

from .. import integrity
from ..config import settings
from ..errors import ApiError
from ..models import Bid, Lot, Receipt, User, WalletTransaction, utcnow
from ..realtime import publish
from .external import ItemDTO

MAX_CENTS = 10**12


# ---------- state helpers ----------

def lot_state(lot: Lot, now: datetime) -> str:
    """scheduled | live | ended | cancelled"""
    if lot.cancelled_at:
        return "cancelled"
    if lot.settled_at or now >= lot.ends_at:
        return "ended"
    if now < lot.starts_at:
        return "scheduled"
    return "live"


def min_next_bid(lot: Lot) -> int:
    return lot.start_price_cents if lot.bid_count == 0 else lot.current_cents + lot.min_increment_cents


def committed_cents(db: Session, user_id: int) -> int:
    """Money reserved by the lots this user currently leads (not yet settled, not cancelled)."""
    q = select(func.coalesce(func.sum(Lot.current_cents), 0)).where(
        Lot.leader_id == user_id, Lot.settled_at.is_(None), Lot.cancelled_at.is_(None))
    return int(db.execute(q).scalar_one())


def _lock_lot(db: Session, lot_id: int) -> Lot:
    lot = db.execute(select(Lot).where(Lot.id == lot_id).with_for_update()
                     .execution_options(populate_existing=True)).scalar_one_or_none()
    if not lot:
        raise ApiError("lot_not_found", "Lote não encontrado.", 404)
    return lot


def _lock_users(db: Session, *ids: int) -> dict[int, User]:
    rows = db.execute(select(User).where(User.id.in_(set(ids))).order_by(User.id).with_for_update()
                      .execution_options(populate_existing=True)).scalars().all()
    return {u.id: u for u in rows}


# ---------- lots ----------

def create_lot(db: Session, seller: User, item: ItemDTO, start_price_cents: int, min_increment_cents: int,
               starts_at: datetime, ends_at: datetime, now: datetime | None = None) -> Lot:
    now = now or utcnow()
    if not (0 < start_price_cents <= MAX_CENTS) or not (0 < min_increment_cents <= MAX_CENTS):
        raise ApiError("invalid_amount", "Lance inicial e incremento mínimo devem ser maiores que zero.", 422)
    if starts_at < now - timedelta(minutes=1):
        starts_at = now  # "start now" typed a few seconds ago
    if ends_at <= now:
        raise ApiError("invalid_window", "A data de término precisa estar no futuro.", 422)
    if ends_at - starts_at < timedelta(minutes=1):
        raise ApiError("invalid_window", "O lote precisa durar pelo menos 1 minuto.", 422)
    lot = Lot(seller_id=seller.id, external_source=item.source, external_id=item.external_id, title=item.title,
              description=item.description, image_url=item.image_url, attributes=item.attributes,
              start_price_cents=start_price_cents, min_increment_cents=min_increment_cents,
              starts_at=starts_at, original_ends_at=ends_at, ends_at=ends_at, created_at=now)
    db.add(lot)
    db.commit()
    return lot


def cancel_lot(db: Session, seller: User, lot_id: int, refund: bool = False, now: datetime | None = None) -> Lot:
    now = now or utcnow()
    lot = _lock_lot(db, lot_id)
    if lot.seller_id != seller.id:
        raise ApiError("forbidden", "Este lote pertence a outro leiloeiro.", 403)
    if lot.cancelled_at:
        raise ApiError("already_cancelled", "Este lote já foi cancelado.")
    if lot.settled_at or now >= lot.ends_at:
        raise ApiError("lot_ended", "Lotes encerrados não podem ser cancelados.")
    if lot.bid_count > 0 and not refund:
        raise ApiError("lot_has_bids", "Este lote já recebeu lances e não pode ser cancelado.")
    lot.cancelled_at = now
    lot.cancelled_with_refund = lot.bid_count > 0
    # Refund is automatic: the leader's commitment is derived from non-cancelled lots only.
    db.commit()
    publish(lot.id, "cancelled")
    return lot


# ---------- bidding ----------

def place_bid(db: Session, lot_id: int, user_id: int, amount_cents: int, now: datetime | None = None) -> Bid:
    try:
        return _place_bid(db, lot_id, user_id, amount_cents, now or utcnow())
    except ApiError:
        db.rollback()  # release the row locks as soon as a bid is refused
        raise


def _place_bid(db: Session, lot_id: int, user_id: int, amount_cents: int, now: datetime) -> Bid:
    lot = _lock_lot(db, lot_id)
    user = _lock_users(db, user_id).get(user_id)
    if not user:
        raise ApiError("unauthorized", "Usuário não encontrado.", 401)
    if user.role != "bidder":
        raise ApiError("seller_cannot_bid", "Leiloeiros não podem dar lances.", 403)

    state = lot_state(lot, now)
    if state == "cancelled":
        raise ApiError("lot_cancelled", "Este lote foi cancelado.")
    if state == "ended":
        raise ApiError("lot_ended", "Este lote já foi encerrado.")
    if state == "scheduled":
        raise ApiError("lot_not_started", "Este lote ainda não foi iniciado.")
    if lot.leader_id == user.id:
        raise ApiError("already_leading", "Você já está ganhando este lote.")

    minimum = min_next_bid(lot)
    if not (0 < amount_cents <= MAX_CENTS) or amount_cents < minimum:
        raise ApiError("below_minimum", "Seu lance está abaixo do mínimo para este lote.",
                       min_next_bid_cents=minimum)

    available = user.balance_cents - committed_cents(db, user.id)
    if amount_cents > available:
        raise ApiError("insufficient_balance", "Saldo disponível insuficiente para este lance.",
                       available_cents=available)

    # Anti-sniping: a bid in the last N seconds pushes the end to now + extension.
    ends_after = lot.ends_at
    if lot.ends_at - now <= timedelta(seconds=settings.anti_snipe_window_seconds):
        ends_after = now + timedelta(seconds=settings.anti_snipe_extension_seconds)

    seq = lot.bid_count + 1
    prev = lot.head_hash or integrity.genesis_hash(lot)
    bid = Bid(lot_id=lot.id, seq=seq, bidder_id=user.id, amount_cents=amount_cents, created_at=now,
              ends_at_after=ends_after, prev_hash=prev,
              hash=integrity.bid_hash(lot.id, seq, user.id, amount_cents, now, ends_after, prev))
    db.add(bid)
    lot.bid_count = seq
    lot.current_cents = amount_cents
    lot.leader_id = user.id
    lot.head_hash = bid.hash
    lot.ends_at = ends_after
    db.commit()
    publish(lot.id, "bid")
    return bid


# ---------- settlement ----------

def settle_lot(db: Session, lot_id: int, now: datetime | None = None) -> bool:
    """Settle an ended lot exactly once (idempotent). Returns True when this call settled it."""
    now = now or utcnow()
    lot = _lock_lot(db, lot_id)
    if lot.settled_at or lot.cancelled_at or now < lot.ends_at:
        db.rollback()
        return False

    if lot.bid_count == 0:  # no bids: closes without a winner
        lot.settled_at = now
        db.commit()
        publish(lot.id, "settled")
        return True

    users = _lock_users(db, lot.leader_id, lot.seller_id)
    winner, seller = users[lot.leader_id], users[lot.seller_id]
    amount = lot.current_cents
    if winner.balance_cents < amount:  # cannot happen: bids are checked against available balance
        raise ApiError("settlement_failed", "Saldo do vencedor insuficiente na liquidação.", 500)

    winner.balance_cents -= amount
    seller.balance_cents += amount
    db.add_all([
        WalletTransaction(user_id=winner.id, kind="purchase", amount_cents=-amount, lot_id=lot.id, created_at=now),
        WalletTransaction(user_id=seller.id, kind="sale", amount_cents=amount, lot_id=lot.id, created_at=now),
        Receipt(code=secrets.token_urlsafe(9), lot_id=lot.id, winner_id=winner.id, amount_cents=amount,
                bid_count=lot.bid_count, head_hash=lot.head_hash, issued_at=now),
    ])
    lot.winner_id = winner.id
    lot.final_cents = amount
    lot.settled_at = now
    db.commit()
    publish(lot.id, "settled")
    return True


def settle_due(db: Session, now: datetime | None = None) -> int:
    now = now or utcnow()
    ids = db.execute(select(Lot.id).where(Lot.settled_at.is_(None), Lot.cancelled_at.is_(None),
                                          Lot.ends_at <= now)).scalars().all()
    db.rollback()
    return sum(1 for i in ids if settle_lot(db, i, now))
