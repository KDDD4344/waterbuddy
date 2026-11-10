"""When a reminder may be sent. Pure functions, so every safety rule is unit-tested.

- One reminder a day at most, at the time the person chose (field task 9 promises this).
- Never once today's goal is met (safety rule 2).
- Never after last call, two hours before bedtime (safety rule 3).
- Ignored reminders get quieter: every other day after 3 in a row, paused after 7.
"""

from datetime import date, datetime
from zoneinfo import ZoneInfo, ZoneInfoNotFoundError

from .models import Reminder

LAST_CALL_BEFORE_MIN = 120
EARLIEST = "06:00"
# The scheduler runs every few minutes (GitHub Actions cron can be late), so a reminder
# is due for a while after its time; last_sent_day stops it from going twice.
WINDOW_MIN = 45
QUIET_AFTER = 3
PAUSE_AFTER = 7


def minutes(hhmm: str) -> int:
    h, m = hhmm.split(":")
    return int(h) * 60 + int(m)


def valid_hhmm(value: str) -> bool:
    try:
        h, m = value.split(":")
        return len(h) == 2 and len(m) == 2 and 0 <= int(h) < 24 and 0 <= int(m) < 60
    except ValueError:
        return False


def valid_tz(tz: str) -> bool:
    try:
        ZoneInfo(tz)
        return True
    except (ZoneInfoNotFoundError, ValueError):
        return False


def last_call_minutes(bedtime: str) -> int:
    """Last call in minutes after midnight, as an evening time (a 01:00 bedtime gives 23:00)."""
    m = (minutes(bedtime) - LAST_CALL_BEFORE_MIN) % (24 * 60)
    # A last call in the small hours still belongs to the evening before.
    return m + 24 * 60 if m < 4 * 60 else m


def time_problem(time: str, bedtime: str) -> str | None:
    """Why a reminder time can't be used, or None if it's fine."""
    if not valid_hhmm(time) or not valid_hhmm(bedtime):
        return "Times must look like 09:00."
    if minutes(time) < minutes(EARLIEST):
        return "Reminders start from 6 am."
    if minutes(time) + WINDOW_MIN > last_call_minutes(bedtime):
        return "That's too close to last call. Pick an earlier time."
    return None


def local_day(now_utc: datetime, tz: str) -> str:
    return now_utc.astimezone(ZoneInfo(tz)).date().isoformat()


def is_due(r: Reminder, now_utc: datetime) -> bool:
    if r.paused:
        return False
    local = now_utc.astimezone(ZoneInfo(r.tz))
    today = local.date().isoformat()
    if r.done_day == today or r.last_sent_day == today:
        return False
    now_min = local.hour * 60 + local.minute
    start = minutes(r.time)
    if not start <= now_min < start + WINDOW_MIN:
        return False
    if now_min >= last_call_minutes(r.bedtime):
        return False
    # Quieter: after several ignored reminders, only every other day.
    return not (r.ignored_streak >= QUIET_AFTER and date.fromisoformat(today).toordinal() % 2 == 1)


def apply_feedback(r: Reminder, action: str) -> None:
    if action == "opened":
        r.ignored_streak = 0
    elif action == "dismissed":
        r.ignored_streak += 1
        if r.ignored_streak >= PAUSE_AFTER:
            r.paused = True
