from datetime import timedelta

from sqlalchemy import text

from app.db import engine
from app.models import utcnow
from app.services import external
from app.services.auction import place_bid, settle_lot
from tests.conftest import ITEM


def auth(client, email, password="password1"):
    r = client.post("/api/auth/login", json={"email": email, "password": password})
    assert r.status_code == 200, r.text
    return {"Authorization": f"Bearer {r.json()['token']}"}


def test_register_login_and_roles(client):
    r = client.post("/api/auth/register", json={"name": "Zed", "email": "Z@T.com", "password": "password1", "role": "bidder"})
    assert r.status_code == 200 and r.json()["user"]["email"] == "z@t.com"
    assert client.post("/api/auth/register", json={"name": "Zed", "email": "z@t.com", "password": "password1", "role": "bidder"}).json()["code"] == "email_taken"
    assert client.post("/api/auth/login", json={"email": "z@t.com", "password": "nope"}).status_code == 401
    h = auth(client, "z@t.com")
    assert client.get("/api/seller/lots", headers=h).status_code == 403   # bidder cannot use the seller panel
    assert client.get("/api/wallet").status_code == 401


def test_full_bid_flow_over_http_with_clear_errors(client, db, world):
    w = world
    h = auth(client, "ana@t.com")
    assert client.post("/api/wallet/deposit", json={"amount_cents": 50_00}, headers=h).json()["total_cents"] == 1050_00
    r = client.post(f"/api/lots/{w.lot.id}/bids", json={"amount_cents": 50_00}, headers=h)
    assert r.status_code == 409 and r.json()["code"] == "below_minimum" and r.json()["min_next_bid_cents"] == 100_00
    r = client.post(f"/api/lots/{w.lot.id}/bids", json={"amount_cents": 100_00}, headers=h)
    d = r.json()
    assert r.status_code == 200 and d["me"]["status"] == "leading" and d["me"]["position"] == 1 and d["bids"][0]["is_mine"]
    assert client.post(f"/api/lots/{w.lot.id}/bids", json={"amount_cents": 500_00}, headers=h).json()["code"] == "already_leading"
    hb = auth(client, "bob@t.com")
    assert client.post(f"/api/lots/{w.lot.id}/bids", json={"amount_cents": 2000_00}, headers=hb).json()["code"] == "insufficient_balance"
    client.post(f"/api/lots/{w.lot.id}/bids", json={"amount_cents": 110_00}, headers=hb)
    assert client.get(f"/api/lots/{w.lot.id}", headers=h).json()["me"]["status"] == "outbid"
    assert client.get(f"/api/lots/{w.lot.id}").json()["me"]["status"] == "none"   # anonymous


def test_websocket_pings_on_new_bid(client, world):
    w = world
    h = auth(client, "ana@t.com")
    with client.websocket_connect(f"/api/ws/lots/{w.lot.id}") as ws:
        client.post(f"/api/lots/{w.lot.id}/bids", json={"amount_cents": 100_00}, headers=h)
        assert ws.receive_json() == {"type": "bid", "lot_id": w.lot.id}


def test_showcase_buckets_and_cancelled_hidden(client, db, world):
    w = world
    hs = auth(client, "seller@t.com")
    assert [l["id"] for l in client.get("/api/lots?state=live").json()["lots"]] == [w.lot.id]
    assert client.get("/api/lots?state=ended").json()["lots"] == []
    assert client.post(f"/api/seller/lots/{w.lot.id}/cancel", headers=hs).json()["cancelled"]
    assert client.get("/api/lots?state=live").json()["lots"] == []
    assert client.get(f"/api/lots/{w.lot.id}").status_code == 404
    assert client.get("/api/lots?state=live&q=zzz").json()["lots"] == []


