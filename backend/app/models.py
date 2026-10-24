from datetime import datetime, timezone

from sqlalchemy import JSON, BigInteger, DateTime, ForeignKey, Index, Integer, String, Text, UniqueConstraint
from sqlalchemy.orm import Mapped, mapped_column, relationship

from .db import Base


def utcnow() -> datetime:
    return datetime.now(timezone.utc)


class User(Base):
    __tablename__ = "users"

    id: Mapped[int] = mapped_column(primary_key=True)
    email: Mapped[str] = mapped_column(String(255), unique=True, index=True)
    name: Mapped[str] = mapped_column(String(120))
    password_hash: Mapped[str] = mapped_column(String(255))
    role: Mapped[str] = mapped_column(String(10))  # "seller" | "bidder"
    # Money is always stored as integer cents (BRL) to avoid float errors.
    balance_cents: Mapped[int] = mapped_column(BigInteger, default=0)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)


class WalletTransaction(Base):
    """Append-only ledger: deposit (+), purchase (-) for the winner, sale (+) for the seller."""
    __tablename__ = "wallet_transactions"

    id: Mapped[int] = mapped_column(primary_key=True)
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id"), index=True)
    kind: Mapped[str] = mapped_column(String(12))
    amount_cents: Mapped[int] = mapped_column(BigInteger)  # signed
    lot_id: Mapped[int | None] = mapped_column(ForeignKey("lots.id"), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)


class Lot(Base):
    __tablename__ = "lots"

    id: Mapped[int] = mapped_column(primary_key=True)
    seller_id: Mapped[int] = mapped_column(ForeignKey("users.id"), index=True)
    seller: Mapped[User] = relationship(foreign_keys=[seller_id])

    # Snapshot of the item taken from the external API at creation time. After this,
    # the lot never depends on the external API again.
    external_source: Mapped[str] = mapped_column(String(30))
    external_id: Mapped[str] = mapped_column(String(60))
    title: Mapped[str] = mapped_column(String(300))
    description: Mapped[str] = mapped_column(Text, default="")
    image_url: Mapped[str | None] = mapped_column(String(600), nullable=True)
    attributes: Mapped[dict] = mapped_column(JSON, default=dict)

    start_price_cents: Mapped[int] = mapped_column(BigInteger)
    min_increment_cents: Mapped[int] = mapped_column(BigInteger)
    starts_at: Mapped[datetime] = mapped_column(DateTime(timezone=True))
    original_ends_at: Mapped[datetime] = mapped_column(DateTime(timezone=True))
    ends_at: Mapped[datetime] = mapped_column(DateTime(timezone=True))  # moves with anti-sniping

    # Denormalised state, always updated inside the same transaction as the bid.
    bid_count: Mapped[int] = mapped_column(Integer, default=0)
    current_cents: Mapped[int | None] = mapped_column(BigInteger, nullable=True)
    leader_id: Mapped[int | None] = mapped_column(ForeignKey("users.id"), nullable=True, index=True)
    head_hash: Mapped[str | None] = mapped_column(String(64), nullable=True)

    cancelled_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    cancelled_with_refund: Mapped[bool] = mapped_column(default=False)
    settled_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    winner_id: Mapped[int | None] = mapped_column(ForeignKey("users.id"), nullable=True)
    final_cents: Mapped[int | None] = mapped_column(BigInteger, nullable=True)

    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)

    __table_args__ = (Index("ix_lots_ends_at", "ends_at"),)


class Bid(Base):
    __tablename__ = "bids"

    id: Mapped[int] = mapped_column(primary_key=True)
    lot_id: Mapped[int] = mapped_column(ForeignKey("lots.id"), index=True)
    seq: Mapped[int] = mapped_column(Integer)
    bidder_id: Mapped[int] = mapped_column(ForeignKey("users.id"))
    amount_cents: Mapped[int] = mapped_column(BigInteger)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True))
    ends_at_after: Mapped[datetime] = mapped_column(DateTime(timezone=True))
    prev_hash: Mapped[str] = mapped_column(String(64))
    hash: Mapped[str] = mapped_column(String(64))

    __table_args__ = (UniqueConstraint("lot_id", "seq", name="uq_bid_lot_seq"),)


class Receipt(Base):
    __tablename__ = "receipts"

    id: Mapped[int] = mapped_column(primary_key=True)
    code: Mapped[str] = mapped_column(String(40), unique=True, index=True)
    lot_id: Mapped[int] = mapped_column(ForeignKey("lots.id"), unique=True)
    winner_id: Mapped[int] = mapped_column(ForeignKey("users.id"), index=True)
    amount_cents: Mapped[int] = mapped_column(BigInteger)
    bid_count: Mapped[int] = mapped_column(Integer)
    head_hash: Mapped[str] = mapped_column(String(64))
    issued_at: Mapped[datetime] = mapped_column(DateTime(timezone=True))


class ExternalCache(Base):
    """Persistent cache of external API responses so the app survives outages and restarts."""
    __tablename__ = "external_cache"

    key: Mapped[str] = mapped_column(String(300), primary_key=True)
    payload: Mapped[dict] = mapped_column(JSON)
    fetched_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)
