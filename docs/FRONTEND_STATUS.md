# ArgusAI Frontend — Status

Last updated: 2026-09-19, after commit `d20bd18` (pushed to `origin/main`).

Read this before touching `web/` — it tells you what's actually built, what's
verified, and what's left. `docs/FRONTEND.md` is Sahil's original API handoff
(useful as a reference); this file tracks reality as of the last session.

## Current state: P0 done, backend selected by environment

`web/` is a Next.js 16 (App Router, TypeScript, Tailwind v4) app talking
to the backend configured by `NEXT_PUBLIC_API_BASE` — not a mock. The mock
backend built early in the session was deleted once the real one came online;
don't recreate it.

**Working and verified live in a browser (zero console errors):**
- Landing page (`/`) — pick one of the 3 real POs, starts a delivery against
  the real backend with a client-generated UUID
- Worker/clerk view (`/receive/[deliveryId]`) — PO checklist, stubbed
  push-to-talk form (`log_line`), damage reporting (`report_damage` →
  photo → real Gemini vision assessment), live decision banner
- Manager dashboard (`/dashboard`) — live escalation queue enriched from
  event history, Accept/Reject, idempotent
- Full loop confirmed end-to-end: clerk logs damage → photo → real Gemini
  vision → policy engine escalates → dashboard shows it → manager accepts →
  SSE pushes the decision back to the worker's banner in real time

**Backend tests:** 33/33 passing (`uv run pytest` from repo root).
**Frontend:** `npm run build` and `npm run lint` both clean in `web/`.

## Run it

```
cd web && npm run dev
```

Dev server **must** run on port 5173 (`package.json`'s `dev` script already
has `-p 5173` baked in), and the backend `CORS_ORIGINS` value must include
that origin. Point the frontend at a backend with `NEXT_PUBLIC_API_BASE` in
`web/.env.local`; the code fallback is local FastAPI at
`http://127.0.0.1:8000`.

Note: the backend has **shared live state** — other people's test runs
(including deliveries starting with `SIM-` from Sahil's own simulator
script) will show up. That's expected.

## Key gotchas discovered by live testing (not guesses — read before redoing this work)

1. **Damage must go through `report_damage`, never `log_line`'s
   `damage_noted` field.** The backend's `/photos` endpoint recomputes the
   discrepancy's value by searching backward through events for a
   `DAMAGE_REPORTED`-type event. Damage noted inline on `log_line` only
   produces a `LINE_LOGGED` event, so that lookup finds nothing and prices
   the damage at EUR 0 — meaning it always auto-accepts regardless of real
   value. `web/src/app/receive/[deliveryId]/page.tsx`'s `handleLogLine`
   already does the right thing (splits into a `log_line` call + a separate
   `report_damage` call when damage is noted). This is a backend quirk, not
   ours to fix — just don't undo the frontend workaround.

2. **The backend never exposes structured PO/receipt-line data.**
   `GET /deliveries/{id}` only returns a raw event log, not
   `ordered_qty`/`received_qty` per line. `lib/po-catalog.ts` is a static
   mirror of `backend/seed/purchase_orders.json` (display-only baseline;
   the backend never told us about it), and `lib/derive.ts` reduces the
   event log into the checklist/escalation view-models the UI actually
   needs. If the backend's seed data ever changes, update
   `po-catalog.ts` to match.

3. **SSE sends named events**, not plain `data:` messages — the server does
   `event: line_logged\ndata: {...}`. A plain `EventSource.onmessage`
   handler never fires. `lib/use-event-stream.ts` uses
   `addEventListener(type, ...)` per event type, plus manual reconnect with
   backoff (the server doesn't support native `Last-Event-ID` replay dedup,
   so reconnection is done by hand via `?last_event_id=`).

4. **Enum values are lowercase** (`"damage"`, `"escalate"`, `"pending"`,
   etc.) — verified against `backend/models.py`. Don't reintroduce uppercase
   assumptions from `ARCHITECTURE.md`, which was written before the backend
   existed and is stale where it conflicts with `backend/models.py` /
   `backend/routes.py`.

