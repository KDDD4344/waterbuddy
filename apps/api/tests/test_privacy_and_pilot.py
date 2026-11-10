from datetime import UTC, date, datetime, timedelta

from sqlmodel import select

from app.models import Reminder
from app.pilot_report import describe, summarise
from app.scheduler import purge_stale, send_due
from tests.conftest import DEVICE, body

NOW = datetime(2026, 12, 20, 12, 0, tzinfo=UTC)


def row(i: int, created: datetime, updated: datetime | None = None, paused: bool = False) -> Reminder:
    return Reminder(
        id=f"dev_{i:02d}_abcdefghijklmnopqrstu",
        endpoint="https://push.example.test/x",
        p256dh="p",
        auth="a",
        tz="Asia/Kolkata",
        time="09:00",
        bedtime="22:30",
        paused=paused,
        created_at=created,
        updated_at=updated or created,
    )


def test_rows_unused_for_90_days_are_deleted(session):
    session.add(row(1, NOW - timedelta(days=200), NOW - timedelta(days=91)))
    session.add(row(2, NOW - timedelta(days=200), NOW - timedelta(days=89)))
    session.commit()
    assert purge_stale(session, NOW) == 1
    session.commit()
    assert [r.id[:6] for r in session.exec(select(Reminder)).all()] == ["dev_02"]


def test_each_scheduler_run_purges(session):
    session.add(row(1, NOW - timedelta(days=120), NOW - timedelta(days=100), paused=True))
    session.commit()
    result = send_due(session, NOW, lambda r, p: None)
    assert result.purged == 1
    assert session.exec(select(Reminder)).all() == []


def test_using_the_app_keeps_the_row(client, engine):
    from sqlmodel import Session

    client.put(f"/reminders/{DEVICE}", json=body())
    with Session(engine) as s:
        r = s.get(Reminder, DEVICE)
        r.updated_at = datetime.now(UTC) - timedelta(days=80)
        s.add(r)
        s.commit()
    client.post(f"/reminders/{DEVICE}/today", json={"day": "2026-11-10", "goal_met": False})
    with Session(engine) as s:
        assert purge_stale(s, datetime.now(UTC) + timedelta(days=30)) == 0


def test_pilot_summary_counts_two_week_old_rows_still_on():
    start = date(2026, 11, 20)
    rows = [
        row(1, datetime(2026, 11, 21, tzinfo=UTC)),  # on
        row(2, datetime(2026, 11, 22, tzinfo=UTC), paused=True),  # paused
        row(3, datetime(2026, 12, 15, tzinfo=UTC)),  # too new
        row(4, datetime(2026, 11, 1, tzinfo=UTC)),  # before the pilot
    ]
    s = summarise(rows, since=start, now=NOW, participants=4)
    assert (s.joined, s.two_weeks_old, s.still_on) == (3, 2, 1)
    assert s.share == 0.25
    assert "25%" in describe(s)
    assert summarise([], since=start, now=NOW, participants=0).share == 0.0
