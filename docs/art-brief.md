# Art brief (Phase 7)

The app already runs with code-drawn placeholders. Everything here can be swapped in
piece by piece: drop a file in, run the check, and the app uses it. If a file is missing or
fails the check, the app keeps the placeholder, so nothing breaks while art is in progress.

Look and feel: the approved 3D prototype in `docs/prototype/` and the colour tokens in
`apps/web/src/styles/tokens.css`. Inks: paper `#F2EFE7`, deep water `#0E3A49`, shallows
`#6FB7B0`, Pip's coral `#E9784F`, rust `#9E4430`, ochre `#C89B3C`.

Rules that apply to all art (from `docs/safety-rules.md`):
- Pip never looks sick, thirsty or sad because of someone's logs.
- The bottle is a cherished, hand-blown glass home, never litter.
- No streak, loss or guilt imagery anywhere.

---

## 1. Pip, as a 3D model

**File:** `apps/web/public/models/pip.glb`, then set `"pip": "/models/pip.glb"` in
`content/art/models.json`.

**Check before committing:** `python tools/check_glb.py apps/web/public/models/pip.glb`

### Size and budget
| | Limit |
|---|---|
| Triangles | 18,000 or fewer in total |
| File size | 1.5 MB or less after compression |
| Textures | 1024 px or smaller, WebP; flat colours preferred |
| Scale | metres, Y up; the bottle is about 2.8 long and rests on y = 0 |
| Compression | `npm run art:optimize -- in.glb out.glb` (Meshopt, from `apps/web`) |

### Node names the app looks for
Names must match exactly. Everything else in the file is free.

| Node | What the app does with it |
|---|---|
| `Bottle` | Group holding the glass, liquid and cork |
| `Glass` | Mesh. Its material is replaced with the app's glass shader |
| `Liquid` | Mesh filling the inside of the bottle. Replaced with the liquid shader, which cuts it at today's fill level |
| `Cork` | Mesh, positioned **in** the neck. The `cork` clip (or the app) moves it |
| `Pip` | Group for the crab (body, legs, claws, eyes) |
| `Eye_L`, `Eye_R` | Eyeball groups. The app turns them to look around and at the camera; keep their forward axis +Z |
| `Lid_L`, `Lid_R` | Eyelids. The app rotates them on X for blinks and expressions (0 = open, about 1.6 = closed) |
| `Mouth` | Empty at the bottle's mouth, where the pour stream starts |

Optional shape keys on any mesh: `happy`, `surprised`, `sleepy`. The app blends them for
expressions if they're there.

### Animation clips
Hand-animated, 30 fps. Names must match. Eyes and blinks stay code-driven, so don't key
the eyes or lids in these clips.

| Clip | Length | Loops | Moment |
|---|---|---|---|
| `idle` | 4–6 s | yes | Breathing, small claw fidgets |
| `hide` | 1.1 s | no | Ducks into the bottle when a drink is poured (holds at the end while hidden) |
| `peek` | 0.9 s | no | Pops half out and back |
| `cheer` | 1.1 s | no | Claws up after a pour |
| `dance` | 2.2 s | no | Halfway, a full bottle, or a finished field task |
| `wave` | 1.4 s | no | Hello, and when tapped |
| `nod` | 0.8 s | no | Small acknowledgement (reduced motion, past the goal) |
| `click` | 0.5 s | no | Claw clack |
| `cork` | 0.8 s | no | Pip pushes the cork into the neck (played backwards to uncork) |
| `sail` | 3–4 s | yes | Riding the bottle across the Waterverse |

### Must read at 24 px
At icon size Pip is: one coral dome, two white eyes on stalks, one claw. Check it by
looking at a 24 px render before adding detail.

---

## 2. Postcard illustrations (Route I, six cards)

**Files:** `content/art/postcards/<card id>.png` (or `.jpg`), then set `"art": true` in the
card's JSON and run `python tools/build_art.py`. That makes the WebP sizes the app loads.

| | |
|---|---|
| Shape | Portrait 4:5, at least 1600 × 2000 px |
| Colour | sRGB, the app inks above, painted in one consistent hand across all six |
| Content | What the card's `alt` text says (it is the brief for each picture) |
| Accuracy | Every animal, plant and landmark drawn must match the card's sources |

Cards and what to draw (from their `alt` text):
1. **Loktak Lake** — rings of floating green islands (phumdis), low hills; Moss is a resident here (see 3)
2. **Umngot River** — a canoe over water so clear its shadow lies on the pebbles
3. **Majuli** — a long green river island, thatched roofs, a ferry on the wide river
4. **Sundarbans** — mangroves on stilt-like roots over a tidal creek at dusk
5. **Chilika Lake** — a calm lagoon, a sandbar on the horizon, a dolphin's fin
6. **Vembanad Lake** — rice fields below the waterline, a canal, coconut palms on a clay bank

---

## 3. Moss, the marimo at Loktak

A round, velvety green moss ball who lives among Loktak's floating islands. Friendly,
slow, a little sleepy. Small dark eyes, no mouth. In the Waterverse Moss bobs beside the
Loktak island once its fog lifts (placeholder already in the app). Same rules as Pip: never
sad or unwell.

---

## 4. Sound

Today every sound is synthesised in `apps/web/src/three/audio.ts` and off by default.
Final sounds replace these one for one, as short OGG/MP3 files under 40 KB each:
pour (pitch rises with the fill), splash, cheer chord, cork pop, page fold, sticker press,
postcard unfold, fog lifting. Gentle, never alarming; nothing for reminders (the phone's
own notification sound is used).

---

## 5. Stamps, stickers and buttons

Stamps and stickers animate with CSS today (decision D-010). If an animator joins, Rive
files can replace them; until then keep sticker art as SVG in the two-ink style of
`apps/web/src/components/Sticker.tsx`.
