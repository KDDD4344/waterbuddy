# Privacy: data map for the legal check (Phase 8)

For the lawyer doing the India legal check. The notice people read in the app is
`content/privacy-notice.json` (Privacy, from the welcome screen and from You). This page says
what the code actually does, so the two can be checked against each other.

## Law to check against

- Digital Personal Data Protection Act, 2023 (DPDP Act). A "child" is anyone under 18 (section 2(f)). Section 9 covers children's data.
- Digital Personal Data Protection Rules, 2025, notified on 13 November 2025. Most duties, including notice (rule 3) and verifiable parental consent (rule 10), start 18 months later, on 13 May 2027.
- WaterBuddy follows them now rather than waiting.

## What is stored where

| Data | Where | Who can see it | Why | How long |
|---|---|---|---|---|
| Age range, goal and its history, units, vessels, drink logs, field task answers, journal notes, postcards, settings | The phone's browser storage (IndexedDB) | Only the person holding the phone | Running the app | Until Delete everything, or clearing the browser's site data |
| Random device code, push endpoint and keys, reminder time, time zone, bedtime, last goal-met day, unopened-reminder count, paused flag, created and updated times | Reminder server (`apps/api`, Postgres on Render) | The WaterBuddy team | Sending one reminder a day, and stopping it at the goal and at last call | Until reminders are turned off or Delete everything; when the push service says the endpoint is gone; or after 90 days without use (`RETENTION` in `apps/api/app/models.py`) |
| The reminder message | The person's push service (Google, Apple or Mozilla) | That provider, in transit | Delivery | That provider's terms |
| Pilot feedback, if a form link is set (`VITE_FEEDBACK_URL`) | The form provider the team picks | The WaterBuddy team | Fixing what pilot testers hit | Delete after the pilot |

The server never receives drink amounts, names, email addresses, phone numbers, age or location. Its input models reject any extra field (`extra="forbid"` in `apps/api/app/reminders.py`), and a test checks this.

There are no analytics, advertising or third-party scripts. Fonts are bundled with the app, so no font service sees visitors.

## Under 18

- 14 to 17 (teen mode) and 4 to 13 (kid mode, set up by a parent) keep everything on the phone. Reminders and the feedback link are switched off (`remindersAllowed`, `feedbackAllowed` in `apps/web/src/domain/modes.ts`).
- If an existing profile's age range is changed to under 18, the app deletes its reminder row on the server (`useReminderSync`).
- So the server holds nothing about anyone the app knows to be under 18, and the team needs no parental consent today. Decision D-011.
- Kid mode's parent check (a sum written in words) stops a child from changing settings by tapping around. **It is not verifiable parental consent under rule 10**, and the app doesn't treat it as consent.
- Nothing in the app tracks, profiles or advertises to anyone (section 9(3)).
- The server counts unopened reminders for one purpose: making reminders quieter and then pausing them (safety rule 2). Only adults have reminders.

## People's rights, and where they are in the app

| Right | In the app |
|---|---|
| Access (section 11) | You → Download my data: a JSON file of everything on the phone. The server row is listed on screen under Reminders. |
| Correction (section 12) | Every value can be edited in the app. |
| Erasure (section 12) | You → Delete everything deletes the phone's data and the server row. Turning reminders off deletes the server row. |
| Grievance (section 13) | A contact in the notice. **Still to be filled in:** `operator` and `contact` in `content/privacy-notice.json`. |
| Complaint to the Data Protection Board | Named in the notice. |

## Questions for the lawyer

1. Is a push endpoint plus time zone and bedtime, keyed by a random code, "personal data" under the Act? We treat it as personal data to be safe.
2. Does keeping everything on the phone for under-18s mean the team needs no rule 10 consent, as long as the server never receives their data?
3. Is a self-declared age range enough to know who is under 18, given that we don't verify age?
4. Render and Vercel may store data outside India. Is anything needed beyond saying so in the notice?
5. Who should be named as operator while the team is a group of students? Is a grievance email enough?
6. The pilot feedback form: what should its consent text say?
