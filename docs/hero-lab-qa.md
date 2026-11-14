# Hero Lab: QA report (release readiness)

**Updated:** 14 November 2026. **Branch:** `hero-lab` (checkpoint commit `ea1d5bf`, plus this round's fixes, uncommitted).

## Verdict: not release-ready yet

The automated results are good and every issue found so far is fixed. But the Hero Lab has **not been tested on a single real phone**, and the screen-reader checks so far are automated only. Those are the main ways people will use it, so it can't be called release-ready until the device procedure ([`hero-lab-device-testing.md`](hero-lab-device-testing.md)) has been run on a real iPhone and a real Android phone and its results recorded here.

## 1. Automated tests passed

All automated results here are from this Mac (Apple M5): Chromium on the real GPU, Chromium on a software renderer, and WebKit (Safari's engine). Devices are emulated.

| Suite | Result | What it covers |
|---|---|---|
| Unit tests (Vitest) | **142 / 142** in each of six timezones (UTC−11 to UTC+14) | Hydration rules, saving, two-tab merging, Undo, midnight, animation clips, plus the whole app's own tests |
| App tests, clock sweep (by the companion session) | **All pass** at every hour, every 30 minutes, every 5 minutes around the boundaries, and at 05:50 exactly (368 runs) | The two app tests once thought to depend on the time of day (see "Corrections") |
| Browser suite, production build (Playwright) | **65 / 65 passed** (30 lab, 35 app); 3 skipped by design (the app's iPhone-only and Chromium-only push tests) | App and lab, in Chrome (Pixel 7) and Safari (iPhone 14) engines. The app passes unchanged alongside the lab |
| Interaction QA harness, previous round | 235 / 238, then the 3 failures investigated (below) | Camera, every scene interaction, hydration, onboarding, layout at 6 sizes, reduced motion |
| Two tabs, one after the other | **10 / 10** runs kept exactly both glasses | Clean browser each run, display held awake |
| Two tabs pouring at the same instant | **10 / 10** after the fix (**0 / 8** before) | Same |
| Tap storm (24 taps plus a drag) | **5 / 5** runs: no long tasks, slowest frame 17.8 ms, steady 60 fps | Production build, clean browser, display awake |
| Accessibility checks | **38 / 38** after the fixes (**35 / 38** before) | Keyboard, screen-reader names and announcements, touch targets at 3 sizes, contrast, reduced motion, audio |

### Accessibility, in detail
- **Keyboard:**
  - The tab order is the scene, Settings, the guide's Got it, then Pour; Undo sits just before Pour when it's offered. Every stop shows a visible focus ring.
  - Enter works on every button, Escape closes the guide and the settings menu, and arrow keys and +/− look around.
  - Undo stays while it has focus, and focus moves to Pour after an Undo.
- **Screen readers (automated):**
  - The 3D canvas is hidden from screen readers; the scene has a label that explains the keys.
  - The progress card reads as text, and the guide is a labelled region with its three lines as a list.
  - A polite live region announces "Pouring…", the result plus "Undo is available just before the Pour button", and "Undone…".
- **Touch targets:** every control is at least 48×48 px on iPhone SE, Pixel 7 and a phone in landscape (WCAG 2.2 asks for 24×24; Apple and Android guidance for 44–48).
- **Contrast:** every piece of text is at least **5.3:1** against the worst case behind it (the translucent panels tested over the scene's darkest and lightest colours). WCAG AA asks for 4.5:1, or 3:1 for large text.
- **Reduced motion** (system setting or the in-app switch): no opening camera move and no entrance animations. A celebration becomes a gentle happy with no camera swoop, pouring moves no camera, and flicks stop at once.
- **Audio:** silent by default; no audio is created until Sound is switched on. With Sound on, the ambience, pour, water taps and Ripple taps each make sound; switching it off silences everything.

## 2. Real-device tests completed

**None.** No physical iPhone or Android phone has been used yet. The procedure is ready: [`hero-lab-device-testing.md`](hero-lab-device-testing.md) (sections A–G, about 60 steps, with a results template).

## 3. Issues fixed

### This round
| Issue | Found by | Fix | Verified by |
|---|---|---|---|
| **Two tabs pouring at the same instant lost a glass** (0 of 8 runs kept both; both tabs showed 1,000 instead of 1,250, and a reload kept the loss). Each tab saved its whole day, so the second save overwrote the first. | Repeat test, clean browser | Every glass now has an id, and an Undo leaves a removal marker. Each tab merges with what's stored before saving, and merges (never replaces) when another tab saves. The merge is order-independent, so both tabs converge. | 10 / 10 simultaneous, 10 / 10 sequential; 5 new unit tests; new browser test |
| **Undo vanished after 10 s even while focused**, losing keyboard focus to the page: a time limit a keyboard or screen-reader user couldn't extend | Accessibility check | The countdown pauses while Undo has focus or a pointer over it; after Undo, focus moves to Pour | Accessibility check |
| **Escape didn't close the settings menu** | Accessibility check | Escape closes it and returns focus to ☰ | Accessibility check |
| **Undo appeared silently for screen-reader users** | Accessibility check | The pour announcement now ends "Undo is available just before the Pour button." | Accessibility check |
| **One lab unit test assumed India time** (it failed under UTC and Los Angeles time, the usual CI timezones) | Timezone run | The test builds "the next morning" in local time | 142 / 142 in six timezones |
| **No guard against iOS's long-press callout or double-tap page zoom** (press-and-hold on the water lasts about a second) | Review for the device procedure | `-webkit-touch-callout: none` and no text selection on the scene; `touch-action: manipulation` on buttons | **Not verified: needs a real iPhone** (device steps B9, B10, C5) |
| App tests timing out under heavy CPU load (by the companion session) | Load test: 3 / 42 full runs passed with 20 CPU hogs | Longer test timeouts (`testTimeout` 20 s; Testing Library waits 5 s) | 28 / 28 under the same load |

### Previous round (interaction QA)
- **Data integrity:**
  - two tabs overwrote each other;
  - a page left open past midnight filed yesterday's drinks under today;
  - Undo targeted "the latest glass" instead of its own.
- **Guide:** it came back on every visit for anyone who never pressed Got it.
- **Ripple taps:** "keep tapping and Ripple turns curious" couldn't happen; a tap on Ripple's chest once read as the ground (a safety net was added).
- **Landscape phones:** the dock took half the screen.
- **DEV tools:** they blocked taps and could push their own toggle off a short screen.
- **Robustness:** pointer capture could throw; a scene closed mid-load leaked Ripple's model.

### Outstanding failures from the last report, re-investigated
| Report | Repeated how | Result |
|---|---|---|
| Two tabs: 3 entries instead of 2 (once) | 10 sequential runs plus 10 simultaneous runs; production build; a fresh browser each run; display held awake; no other test browsers running | **Not reproduced** (20 / 20 correct). Simultaneous pours did reveal a **different, real bug** (a lost glass, not a duplicate), fixed above. The one-off duplicate happened during a run when a crashed earlier run had left a browser rendering the lab in the background for hours. That wasn't a second tab of the same profile, so I can't link it to the duplicate with certainty, and it stays listed as unexplained. |
| 100–200 ms stalls during tap storms | 5 storms, same clean conditions | **Not reproduced**: no long tasks, slowest frame 17.8 ms, steady 60 fps. The earlier stalls were all inside `render()` (the GPU), never in tap handling. They coincided with the stray browser and the display sleeping. |
| Simultaneous pours from two tabs | See the first row | **Was a real bug, now fixed.** |

### Corrections to the last report
- **The two app tests weren't time-dependent.** The last report said they depended on the time of day. That was wrong. The companion session's sweep faked the clock at every hour, every 5 minutes around the boundaries and at the exact failing minute, and both passed every time. What fails them is CPU load: the night they failed, a stray browser was pinning the CPU, and the same "2 failed" pattern reproduces under artificial load. The fix is the longer timeouts above, not a pinned clock.
- **What controlling the clock and timezone showed:** every hour (sweep) and six timezones (this round) pass. The only zone-dependent test was one of the lab's own, now fixed.

## 4. Remaining known limitations

- **No real-device testing yet** (section 2). Until then, everything about real touch handling, Safari and Chrome's own gestures, real GPUs and heat is unverified.
- **Screen readers:** VoiceOver and TalkBack haven't been used. The automated checks only confirm names, roles and announcements. The scene itself is marked as an application (so arrow keys work); how VoiceOver and TalkBack treat that needs a person (device step G5).
- **The 3D scene is pointer-only:** Ripple, the water, the pads and the spout can't be "tapped" from the keyboard or a screen reader. Looking around works from the keyboard. Logging, Undo, settings and the guide are fully accessible, and nothing in the scene affects hydration. Making the scene's toys keyboard-operable would be a new feature, so it isn't in this pass.
- **Sound on iPhone:** Safari usually mutes web audio when the ring/silent switch is on silent. Not tested (device step G7).
- **Two tabs pressing Pour in the very same instant** now merge correctly in tests. Real browsers in separate processes have only been exercised on this Mac.
- **Unexplained one-off:** the single two-tab duplicate from the last round wasn't reproduced in 20 clean runs. If it ever reappears, the entries now carry ids, which would show whether it's a true duplicate (same id) or an extra glass.
- **Text size:** the lab uses fixed sizes. The phone's large-text setting doesn't enlarge it (device step A5 records how it looks).
- **Frame cost:** M5 only, about 19 ms per frame at 2560×1600 uncapped, 6.8 ms at phone size. The software renderer runs at 3 fps (functional, used by CI). Mid-range phones are unmeasured.

## 5. Items that require manual verification

All of these are in [`hero-lab-device-testing.md`](hero-lab-device-testing.md), on both a real iPhone (Safari) and a real Android phone (Chrome):

- **Layout:** notch and safe areas, the browser toolbar collapsing, rotation, large text, dark mode (A1–A6).
- **Gestures:** one-finger look, flick, limits, pinch (with no page zoom), the iOS edge-swipe Back, Android pull-to-refresh, double-tap and long-press behaviour (B1–B11). B9 and B10 also verify this round's CSS guards.
- **Scene responses:** every scene interaction on a real touchscreen (C1–C10).
- **Hydration on the device:**
  - exact +250, double-tap, Undo;
  - reload, closing the tab, switching apps, locking mid-pour;
  - two tabs, the goal, the next day, private browsing, airplane mode (D1–D13).
- **Browser navigation:** Back and Forward, reload mid-pour, returning to a background tab (E1–E5).
- **Performance on real GPUs:** fps and frame time idle, during a pour and while dragging; heat after 5 minutes; Low Power Mode (F1–F6).
- **Accessibility on the device:** VoiceOver and TalkBack reading order and announcements, the system Reduce Motion setting, sound including the iPhone silent switch, a Bluetooth keyboard (G1–G9).

The verdict changes to release-ready only after these are recorded, with any ✗ fixed or explicitly accepted.

## How the automated checks were run

- **Repeatable conditions this round:**
  - a production build served on its own port;
  - a fresh browser per run, with Chromium's background throttling turned off;
  - the display held awake (`caffeinate -dimu`);
  - no other test browsers running (the harness now always closes them).
- **Where the scripts are:** the investigation scripts and harness are kept outside the repo. The lasting coverage lives in the repository's own tests (`src/lab/engine/lab.test.ts`, `e2e/lab.spec.ts`).
- **The previous round's full matrix** (camera, interactions, hydration, onboarding and layout per device, with method) is the earlier version of this file, in checkpoint commit `ea1d5bf`: `git show ea1d5bf:docs/hero-lab-qa.md`.
