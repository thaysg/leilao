"""Serialisers: the only place that decides what the API exposes (never e-mails or user ids of bidders)."""
from datetime import datetime

from sqlalchemy import func, select
from sqlalchemy.orm import Session

from . import integrity
from .models import Bid, Lot, Receipt, User
from .services.auction import committed_cents, lot_state, min_next_bid


def lot_summary(lot: Lot, now: datetime) -> dict:
    return {
        "id": lot.id, "title": lot.title, "image_url": lot.image_url, "state": lot_state(lot, now),
        "start_price_cents": lot.start_price_cents, "min_increment_cents": lot.min_increment_cents,
        "current_cents": lot.current_cents, "bid_count": lot.bid_count, "min_next_bid_cents": min_next_bid(lot),
        "starts_at": lot.starts_at, "ends_at": lot.ends_at, "seller_name": lot.seller.name,
        "final_cents": lot.final_cents, "has_winner": lot.winner_id is not None,
    }


def my_status(db: Session, lot: Lot, user: User | None, state: str) -> dict:
    empty = {"status": "none", "position": None, "best_bid_cents": None, "alias": None, "bid_count": 0}
    if not user or user.role != "bidder":
        return empty
    mine = db.execute(select(func.count(Bid.id), func.max(Bid.amount_cents))
                      .where(Bid.lot_id == lot.id, Bid.bidder_id == user.id)).one()
    out = {**empty, "alias": integrity.alias(lot.id, user.id), "bid_count": mine[0], "best_bid_cents": mine[1]}
    if mine[0] == 0:
        return out
    # position = rank of the user's best bid among distinct bidders (1 = leading)
    higher = db.execute(select(func.count(func.distinct(Bid.bidder_id))).where(
        Bid.lot_id == lot.id, Bid.bidder_id != user.id, Bid.amount_cents > mine[1])).scalar_one()
    out["position"] = higher + 1
    leading = lot.leader_id == user.id
    if state == "ended":
        out["status"] = "won" if leading else "lost"
    else:
        out["status"] = "leading" if leading else "outbid"
    return out


def lot_detail(db: Session, lot: Lot, now: datetime, user: User | None) -> dict:
    state = lot_state(lot, now)
    bids = db.execute(select(Bid).where(Bid.lot_id == lot.id).order_by(Bid.seq.desc())).scalars().all()
    receipt = db.execute(select(Receipt).where(Receipt.lot_id == lot.id)).scalar_one_or_none()
    return {
        **lot_summary(lot, now),
        "description": lot.description, "attributes": lot.attributes, "server_time": now,
        "original_ends_at": lot.original_ends_at,
        "extended": lot.ends_at != lot.original_ends_at,
        "me": my_status(db, lot, user, state),
        "bids": [{"seq": b.seq, "alias": integrity.alias(lot.id, b.bidder_id), "amount_cents": b.amount_cents,
                  "created_at": b.created_at, "is_mine": bool(user and b.bidder_id == user.id)} for b in bids],
        "winner_alias": integrity.alias(lot.id, lot.winner_id) if lot.winner_id else None,
        "receipt_code": receipt.code if (receipt and user and user.id == receipt.winner_id) else None,
        "is_owner": bool(user and user.id == lot.seller_id),
    }


def wallet_view(db: Session, user: User) -> dict:
    committed = committed_cents(db, user.id)
    return {"total_cents": user.balance_cents, "committed_cents": committed,
            "available_cents": user.balance_cents - committed}
