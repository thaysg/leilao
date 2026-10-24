from datetime import timedelta
from threading import Barrier, Thread

import pytest
from sqlalchemy import select, text

from app.db import SessionLocal, engine
from app.errors import ApiError
from app.models import Lot, Receipt, User, WalletTransaction
from app.services.auction import cancel_lot, committed_cents, create_lot, place_bid, settle_lot
from tests.conftest import ITEM, make_user


def code_of(fn):
    with pytest.raises(ApiError) as e:
        fn()
    return e.value.code


def test_first_bid_must_reach_starting_price(db, world):
    w = world
    assert code_of(lambda: place_bid(db, w.lot.id, w.ana.id, 99_99, w.now)) == "below_minimum"
    assert place_bid(db, w.lot.id, w.ana.id, 100_00, w.now).seq == 1


def test_next_bid_needs_current_plus_increment(db, world):
    w = world
    place_bid(db, w.lot.id, w.ana.id, 100_00, w.now)
    assert code_of(lambda: place_bid(db, w.lot.id, w.bob.id, 109_99, w.now)) == "below_minimum"
    assert place_bid(db, w.lot.id, w.bob.id, 110_00, w.now).seq == 2


def test_leader_cannot_cover_own_bid(db, world):
    w = world
    place_bid(db, w.lot.id, w.ana.id, 100_00, w.now)
    assert code_of(lambda: place_bid(db, w.lot.id, w.ana.id, 200_00, w.now)) == "already_leading"


def test_seller_cannot_bid(db, world):
    w = world
    assert code_of(lambda: place_bid(db, w.lot.id, w.seller.id, 100_00, w.now)) == "seller_cannot_bid"


def test_only_inside_live_window(db, world):
    w = world
    early = create_lot(db, w.seller, ITEM, 100_00, 10_00, w.now + timedelta(hours=1), w.now + timedelta(hours=2), now=w.now)
    assert code_of(lambda: place_bid(db, early.id, w.ana.id, 100_00, w.now)) == "lot_not_started"
    assert code_of(lambda: place_bid(db, w.lot.id, w.ana.id, 100_00, w.now + timedelta(days=2))) == "lot_ended"


def test_balance_is_committed_and_released_when_outbid(db, world):
    w = world
    place_bid(db, w.lot.id, w.ana.id, 900_00, w.now)
    assert committed_cents(db, w.ana.id) == 900_00
    other = create_lot(db, w.seller, ITEM, 100_00, 10_00, w.now - timedelta(minutes=1), w.now + timedelta(days=1), now=w.now)
    # Ana has only R$100 available now
    assert code_of(lambda: place_bid(db, other.id, w.ana.id, 101_00, w.now)) == "insufficient_balance"
    place_bid(db, w.lot.id, w.bob.id, 910_00, w.now)  # Ana outbid -> funds released immediately
    assert committed_cents(db, w.ana.id) == 0
    assert place_bid(db, other.id, w.ana.id, 1000_00, w.now).amount_cents == 1000_00


def test_anti_sniping_extends_to_two_minutes(db, world):
    w = world
    lot = create_lot(db, w.seller, ITEM, 100_00, 10_00, w.now - timedelta(minutes=5), w.now + timedelta(minutes=10), now=w.now)
    place_bid(db, lot.id, w.ana.id, 100_00, w.now)  # 10 min left: no extension
    db.refresh(lot)
    assert lot.ends_at == lot.original_ends_at
    t = lot.ends_at - timedelta(seconds=90)  # inside the last 2 minutes
    place_bid(db, lot.id, w.bob.id, 110_00, t)
    db.refresh(lot)
    assert lot.ends_at == t + timedelta(minutes=2)


def test_settlement_moves_money_and_issues_receipt_once(db, world):
    w = world
    place_bid(db, w.lot.id, w.ana.id, 100_00, w.now)
    place_bid(db, w.lot.id, w.bob.id, 150_00, w.now)
    end = w.lot.ends_at + timedelta(seconds=1)
    assert settle_lot(db, w.lot.id, end) is True
    assert settle_lot(db, w.lot.id, end) is False  # idempotent
    db.expire_all()
    assert db.get(User, w.bob.id).balance_cents == 850_00
    assert db.get(User, w.seller.id).balance_cents == 150_00
    assert db.get(User, w.ana.id).balance_cents == 1000_00
    assert db.execute(select(Receipt)).scalars().one().amount_cents == 150_00
    assert len(db.execute(select(WalletTransaction)).scalars().all()) == 2


def test_lot_without_bids_closes_without_winner(db, world):
    w = world
    settle_lot(db, w.lot.id, w.lot.ends_at + timedelta(seconds=1))
    db.expire_all()
    lot = db.get(Lot, w.lot.id)
    assert lot.settled_at and lot.winner_id is None
    assert db.execute(select(Receipt)).first() is None


def test_cancel_rules(db, world):
    w = world
    place_bid(db, w.lot.id, w.ana.id, 500_00, w.now)
    assert code_of(lambda: cancel_lot(db, w.seller, w.lot.id)) == "lot_has_bids"
    other_seller = make_user(db, "seller", "Other")
    assert code_of(lambda: cancel_lot(db, other_seller, w.lot.id, refund=True)) == "forbidden"
    cancel_lot(db, w.seller, w.lot.id, refund=True)  # optional feature: automatic refund
    assert committed_cents(db, w.ana.id) == 0
    assert code_of(lambda: place_bid(db, w.lot.id, w.bob.id, 100_00, w.now)) == "lot_cancelled"


def test_concurrent_equal_bids_only_one_wins(world):
    w = world
    n, results = 8, []
    barrier = Barrier(n)
    users = [make_user_for_thread(f"U{i}") for i in range(n)]

    def worker(uid):
        with SessionLocal() as s:
            barrier.wait()
            try:
                place_bid(s, w.lot.id, uid, 100_00, w.now)
                results.append("ok")
            except ApiError as e:
                results.append(e.code)

    ts = [Thread(target=worker, args=(u,)) for u in users]
    [t.start() for t in ts]
    [t.join() for t in ts]
    assert results.count("ok") == 1
    assert results.count("below_minimum") == n - 1


def test_concurrent_bids_by_same_user_cannot_overspend(world):
    w = world
    with SessionLocal() as s:
        lots = [create_lot(s, w.seller, ITEM, 100_00, 10_00, w.now - timedelta(minutes=1), w.now + timedelta(days=1), now=w.now)
                for _ in range(3)]
        ids = [l.id for l in lots]
    barrier, results = Barrier(3), []

    def worker(lot_id):
        with SessionLocal() as s:
            barrier.wait()
            try:
                place_bid(s, lot_id, w.ana.id, 600_00, w.now)  # Ana has R$1000: only one R$600 bid fits
                results.append("ok")
            except ApiError as e:
                results.append(e.code)

    ts = [Thread(target=worker, args=(i,)) for i in ids]
    [t.start() for t in ts]
    [t.join() for t in ts]
    assert results.count("ok") == 1 and results.count("insufficient_balance") == 2


def make_user_for_thread(name):
    with SessionLocal() as s:
        return make_user(s, "bidder", name, 1000_00).id
