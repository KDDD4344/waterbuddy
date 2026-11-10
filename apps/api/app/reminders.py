"""Reminder endpoints. Every input model forbids extra fields, so the app cannot send the
server more than reminders need, even by mistake."""

import re
from typing import Annotated, Literal

from fastapi import APIRouter, Depends, Header, HTTPException, Response, status
from pydantic import BaseModel, ConfigDict, Field, field_validator
from sqlmodel import Session

from .db import get_session
from .models import Reminder, utcnow
from .rules import apply_feedback, time_problem, valid_tz
from .settings import Settings, get_settings

router = APIRouter(tags=["reminders"])

DEVICE_ID = re.compile(r"^[A-Za-z0-9_-]{22,64}$")
DAY = r"^\d{4}-\d{2}-\d{2}$"


class Strict(BaseModel):
    model_config = ConfigDict(extra="forbid")


class Keys(Strict):
    p256dh: str = Field(min_length=20, max_length=256)
    auth: str = Field(min_length=8, max_length=64)


class Subscription(Strict):
    endpoint: str = Field(max_length=1024)
    keys: Keys
    # Browsers add this to PushSubscription.toJSON(); accepted and ignored.
    expirationTime: int | None = None  # noqa: N815

    @field_validator("endpoint")
    @classmethod
    def https_only(cls, v: str) -> str:
        if not v.startswith("https://"):
            raise ValueError("push endpoint must be https")
        return v


class ReminderIn(Strict):
    subscription: Subscription
    tz: str = Field(max_length=64)
    time: str
    bedtime: str


class ReminderOut(BaseModel):
    time: str
    tz: str
    bedtime: str
    paused: bool
    # The last local day the app said the goal was met.
    goal_met_day: str | None = None


class TodayIn(Strict):
    day: str = Field(pattern=DAY)
    goal_met: bool


class FeedbackIn(Strict):
    action: Literal["opened", "dismissed"]


SessionDep = Annotated[Session, Depends(get_session)]
SettingsDep = Annotated[Settings, Depends(get_settings)]


def _id(device_id: str) -> str:
    if not DEVICE_ID.match(device_id):
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Not found")
    return device_id


def _get(session: Session, device_id: str) -> Reminder:
    r = session.get(Reminder, _id(device_id))
    if not r:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Not found")
    return r


def _out(r: Reminder) -> ReminderOut:
    return ReminderOut(time=r.time, tz=r.tz, bedtime=r.bedtime, paused=r.paused, goal_met_day=r.done_day)


@router.get("/push/key")
def push_key(settings: SettingsDep) -> dict[str, str]:
    if not settings.push_configured:
        raise HTTPException(
            status.HTTP_503_SERVICE_UNAVAILABLE, "Reminders are not set up on this server yet"
        )
    return {"key": settings.vapid_public_key}


@router.put("/reminders/{device_id}", response_model=ReminderOut)
def save_reminder(device_id: str, body: ReminderIn, session: SessionDep) -> ReminderOut:
    _id(device_id)
    if not valid_tz(body.tz):
        raise HTTPException(status.HTTP_422_UNPROCESSABLE_ENTITY, "Unknown time zone")
    if problem := time_problem(body.time, body.bedtime):
        raise HTTPException(status.HTTP_422_UNPROCESSABLE_ENTITY, problem)
    r = session.get(Reminder, device_id) or Reminder(
        id=device_id, endpoint="", p256dh="", auth="", tz="", time="", bedtime=""
    )
    r.endpoint = body.subscription.endpoint
    r.p256dh = body.subscription.keys.p256dh
    r.auth = body.subscription.keys.auth
    r.tz, r.time, r.bedtime = body.tz, body.time, body.bedtime
    # Saving is a fresh choice, so a paused reminder starts again.
    r.paused = False
    r.ignored_streak = 0
    r.updated_at = utcnow()
    session.add(r)
    session.commit()
    return _out(r)


@router.get("/reminders/{device_id}", response_model=ReminderOut)
def get_reminder(device_id: str, session: SessionDep) -> ReminderOut:
    return _out(_get(session, device_id))


@router.delete("/reminders/{device_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_reminder(device_id: str, session: SessionDep) -> Response:
    r = session.get(Reminder, _id(device_id))
    if r:
        session.delete(r)
        session.commit()
    return Response(status_code=status.HTTP_204_NO_CONTENT)


@router.post("/reminders/{device_id}/today", status_code=status.HTTP_204_NO_CONTENT)
def set_today(device_id: str, body: TodayIn, session: SessionDep) -> Response:
    """The app says whether today's goal is met. Only a yes/no for the day, never amounts."""
    r = _get(session, device_id)
    if body.goal_met:
        r.done_day = body.day
    elif r.done_day == body.day:
        r.done_day = None
    session.add(r)
    session.commit()
    return Response(status_code=status.HTTP_204_NO_CONTENT)


@router.post("/reminders/{device_id}/feedback", status_code=status.HTTP_204_NO_CONTENT)
def feedback(device_id: str, body: FeedbackIn, session: SessionDep) -> Response:
    r = _get(session, device_id)
    apply_feedback(r, body.action)
    session.add(r)
    session.commit()
    return Response(status_code=status.HTTP_204_NO_CONTENT)


@router.post("/internal/send-due")
def trigger_send_due(
    session: SessionDep, settings: SettingsDep, x_cron_token: Annotated[str | None, Header()] = None
) -> dict[str, int]:
    """Called every few minutes by a scheduler (see .github/workflows/reminders.yml)."""
    if not settings.cron_token or x_cron_token != settings.cron_token:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Not found")
    if not settings.push_configured:
        raise HTTPException(status.HTTP_503_SERVICE_UNAVAILABLE, "Push keys are not set")
    from datetime import UTC, datetime

    from .push import make_sender
    from .scheduler import send_due

    result = send_due(session, datetime.now(UTC), make_sender(settings))
    return {"sent": result.sent, "gone": result.gone, "failed": result.failed}
