"""Pilot check (Phase 8): after two weeks, do people keep their reminder switched on?

    python -m app.pilot_report --since 2026-11-20 --participants 15

Counts only what the server already holds for reminders (decision D-009): when each row was
created, and whether it is paused. A person who turned reminders off has no row at all, so the
share is taken over the number of people in the pilot, which the team knows.
"""

import argparse
from collections.abc import Iterable
from dataclasses import dataclass
from datetime import UTC, date, datetime, timedelta

from sqlmodel import Session, select

from .models import Reminder, as_utc

TARGET = 0.5


@dataclass
class PilotSummary:
    participants: int
    joined: int
    """Rows created since the pilot started."""
    two_weeks_old: int
    """Of those, rows at least `days` old."""
    still_on: int
    """Of those, rows that are not paused."""

    @property
    def share(self) -> float:
        return self.still_on / self.participants if self.participants else 0.0


def summarise(
    rows: Iterable[Reminder], *, since: date, now: datetime, participants: int, days: int = 14
) -> PilotSummary:
    start = datetime(since.year, since.month, since.day, tzinfo=UTC)
    cohort = [r for r in rows if as_utc(r.created_at) >= start]
    old = [r for r in cohort if as_utc(r.created_at) <= now - timedelta(days=days)]
    return PilotSummary(
        participants=participants,
        joined=len(cohort),
        two_weeks_old=len(old),
        still_on=sum(1 for r in old if not r.paused),
    )


def describe(s: PilotSummary, days: int = 14) -> str:
    return "\n".join(
        [
            f"People in the pilot:                {s.participants}",
            f"Reminders set up since the start:   {s.joined}",
            f"Of those, at least {days} days old:     {s.two_weeks_old}",
            f"Still on and not paused:            {s.still_on}",
            f"Share of pilot with reminders on:   {s.share:.0%} (aim: at least {TARGET:.0%})",
        ]
    )


def main(argv: list[str] | None = None) -> None:
    p = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    p.add_argument("--since", required=True, type=date.fromisoformat, help="pilot start day, YYYY-MM-DD")
    p.add_argument("--participants", required=True, type=int, help="how many people joined the pilot")
    p.add_argument("--days", type=int, default=14)
    args = p.parse_args(argv)

    from .db import engine, init_db

    init_db()
    with Session(engine) as session:
        rows = session.exec(select(Reminder)).all()
    s = summarise(
        rows, since=args.since, now=datetime.now(UTC), participants=args.participants, days=args.days
    )
    print(describe(s, args.days))


if __name__ == "__main__":
    main()
