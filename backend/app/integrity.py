"""Tamper-evident bid history.

Every bid stores `hash = HMAC-SHA256(secret, lot | seq | bidder | amount | time | end-after | prev_hash)`.
The first bid chains to a *genesis* hash that binds the immutable lot terms (price, increment, window).
The secret never leaves the server, so someone with direct database access can edit or insert rows but
cannot recompute valid hashes. See the README for the full threat model.
"""
import hashlib
import hmac
from datetime import datetime, timezone

from .config import settings


def iso(dt: datetime) -> str:
    return dt.astimezone(timezone.utc).isoformat(timespec="microseconds")


def _mac(*parts) -> str:
    msg = "|".join(str(p) for p in parts).encode()
    return hmac.new(settings.audit_secret.encode(), msg, hashlib.sha256).hexdigest()


def genesis_hash(lot) -> str:
    return _mac("genesis", lot.id, lot.seller_id, lot.external_source, lot.external_id,
                lot.start_price_cents, lot.min_increment_cents, iso(lot.starts_at), iso(lot.original_ends_at))


def bid_hash(lot_id, seq, bidder_id, amount_cents, created_at, ends_at_after, prev_hash) -> str:
    return _mac("bid", lot_id, seq, bidder_id, amount_cents, iso(created_at), iso(ends_at_after), prev_hash)


def alias(lot_id: int, user_id: int) -> str:
    """Stable per-lot pseudonym: lets people follow a bidder inside one lot without identifying them."""
    return _mac("alias", lot_id, user_id)[:6].upper()