def test_audit_and_receipt_are_public_and_private(client, db, world):
    w = world
    place_bid(db, w.lot.id, w.ana.id, 100_00, w.now)
    place_bid(db, w.lot.id, w.bob.id, 120_00, w.now)
    settle_lot(db, w.lot.id, w.lot.ends_at + timedelta(seconds=1))
    r = client.get(f"/api/lots/{w.lot.id}/audit")   # no Authorization header
    assert r.status_code == 200 and r.json()["intact"] and len(r.json()["bids"]) == 2
    assert "ana@t.com" not in r.text and "bob@t.com" not in r.text and "Bob" not in r.text
    h = auth(client, "bob@t.com")
    code = client.get(f"/api/lots/{w.lot.id}", headers=h).json()["receipt_code"]
    assert code and client.get(f"/api/lots/{w.lot.id}").json()["receipt_code"] is None
    rc = client.get(f"/api/receipts/{code}")
    assert rc.status_code == 200 and rc.json()["amount_cents"] == 120_00 and "bob@t.com" not in rc.text
    assert client.get(f"/api/me/wins", headers=h).json()["wins"][0]["code"] == code
    with engine.begin() as c:
        c.execute(text("UPDATE bids SET amount_cents = 1 WHERE seq = 1"))
    assert client.get(f"/api/lots/{w.lot.id}/audit").json()["intact"] is False


def test_lot_is_settled_lazily_when_opened_after_end(client, db, world):
    w = world
    place_bid(db, w.lot.id, w.ana.id, 100_00, w.now)
    with engine.begin() as c:   # time passes: the lot's end moves into the past
        c.execute(text("UPDATE lots SET ends_at = now() - interval '1 minute'"))
    d = client.get(f"/api/lots/{w.lot.id}").json()
    assert d["state"] == "ended" and d["final_cents"] == 100_00 and d["winner_alias"]


# ---- external API resilience ----

RAW = {"info": {"total": 2}, "data": [
    {"id": 7, "title": "Waterlilies", "creation_date": "1906", "technique": "Oil on canvas", "type": "Painting",
     "creators": [{"description": "Claude Monet (French, 1840-1926)"}],
     "images": {"web": {"url": "https://cdn.test/7/7_web.jpg"}}},
    {"id": 8, "title": "No image", "images": {"web": None}}]}


def test_external_cache_stale_and_503(client, db, world, monkeypatch):
    hs = auth(client, "seller@t.com")
    external._Breaker.open_until = 0

    def down(*a, **k):
        raise RuntimeError("API down")

    monkeypatch.setattr(external, "_fetch", down)
    r = client.get("/api/seller/items?q=monet", headers=hs)
    assert r.status_code == 503 and r.json()["code"] == "external_unavailable"   # no cache yet: clear message, app alive
    assert client.get("/api/lots?state=live").status_code == 200                # the rest keeps working

    monkeypatch.setattr(external, "_fetch", lambda *a, **k: RAW)
    ok = client.get("/api/seller/items?q=monet", headers=hs).json()
    assert [i["external_id"] for i in ok["items"]] == ["7"] and ok["stale"] is False   # items without image are skipped
    assert ok["items"][0]["image_url"] == "https://cdn.test/7/7_web.jpg"
    assert ok["items"][0]["attributes"]["Artista"].startswith("Claude Monet")

    monkeypatch.setattr(external, "_fetch", down)
    with engine.begin() as c:
        c.execute(text("UPDATE external_cache SET fetched_at = now() - interval '1 day'"))
    stale = client.get("/api/seller/items?q=monet", headers=hs).json()
    assert stale["stale"] is True and len(stale["items"]) == 1                   # API down: serve cached results


def test_create_lot_uses_snapshot_even_if_api_is_down(client, db, world, monkeypatch):
    hs = auth(client, "seller@t.com")
    monkeypatch.setattr(external, "_fetch", lambda *a, **k: RAW)
    client.get("/api/seller/items?q=monet", headers=hs)
    monkeypatch.setattr(external, "_fetch", lambda *a, **k: (_ for _ in ()).throw(RuntimeError("down")))
    now = utcnow()
    body = {"external_id": "7", "start_price_cents": 100_00, "min_increment_cents": 5_00,
            "starts_at": now.isoformat(), "ends_at": (now + timedelta(hours=1)).isoformat()}
    r = client.post("/api/seller/lots", json=body, headers=hs)
    assert r.status_code == 200 and r.json()["title"] == "Waterlilies"
    lot_id = r.json()["id"]
    d = client.get(f"/api/lots/{lot_id}")   # room works with the API down
    assert d.status_code == 200 and d.json()["image_url"].endswith("7_web.jpg")
    bad = client.post("/api/seller/lots", json={**body, "ends_at": (now - timedelta(hours=1)).isoformat()}, headers=hs)
    assert bad.json()["code"] == "invalid_window"