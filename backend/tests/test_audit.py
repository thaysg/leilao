from datetime import timedelta

from sqlalchemy import text

from app.db import engine
from app.services.audit import verify_lot
from app.services.auction import place_bid, settle_lot
from app.models import Lot


def bids(db, w, n=4):
    users = [w.ana, w.bob]
    for i in range(n):
        place_bid(db, w.lot.id, users[i % 2].id, (100 + 10 * i) * 100, w.now + timedelta(seconds=i))
    db.expire_all()
    return db.get(Lot, w.lot.id)


def sql(q, **p):
    """Simulates someone editing the database directly, bypassing the application."""
    with engine.begin() as c:
        c.execute(text(q), p)


def verdict(db, lot_id):
    db.expire_all()
    return verify_lot(db, db.get(Lot, lot_id))


def test_clean_history_is_intact(db, world):
    lot = bids(db, world)
    r = verify_lot(db, lot)
    assert r["intact"] and r["bid_count"] == 4 and all(b["ok"] for b in r["bids"])


def test_edited_amount_is_detected(db, world):
    bids(db, world)
    sql("UPDATE bids SET amount_cents = 1 WHERE seq = 2")
    r = verdict(db, world.lot.id)
    assert not r["intact"] and any(i["code"] == "content_altered" and i["seq"] == 2 for i in r["issues"])
    assert [b["ok"] for b in r["bids"]] == [True, False, True, True]


def test_edited_bidder_is_detected(db, world):
    bids(db, world)
    sql("UPDATE bids SET bidder_id = :b WHERE seq = 1", b=world.bob.id)
    assert any(i["code"] == "content_altered" for i in verdict(db, world.lot.id)["issues"])


def test_deleted_middle_bid_is_detected(db, world):
    bids(db, world)
    sql("DELETE FROM bids WHERE seq = 2")
    codes = {i["code"] for i in verdict(db, world.lot.id)["issues"]}
    assert {"missing_bid", "chain_broken", "count_mismatch"} <= codes


def test_deleted_last_bid_is_detected(db, world):
    bids(db, world)
    sql("DELETE FROM bids WHERE seq = 4")
    codes = {i["code"] for i in verdict(db, world.lot.id)["issues"]}
    assert "count_mismatch" in codes and "head_mismatch" in codes


def _truncate_tail_and_fix_anchors():
    """Attacker deletes the last bid AND rewrites the lot counters to match the new tail."""
    sql("DELETE FROM bids WHERE seq = 4")
    sql("""UPDATE lots SET bid_count = 3, current_cents = (SELECT amount_cents FROM bids WHERE seq = 3),
           head_hash = (SELECT hash FROM bids WHERE seq = 3), leader_id = (SELECT bidder_id FROM bids WHERE seq = 3),
           ends_at = (SELECT ends_at_after FROM bids WHERE seq = 3)""")


def test_tail_truncation_with_fixed_anchors_is_caught_after_settlement(db, world):
    """Once the lot is settled, the receipt and wallet ledger pin the real last bid."""
    bids(db, world)
    settle_lot(db, world.lot.id, world.lot.ends_at + timedelta(seconds=1))
    _truncate_tail_and_fix_anchors()
    codes = {i["code"] for i in verdict(db, world.lot.id)["issues"]}
    assert "receipt_mismatch" in codes or "settlement_mismatch" in codes


def test_known_limit_live_tail_truncation_with_fixed_anchors_is_not_detectable(db, world):
    """Documented limit (see README): on a LIVE lot a DB admin who deletes the newest bid and rewrites the lot's
    counters leaves a self-consistent chain. Mitigation: the head hash is public, so anyone who noted it detects this."""
    bids(db, world)
    head_before = db.get(Lot, world.lot.id).head_hash
    _truncate_tail_and_fix_anchors()
    r = verdict(db, world.lot.id)
    assert r["intact"] and r["head_hash"] != head_before  # only an externally noted head hash exposes it


def test_inserted_forged_bid_is_detected(db, world):
    bids(db, world)
    sql("""INSERT INTO bids (lot_id, seq, bidder_id, amount_cents, created_at, ends_at_after, prev_hash, hash)
           SELECT lot_id, 5, bidder_id, 99999, created_at, ends_at_after, hash, repeat('a', 64) FROM bids WHERE seq = 4""")
    r = verdict(db, world.lot.id)
    assert not r["intact"] and any(i["seq"] == 5 for i in r["issues"])


def test_changed_lot_terms_are_detected(db, world):
    bids(db, world)
    sql("UPDATE lots SET start_price_cents = 1")
    assert any(i["code"] == "chain_broken" and i["seq"] == 1 for i in verdict(db, world.lot.id)["issues"])


def test_settlement_tampering_is_detected(db, world):
    bids(db, world)
    settle_lot(db, world.lot.id, world.lot.ends_at + timedelta(seconds=1))
    assert verdict(db, world.lot.id)["intact"]
    sql("UPDATE receipts SET amount_cents = 5")
    assert any(i["code"] == "receipt_mismatch" for i in verdict(db, world.lot.id)["issues"])
