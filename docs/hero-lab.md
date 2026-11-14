# Hero Experience Lab: technical report

**What it is.** A separate, runnable prototype of WaterBuddy's defining moment. Ripple, the approved Buddy, loaded from its GLB (`public/models/buddy/ripple-waterbuddy.glb`), lives in a 3D spring. Logging 250 ml pours water into the spring and Ripple reacts. The app itself is untouched.

**Run it.** `cd apps/web && npm run dev`, then open `http://localhost:5175/lab/`. On a phone on the same network, use `npm run dev -- --host` and open the printed address with `/lab/`.

**Status:** prototype for review. Nothing here has been added to the app yet.

## How to review it

| Question | Where to look |
|---|---|
| Is Buddy memorable? | Ripple is the only Buddy now. Zoom in and orbit around it. Tap it and move the mouse (its eyes lead, its head follows). Reaction triggers are in **Lab tools** (dev only, see below). |
| Does the scene feel alive? | Leave it for a minute: fish, dragonflies, idle drips from the spout, swaying ferns, drifting motes, Buddy glancing around and blinking. |
| Is logging satisfying? | Turn **Sound** on (☰), then press **Pour 250 ml**. Five pours reach the goal and the one celebration. After that the button becomes a quiet **Log 250 ml**. **Undo** appears for 10 s after each glass; the day survives a reload. |
| Is exploring rewarding? | Drag, pinch, then tap Ripple (idle, and again mid-reaction), the water (tap, then press and hold), a lily pad and the spout. **☰ → How to explore** reopens the guide. |
| Does it work on a phone? | Open `/lab/?dev` on a phone and open **Lab tools**: it shows fps, frame time, draw calls and triangles. `?dev&perf` adds the app's meter; `?dev&q=low` / `?dev&q=high` and `?dev&dpr=1` force a tier. Without `?dev` these switches are ignored. |
| Motion sensitivity | Menu → Reduce motion, or the phone's own reduced-motion setting. |

## Audit (before building)

- **Stack:** React 19, TypeScript, Vite 6 with vite-plugin-pwa, three r186 and React Three Fiber, Dexie, Vitest and Playwright.
  - Existing 3D is hand-written three.js with custom GLSL, wrapped in R3F canvases (`src/three/`).
  - It already has quality fallbacks and a reduced-motion hook.
- **Reused unchanged:**
  - The sip guard and its threshold (`domain/guards.ts`, safety rule 4).
  - The synthesized pour sound (`three/audio.ts`).
  - The `?perf` meter, the WebGL check, the reduced-motion hook, design tokens and fonts.
- **Isolation:**
  - `/lab/` is its own Vite page and bundle (`apps/web/lab/index.html`, `src/lab/`).
  - The app's service worker neither serves nor precaches it.
  - The Vercel rewrite leaves it alone.
  - The app's first page still loads three.js lazily (checked in the build output).
- **Not reused:**
  - Pip, as asked.
  - The tidepool scene: its ideas (caustics, motes) carried over, but the new spring is rebuilt around a rising water level.

## QA and stability pass

The current QA report is [`hero-lab-qa.md`](hero-lab-qa.md): automated results, real-device status (none yet), issues fixed, known limitations and what still needs a person. The procedure for real phones is [`hero-lab-device-testing.md`](hero-lab-device-testing.md). The lab is **not release-ready** until that procedure has been run on a real iPhone and a real Android phone.

## Interactive environment (iteration 7)

**Camera.**
- **Drag to look** with a mouse, pen or one finger. The drag moves a goal and the view eases toward it, so it's smooth at any frame rate. On release it glides on with the finger's speed and slows down; the glide is time-based, so it's the same on 30 and 120 Hz screens.
- **Natural angles only.** Past a limit the drag meets growing resistance and springs back on release (measured: held at −0.72 rad against a −0.62 limit, back to −0.62).
- **Zoom:** pinch, scroll or a trackpad pinch, all eased.
- **Taps vs drags:** a tap tolerates a small wobble (12 px for a finger, 6 for a mouse) without turning the view.
- **No conflicts with buttons:** only the canvas listens. Buttons never start a drag, and a drag released over the Pour button doesn't press it (tested).

**What each thing does when touched.** None of these can log water. Only the Pour button does, and a browser test taps everything, long-presses, drags and scrolls, then checks the count and the saved day are unchanged.
- **Ripple:** its eyes come to you first, then it answers according to what it's doing.
  - Idling: happy; keep tapping and it turns curious ("what is it?").
  - Mid-reaction: a ticklish giggle layered on top (fin flutter, a double blink, a head wobble). The clip never restarts.
  - Celebrating: joins in with sparkle, never interrupted.
  - Watching a pour: a quick glance at you, then back to the water.
