# Pilot (Phase 8)

10 to 20 people use WaterBuddy for two weeks on their own phones. Then we fix what they ran into.

**It worked if** at least half the people in the pilot still have the daily reminder switched on, and not paused, after two weeks. That's the "done when" from the build plan.

## Before it starts

- [ ] Deployed: web on Vercel, API on Render, reminder cron in GitHub (README, "Deploy").
- [ ] Reminders checked on one real Android phone and one real iPhone (iOS 16.4 or later, installed to the Home Screen).
- [ ] The health reviewer has seen the goal table and the sip guard (`docs/health-review.md`). A pilot can run on a draft review, but people must be told.
- [ ] A feedback form is made (Google Forms or similar), and its link set as `VITE_FEEDBACK_URL` in Vercel. The form asks for no name and no health details.
- [ ] Pilot start day written down: ____________

## Who

- Adults, 18 and over. They are the only ones who get reminders, which is what we measure.
- A mix: at least three people aged 50 or over, at least three on low-cost Android phones, and at least two iPhone users.
- Parents can try kid mode with their child on their own phone, and tell us about it in the form. The child doesn't fill in anything.

## What to tell people (consent)

Read or send this, and start only after a clear yes:

> WaterBuddy is a test version. Your drinks and notes stay on your phone; we never see them. If you turn on the daily reminder, our server keeps your reminder time, time zone, bedtime and a yes/no for whether today's goal was met. That's how we'll count how many people still use reminders after two weeks. You can stop at any time: turn reminders off, or tap Delete everything under You. The feedback form is optional, and goes to the WaterBuddy team. The goal suggestions are still being checked by a health reviewer. If a doctor has told you to limit fluids, follow their advice.

## During the two weeks

- Day 1: help people install it (Share → Add to Home Screen on iPhone; Install on Android) and turn on the reminder if they want it.
- Day 3: one message: "Anything confusing so far? The form is under You → Pilot feedback."
- Day 7: ask two or three people to open the app with `?perf` at the end of the address (e.g. `https://<app>/?perf`), use Today and the Atlas for a minute, tap Copy on the meter, and paste the numbers into the form. That's the real-phone performance check (aim: about 30 frames a second or more on Today, see `docs/accessibility.md`).
- Watch the form. Fix anything that blocks people straight away; collect the rest.

## Day 14: the count

From `apps/api` on the server (Render shell), or locally with `WB_DATABASE_URL` set to the production database:

```bash
python -m app.pilot_report --since <pilot start day> --participants <number of people>
```

It prints how many reminders were set up since the start, how many are at least 14 days old, how many of those are still on and not paused, and that as a share of everyone in the pilot. People who turned reminders off have no row at all, so the share is over the whole pilot, not just the rows left.

## After

- [ ] Every problem from the form sorted into: fix before launch, fix later, won't fix (with a reason).
- [ ] Fixes made and tested.
- [ ] Feedback form closed and its answers deleted once the fixes are done.
- [ ] Result written into `docs/launch-checklist.md`.
