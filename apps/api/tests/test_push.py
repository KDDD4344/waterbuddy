"""Sends a real encrypted web push to a fake push service and decrypts it as a browser would."""

import base64
import json
import os
from datetime import UTC, datetime

import http_ece
from cryptography.hazmat.primitives import serialization
from cryptography.hazmat.primitives.asymmetric import ec

from app.models import Reminder
from app.push import SubscriptionGoneError, make_sender
from app.scheduler import send_due
from app.settings import Settings
from app.vapid import b64, generate


class FakeResponse:
    def __init__(self, status_code: int):
        self.status_code = status_code
        self.text = ""
        self.reason = "Gone" if status_code == 410 else "Created"
        self.headers: dict = {}


class FakePushService:
    def __init__(self, status_code: int = 201):
        self.status_code = status_code
        self.requests: list[dict] = []

    def post(self, url, data=None, headers=None, timeout=None):
        self.requests.append({"url": url, "data": data, "headers": headers})
        return FakeResponse(self.status_code)


def browser_keys():
    key = ec.generate_private_key(ec.SECP256R1())
    public = key.public_key().public_bytes(
        serialization.Encoding.X962, serialization.PublicFormat.UncompressedPoint
    )
    auth = os.urandom(16)
    return key, b64(public), b64(auth), auth


def make_reminder(p256dh: str, auth: str) -> Reminder:
    return Reminder(
        id="dev_abcdefghijklmnopqrstuv",
        endpoint="https://push.example.test/send/abc",
        p256dh=p256dh,
        auth=auth,
        tz="Asia/Kolkata",
        time="09:00",
        bedtime="22:30",
    )


def settings() -> Settings:
    pub, priv = generate()
    return Settings(vapid_public_key=pub, vapid_private_key=priv, vapid_subject="mailto:test@example.test")


def test_payload_is_encrypted_and_carries_no_health_data(session):
    key, p256dh, auth_b64, auth = browser_keys()
    session.add(make_reminder(p256dh, auth_b64))
    session.commit()
    service = FakePushService()
    now = datetime(2026, 11, 10, 3, 35, tzinfo=UTC)  # 09:05 in India

    result = send_due(session, now, make_sender(settings(), service))

    assert result.sent == 1
    req = service.requests[0]
    assert req["headers"]["Authorization"].startswith("vapid ")
    assert req["headers"]["Content-Encoding"] == "aes128gcm"
    plain = http_ece.decrypt(req["data"], private_key=key, auth_secret=auth, version="aes128gcm")
    assert json.loads(plain) == {"t": "reminder", "id": "dev_abcdefghijklmnopqrstuv", "day": "2026-11-10"}

    # second run in the same window sends nothing
    assert send_due(session, now, make_sender(settings(), service)).sent == 0


def test_gone_subscriptions_are_deleted(session):
    _, p256dh, auth_b64, _ = browser_keys()
    session.add(make_reminder(p256dh, auth_b64))
    session.commit()
    now = datetime(2026, 11, 10, 3, 35, tzinfo=UTC)
    result = send_due(session, now, make_sender(settings(), FakePushService(410)))
    assert result.gone == 1
    assert session.get(Reminder, "dev_abcdefghijklmnopqrstuv") is None


def test_one_failure_does_not_stop_the_rest(session):
    _, p256dh, auth_b64, _ = browser_keys()
    a = make_reminder(p256dh, auth_b64)
    b = make_reminder(p256dh, auth_b64)
    b.id = "dev_zzzzzzzzzzzzzzzzzzzzzz"
    session.add_all([a, b])
    session.commit()
    calls = []

    def flaky(r, payload):
        calls.append(r.id)
        if r.id == a.id:
            raise RuntimeError("network")

    result = send_due(session, datetime(2026, 11, 10, 3, 35, tzinfo=UTC), flaky)
    assert (result.sent, result.failed) == (1, 1)
    assert len(calls) == 2


def test_gone_error_type_is_exported():
    assert issubclass(SubscriptionGoneError, Exception)


def test_vapid_keys_have_the_right_shape():
    pub, priv = generate()
    assert len(base64.urlsafe_b64decode(pub + "==")) == 65
    assert len(base64.urlsafe_b64decode(priv + "==")) == 32
