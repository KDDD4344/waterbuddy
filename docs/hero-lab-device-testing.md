# Hero Lab: real-device test procedure

Follow this on **a real iPhone with Safari** and **a real Android phone with Chrome**. It covers what the automated QA can't: real touch handling, Safari and Chrome's own gestures, real GPUs and thermals, VoiceOver and TalkBack, and the hardware sound switch.

**Status: not yet run on any device.** Nothing below has passed until someone records a result for it.

## Before you start

**Get the build onto the phone (same Wi-Fi as the Mac):**

```bash
cd apps/web && npm run build && npx vite preview --host --port 4180
```

Vite prints a `Network:` address. On the phone, open `http://<that address>:4180/lab/?dev`.
- `?dev` shows the **DEV Lab tools** (fps, frame time, draw calls, Reset the day).
- Use `/lab/` without `?dev` for anything about the consumer view (sections A and G).
- A deployed preview URL works too.

**Record for each device:**
- the model;
- the OS and browser version;
- whether Low Power Mode or Battery Saver is on;
- the Lab tools line with resolution and quality tier.

**Start clean:** for a first-visit run, clear the site's data:
- iPhone: Settings → Safari → Advanced → Website Data;
- Android: Chrome → ⋮ → Settings → Site settings → All sites.

**How to record:** mark each step ✓ (as expected), ✗ (not as expected: write what happened) or – (couldn't test). Take a screen recording for any ✗.

## A. Loading and layout

| # | Step | Expected |
|---|---|---|
| A1 | Open `/lab/` in portrait | "Ripple is on the way…", then Ripple on the rock within a few seconds. Header (WaterBuddy, 750 / 2,000 ml, ☰) and Pour button fully visible; nothing under the notch, Dynamic Island or home indicator |
| A2 | First visit | "Explore the spring" guide under the header. It doesn't cover Ripple's face, the pool or the spout |
| A3 | Scroll the page, or let the browser's toolbar collapse and expand | The page doesn't scroll; the scene and controls stay put; Pour stays reachable |
| A4 | Rotate to landscape, then back | Landscape: Pour bottom-right, guide bottom-left, Ripple fully in view (head not cut off). Back in portrait, it looks as at the start. No horizontal scroll |
| A5 | Text size: iPhone Settings → Display → Text Size at its largest / Android Font size at its largest | Note what happens. The lab uses fixed sizes, so it's expected to stay the same; look for clipped or overlapping text |
| A6 | Dark mode on | The lab looks the same (it has its own colours). Note anything unreadable |

## B. Camera gestures

| # | Step | Expected |
|---|---|---|
| B1 | One finger: drag slowly left and right | The view turns smoothly, following the finger without lag or jumps |
| B2 | Flick and let go | It glides a little, then stops; no endless spin |
| B3 | Drag hard past each edge (left, right, up, down) | Growing resistance, then a spring back to the limit. Never under the ground, never round to the unfinished back of the scene |
| B4 | Pinch out, then in | Zooms in and out smoothly and stops at a nearest and furthest distance. **The page itself must not zoom** |
| B5 | Pinch, lift one finger, keep moving the other | No jump; the remaining finger turns the view |
| B6 | Tap with a slight wobble | Counts as a tap (something reacts); the view doesn't turn |
| B7 | iPhone: swipe in from the left edge of the screen | Note whether Safari goes back. If it does, check Back returns to the lab with the day intact (section E) |
| B8 | Android: pull down from the top of the scene | No pull-to-refresh |
| B9 | Double-tap the scene, and double-tap the Pour button | No page zoom. A double-tap on Pour logs **one** glass (D2) |
| B10 | Long-press the scene | No text-selection loupe, no copy menu, no image-save sheet |
| B11 | Start a drag on ☰ or Pour and slide onto the scene; start a drag on the scene and release on Pour | Neither turns the view or presses the button by accident |

## C. Touching things in the scene

Dismiss the guide first, or leave it and watch its ticks.

| # | Step | Expected |
|---|---|---|
| C1 | Tap Ripple once while it's idling | Its eyes come to you; a happy wiggle and a few sparkles |
| C2 | Tap Ripple again while it's still reacting | A ticklish giggle (fins flutter, double blink); the reaction doesn't restart |
| C3 | Tap Ripple three times within about 6 s | The third tap makes it curious (head tilt) |
| C4 | Tap the open water | A small ring spreads; fish dart away |
| C5 | Press and hold the water for about a second, then release | A bigger plunge: wider, faster rings, a rebound ring, a little spray |
| C6 | Tap a lily pad | It dips, bobs, turns and drifts away from your finger; petals ruffle on a pad with a flower |
| C7 | Tap the bamboo spout (portrait: its end is at the right edge) | A short trickle of droplets into the pool. **The number in the header doesn't change** |
| C8 | Tap the grass on the bank | The plants rustle |
| C9 | Tap Ripple and the spout during a pour | Ripple glances at you; the spout ignores you; the pour carries on |
| C10 | Leave it alone for 30 s without touching anything | Something you haven't tried gives a small sign of life (a pad dips, the spout drips, Ripple glances at you) |

## D. Hydration and persistence

Note the number in the header before each step.

| # | Step | Expected |
|---|---|---|
| D1 | Press Pour 250 ml once | It pours for about 3 s; the number rises by exactly 250 |
| D2 | Double-tap Pour quickly | Exactly +250, not +500 |
| D3 | After a pour, tap Undo within 10 s | The number drops by exactly 250; the spring settles down; Undo disappears |
| D4 | Pour, then wait without touching | Undo disappears after about 10 s |
| D5 | Pour, then reload the page | The number is unchanged after the reload |
| D6 | Pour, close the tab, reopen `/lab/` | The number is kept |
| D7 | Pour, switch to another app for 2 minutes, come back | The number is kept, and the scene runs again |
| D8 | Lock the phone during a pour; unlock after 10 s | The glass is logged exactly once; the scene runs again |
| D9 | Open the lab in two tabs; pour in one, switch to the other | The other tab shows the new total. Pour there: both tabs end up 500 higher than at the start |
| D10 | Pour until the goal (2,000) | A single celebration; the button becomes a quieter "Log 250 ml". Logging more adds exactly 250 each time with no celebration. After six glasses within an hour, "Sip, don't rush" appears |
| D11 | Next day: open the lab after midnight (or set the date forward: iPhone Settings → General → Date & Time; Android Settings → System → Date & time) | A fresh day; yesterday's glasses aren't counted. Set the date back afterwards |
| D12 | Private browsing (Safari Private / Chrome Incognito) | Logging works. Closing the private tab forgets the day; that's expected |
| D13 | Airplane mode after the page has loaded | Logging, Undo and reload-from-cache (if it reloads) behave the same; note if the page can't reload offline (the lab isn't an offline app) |