- **Water:** a tap makes a small, quick ring. A longer press (up to about a second) makes a bigger plunge: longer waves that travel faster and further, a rebound ring, a little spray and a splash sound. Fish scatter in proportion. The CPU's wave height matches the shader, so pads ride the same rings.
- **Lily pads:** a touched pad dips, bobs, turns and drifts away from the touch, and its petals ruffle. Every pad now tilts with the surface, so passing ripples rock it.
- **Bamboo spout:** a short trickle of droplets that ring the pool. It's ignored while a glass is pouring. It never starts a pour and never logs.
- **The bank:** grass and ferns rustle (as before).

**Discovery.**
- **Hand cursor:** on desktop, the cursor becomes a hand over things that respond, and pads and the spout give a small welcome as you arrive.
- **Signs of life:** every 9–13 s of quiet, one thing not yet touched shows a sign of life (a pad dips with a soft ring, the spout lets a few drops go, Ripple glances and nods). Each one stops once you've tried it.
- **First-visit guide:** three short lines (look around; tap Ripple, the water, a pad or the spout; only Pour logs water).
  - Each line ticks off as you try it ("2 of 4 found").
  - **Got it** dismisses it for good; **☰ → How to explore** brings it back.
  - On desktop it sits bottom-left over the bank; on phones, under the header. Either way it's clear of Ripple, the pool and the spout.

**Hydration integrity.**
- **Saved at once:** the day is saved on this device after every change and restored on reload (same calendar day only). Damaged or unknown data is ignored, never half-loaded.
- **Undo:** after each glass lands, **Undo** is offered for 10 seconds. It takes back only the last glass you logged, never the demo's seeded entries. The spring settles back down.
- **No second celebration:** undoing the goal glass and logging again doesn't celebrate twice (the day remembers it already celebrated).
- **Tests:** unit tests cover saving, the new-day rollover, bad data, undo and the second celebration. Browser tests cover reload, Undo and the guide.

**Cost.** Frame time is unchanged (M5: ~19 ms at 2560×1600, ~6.8 ms at phone size). Precise picking against Ripple's skinned meshes costs about 5 ms, so it runs only on a tap. Hover uses a bounding sphere, once per frame (0.003 ms). A finger's near-miss retries also use the cheap test.

## Performance pass (after the audit)

**Correction first.** Earlier sections of this report quoted 1 to 4.6 ms per frame on the M5. Those numbers were wrong: they timed the CPU with `gl.finish()`, which on Chrome's ANGLE/Metal returns before the GPU is done. GPU timer queries aren't trustworthy here either: they include queueing between frames (they read 41 ms where frames were arriving every 23 ms). The honest number is the steady gap between frames with vsync and the frame cap off, at a fixed resolution. The earlier sections are left as written, marked below.

**Method.** Chromium on this Mac's GPU (Apple M5, ANGLE/Metal), `--disable-gpu-vsync --disable-frame-rate-limit`, adaptive resolution held off, 240 frames after a 90-frame settle, median. Each number is the best of three runs; launch-to-launch spread is about ±15%, so small differences mean nothing. Draw calls are counted for every pass.

| Tier, buffer | Before | After |
|---|---|---|
| High, 2560×1600 (desktop at 2×) | ≈ 28 ms (36 fps) | ≈ 19 ms (52 fps) |
| High, 683×1477 (phone size) | ≈ 9.5 ms | ≈ 7.0 ms |
| Low, 683×1477 (phone size) | ≈ 4.4 ms | ≈ 4.0–4.4 ms |
| Draw calls, high, desktop framing (refraction · reflection · main incl. transmission) | 253 · 154 · 444 | 90 · 80 · 316 |

**What cost what** (switching one thing off at a time, desktop 2×):
- **Ripple's transmission copy:** about 10 ms. three redraws the opaque scene behind Ripple at full retina resolution so its liquid skin can show it. Now drawn at one sample per CSS pixel (`transmissionResolutionScale = 1 / dpr`). Side by side with full resolution the difference is 0.5/255 on average: the skin's roughness blurs it anyway.
- **The refraction pass:** about 4 ms. It now skips everything above the water (sky, distant hills, canopy, grass, flowers, ferns, light shafts, motes, mist), which can never be seen through the surface.
- **The reflection pass:** about 2 ms. Kept.
- **Foliage, light shafts, Ripple itself:** under 1 ms each. The frame is limited by pixels, not triangles, so I didn't make a low-resolution terrain.
- **Petals and canopy cards** were 48 + 38 separate meshes, drawn in every pass. They're now 2 + 3 instanced meshes. That doesn't change the M5's time (its GPU is the limit) but it removes about 130 draw calls per frame, which is what phones' CPUs pay for.

