"""Find reminders that are due and send them.

Run once from a cron trigger (`python -m app.scheduler`, or POST /internal/send-due), or
every minute inside the web process with WB_SCHEDULER_ENABLED=true.
"""

import asyncio
import logging
from dataclasses import dataclass
from datetime import UTC, datetime

from sqlmodel import Session, select

from .models import RETENTION, Reminder, as_utc, utcnow
from .push import Sender, SubscriptionGoneError, make_sender, payload_for
from .rules import is_due, local_day
from .settings import get_settings

log = logging.getLogger("waterbuddy.scheduler")


@dataclass
class RunResult:
    sent: int = 0
    gone: int = 0
    failed: int = 0
    purged: int = 0


def purge_stale(session: Session, now: datetime) -> int:
    """Delete reminders nobody has used for RETENTION (90 days). The app notices and shows
    reminders as off. Filtered in Python so it behaves the same on SQLite and Postgres."""
    cutoff = now - RETENTION
    stale = [r for r in session.exec(select(Reminder)).all() if as_utc(r.updated_at) < cutoff]
    for r in stale:
        session.delete(r)
    return len(stale)


def send_due(session: Session, now: datetime, send: Sender) -> RunResult:
    result = RunResult(purged=purge_stale(session, now))
    for r in session.exec(select(Reminder).where(Reminder.paused == False)).all():  # noqa: E712
        if not is_due(r, now):
            continue
        day = local_day(now, r.tz)
        try:
            send(r, payload_for(r, day))
        except SubscriptionGoneError:
            session.delete(r)
            result.gone += 1
            continue
        except Exception:  # one bad subscription must not stop the rest
            log.exception("push failed for one subscription")
            result.failed += 1
            continue
        r.last_sent_day = day
        r.updated_at = utcnow()
        session.add(r)
        result.sent += 1
    session.commit()
    return result


def run_once() -> RunResult:
    from .db import engine, init_db

    settings = get_settings()
    if not settings.push_configured:
        raise SystemExit("Set WB_VAPID_PUBLIC_KEY and WB_VAPID_PRIVATE_KEY first (python -m app.vapid).")
    init_db()
    with Session(engine) as session:
        return send_due(session, datetime.now(UTC), make_sender(settings))


async def loop(every_seconds: int = 60) -> None:
    while True:
        try:
            result = await asyncio.to_thread(run_once)
            if result.sent or result.gone or result.failed:
                log.info("reminders: %s", result)
        except Exception:
            log.exception("scheduler run failed")
        await asyncio.sleep(every_seconds)


if __name__ == "__main__":
    logging.basicConfig(level=logging.INFO)
    print(run_once())
