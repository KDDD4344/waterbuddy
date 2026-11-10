from datetime import UTC, datetime

from app.models import Reminder
from app.rules import apply_feedback, is_due, last_call_minutes, time_problem

IST = "Asia/Kolkata"


def reminder(**kw) -> Reminder:
    base = {
        "id": "x" * 22,
        "endpoint": "https://e",
        "p256dh": "k",
        "auth": "a",
        "tz": IST,
        "time": "09:00",
        "bedtime": "22:30",
    }
    return Reminder(**{**base, **kw})


def ist(hh: int, mm: int, day: int = 10) -> datetime:
    # 09:00 IST is 03:30 UTC
    total = hh * 60 + mm - 330
    return datetime(2026, 11, day, 0, 0, tzinfo=UTC).replace(hour=(total // 60) % 24, minute=total % 60)


def test_due_at_the_chosen_time_only():
    r = reminder()
    assert not is_due(r, ist(8, 59))
    assert is_due(r, ist(9, 0))
    assert is_due(r, ist(9, 30))
    assert not is_due(r, ist(9, 50))


def test_at_most_once_a_day():
    r = reminder(last_sent_day="2026-11-10")
    assert not is_due(r, ist(9, 5))
    assert is_due(r, ist(9, 5, day=11))


def test_never_after_the_goal_is_met():
    assert not is_due(reminder(done_day="2026-11-10"), ist(9, 5))
    assert is_due(reminder(done_day="2026-11-09"), ist(9, 5))


def test_never_after_last_call():
    r = reminder(time="20:15", bedtime="22:30")
    assert is_due(r, ist(20, 20))
    assert not is_due(r, ist(20, 40))


def test_time_must_leave_room_before_last_call():
    assert time_problem("09:00", "22:30") is None
    assert "last call" in (time_problem("20:00", "22:30") or "")
    assert "6 am" in (time_problem("05:00", "22:30") or "")
    assert time_problem("9am", "22:30")


def test_last_call_after_midnight_counts_as_evening():
    assert last_call_minutes("01:00") == 23 * 60
    assert last_call_minutes("02:30") == 24 * 60 + 30


def test_ignored_reminders_get_quieter_then_pause():
    r = reminder()
    for _ in range(3):
        apply_feedback(r, "dismissed")
    days_due = [is_due(r, ist(9, 5, day=d)) for d in range(10, 16)]
    assert days_due.count(True) == 3  # every other day
    for _ in range(4):
        apply_feedback(r, "dismissed")
    assert r.paused and not is_due(r, ist(9, 5))
    apply_feedback(r, "opened")
    assert r.ignored_streak == 0


def test_time_zones_are_respected():
    r = reminder(tz="Europe/London", time="09:00")
    assert is_due(r, datetime(2026, 11, 10, 9, 10, tzinfo=UTC))
    assert not is_due(r, ist(9, 10))