## E. Browser navigation

| # | Step | Expected |
|---|---|---|
| E1 | From `/lab/`, open another site, then press Back | The lab reloads (or restores); the day is intact; no blank or frozen canvas |
| E2 | Press Forward and Back again a few times | Same; no duplicated glasses |
| E3 | Reload during a pour | After the reload the glass is counted exactly once (it's saved the moment Pour is pressed) |
| E4 | Share or copy the URL and open it in a new tab | The same day is shown |
| E5 | Leave the tab in the background for 10 minutes | Coming back: the scene resumes within a second or two; no error |

## F. Performance (with `?dev`, Lab tools open)

| # | Step | Record |
|---|---|---|
| F1 | 30 s after loading, idle | The Lab tools line: fps, frame time (p90), draw calls, resolution |
| F2 | During a pour | fps (watch for drops below about 30) |
| F3 | Drag around continuously for 20 s | Does it stay smooth? Any stutters? |
| F4 | Leave it running 5 minutes, then repeat F1 | Does the phone get warm? Does the resolution drop? |
| F5 | iPhone Low Power Mode / Android Battery Saver on | fps (Safari limits to 30 fps in Low Power Mode; that's expected) |
| F6 | Load time | Seconds from opening the URL to Ripple appearing (the Lab tools line shows "loaded in … ms" for the GLB) |

**Target:** steady 30 fps or better on a mid-range phone, no stutter during a pour, no crash or reload after 5 minutes.

## G. Accessibility on the device

| # | Step | Expected |
|---|---|---|
| G1 | **VoiceOver** (iPhone: Settings → Accessibility → VoiceOver) or **TalkBack** (Android: Settings → Accessibility → TalkBack). Swipe through the page | In order: "Spring Hollow, with Ripple…" (the scene); the progress "750 / 2,000 ml"; Settings; the guide and its three lines with Got it; Pour 250 ml. The 3D canvas itself isn't read |
| G2 | Double-tap Pour with the screen reader on | It announces "Pouring 250 ml…", then "Poured 250 ml. … Undo is available just before the Pour button." |
| G3 | Swipe back one item to Undo and double-tap | "Undone. … today." Focus moves to Pour |
| G4 | Open Settings with the screen reader; toggle Reduce motion and Sound | Each switch announces its name and state |
| G5 | With the screen reader on, try to turn the scene | Note what happens (the scene is marked as an application; it may need the screen reader's pass-through gesture). The scene is optional; logging must stay fully usable without it |
| G6 | System Reduce Motion on (iPhone: Accessibility → Motion; Android: Accessibility → Remove animations) and reload | No opening camera move; celebration is a gentle happy with no jump or camera swoop; flicks stop at once |
| G7 | ☰ → Sound on. Pour, tap the water, tap Ripple | You hear a soft brook, a pour gurgle and splash, a chime per glass, and small plinks for taps. **iPhone: also try with the ring/silent switch on silent.** Note whether sound plays (Safari usually mutes web audio on silent) |
| G8 | Sound off again | Silence |
| G9 | Bluetooth keyboard (if available): Tab through the page | A visible focus ring on every stop; Enter presses Pour; Escape closes the menu; arrow keys turn the scene |

## Results template

Copy this for each device.

```
Device:            (model)
OS / browser:      (e.g. iOS 19.1 / Safari; Android 16 / Chrome 142)
Low Power / Saver: on | off
Lab tools line:    (quality, resolution)
Tester, date:

A1 ✓/✗/–  notes
A2 …
...
G9 …

Issues found: (step, what happened, screen recording link)
```
