# WaterBuddy

Fill Pip's bottle today. Get a postcard tomorrow.

WaterBuddy is a hydration companion for every age. Pip, a hermit crab who lives in a glass bottle, keeps today's water in his home; when it's full he sails overnight to a real place on Earth and sends a postcard in the morning.

## Repo

```
apps/web/      the app: React + TypeScript + Vite (+ React Three Fiber from Phase 2), installable PWA
apps/api/      Python 3.12 + FastAPI: reminders and web push (Phase 6), opt-in sync later
content/       postcards and facts as JSON, each with sources and a review status
tools/         Python scripts: content validator, icon generator
docs/          decisions, safety rules, and the approved 3D prototype (docs/prototype/)
```

## Run it locally

Web app (needs Node 20+):

```bash
cd apps/web
npm install
npm run dev
```

Python API (needs Python 3.12+):

```bash
cd apps/api
python3.12 -m venv .venv
.venv/bin/pip install -r requirements-dev.txt
.venv/bin/uvicorn app.main:app --reload
```

To let the app talk to the API, copy `apps/web/.env.example` to `apps/web/.env`.

Hero Experience Lab (the new Buddy concepts, Spring Hollow and the 250 ml pour): with `npm run dev`
running, open `http://localhost:5175/lab/`. It's a separate page; see `docs/hero-lab.md`.

Reminders locally: run `.venv/bin/python -m app.vapid`, put the two keys in `apps/api/.env`
with `WB_SCHEDULER_ENABLED=true`, then build and preview the web app (`npm run build && npm run preview`).
Push needs the production service worker, so it doesn't work under `npm run dev`.

## Checks

```bash
cd apps/web && npm run lint && npm run typecheck && npm test && npm run build
cd apps/web && npx playwright install chromium webkit && npm run test:e2e
cd apps/api && .venv/bin/ruff check . && .venv/bin/pytest
python3 tools/validate_content.py && python3 -m pytest tools -q
python3 tools/build_art.py --check
```

## Adding art

See [`docs/art-brief.md`](docs/art-brief.md). In short:

- **Pip's model:** compress with `npm run art:optimize -- in.glb public/models/pip.glb` (in `apps/web`), check with `python tools/check_glb.py apps/web/public/models/pip.glb`, then set `"pip": "/models/pip.glb"` in `content/art/models.json`.
- **Postcards:** put the painting in `content/art/postcards/<card id>.png`, set `"art": true` in the card's JSON, and run `python tools/build_art.py` (needs `pip install -r tools/requirements.txt`).
- **Icons:** `python tools/make_icons.py apps/web/public/icons` redraws the PNG icons and the notification badge from the same shapes as `favicon.svg`.

CI runs all of these on every push and pull request (`.github/workflows/ci.yml`).

## Every age, privacy and launch

- **Age modes:** the age range picks kid, teen, adult or older mode (`apps/web/src/domain/modes.ts`, decision D-011). Under 18, nothing leaves the phone.
- **Accessibility:** `e2e/a11y.spec.ts` runs axe on every screen in both engines; the people checks are in [`docs/accessibility.md`](docs/accessibility.md).
- **Real-phone speed:** open the app with `?perf` for a frame-rate meter.
- **Privacy:** the notice people read is `content/privacy-notice.json`; the data map for the legal check is [`docs/privacy.md`](docs/privacy.md).
- **Health review:** [`docs/health-review.md`](docs/health-review.md) lists every number and phrase a reviewer signs off.
- **Pilot:** [`docs/pilot.md`](docs/pilot.md); after two weeks, `python -m app.pilot_report --since <start day> --participants <n>` in `apps/api`.
- **Launch:** [`docs/launch-checklist.md`](docs/launch-checklist.md). `python tools/validate_content.py --strict` is the automatic gate; it fails until every review is in.

## Deploy

- **Web:** import the repo in Vercel and set the root directory to `apps/web`. `vercel.json` handles the service worker and caching headers. Set `VITE_API_URL` to the API's URL.
- **API:** in Render choose *New → Blueprint* and pick this repo; `render.yaml` deploys `apps/api` with a small Postgres database. Set `WB_ALLOWED_ORIGINS` to the web app's URL, and the push keys from `python -m app.vapid`.
- **Pilot only:** set `VITE_FEEDBACK_URL` in Vercel to the feedback form's link; adults see it under You.
- **Reminders:** in GitHub, add the repository variable `WB_API_URL` and the secret `WB_CRON_TOKEN`, the same value as on Render (make one with `python -c "import secrets; print(secrets.token_urlsafe(32))"`). `.github/workflows/reminders.yml` then sends due reminders every 10 minutes.
- **Checking on real phones:** Android Chrome works from the website or the installed app. iPhone and iPad need iOS 16.4 or later, and WaterBuddy added to the Home Screen first.

## Rules that never bend

Read [`docs/safety-rules.md`](docs/safety-rules.md) before building any feature that rewards, reminds or counts. Decisions and their reasons live in [`docs/decisions.md`](docs/decisions.md).

## Phases

| | Phase | Status |
|---|---|---|
| 0 | Foundations | Done |
| 1 | The tracker, no 3D yet | Done |
| 2 | Pip and the tidepool | Done (frame rate still to check on a real mid-range phone) |
| 3 | Field tasks and the journal | Done |
| 4 | Night voyage and postcards | Done (cards await a named fact reviewer) |
| 5 | The Waterverse | Done (smoothness still to check on a real mid-range phone) |
| 6 | Reminders and installing | Done (real-phone delivery still to check) |
| 7 | Production art and motion | Pipeline done; art itself is with the art track (`docs/art-brief.md`) |
| 8 | Every age, privacy and launch | Built; legal check, health review, real-phone checks and the pilot are with people (`docs/launch-checklist.md`) |
