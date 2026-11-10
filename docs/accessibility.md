# Accessibility and real-phone speed (Phase 8)

## What the tests check, on every push

`apps/web/e2e/a11y.spec.ts` runs axe-core against WCAG 2.2 A and AA in Chrome (Pixel 7) and Safari (iPhone 14):

- The welcome screen, the privacy notice, and each onboarding step.
- Today, Atlas, Journal and You at standard text size.
- The same four tabs at the largest text size with high contrast on, also checking that nothing scrolls sideways at phone width (WCAG 1.4.10).
- The custom amount sheet, the goal sheet, kid mode's grown-up question, and both sides of a postcard.

### What the first audit found (10 November 2026), all fixed

| Problem | WCAG | Fix |
|---|---|---|
| Log buttons showed "250 ml" but were named "Log 250 millilitres", so voice control ("tap 250 ml") couldn't find them | 2.5.3 Label in Name | Named with the visible words: "Log 250 ml, Steel tumbler" |
| Drink entries on Today and in History had spoken names that didn't match what's shown | 2.5.3 | Named from the visible text, including "Edit" |
| The field task chip's sticker was an image with an empty name | 1.1.1 Non-text Content | Marked as decoration; the chip's text already says what it is |
| Two text styles were 11.5 px | (house rule: nothing under 12 px) | 12 px |

## Display settings for every age

You → Display has Text size (Standard, Large, Larger: 100%, 115% and 130%) and High contrast. Kid mode and 65-and-over start on Large. Every font size in the app scales from one variable, `--wb-scale` in `apps/web/src/styles/tokens.css`. High contrast changes only colour tokens. Its ratios against the paper colour are noted there: body text 15.2:1, muted text 12.1:1, borders 3.3:1.

## Checks that need people

The automated checks find roughly a third of real problems. Before launch, someone does each of these on a real phone and writes down what went wrong:

- [ ] **TalkBack** (Android): onboarding, log a drink, undo, open the Journal, read a postcard both sides, change the goal, turn on a reminder.
- [ ] **VoiceOver** (iPhone): the same.
- [ ] **Largest system text size** with WaterBuddy's Larger setting: nothing cut off or overlapping.
- [ ] **Switch Access or a keyboard**: every control can be reached and used, and sheets return focus where they started.
- [ ] **Reduced motion** on the phone: Pip still reacts, with no pour, splash or camera drift.
- [ ] **Bright sun**: High contrast is readable outdoors.
- [ ] **An older adult and a child** (with their parent) each set the app up without help, while someone watches and doesn't explain.

## Real-phone speed

Open the app with `?perf` at the end of the address. A small meter shows frames per second and the 95th-percentile frame time, and Copy puts those numbers, the screen size, graphics chip and browser on the clipboard. Nothing is sent anywhere.

Aim, on a low-cost Android phone (about ₹10,000) and an iPhone:

| Screen | Aim |
|---|---|
| Today with the 3D tidepool, idle | 30 fps or more; p95 under 50 ms |
| Today, during a pour | No frame over 100 ms |
| Atlas, panning the Waterverse | 30 fps or more (the app lowers resolution by itself if it stays slow) |
| Logging a drink | Total updates in under 2 seconds (already tested) |

If a phone misses the aim, the 3D scenes can be turned off under You and everything still works. Record what you measured in `docs/launch-checklist.md`.