**Low tier and Ripple's liquid look.** Keeping transmission on the low tier cost about +1 to 1.5 ms at phone size (+25 to 40%) at any resolution, because the cost is redrawing about 230 objects, not pixels. So the low tier stays opaque, but no longer looks pale: each liquid material takes the colour light passing through it would have had, from the asset's own attenuation colour, thickness and transmission (`liteLiquid` in `rippleGlb.ts`). Runtime only; the file isn't changed.

**Adaptive resolution.** It steps down below 50 fps (median frame over 20 ms), and back up with clear headroom (under 12 ms; twice as fast under 8 ms). Gaps over a second and hidden pages don't count. One limit, stated plainly: timing alone can't tell a throttled embed (such as a hidden preview panel) from a GPU-bound phone; both show long gaps with little page work (checked under SwiftShader). So a throttled panel still steps down, and steps back up within a few seconds once it's visible.

**A smaller GLB, original kept.** The page now loads `ripple-waterbuddy.opt.glb`, made by `apps/web/scripts/compress-ripple.mjs`, and falls back to the untouched original if it fails (browser-tested).
- **Size:** 2.30 → 1.05 MB on disk; 1.06 → 0.49 MB gzipped.
- **What changed:** geometry, skin, instancing and the four clips are in `EXT_meshopt_compression` over the original 32-bit floats. Decoding gives back every value bit for bit (checked on all 482 accessors; a triangle may start at a different corner, same winding). The two textures are WebP (288 → 24 KB and 98 → 7 KB; PSNR 40.6 and 44.2 dB).
- **What I didn't do, and why:** the standard `optimize`/`meshopt` presets quantize, prune and dedup. On this file that rewrote 54 node transforms (including animated ones such as `mouth` and `head_shell`), added 8 nodes and merged 8 materials, which Ripple's live layer and clips depend on. Not used.
- **Load time:** unchanged on a local server (about 320 ms on the M5 either way; about 7.8 s under SwiftShader, where slow frames dominate). The gain is the download: about half a megabyte less over the network, gzipped.

**Still to measure:** a real phone. Open `/lab/?dev` and **Lab tools**.

## Ripple from the supplied GLB (current)

**What the asset is.**
- **File:** `apps/web/public/models/buddy/ripple-waterbuddy.glb`. It's a byte-identical copy of the supplied file (SHA-256 starts `44d81b70508a3db1`); the original was not modified. Since the performance pass, the page loads a compressed copy (`ripple-waterbuddy.opt.glb`, see above) and falls back to this file.
- **Origin:** it was written by this lab's own exporter (generator `THREE.GLTFExporter r186`). It's Ripple as reconstructed here, now treated as the approved asset.
- **Contents:**
  - 2.3 MB, 101 meshes, about 90k triangles once instanced beads are counted, 19 materials and 2 PNG textures;
  - an 8-bone skin;
  - four clips: idle 4.0 s, happy 1.8 s, curious 2.6 s, celebrate 3.4 s, with 35 channels each.
- **Material extensions:**
  - transmission, volume, IOR, clearcoat, iridescence and emissive strength;
  - unlit, for the inner glow cores;
  - `EXT_mesh_gpu_instancing` (required).
  - three r186's GLTFLoader supports all of them. Loading takes about 135 ms from the dev server.

