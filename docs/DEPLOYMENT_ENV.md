# ArgusAI Environment And Database Setup

## Database Location

Local development uses `DATABASE_URL=sqlite:///./backend/app.db` by default, which creates a SQLite file at `backend/app.db`. That file is ignored by git. You can also point local development at Postgres with a connection string such as `postgresql+psycopg://argusai:password@localhost:5432/argusai`.

Production should use an external cloud database reachable from Modal through `DATABASE_URL`, for example Neon or Supabase Postgres:

```env
DATABASE_URL=postgresql+psycopg://USER:PASSWORD@HOST/DB?sslmode=require
```

Modal containers are ephemeral. A SQLite file inside the container will disappear unless it is stored on a `modal.Volume`; this app still mounts `argusai-data` at `/data` for SQLite fallback and uploaded photos, but production database state should live in the external cloud database configured by `DATABASE_URL`.

## Environment Files

Frontend local environment lives at `web/.env.local`:

```env
NEXT_PUBLIC_API_BASE=http://127.0.0.1:8000
```

Vercel production should set the same public variable in Project Settings:

```env
NEXT_PUBLIC_API_BASE=https://<modal-user-or-workspace>--argusai-web.modal.run
```

Backend local environment lives at `backend/.env`:

```env
DATABASE_URL=sqlite:///./backend/app.db
GEMINI_API_KEY=your_gemini_key
CORS_ORIGINS=http://localhost:5173,http://127.0.0.1:5173
LOGFIRE_TOKEN=
GEMINI_LIVE_MODEL=gemini-3.8-live
GEMINI_VISION_MODEL=gemini-3.6-flash
```

For Modal production, put backend values in a Modal Secret instead of committing an env file:

```env
DATABASE_URL=postgresql+psycopg://USER:PASSWORD@HOST/DB?sslmode=require
GEMINI_API_KEY=your_gemini_key
CORS_ORIGINS=https://<your-vercel-app>.vercel.app
LOGFIRE_TOKEN=
GEMINI_LIVE_MODEL=gemini-3.8-live
GEMINI_VISION_MODEL=gemini-3.6-flash
```

## Modal Secret Binding

`backend/modal_app.py` binds `modal.Secret.from_dotenv(__file__)` when `ARGUSAI_MODAL_SECRET_MODE=dotenv`, and `modal.Secret.from_name("argusai-secrets")` by default for production deploys.

Local Modal run using `backend/.env`:

```powershell
$env:ARGUSAI_MODAL_SECRET_MODE="dotenv"
python -m modal serve backend/modal_app.py
```

Production secret from a dotenv file:

```powershell
python -m modal secret create argusai-secrets --from-dotenv backend/.env.production --force
python -m modal deploy backend/modal_app.py
```

Production secret from inline values:

```powershell
python -m modal secret create argusai-secrets `
  DATABASE_URL="postgresql+psycopg://USER:PASSWORD@HOST/DB?sslmode=require" `
  GEMINI_API_KEY="your_gemini_key" `
  CORS_ORIGINS="https://<your-vercel-app>.vercel.app" `
  --force
```

## CORS

The FastAPI app reads `CORS_ORIGINS` and passes it to `CORSMiddleware`. Include every browser origin that will call Modal, separated by commas and without trailing slashes:

```env
CORS_ORIGINS=http://localhost:5173,http://127.0.0.1:5173,https://<your-vercel-app>.vercel.app
```

The frontend reads `NEXT_PUBLIC_API_BASE`, so Vercel must point at the Modal backend URL and Modal must allow the Vercel frontend origin.
