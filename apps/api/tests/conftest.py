import pytest
from fastapi.testclient import TestClient
from sqlmodel import Session

from app.db import get_session, init_db, make_engine
from app.main import create_app
from app.settings import Settings, get_settings

DEVICE = "dev_abcdefghijklmnopqrstuv"
SUB = {
    "endpoint": "https://push.example.test/send/abc",
    "keys": {"p256dh": "B" + "x" * 86, "auth": "authsecret123456"},
}


@pytest.fixture
def engine():
    eng = make_engine("sqlite://")
    init_db(eng)
    return eng


@pytest.fixture
def session(engine):
    with Session(engine) as s:
        yield s


@pytest.fixture
def client(engine):
    app = create_app()

    def _session():
        with Session(engine) as s:
            yield s

    app.dependency_overrides[get_session] = _session
    app.dependency_overrides[get_settings] = lambda: Settings(
        vapid_public_key="pub-key", vapid_private_key="priv-key", cron_token="cron-secret"
    )
    return TestClient(app)


def body(**overrides):
    return {"subscription": SUB, "tz": "Asia/Kolkata", "time": "09:00", "bedtime": "22:30", **overrides}