**How it's played** (`engine/buddies/rippleGlb.ts`, `engine/buddies/clipDirector.ts`).
- **Loading:** GLTFLoader loads the file unchanged; three's AnimationMixer plays its own clips.
- **Idle** loops forever.
- **Reactions** cross-fade in (0.28 s), play once, and hand back to idle 0.4 s before their last frame, so nothing holds or snaps.
- **No conflicts:** a reaction already playing is never restarted, and a smaller one never interrupts a bigger one (curious can't cut into a celebration).
- **Unit tests:** six, against synthetic clips.

**Live layers on top of the clips** (they don't change the asset):
- Ripple turns partly toward what it's looking at.
- Its eyes follow the pointer or the action, with small darting glances.
- It drifts slowly in the water.
- Idle quickens while water pours.
- Glasses logged after the goal get a calm nod.

**Events → reactions.**
| Event | Reaction |
|---|---|
| A glass lands, before the goal | **happy** |
| The glass that reaches the goal | **celebrate** (once a day) |
| A glass after the goal | a calm nod. No clip, sparkle, light or chime. |
| Looking around (dragging the view), or tapping the water, a lily pad, the spout or the plants | **curious**, at most once every 4 s, never during a pour |
| Tapping Ripple | **happy** |
| Otherwise | **idle** |

**Loading and errors.**
- While the file loads, the scene works normally and a small note says "Ripple is on the way…".
- If loading fails, an alert says "Ripple couldn't load" with **Try again**, and logging still works. Browser tests force the failure and check both.
- The app's offline cache leaves this file out until the app itself uses it.

**Performance, measured.**
- **Apple M5 (high tier, 2048×1536):** ~~about 2.2 ms per frame~~ (wrong method; see "Performance pass" above).
- **Chromium's CPU renderer at Pixel 7 size (low tier):** a harsh worst case, not a real phone.
  - 167 ms per frame with the GLB blocked;
  - 337 ms with Ripple and transmission off;
  - with transmission on, the run didn't finish within 3 minutes.
- **What that means:**
  - On weak hardware Ripple's cost is draw calls, not triangles, so I didn't reduce geometry.
  - Only Ripple's silhouette (body, head, chest, crest, fins, tail fan) now casts shadows, which cut its shadow casters from 59 to 11. That's a render setting, not a change to the asset.
  - The low tier turns transmission off at runtime and lifts the emissive glow slightly; the file is untouched.
- **Still to measure:** a real phone (`/lab/?dev`, then Lab tools).
- **Testing switches (with `?dev` only):** `?q=low|high`, `?dpr=`, and `?buddyLite=0` to keep transmission on.

**Lab tools.** They play each clip, show the asset's statistics and the clip now playing, and reset the day. The old "Download Ripple" export is gone, because the supplied file is now the source. The procedural modelling code in `engine/buddies/sprite.ts` stays as the record of how the asset was made; the lab no longer runs it.

## Iteration 6: polish pass

**Ripple** (over the GLB's clips, nothing in the file changed).
- **Natural blinking:** the idle clip had blinks baked in, so they repeated every 4 s. While idling, the lids are held at rest and blink on a random schedule instead: gaps of 2–6.5 s, a fast close and slower open, the occasional double blink, with the lash line showing. Reactions keep their clips' own lids, blended by idle's weight so cross-fades stay smooth. Ripple also blinks as a reaction starts. Measured over 30 s of simulated idling: irregular gaps between 2.2 and 5.5 s, with doubles.
- **Celebrations use the whole body:** the fins flare, the cheek fins open and the tail whips through the jump. At the top, Ripple shakes off a spray of water droplets, which replace most of the sparkles.
- **Framing:** any celebration, including one from Lab tools, gets the look-up camera framing, so the leap stays in shot.
- **Transitions:** the hand-back from a reaction to idle is longer and softer (0.55 s).

**Environment.**
- A very slow, wide swell of light drifts across the hollow, like high cloud.
- There are fewer floating motes (240 / 120), so they read as atmosphere, not noise.
- The shadow-map type was updated for three r186 (PCFSoft was removed and fell back with a warning).

**Hydration rule: the sip guard uses real drinking times.**
- `logGlass` takes when the glass was drunk (`drankAt`, which defaults to now), and the guard counts only real drinking times in the last hour.
- **Glasses entered late** count at the time they were actually drunk, so catching up never reads as drinking fast.
- **Seeded demo entries** are marked `source: 'seeded'` and never count.
- **Future times** are clamped to now.
- **Four new unit tests** pin this down. Logging above the goal stays exact and is never rewarded (unchanged).

**Loading, measured.**
- The GLB is preloaded from the page head, so it downloads while the pond builds. One request, no duplicate (checked in Playwright).
- **This Mac's GPU:** it parses in about 135 ms.
- **Headless Chromium (CPU rendering):** about 10 s at phone size. The loader's steps queue behind very slow frames there; drawing every third frame while loading took it from 12.8 s to 10.4 s.
- Real phones render on a GPU, but this is the first thing to time on one (`/lab/?perf`).

**Frame cost (Apple M5, high tier).** ~~About 2.4 ms per frame idling, 4.6 ms during a pour~~: measured with `gl.finish()`, which was wrong. See "Performance pass" above.

## Iteration 5: visual and interaction quality

Everything below is layered over the existing GLB, pond, pour and hydration logic; none of them was replaced.

**Ripple** (`rippleGlb.ts`). Additive motion runs after the mixer poses each frame, so the clips stay the base:
- **Fins:** each flutters on its own slowly drifting rhythm, quicker while water pours or a reaction plays, and paddles against a turn. The cheek fins flicker and the tail fan swishes.
- **Head and eyes:** the eyes jump to the target and the head turns after them, part of the way, on a softer spring.
- **Antennae:** they lag the head's turn, then wobble back.
- **Body:** it leans toward what Ripple is watching, so it leans forward and down over the pour.

**Pond** (`water.ts`). Ripple crests catch a soft highlight, so each ring reads as it travels. The existing high-tier reflections, refraction and gusts are kept.

**Depth and vegetation** (`world.ts`), static or shader-swayed only, about five draw calls:
- sedge reeds clustered at the water's edge (260 on the high tier, 120 on the low), bluer and taller than the bank grass;
- small flowers in four colours scattered on the banks (220 / 100), as crossed cards;
- two slow mist veils at the back of the hollow, for depth between the pond and the trees.

**The pour** (`pour.ts`, `scene.ts`).
- **First impact:** a crown of droplets, higher than the steady splash.
- **While it runs:** a soft spray rises over the churn, and sun glints run down the falling water.
- **The camera:** leans gently toward the stream, then settles back. The move is about a third as large on tall screens, so Ripple stays in frame.
- **Ripple:** leans in to watch.
- Sound is unchanged: splash, bubbles, a chime per glass, and the goal arpeggio.

**Camera** (`orbit.ts`).
- Zoom glides instead of jumping, and released drags settle with softer inertia.
- The view opens with a three-second ease in from a wider, higher angle.
- The goal celebration looks up with the jump and eases back slightly, so the whole leap stays in frame.
- Any drag takes over a camera move immediately.
- With Reduce motion there are no camera moves.

**Layout fixes found in testing.** The sip-don't-rush note no longer covers Ripple: on desktop it sits under the progress card, and on phones just above the button. On phones in dev builds the Lab tools toggle steps aside while the note is up.

**Checked by:** Playwright captures at 1280×800 and Pixel 7 of idle, the impact, mid-pour, the landing and the goal celebration, plus the full lab test suite.

## Earlier: Ripple as built in code (iterations 2 and 3)

The sections below describe the reconstruction that produced the GLB.

### Ripple, the approved Buddy

### What Ripple is

**Ripple is an image-based reconstruction.** The team approved a Buddy designed in Tripo: a translucent aqua water sprite. We don't have that model's GLB, because Tripo only exports on a paid plan. So Ripple is a new model built from scratch in code, matched by eye to the concept's turnaround videos. It is **not** the Tripo model, and the lab says so in its menu and its name card.

### Iteration 2: character quality

**Silhouette.**
- **Crest:** a frilled wave that rolls back over the head in three crests and curls over at the tip. Two smaller frills splay out to each side, so it fans like a breaking wave from the front and rolls from the side. Two side curls and four violet-tipped antennae sit with it.
- **Eyes:** larger. They sit in soft rims of skin, with fibrous deep-blue irises, light pooling at the bottom and three catchlights.
- **Fins:** wider, cupped and scalloped, with ribs and droplet speckle in the texture.
- **Tail:** longer, looping forward on an 8-bone spine, with soft ridges and a ruffled fan.

**Materials.**
- **Liquid skin:** standard glTF transmission and volume. Light passes through and is tinted by its thickness, with clearcoat, iridescence and a soft emissive glow.
- **Inner light:** two light cores inside the head and belly show through the skin and breathe. They grow brighter as the day's water fills the spring, and flare when Ripple celebrates.
- **Fins:** see-through, iridescent membranes that ripple in the vertex shader.
- **Water beads:** bright glossy droplets.
- **Phones:** the low tier drops transmission for an opaque, brighter-emissive version, so Ripple stays legible and fast.

**Prominence.**
- Ripple is about 40% larger, and the camera now frames it first.
- On phones it sits in the middle of the visible area above the controls.
- I tried scene-wide key and rim lights, but they made every material in the scene cost more and stalled low-end rendering. Ripple's own materials carry that glow instead.

**Organic motion** (`RippleMotion` in `engine/buddies/sprite.ts`). A spring layer sits on top of the shared reaction curves, so nothing moves rigidly:
- **Follow-through:** the head lags hops and sways, then catches up. The crest and antennae jiggle a beat behind the head.
- **Fins:** they lift as Ripple falls and push down as it rises.
- **Tail:** a wave travels down the spine. Its swish grows with excitement and it drags against hops.
- **Drifting:** Ripple floats in a slow figure-eight, banking into each turn.
- **Eyes:** they jump in tiny saccades around whatever Ripple is looking at, and pupils dilate when curious.
- **Lids and breathing:** lids blink fast and open slower. The chest breathes.
- **Idle fidgets:** a tail flick or a fin stretch every 4 to 10 seconds.
- **Reduced motion:** all of this calms down to about a third.

**With the pour.**
- As water starts, Ripple turns to the spout with a curious "o".
- While water flows, its fins flutter faster and its tail swishes harder, scaled by the stream's strength.
- When the glass lands, Ripple goes happy (^ ^ eyes, a big smile, fins wide). On the goal glass it celebrates instead; past the goal it gives a calm nod.

**Only Ripple in the experience.** The concept picker is gone. The three earlier concepts (Cobble, Bloop, Nimbus) stay in `engine/buddies/` for reference but are no longer loaded.

**GLB export.** Menu → **Download Ripple (.glb, rigged)** writes `ripple-waterbuddy.glb`. It contains:
- the mesh with PBR transmission, volume, clearcoat and iridescence;
- the 8-bone skin and the mouth morphs;
- idle, happy, curious and celebrate clips, recorded through the same motion layer.

The fin ripple and inner-glow pulsing are live-only effects, so they don't export. A browser test checks the file's header, skin and clip names.

### Still open

- **Fidelity:** the Tripo concept has finer sculpted detail (flowing transitions between head, body and arms, surface texture). An artist could refine Ripple's GLB in Blender. If the team buys a Tripo plan, its mesh could be re-targeted onto Ripple's skeleton.
- **Licensing:** paid Tripo plans list "Commercial Use" as a benefit. The legal check should confirm whether a design made on Tripo's free plan can be used commercially, even as a reference.
- **Phones:** not yet run on a real phone. Check with `?perf`.

### Iteration 3: refinement

**Consumer interface and lab tools.**
- **Consumer layer:** only what a person would use: today's progress, the pour button, and Reduce motion and Sound in ☰.
- **Lab tools:** the team's tools (reaction triggers, Reset the day, the GLB download, the reconstruction note, and the render tier) moved into a **Lab tools** panel.
  - It's styled to look nothing like product UI: dashed amber border, monospace, a DEV tag.
  - It shows in the dev server, and in a production build only with `?dev`. A browser test checks it's hidden without `?dev`.

**After the goal: accurate, never rewarding.**
- Every glass is still logged exactly; the counter goes past the goal, for example 2,250 / 2,000.
- But once the goal is met:
  - the button turns into a quiet white **Log 250 ml** (no "Pour");
  - Ripple doesn't turn curious or get excited, and gives only a calm nod;
  - there are no sparkles, no light pulse, no chime (a neutral soft tick instead) and no motes swirling;
  - the status reads "Today's goal is already met, so there's no need for more unless you're thirsty."
- The sip-don't-rush note still appears after more than a litre in an hour. As in the app, it stays away for an hour once dismissed.

**Animation.**
- **Contentment lingers:** after a happy moment, a soft smile and slightly raised lower lids fade over about 3.5 s instead of snapping back.
- **Blinks:** Ripple blinks as its expression changes, which hides the switch. A thin lash line shows on blinks so a closed eye reads as a blink.
- **Eyes lead, head follows:** the eyes jump to a target and the head turns after them on a softer spring.
- **Independent fins:** each fin flaps at its own slowly drifting rate, curls on its own and paddles into turns.
- **Floating:** Ripple layers unrelated rhythms so the drift never visibly repeats. It rises a touch on each breath and pitches with its vertical speed.

**Materials** (no extra geometry). Ripple's liquid skin gains:
- a fresnel rim glow at grazing angles;
- slow caustic shimmer drifting through the body;
- rippling light thrown up from the pond onto its underside.

**Environment.**
- **Real reflections (high tier):**
  - a half-resolution mirror pass of everything above the water: Ripple, stones, ferns and bank;
  - clipped at the waterline and distorted by the waves;
  - Ripple's transmission and the light shafts are skipped in this pass to keep it cheap and free of streaks;
  - phones keep the sky-and-bank tint.
- **Ripples:** rings spread into softer wave trains as they age.
- **Wind:** gusts roll across the hollow, so plants sway harder as one passes and patches of water ruffle.
- **Plants:** every grass blade and fern clump has its own shade (yellower, bluer, darker).
- **Water and floor:** the water tints what's beneath it teal, and the pond floor is a little darker so the full pool no longer looks milky.

**The pour, coordinated.**
- **On press:** the button fills as the water lands, and "+250" rises from the counter.
- **On impact:** a splash sound, fish scatter, motes swirl, and the ferns by the spout shiver.
- **While it flows:** bubbles chatter and Ripple's fins and tail speed up with the stream.
- **On landing:** the pool settles with one wide ring, the spout lets go two trailing drips, and Ripple reacts.

**Sound** (Web Audio, synthesised, off until switched on):
- a soft brook ambience;
- the pour, with a gurgle and pitch rising as the spring fills;
- a splash on impact, and plinks for drips and bubbles;
- a bell chime one note higher for each glass toward the goal (a pentatonic run);
- an arpeggio only for the glass that reaches the goal.

**Cost.** ~~On the Apple M5 at 2560×1600 (high tier) a frame takes about 3.4 ms~~ (wrong method; see "Performance pass"). The main pass draws about 440 times and 458k triangles. Still to measure on real phones (`?perf`); phones use the low tier, which has no reflection or transmission.

## Earlier concepts (retired from the experience)

Cobble (river stone), Bloop (living jelly) and Nimbus (little cloud) came from the first iteration. They shared the animation system below. Their code remains in `engine/buddies/`, but the lab no longer loads them.

**How the animation works** (`engine/animator.ts`, unit-tested):
- Reactions (idle, happy, curious, celebrate, plus a calm "nod" past the goal) are curves over named channels: hop, squash, lean, tilt, blink, squint, smile, open, "o" mouth, arms and a signature accent.
- Each character maps those channels onto its own body, scaled by a temperament (bounce, tempo, float).
- Squash goes through an underdamped spring so it overshoots softly.
- Buddy's gaze is its own system: eye contact, glances at fish and dragonflies, and following the mouse or a tap.

## The spring (Spring Hollow)

- **Setting:** a limestone spring in a forest hollow, late morning, backlit by the sun.
- **Modelling:** everything is generated procedurally from fixed seeds, with no downloaded models or textures. That covers terrain, layered limestone boulders, moss, ferns, grass, lily pads with water lilies, a bamboo spout, canopy, three hazed tree lines, light shafts and motes. Foliage textures are painted on canvases at load.
- **Water level is today's progress.** Drinking visibly refills the spring:
  - the shoreline and the wet band on the stones move;
  - lily pads drift outward;
  - plants grow greener and fronds lift;
  - light shafts and motes brighten;
  - the lilies open.

**Water shader** (`engine/water.ts`):
- Refraction of the pool floor, pebbles and fish, with depth-based colour absorption (red goes first, so deeper water turns teal).
- Fresnel reflection of sky and banks.
- Sun glints and glitter, and soft shoreline foam.
- Up to 16 ripple rings plus a slosh wave when the level jumps. The vertices move too, so the shoreline laps.

**Stones and plants** (`engine/materials.ts`) extend three's own physically based materials. They keep real shadows and environment lighting, and add:
- caustics below the waterline;
- dappled canopy light;
- glow through backlit leaves;
- wind sway and touch "rustle";
- procedural surface grain.

**Taps:**
- Buddy: reacts.
- Water: ripples, scatters fish, and Buddy looks there.
- Lily pad: bobs.
- Spout: drips.
- Plants: rustle.

## The 250 ml pour (`engine/pour.ts`, `engine/scene.ts`)

One timeline drives everything, so nothing pops:

1. **0 s:** the spout dips. Buddy turns curious and looks at it. The pour sound starts if sound is on.
2. **0 to 0.7 s:** the stream's leading edge falls along a real ballistic arc (one mesh bent in the vertex shader).
3. **Impact:**
   - foam churns, droplets splash, and bubbles rise under the surface;
   - ripple rings spread and a slosh wave crosses the pool;
   - fish scatter, and motes swirl;
   - Buddy's gaze tracks the landing point.
4. **While pouring:** the level rises with the water actually landing, through a spring that overshoots slightly. The on-screen number counts up in step.
5. **About 2.3 s:** the stream thins, breaks from the spout and falls away.
6. **End:** Buddy is happy. On the glass that reaches the goal it celebrates instead: a jump, sparkles, dragonflies looping, and a warm flash. Past the goal it gives a quiet nod.
7. Throughout, the status line is announced to screen readers.

Safety rules hold:
- **No reward past the goal** (rule 1): tested.
- **Sip, don't rush** (rule 4): the app's own guard and wording.
- **Nothing is stored** beyond the chosen Buddy.

## Technology choices

| Option | Decision | Why |
|---|---|---|
| WebGL 2 via three r186 | **Used** | Same stack as the app, so it can move in later. Runs on every target phone. |
| WebGPU (`three/webgpu`) | Not now | Broadly available since Safari 26 / iOS 26, but older phones need a WebGL fallback anyway. Moving needs every shader rewritten in TSL. Nothing here needs compute. Worth revisiting for particle-heavy scenes. ([three r171+ WebGPU](https://www.svilenkovic.com/3d/webgpu-three-js), [browser support](https://webo360solutions.com/blog/webgpu-browser-support)) |
| React Three Fiber | Not for the lab scene | The scene needs exact control over three render passes, layers and the shadow update. Plain three.js inside a React component is simpler here. The HTML layer is React. |
| Custom GLSL shaders | **Used** | Water, jelly, cloud, stream and foam. Built-in materials extended rather than replaced where possible. |
| Procedural modelling | **Used** | No Blender on this machine, nothing to license, small download (lab code is about 96 KB before compression, plus three.js the app already ships). Characters react live to gaze and taps, which baked clips can't. |
| Blender assets | Next step | For production, final character meshes from an artist could replace the procedural bodies. The animator and face kit stay. The app's glTF pipeline (`npm run art:optimize`) is ready. |
| Rive | Not used | Rive is strong for 2D state-machine characters, but there's no evidence it handles lit 3D characters in a 3D scene. It would suit 2D UI moments around Buddy. ([comparison](https://jisaku.com/glossary/lottie-rive-spline-three-js-r3f-2d-3d-animation-library-2026)) |

## Rendering and performance

**Each frame:**
1. The scene without the water surface, at 60% resolution (45% on phones), into a half-float target with depth. The water uses it for refraction and depth.
2. The full scene to the screen.
3. When Bloop is on screen only: a frame copy, then the jelly drawn over it.

Shadows render once per frame and are reused.

**Measured:**
- **Apple M5, 2560×1600:** see "Performance pass" near the top: about 19 ms per frame uncapped at 2×, after the fixes (28 ms before). The figure first written here (1 to 2 ms) came from a wrong method.
- **Software WebGL (Chromium headless on SwiftShader):** about 5 fps at first. The lab now steps the simulation to real time, so a pour always takes its real 3.4 s. It also drops its resolution to 0.75× within about 1.5 s.

**Not yet measured:** real phones. This is the next gate: `?perf` on a ~₹10,000 Android and an iPhone, aiming for 30 fps or better. Expected costs, in order:
- the extra refraction pass;
- shadows;
- Bloop's frame copy;
- draw calls from the many small meshes (lily petals, canopy cards, dragonflies).

**Already in place:**
- Phones start on a lighter tier: fewer grass blades, ferns and motes; a coarser water grid; 1024 shadows.
- Resolution adapts both ways.
- Rendering pauses in hidden tabs.

**If a mid-range phone misses the target:**
1. ~~Merge the petals and canopy cards into instanced meshes~~ (done).
2. Update shadows every other frame.
3. Drop the refraction pass resolution further.

## Accessibility and motion

- Every action is a real button or radio. Taps in the scene are extras, not the only way.
- The scene takes focus: arrow keys look around, and + and − zoom.
- Status is announced politely.
- Reduce motion keeps every reaction's face and timing but drops hops, spins, camera drift, splashes and slosh. Sway and motes slow right down.
- Automated:
  - axe-core finds no WCAG 2.2 A/AA violations;
  - the page fits a phone without scrolling sideways;
  - both run in Chrome and Safari engines in `e2e/lab.spec.ts`.

## Tests

- **Unit (Vitest):** `src/lab/engine/lab.test.ts` covers the hydration rules (only the goal glass celebrates; the sip guard uses real drinking times and ignores seeded entries), the spring level and the animator. `clipDirector.test.ts` covers clip cross-fades, priority and no restarts.
- **Browser (`e2e/lab.spec.ts`, Chrome and Safari engines):**
  - the pour flow, reactions and no console errors;
  - the goal announced once, then quiet logging;
  - accessibility (axe, WCAG 2.2 A/AA) and no sideways scroll on a phone;
  - Ripple loads from the compressed GLB, with 8 bones and all four clips playable;
  - the original GLB loads if the compressed copy fails;
  - if both fail, logging still works and Try again recovers;
  - tapping Ripple, a pad, the spout and the water, a long press, a drag and a scroll never change the water logged or the saved day;
  - a logged glass survives a reload, and Undo takes it back (and stays undone after a reload);
  - the first-visit guide can be dismissed, stays dismissed, and reopens from the menu;
  - the consumer page shows no lab tools, hooks, meter or tester overrides without `?dev`;
  - the app at `/` is unaffected.

## Known gaps

- Not yet tried on a real phone or with TalkBack or VoiceOver.
- The characters are procedural first passes. An artist's pass on Cobble's proportions and face would lift it further.
- Sound is the app's existing simple synthesis, off by default.
- The lab day starts at 750 ml so the spring isn't empty on first look; Reset returns there.
