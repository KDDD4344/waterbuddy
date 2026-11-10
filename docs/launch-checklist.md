# Launch checklist

WaterBuddy launches when every row here is signed off. Each row needs a name and a date.
"Code" rows are checked by the test suite; "People" rows need someone to do them.

## Safety rules (`docs/safety-rules.md`)

| # | Rule | How it's checked | Status |
|---|---|---|---|
| 1 | No reward past the goal | Code: domain and voyage tests | Built |
| 2 | Reminders stop at the goal, never increase, get quieter | Code: API rules tests, e2e reminder test | Built |
| 3 | Last call two hours before bedtime | Code: voyage and API rules tests | Built |
| 4 | Sip, don't rush | Code: guard test. People: threshold and wording approved (`docs/health-review.md` §2) | Waiting on reviewer |
| 5 | Goal guard; kid goals set by a parent | Code: goal warning and kid-mode parent check tests | Built; ranges waiting on reviewer |
| 6 | No diagnosis | Code: reminder wording test. People: reviewer reads all health wording | Waiting on reviewer |
| 7 | Count fluids honestly | Code: labels say "fluids logged" | Built |
| 8 | Heat days | **Not built.** Build it, or agree with the reviewer to drop it for now (`docs/health-review.md` §5) | Open |
| 9 | No streaks to lose | Code: voyage tests (missed days never mentioned) | Built |
| 10 | No purchases that change progress | Nothing to buy | Built |
| 11 | Drink logs stay on the device | Code: API rejects extra fields; data map in `docs/privacy.md` | Built |
| 12 | No social features under 18 | Nothing social; under-18 profiles keep everything on the phone (D-011) | Built |
| 13 | Every fact has a source and a reviewer | `python tools/validate_content.py --strict` passes | Waiting on reviewers |

## Sign-offs

| Item | What "done" means | Who | Date |
|---|---|---|---|
| Health review | Every box in `docs/health-review.md` ticked; `content/goals.json` review approved | | |
| Postcard facts | All six Route I cards reviewed against their sources; each card's review approved | | |
| India legal check | `docs/privacy.md` questions answered; notice approved; `operator` and `contact` filled in `content/privacy-notice.json` | | |
| Accessibility, people | TalkBack and VoiceOver passes from `docs/accessibility.md` done; problems fixed | | |
| Real-phone speed | `?perf` numbers from at least one low-cost Android phone and one iPhone meet the aim in `docs/accessibility.md` | | |
| Reminders on real phones | A reminder arrives on Android Chrome and on an installed iPhone app, and stops once the goal is met | | |
| Pilot | `docs/pilot.md` done; at least half the pilot still has reminders on after two weeks | | |
| Art | Either the art from `docs/art-brief.md` is in and passes its checks, or the team agrees to launch with the placeholders | | |

## Automatic gate

These must all pass on the commit that ships:

```bash
python tools/validate_content.py --strict
python tools/build_art.py --check
```

plus the CI jobs (`.github/workflows/ci.yml`): web lint, typecheck, unit tests and build; Playwright in both engines, including the accessibility audit; API tests; tools tests.

## Deploy

Follow "Deploy" in the README. Then, on the live site:

- [ ] Privacy notice opens from the welcome screen and shows the operator and contact.
- [ ] The version under You → About this app matches `apps/web/package.json`.
- [ ] `VITE_FEEDBACK_URL` removed after the pilot, unless feedback stays open.
