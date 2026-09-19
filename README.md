# ArgusAI

Hands-free voice agent for warehouse goods receipt. Built for the Tech Europe Hackathon.

**Partners**: Google DeepMind, Pydantic, Modal, Conduct

**Live demo**: https://sahil0591-argusai--argusai-web.modal.run

---

## What it does

A warehouse clerk talks through a delivery on their phone. ArgusAI:

1. Transcribes and understands natural speech via Gemini Live API
2. Matches received items against the purchase order (fuzzy matching to handle voice recognition errors)
3. Detects discrepancies: shortages, overages, wrong items, and damage
4. Applies policy rules to automatically accept minor issues or escalate significant ones
5. Drafts supplier claims for flagged items
6. Exports SAP-ready documents (GoodsReceiptDocument movement type 101, QualityNotification)

The clerk never touches a screen. The system handles logging, decision-making, and documentation automatically.

---

## Tech stack

| Component | Technology |
|---|---|
| Real-time voice | Gemini Live API (gemini-3.8-live) |
| Vision damage assessment | Gemini Flash (gemini-3.6-flash) |
| Structured agent outputs | Pydantic AI (damage assessment, claim drafting) |
| Backend | FastAPI, deployed on Modal |
| Database | Local SQLite, production cloud Postgres via `DATABASE_URL` |
| Observability | Logfire |
| Frontend | Web app (separate, see `web/`) |

---

## Project structure

```
backend/          FastAPI application
  routes/         API endpoints
  services/       Business logic (voice session, delivery processing)
  models/         Pydantic data models
  store/          SQLite persistence layer
  policy/         Policy engine (deterministic rules + LLM explanation)
  vision/         Damage assessment via Gemini Flash
  seed/           Sample vendors, materials, purchase orders
scripts/          Delivery simulator
web/              Frontend application
docs/             API notes and frontend handoff
```

---

## Key features

**Voice-first**: The clerk works entirely hands-free. Gemini Live handles real-time transcription and natural language understanding throughout the delivery process.

**Fuzzy PO matching**: Tolerates speech recognition errors and informal item names when matching against purchase order line items.

**Vision damage assessment**: The clerk takes a photo; Gemini Flash returns a structured damage report (severity, affected quantity, description) via a Pydantic AI agent.

**Policy engine**: Deterministic rules decide the outcome (accept, flag, escalate). An LLM step adds a human-readable explanation and drafts supplier claims where needed.

**SSE streaming**: Real-time server-sent event feed so the dashboard updates as deliveries progress.

**SAP export**: Produces `GoodsReceiptDocument` (movement type 101) and `QualityNotification` documents ready for SAP import.

---

## Running locally

**Prerequisites**: Python 3.12+, [uv](https://docs.astral.sh/uv/), a Gemini API key.

```bash
# 1. Set up backend environment variables
cp backend/.env.example backend/.env
# Edit backend/.env and fill in GEMINI_API_KEY

# 2. Install dependencies
uv sync

# 3. Start the backend
uv run uvicorn backend.app:app --reload

# 4. (Optional) Run the delivery simulator
uv run python scripts/simulate_delivery.py
```

The API will be available at `http://localhost:8000`. Local SQLite data is stored at `backend/app.db` unless `DATABASE_URL` points elsewhere. See `docs/` for endpoint reference.

---

## Deploying to Modal

```bash
# 1. Create the Modal secret with a cloud database URL and frontend CORS origin
python -m modal secret create argusai-secrets \
  DATABASE_URL="postgresql+psycopg://USER:PASSWORD@HOST/DB?sslmode=require" \
  GEMINI_API_KEY="your_key_here" \
  CORS_ORIGINS="https://<your-vercel-app>.vercel.app" \
  --force

# 2. Deploy
python -m modal deploy backend/modal_app.py
```

Modal containers are ephemeral, so production database state should live in the external database configured by `DATABASE_URL`. The app still mounts a Modal Volume at `/data` for SQLite fallback and uploaded photos. See `docs/DEPLOYMENT_ENV.md` for Vercel, Modal, and CORS templates.

