"""Sending web push. The payload is tiny and carries no health data: the service worker
on the phone writes the words from what's stored there."""

import json
from collections.abc import Callable

from pywebpush import WebPushException, webpush

from .models import Reminder
from .settings import Settings


class SubscriptionGoneError(Exception):
    """The browser says this subscription no longer exists; delete it."""


Sender = Callable[[Reminder, dict], None]


def payload_for(r: Reminder, day: str) -> dict:
    return {"t": "reminder", "id": r.id, "day": day}


def make_sender(settings: Settings, session=None) -> Sender:
    def send(r: Reminder, payload: dict) -> None:
        try:
            webpush(
                subscription_info={"endpoint": r.endpoint, "keys": {"p256dh": r.p256dh, "auth": r.auth}},
                data=json.dumps(payload),
                vapid_private_key=settings.vapid_private_key,
                vapid_claims={"sub": settings.vapid_subject},
                ttl=60 * 60,
                headers={"Urgency": "normal"},
                requests_session=session,
            )
        except WebPushException as exc:
            status = getattr(exc.response, "status_code", None)
            if status in (404, 410):
                raise SubscriptionGoneError(r.id) from exc
            raise

    return send
