# Decision log

Each decision records what we chose, why, and what would make us revisit it. Add new entries at the bottom; never rewrite old ones.

## D-001 · Local-first, no account in v1 (9 Nov 2026)
**Chose:** drink logs live only on the device (IndexedDB). No sign-up to use the app.
**Why:** privacy for every age group, works offline, removes most child-consent work, faster to build.
**Revisit when:** people ask to use WaterBuddy on two devices. Then add opt-in sync (D-004).

## D-002 · Buddy is Pip, a hermit crab whose shell is a glass bottle (9 Nov 2026)
**Chose:** Pip over Moss (marimo) and Fold (origami). Approved by the team.
**Why:** his bottle is the progress vessel, so the character is the interface; every product moment already has an action (pour, cork, sail, message in a bottle); expressive without dialogue.
**Guardrail:** the bottle is a cherished hand-blown glass home, never litter.
**Keep:** Moss lives in the Waterverse at Loktak Lake; Fold's origami language opens and closes postcards and the journal.

## D-003 · App stack: React + TypeScript + Vite + React Three Fiber, as a PWA (9 Nov 2026)
**Why:** the 3D tidepool, liquid and Waterverse must run in the browser at 60 fps; React Three Fiber keeps 3D as components beside the UI; WebGL 2 is the baseline because WebGPU is still missing on Firefox for Android.
**Rule:** the tracker never depends on 3D. Numbers and logging render first; 3D loads after, and a flat layout is always available.

## D-004 · Server: Python 3.12 + FastAPI (9 Nov 2026)
**Why:** the team wants Python; it suits scheduling, push and content tooling. It runs the reminder service (Phase 6) and later opt-in sync.
**Privacy rule:** the server never receives drink logs unless a person opts in to sync.

## D-005 · Facts live in content files with sources (9 Nov 2026)
**Chose:** postcards and tips are JSON in `content/`, each with sources and a review status, checked by `tools/validate_content.py`.
**Why:** health and geography facts must be traceable; a release build refuses unsourced or unreviewed content.

## D-006 · Hosting to start: Vercel (web) and Render (API), free tiers (9 Nov 2026)
**Why:** both deploy from GitHub on every push and have free tiers that suit a pilot.
**Revisit when:** reminders need guaranteed uptime (Render's free tier sleeps when idle).

## D-007 · Night voyage rules (10 Nov 2026)
**Chose:** a day whose goal is met earns one voyage. The postcard washes up the next morning, in route order, and is never taken back, even if a log is later deleted. Over-goal drinking earns nothing more. After last call (two hours before bedtime, 22:30 if unset) Today stops counting glasses to go and says "We'll sail tomorrow".
**Why:** safety rules 1, 3 and 9: no reward for drinking more, no late-night nudges, nothing to lose.
**Content:** Route I is six Indian wetlands and rivers with official sources (Ramsar, UNESCO, state tourism and lake authorities). Postcard art is drawn placeholders until Phase 7.
**Revisit when:** a health reviewer confirms the last-call window, or testers want cards on a different schedule.
