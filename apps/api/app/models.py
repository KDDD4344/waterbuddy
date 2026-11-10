"""What the server stores, and nothing more (decision D-004, safety rule 11).

One row per device that turned reminders on: where to send the push, the one daily
reminder time, the time zone and bedtime (for last call), and whether today's goal is
already met. No drink amounts, no names, no age, no notes.
"""

from datetime import UTC, datetime

from sqlmodel import Field, SQLModel


def utcnow() -> datetime:
    return datetime.now(UTC)


class Reminder(SQLModel, table=True):
    # A random id the device made for itself; it is the only key to this row.
    id: str = Field(primary_key=True, max_length=64)
    endpoint: str = Field(max_length=1024)
    p256dh: str = Field(max_length=256)
    auth: str = Field(max_length=64)
    tz: str = Field(max_length=64)
    time: str = Field(max_length=5)
    bedtime: str = Field(max_length=5)
    # Local day ("YYYY-MM-DD") on which the goal was met: no reminder that day.
    done_day: str | None = Field(default=None, max_length=10)
    last_sent_day: str | None = Field(default=None, max_length=10)
    # Reminders closed without opening the app, in a row. Quieter as this grows.
    ignored_streak: int = 0
    paused: bool = False
    created_at: datetime = Field(default_factory=utcnow)
    updated_at: datetime = Field(default_factory=utcnow)