5. **Escalations are lean** (`GET /escalations` returns just
   `{id, delivery_id, discrepancy_id, status, decided_at, decided_by}`) —
   no material name, no assessment, no reason. `lib/derive.ts`'s
   `enrichEscalations()` cross-references each escalation's `discrepancy_id`
   against the owning delivery's event history to build the full card. The
   dashboard currently re-fetches + re-derives on every relevant SSE event
   rather than patching state incrementally — fine at hackathon scale, but
   note it if data volume ever becomes a concern.

6. **`react-hooks/set-state-in-effect`** (from `eslint-config-next` 16's
   React Compiler rules) flags reacting to a derived store value in a
   `useEffect`. Both pages now subscribe directly to the Zustand store
   (`useAppStore.subscribe(...)`) inside an effect instead of watching a
   `lastEvent` selector — that's the idiomatic fix the rule itself
   recommends. One narrow `eslint-disable-next-line` remains on the
   dashboard's initial mount-fetch (a `useCallback`-memoized fetch called
   from its own effect trips the same rule even for the standard "fetch on
   mount" pattern — a real limitation of the rule, not the code).

## What's NOT done yet

**P1 (next up):**
- Dashboard "wow" layer — live resolved-vs-escalated feed, parallel
  damage-assessment grid animating concurrent Modal fan-out assessments
  (Framer Motion is already installed for this), rendered goods receipt +
  quality notifications view (`GET /deliveries/{id}/export/gr` and
  `/export/qn` — both already wired in `lib/api-client.ts`, just unused by
  any page yet)
- Delivery simulator page (`/simulator`) — drives a fake truck's worth of
  `log_line`/`report_damage`/`/photos` calls against the real backend with
  no mic needed; this is the guaranteed no-mic demo fallback per the
  project's own risk mitigation in `PLAN.md`/pitch doc

**Polish:**
- `impeccable` skill pass once P1 views exist — including picking a
  distinctive typeface (currently the unmodified `create-next-app` Geist
  default; flagged once already by the impeccable design hook and
  deliberately deferred to this pass rather than fixed piecemeal)

**P2 (real voice, attempt last — push-to-talk stub is a working fallback):**
- Real Gemini Live wiring: `GET /live/tools` + `POST /live/token` → WSS
  directly to `wss://generativelanguage.googleapis.com/...
  BidiGenerateContent?key=<token>` → mic capture via `AudioWorklet` → PCM16
  16kHz upstream → handle `tool_call` by POSTing to the matching
  `/tools/*` endpoint and `session.send_tool_response()` → play back 24kHz
  PCM audio responses. Needs a user-gesture-gated `AudioContext` (browser
  autoplay policy) and HTTPS/localhost for `getUserMedia`. Full sequence
  and audio-format details are in `docs/FRONTEND.md` and
  `docs/api-notes.md`.

## File map (`web/src/`)

```
lib/
  types.ts            # TS types matching the REAL backend contract
  api-client.ts        # all backend calls go through here
                        # NEXT_PUBLIC_API_BASE selects local or Modal backend
  po-catalog.ts         # static PO/vendor mirror (display-only, see gotcha #2)
  derive.ts             # event-log -> checklist / enriched-escalation view-models
  store.ts               # zustand: raw SSE event log only (see gotcha #6)
  use-event-stream.ts    # named-event SSE subscription + manual reconnect
app/
  page.tsx                          # landing / start delivery
  receive/[deliveryId]/page.tsx     # worker/clerk view
  dashboard/page.tsx                # manager view
components/
  worker/    (MicButton, POChecklist, PhotoCapture, TranscriptPanel, DecisionBanner)
  manager/   (EscalationCard, EscalationQueue)
  shared/    (Nav)
```

Nothing under `components/dashboard/` or `app/simulator/` yet — that's P1.
