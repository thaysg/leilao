import os

# Must be set BEFORE the app is imported. Tests need a real PostgreSQL (row locks are part of the rules).
os.environ["DATABASE_URL"] = os.environ.get(
    "TEST_DATABASE_URL", "postgresql+psycopg://leilao:leilao@localhost:5432/leilao_test")
os.environ["SEED_ON_START"] = "false"
os.environ["RUN_FINALIZER"] = "false"
os.environ["AUDIT_SECRET"] = "test-audit-secret"

from datetime import timedelta  # noqa: E402

import pytest  # noqa: E402
from fastapi.testclient import TestClient  # noqa: E402
from sqlalchemy import text  # noqa: E402

from app.db import Base, SessionLocal, engine  # noqa: E402
from app.main import app  # noqa: E402
from app.models import User, utcnow  # noqa: E402
from app.security import hash_password  # noqa: E402
from app.services.auction import create_lot  # noqa: E402
from app.services.external import ItemDTO  # noqa: E402

ITEM = ItemDTO(external_id="1", title="Mona", image_url=None, thumb_url=None, attributes={"Artista": "X"})


@pytest.fixture(autouse=True)
def clean_db():
    Base.metadata.create_all(engine)
    with engine.begin() as c:
        c.execute(text("TRUNCATE " + ",".join(t.name for t in Base.metadata.sorted_tables) + " RESTART IDENTITY CASCADE"))
    yield


@pytest.fixture
def db():
    with SessionLocal() as s:
        yield s


@pytest.fixture
def client():
    with TestClient(app) as c:
        yield c


def make_user(db, role="bidder", name="U", balance=0, email=None):
    u = User(name=name, email=email or f"{name.lower()}@t.com", password_hash=hash_password("password1"),
             role=role, balance_cents=balance)
    db.add(u)
    db.commit()
    return u


@pytest.fixture
def world(db):
    """seller + two funded bidders + one live lot (start R$100, increment R$10, ends in 1 day)."""
    now = utcnow()
    seller = make_user(db, "seller", "Seller")
    ana = make_user(db, "bidder", "Ana", 1000_00)
    bob = make_user(db, "bidder", "Bob", 1000_00)
    lot = create_lot(db, seller, ITEM, 100_00, 10_00, now - timedelta(minutes=5), now + timedelta(days=1), now=now)
    return type("W", (), dict(seller=seller, ana=ana, bob=bob, lot=lot, now=now))
