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

## Checks

```bash
cd apps/web && npm run lint && npm run typecheck && npm test && npm run build
cd apps/web && npx playwright install chromium webkit && npm run test:e2e
cd apps/api && .venv/bin/ruff check . && .venv/bin/pytest
python3 tools/validate_content.py && python3 -m pytest tools -q
```

CI runs all of these on every push and pull request (`.github/workflows/ci.yml`).

## Deploy

- **Web:** import the repo in Vercel and set the root directory to `apps/web`. `vercel.json` handles the service worker and caching headers. Set `VITE_API_URL` to the API's URL.
- **API:** in Render choose *New → Blueprint* and pick this repo; `render.yaml` deploys `apps/api`. Set `WB_ALLOWED_ORIGINS` to the web app's URL.

## Rules that never bend

Read [`docs/safety-rules.md`](docs/safety-rules.md) before building any feature that rewards, reminds or counts. Decisions and their reasons live in [`docs/decisions.md`](docs/decisions.md).

## Phases

| | Phase | Status |
|---|---|---|
| 0 | Foundations | Done |
| 1 | The tracker, no 3D yet | Done |
| 2 | Pip and the tidepool | Next |
| 3 | Field tasks and the journal | |
| 4 | Night voyage and postcards | |
| 5 | The Waterverse | |
| 6 | Reminders and installing | |
| 7 | Production art and motion | |
| 8 | Every age, privacy and launch | |
