# Health review (Phase 8)

Everything in WaterBuddy that says or implies something about how much to drink. A
qualified health reviewer (a doctor, or a registered dietitian or nutritionist) reads each
row, then approves it or asks for a change. Nothing launches until every row is approved
(see `docs/launch-checklist.md`).

How to sign off:
- Goal table: set `review` in `content/goals.json` to `{"status": "approved", "reviewer": "<name, qualification>", "date": "YYYY-MM-DD"}`.
- Numbers in code: change the constant (one line each, listed below) if the reviewer asks, and note the reviewer and date in the commit.
- Wording: edit the text where it lives (listed below).
- `python tools/validate_content.py --strict` passes only when the content reviews are in.

## 1. Suggested daily goals by age (`content/goals.json`)

The suggestion is a starting point; people can change it. Each band shows its reason and source in the app.

| Ages | Suggested | Range with no warning | Basis |
|---|---|---|---|
| 4 to 8 | 1,250 ml | 800–1,800 ml | EFSA 2010: 1.6 L total water, about a fifth from food |
| 9 to 13 | 1,600 ml | 1,000–2,400 ml | EFSA 2010: 1.9 L (girls) to 2.1 L (boys) total water |
| 14 to 17 | 1,800 ml | 1,200–3,000 ml | EFSA 2010 adult values: 2.0 L (women) to 2.5 L (men) total water |
| 18 to 64 | 2,000 ml | 1,200–3,500 ml | ICMR-NIN Dietary Guidelines for Indians 2024: about 2 L a day, more in heat or with hard exercise |
| 65 or older | 1,800 ml | 1,000–3,000 ml | EFSA 2010: same reference as other adults |

Questions for the reviewer:
- [ ] Are the suggestions right for India, where heat raises needs for much of the year?
- [ ] Is assuming food gives about a fifth of total water reasonable for Indian diets?
- [ ] Are the "no warning" ranges sensible? Outside them, the app asks people to confirm (safety rule 5).
- [ ] Hard limits for any goal: 500–5,000 ml (`GOAL_MIN_ML`, `GOAL_MAX_ML` in `apps/web/src/domain/goals.ts`).

## 2. Sip, don't rush (safety rule 4)

`SIP_GUARD_ML = 1000` within `SIP_GUARD_WINDOW_MS` (one hour), in `apps/web/src/domain/guards.ts`.

When more than that is logged within an hour, Today shows:

> **Sip, don't rush.** That's over a litre in the last hour. Your body handles water best a little at a time, so there's no hurry.

- [ ] Is one litre in an hour the right threshold for adults? Should it be lower for children?
- [ ] Is the wording calm and correct, with no alarm and no diagnosis (safety rule 6)?

Single entries are capped at 2,000 ml (`MAX_SINGLE_LOG_ML`) to catch typing mistakes.

## 3. Goal warnings (safety rule 5, `apps/web/src/domain/goals.ts`)

- Below the range: "That's lower than usual for ages {band}. If a doctor set this amount, that's fine."
- Above the range: "That's a lot more than usual for ages {band}. Drinking much more than you need isn't healthier, and very large amounts can be harmful."
- Under every goal: "If a doctor has asked you to limit fluids, follow their advice and set that amount as your goal."

- [ ] Approved as written, or changes noted.

## 4. Reminders (safety rules 2 and 3)

At most one reminder a day; none once the goal is met; none after last call (two hours before bedtime); reminders that are ignored get quieter and then pause. The wording lives in `reminderText` in `apps/web/src/domain/reminders.ts` and is tested to never say "dehydrated", "forgot", "missed", "streak", "should" or "behind".

- [ ] Is two hours before bedtime the right last call to protect sleep?

## 5. Not built yet: heat days (safety rule 8)

The rules promise a short, sourced note on hot days that lets people choose to raise today's goal. It isn't built. Before launch, either build it with the reviewer's wording and source, or agree with the reviewer to take it out of the rules for now.

- [ ] Decision recorded in `docs/decisions.md`.

## Sign-off

| | Name and qualification | Date |
|---|---|---|
| Health reviewer | | |
