# Hero Lab: interaction QA and stability pass

**Date:** 12–13 November 2026. **Build:** the uncommitted `/lab/` prototype (iteration 7 plus the fixes below). **Scope:** test what exists. No scene changes and no new features; only the fixes the tests called for.

## Summary

- **Final QA run:** 235 of 238 checks passed. All three failures were investigated (see "Failed interactions"):
  - one was a dev-tools layout bug, now fixed;
  - two were intermittent and passed on repeat runs.
- **Bugs found:** 11 product and dev-tool bugs, all fixed. Each fix has a regression test where one is practical.
- **Hydration:** only the Pour button logs water; every press adds exactly 250 ml; double-clicks never duplicate; Undo removes exactly the right glass. Camera moves and scene taps never touch the records, on any device tested.
- **Suites after the fixes:** 137 unit tests and 28 browser tests pass (Chrome and Safari engines). Typecheck and lint are clean.
- **Not tested:** real phones. Everything here ran on this Mac in emulated devices; see "Remaining limitations".

## How it was tested

| Environment | Engine | Input |
|---|---|---|
| Desktop 1280×800 | Chromium on the Mac's GPU (Apple M5, Metal) | Real mouse, wheel and keyboard events |
| Android phone (Pixel 7, 412×839) | Chromium, GPU | Real touch events (Chrome DevTools protocol), multi-touch pinch |
| iPhone 14 (390×664) | WebKit (Safari's engine) | Synthetic pointer events, hit-tested like real touches |
| Phone in landscape (Pixel 7, 839×360) | Chromium, GPU | Real touch events |
| Layout sizes | Chromium | iPhone SE 375×667, Pixel 7, phone landscape 844×390, iPad 820×1180, laptop 1280×720, desktop 1920×1080; each with and without the DEV tools |
| Reduced motion | Chromium, GPU | `prefers-reduced-motion: reduce` |

A scripted harness drove every check against the dev server and read the scene's real state: the camera angles, the clip playing, ripple strengths, pad motion, the trickle, the saved day and the console. Screen positions were projected from the 3D scene, so taps land on Ripple, a pad, the spout or the water at whatever the framing is. The Playwright suite (`e2e/lab.spec.ts`) runs separately against the production build.

## Working interactions

### Camera
| Check | Desktop | Android | iPhone | Landscape |
|---|---|---|---|---|
| Drag turns the view, smoothly (largest per-frame step 0.004–0.021 rad, no jitter) | ✓ | ✓ | ✓ | ✓ |
| Release glides, then stops | ✓ | ✓ | ✓ | ✓ |
| Limits hold in all four directions; pushing past meets resistance and springs back | ✓ | ✓ | ✓ | ✓ |
| Ripple stays in frame at every limit and zoom (8 extremes) | ✓ | ✓ | ✓ | ✓ |
| Scroll zooms, eased; clamps at 3.4 and 9.5 | ✓ | | | |
| Trackpad pinch (ctrl+wheel) zooms; the wheel never scrolls the page | ✓ | | | |
| Right-button drag doesn't turn the view; no context menu on the scene | ✓ | | | |
| Arrow keys turn the view, eased | ✓ | | | |
| Pinch out zooms in, pinch in zooms out, clamped | | ✓ | ✓ | ✓ |
| Lifting one finger after a pinch doesn't jump the view | | ✓ | ✓ | ✓ |
| A small finger wobble during a tap doesn't turn the view | | ✓ | ✓ | ✓ |
| Gestures never scroll or zoom the page | | ✓ | ✓ | ✓ |
| A drag released over Pour doesn't pour | ✓ | ✓ | ✓ | ✓ |
| A drag that starts on a button (the menu) doesn't turn the view | ✓ | ✓ | ✓ | ✓ |

### Things in the scene
Each one gives its own response, checked in the scene's state, not by eye:

| Tap | Response checked | Desktop | Android | iPhone | Landscape |
|---|---|---|---|---|---|
| Ripple, idle | happy clip plays | ✓ | ✓ | ✓ | ✓ |
| Ripple, mid-reaction | giggle layered on; the clip keeps running (time 0.20 → 0.33 s, not reset) | ✓ | ✓ | ✓ | ✓ |
| Ripple, three taps in 6 s | curious ("what is it?") | ✓ | ✓ | ✓ | ✓ |
| Ripple, while celebrating | celebration not interrupted | ✓ | ✓ | ✓ | ✓ |
| Ripple, during a pour | the pour carries on | ✓ | ✓ | ✓ | ✓ |
| Water, tap | small ring (strength 0.70) | ✓ | ✓ | ✓ | ✓ |
| Water, press and hold | bigger plunge plus a rebound ring (3–4 live rings) | ✓ | ✓ | ✓ | ✓ |
| Lily pad | dips (bob −0.4), turns (spin ≈ 0.4–0.5), petals ruffle | ✓ | ✓ | ✓ | ✓ |
| Bamboo spout | ~1 s trickle of droplets; no pour, nothing logged | ✓ | ✓ | ✓ | ✓ |
| Bamboo spout, during a pour | ignored | ✓ | ✓ | ✓ | ✓ |
| Hover (desktop) | hand cursor over Ripple, pads and the spout; none over plain scenery | ✓ | | | |

### Hydration
| Check | Desktop | Android |
|---|---|---|
| One press adds exactly 250 ml (one entry, `ml: 250`) | ✓ | ✓ |
| Double-click logs once | ✓ | ✓ |
| Three clicks in the same instant log once | ✓ | ✓ |
| Enter pressed twice logs once | ✓ | ✓ |
| Undo is offered after a glass, and disappears after 10 s | ✓ | ✓ |
| Undo, even double-clicked, removes exactly the glass it was offered for | ✓ | ✓ |
| The spring follows Undo (progress 0.75 at 1,500 of 2,000 ml) | ✓ | ✓ |
| The goal is celebrated once; undoing that glass and logging again doesn't celebrate twice | ✓ | ✓ |
| A reload keeps every glass | ✓ | ✓ |
| Taps on Ripple, the water, a pad and the spout, drags, scrolls and pinches change nothing; only the one pour added an entry | ✓ | ✓ (and iPhone, landscape) |

### Persistence and daily rollover
- ✓ **Damaged data:** a fresh day, no crash.
- ✓ **Yesterday's saved day:** not shown today.
- ✓ **Storage blocked:** logging still works, with no errors.
- ✓ **Midnight:** with the clock moved past midnight while the page stays open, a new day starts and no entry from the previous day carries over.
- ✓ **Two tabs:** both tabs keep each other's glasses.

### Onboarding ("Explore the spring")
Checked on desktop, Android and landscape:
- ✓ **First visit:** shown, and it doesn't cover Ripple, a pad, the spout or the water.
- ✓ **Ticks:** it ticks off what's been tried ("1 of 4 found").
- ✓ **Dismissing:** Got it dismisses it, and it stays dismissed for a returning visitor. Escape closes it too.
- ✓ **Reopening:** Settings → How to explore reopens it, and the menu closes when it does.
- ✓ **Retiring:** it isn't shown again to someone who has already looked around and touched something, even without pressing Got it.

### Technical
- ✓ **No console errors:** none in any run, on any engine, including during dispose.
- ✓ **No console warnings.**
- ✓ **One render loop:** a single loop (30 rAF requests for 30 frames). The GLB is downloaded once, even with React's dev-mode double mount.
- ✓ **Cleanup:** disposing the scene stops the loop (0 frames afterwards) and removes all input listeners.
- ✓ **Reduced motion:** the system setting is honoured. A flick stops almost at once, a long press still ripples without spray, and Ripple still reacts.
- ✓ **Layout:** at all six sizes, with and without the DEV tools: no overlapping controls, everything on screen, no sideways scroll, and Ripple's face never hidden behind a control.
- **Frame cost:** no change from this pass (M5: ~19 ms per frame at 2560×1600 uncapped, ~6.8 ms at phone size). The worst case, software rendering on CPU as CI uses, runs at 3 fps after dropping to 0.75× resolution, and everything still works there (the browser suite runs on it).

## Failed interactions

These are the failures from the final run, and what each one was:

1. **Landscape phone, DEV Lab tools wouldn't close.** A real dev-tool bug. On a 360 px-tall screen the open panel was 409 px tall and pushed its own toggle off the top of the screen. **Fixed:** the panel now scrolls inside the screen.
2. **Two tabs: 3 entries instead of 2 (once).** It passed in the earlier post-fix run, in the re-run, and in the production-build browser suite on both engines. I couldn't reproduce or explain the extra entry.
3. **Tap storm: a 200 ms stall (once).** The stall was inside a single `render()` call, not in any tap or hover handler: across all storms, no handler took over 20 ms. No shaders compile late. A re-run gave a worst stall of 107 ms, then two more storms gave none and one 193 ms frame, again inside `render()`.

**What the test machine was doing.** Two things made the GPU-window runs unreliable during this pass:
- **A stray browser:** a crashed section of the final run never closed its browser. It rendered the lab in the background for hours, competing for the GPU. The harness now always closes its browsers.
- **Display sleep:** after midnight the display was allowed to sleep, which throttles visible browser windows. That stalled every later GPU-window run.

Failures 2 and 3 coincided with both. They are not confirmed product bugs, but they also weren't cleanly re-verified on an awake, quiet machine before this report.

## Bugs discovered and fixes implemented

| # | Bug | How it showed | Fix | Regression test |
|---|---|---|---|---|
| 1 | **Two tabs overwrote each other.** Whichever tab saved last won, so the other tab's glass was lost. | QA: 1 of 2 glasses saved | Each tab picks up the other's changes (`storage` event) before it saves its own | e2e: "two open tabs keep each other's glasses" |
| 2 | **A page left open past midnight filed yesterday's drinks under today.** It saved with the current date, not the day's own. | QA (clock moved past midnight): 3 entries from the previous day carried over | A day keeps its own date; a new day starts at midnight (checked every 30 s, on return to the tab, and before each pour); the demo's seeded entries never fall before midnight | unit: saving under the day's date; fresh day after midnight |
| 3 | **Undo removed "the latest glass", not the glass it was offered for.** After a glass from another tab arrived, Undo would have removed that one. | Code review, confirmed with the two-tab fix | Undo removes that exact entry; a second Undo for it does nothing | unit and e2e |
| 4 | **The guide came back on every visit for anyone who never pressed Got it.** | QA: shown on visits 2 and 3 | It retires once someone has looked around and touched something, and opens by itself on at most two visits | e2e: "the guide retires…" |
| 5 | **"Keep tapping Ripple and it turns curious" couldn't happen.** Taps during the happy reaction weren't counted. | QA, all devices | Every tap on Ripple counts (three within 6 s) | QA harness |
| 6 | **A tap on Ripple's chest once read as the ground behind it.** 1 run in 11, desktop; not reproduced in 10 instrumented runs. | QA | Safety net: if the exact mesh test misses, a tap squarely on Ripple's head or chest still counts (two small inner spheres; nothing nearer can be stolen) | QA harness |
| 7 | **Landscape phones:** the portrait dock took nearly half the height, Ripple's head was cut off, and the guide covered the pool. | QA screenshots | Phones on their side use the desktop arrangement (Pour bottom-right, no panel) and a narrower guide | QA layout checks |
| 8 | **DEV Lab tools:** its box spanned the screen width on phones, catching scene taps above the dock and, in landscape, taps on Pour. | QA: Pour click intercepted by `.lab-tools` | Only its contents take taps | QA layout checks |
| 9 | **DEV Lab tools pushed its toggle off a short screen** (finding 1 above). | QA | Panel scrolls inside the screen | QA |
| 10 | **Pointer capture could throw** (for a pointer the browser no longer tracks), aborting the press. | WebKit run: page error | Capture failure is ignored; input carries on | QA, iPhone |
| 11 | **A scene torn down while Ripple was loading still reported back and leaked the model.** This happens in dev (React's double mount) or when leaving the page mid-load. | Code review | Loading checks for disposal and frees what it loaded | (dev only; covered by the "single render loop / GLB once" checks) |

**Not bugs:**
- **WebKit "Couldn't load texture" errors:** these appeared only when the harness reloaded the page mid-load, which aborts the old page's texture decode. On a clean load the textures decode as 512 px WebP images. I changed the harness, not the app.
- **iPhone gesture failures in the first runs:** they came from the harness's synthetic touches not hit-testing like real ones. Fixed in the harness.

## Remaining limitations

- **Real phones:** no real phone or tablet has been tested. Touch was emulated: real touch events on Chromium, synthetic pointer events on WebKit. The WebKit runs don't exercise Safari's own gestures (edge swipe-back, the browser's pinch-to-zoom, iOS long-press menus). **Next step:** `/lab/?dev` on an iPhone and a mid-range Android; Lab tools shows fps and frame times.
- **Unconfirmed spikes and the two-tab miss:** the occasional 100–200 ms frame during the tap storm and the single two-tab miss (failures 2 and 3) haven't been re-checked on an awake, quiet machine. That's the first thing to repeat.
- **Two tabs pouring in the same instant:** they could still race. The sync covers anything more than a moment apart.
- **Midnight timing:** if a glass is already pouring at midnight, it logs into the day it started. A hidden tab catches up when it's shown again or within 30 s.
- **Small screens, first visit:** on the smallest phones and in landscape, the guide can overlap the edge of Ripple's fin or crest, never its face, until it's dismissed.
- **Not covered by these checks:**
  - sound: Web Audio output can't be heard by the harness;
  - the feel of animation timings: they're checked as states (which clip, how strong), not by eye;
  - screen readers: the axe test passes, but TalkBack and VoiceOver weren't used.
- **Outside the lab: two main-app unit tests depend on the time of day.**
  - The tests: `src/App.test.tsx` › "keeps a line a day in the journal" and "a goal day brings a message in a bottle the next morning".
  - What happened: they failed in a run at about 05:50 and passed unchanged at 06:17.
  - Why it's pre-existing: the app files haven't changed since 10 November. The voyage logic has a night/morning boundary, and these tests use the real clock.
  - What to do: the tests should pin the clock. It's a separate fix in the app, not part of this pass.
- **Hydration checks per device:** the full hydration section ran on desktop and Android. iPhone and landscape ran the "interactions log nothing; one pour logs 250 ml" check.
