# ArgusAI — Session Handoff (2026-09-19)

Written because the previous Claude session ran out of tokens mid-fix. Read
this first before doing anything else.

## What ArgusAI is

Hands-free voice agent for warehouse goods receipt. Hackathon project
(Tech Europe Agentic AI Hackathon). Team: Tanveer (frontend), Sahil
(backend). Frontend lives in `web/` (Next.js 16 + Tailwind v4), backend in
`backend/` (FastAPI + Pydantic AI, deployed on Modal).

Full architecture/build history: see `docs/FRONTEND_STATUS.md` (written
mid-session, slightly stale on "what's remaining" but accurate on
architecture/gotchas). `DEMO.md` is the authoritative 2-minute demo script.

## Deployed URLs (as of this session)

- Frontend: **https://argusai.vercel.app** (deployed to Vercel — this
  happened this session, confirming a Vercel deployment now exists)
- Backend: **https://sahil0591--argusai-web.modal.run** (Modal, exact
  hostname per the browser's own CORS error message — double-check against
  `web/src/lib/api-client.ts`'s `API_BASE` constant if it ever looks off;
  there was a one-character discrepancy noticed between what the code
  contains and what the browser reported that was never fully resolved —
  worth a sanity check with a `curl` to whichever URL is actually live)

## 🔴 ACTIVE, UNRESOLVED ISSUE — CORS blocking the deployed frontend

The user reported (with a screenshot) that the deployed Vercel frontend
cannot reach the Modal backend:

```
Access to fetch at 'https://sahil0591--argusai-web.modal.run/deliveries/...'
from origin 'https://argusai.vercel.app' has been blocked by CORS policy:
Response to preflight request doesn't pass access control check: No
'Access-Control-Allow-Origin' header is present on the requested resource.
```

**Root cause (confirmed by reading code, not yet fixed):**

`backend/config.py`:
```python
CORS_ORIGINS: list[str] = [
    origin.strip()
    for origin in os.getenv("CORS_ORIGINS", "http://localhost:5173").split(",")
    if origin.strip()
]
```

`backend/modal_app.py` pulls env vars from a Modal Secret named
`argusai-secrets`:
```python
secrets=[modal.Secret.from_name("argusai-secrets")],
```

So `CORS_ORIGINS` currently only contains `http://localhost:5173` (the
hardcoded default) — the deployed Modal backend has never been told about
the Vercel origin, so FastAPI's CORS middleware correctly refuses it.

**The fix is NOT a code change** (the code already reads `CORS_ORIGINS`
correctly and splits on commas) — it's a **Modal deployment config change**:

1. Update the `argusai-secrets` Modal secret to include:
   ```
   CORS_ORIGINS=http://localhost:5173,https://argusai.vercel.app
   ```
   (comma-separated, no spaces needed but harmless if present — code does
   `.strip()` per entry)
2. Redeploy (or at minimum restart) the Modal app so the FastAPI process
   re-reads env vars at import time — `min_containers=1` keeps a warm
   container, so just editing the secret alone will NOT take effect until
   a fresh deploy/restart happens.

**This requires Modal CLI access.** At the point this session got cut off,
I was checking whether `modal` CLI was available/authenticated on this
machine (`uv run modal --version` / `modal profile current`) — that tool
call was **rejected by the user** (not because it was wrong, just
interrupted to write this handoff file instead). That check was never
completed. Next session should:

- Re-run `uv run modal --version` and `uv run modal profile current` (or
  plain `modal ...` if not using `uv`) to see if this machine has Modal
  access at all.
- If yes: either update the secret via `modal secret create argusai-secrets
  CORS_ORIGINS=... --force` (merging with existing keys — **check current
  secret contents first**, don't accidentally drop `GEMINI_API_KEY` /
  `LOGFIRE_TOKEN` by overwriting rather than updating) or point the user to
  the Modal dashboard's Secrets UI, then run `modal deploy backend/modal_app.py`
  (or whatever the established deploy command is — check for a Makefile/
  script/README section documenting the exact deploy command before
  guessing).
- If no Modal access on this machine: this is Sahil's action. Tell the
  user clearly and give them the exact two facts above (the env var name/
  value to set, and that a redeploy is required after).

## Everything else done this session (all committed except the latest batch — see below)

### Backend fix: "received more than ordered" (overage) now a real case

User explicitly asked for this. Diagnosed: `backend/policy.py` already had
a complete `DiscrepancyType.OVERAGE -> Decision.AUTO_ACCEPT` rule, but
`backend/services.py`'s `log_line()` never actually constructed an
`OVERAGE` discrepancy or called the policy engine — an over-received line
just got a silent warning string in speech text, no event, no visibility
anywhere. Fixed in `backend/services.py` (`log_line` method):

- When `new_qty > po_line.MENGE`, now builds a real
  `Discrepancy(type=DiscrepancyType.OVERAGE, expected_qty=..., actual_qty=...)`,
  appends it to the `line_logged` event's `discrepancies` list, and —
  since overage is deterministic (no photo/vision step needed, unlike
  damage) — calls `evaluate_discrepancy()` synchronously right there and
  writes a `POLICY_DECISION` event immediately (`auto_accept`, no
  escalation possible for this type per the existing policy rule).
- Verified live via curl against a local backend instance (`uv run
  --env-file .env.local uvicorn backend.app:app --port 8000`): correct
  discrepancy fields, correct policy_decision event, correct speech text
  ("Logged 58 PC of PTFE Spiral Wound Gasket DN50. Overage of 8 units.
  Accepted and noted.").

### Frontend changes to support/surface the overage case

- `web/src/components/worker/POChecklist.tsx`: added a distinct
  "over-received · auto-accepted" badge (accent-toned pill) for lines with
  an `overage`-type discrepancy, so it no longer looks identical to a
  plain exact match.
- `web/src/components/dashboard/AssessmentGrid.tsx`: header text changed
  from "Damage assessments — resolving in parallel" to "Discrepancies —
  resolving in parallel" since overage auto-accepts now legitimately
  appear there too (not just damage).
- `web/src/lib/derive.ts`: updated the doc comment on
  `deriveAssessmentFeed()` to reflect that overage skips the "assessing"
  state (no photo step) and jumps straight to "resolved".
- `web/src/app/simulator/page.tsx`: added a standalone third section, "Run
  overage scenario" — a single button that starts a **fresh, separate**
  delivery against PO-4500003 and logs 58 PTFE gaskets (50 ordered).
  Deliberately kept separate from the primary "Run scripted demo" section,
  which replays the exact DEMO.md script the user has **already
  voice-tested with a real human** — did not want to risk disrupting that
  rehearsed flow.

### Real bug found + fixed while verifying the above: dashboard "All deliveries" view hid non-escalated deliveries

`web/src/app/dashboard/page.tsx`'s `refresh()` function, under the default
"All deliveries" filter, was deriving the list of deliveries to fetch full
event data for **only from `listEscalations()`** — meaning any delivery
with zero escalations (which is what auto-accepted overage always
produces) was silently invisible in the assessment grid unless you
manually filtered to that specific delivery. Fixed by also pulling from
`apiClient.listDeliveries()` and unioning the two id sets when the filter
is "all". Confirmed via Playwright screenshot: the assessment grid now
correctly shows auto-accepted overage cards under the default "All
deliveries" view, not just when filtered to one delivery.

### Verification method used

Live Playwright script (temporarily `npm install --no-save playwright` +
`npx playwright install chromium` in `web/`, throwaway `.mjs` script,
removed afterward) driving a real Chromium browser against a **local**
backend instance (not the deployed Modal one, which doesn't have this fix
yet) + a local Next.js dev server temporarily pointed at it via
`NEXT_PUBLIC_API_BASE=http://127.0.0.1:8000 npm run dev`. Confirmed:
checklist badge renders, live transcript shows the decision, dashboard
grid shows two auto-accept cards, zero console/page errors. Screenshots
were reviewed directly (not just element-existence checks). All test
artifacts (playwright package, script, screenshots, local db) were removed
after; local dev server and local backend process were both stopped
afterward via PowerShell (Windows `uv run` child processes don't show up
in bash `ps`, had to use `Get-Process`/`Stop-Process` — see below).

**Windows process cleanup gotcha (worth remembering):** background
processes started via `uv run ... &` in the Bash tool spawn native Windows
processes (`python.exe`, `uv.exe`, `uvicorn.exe`) that Bash's own `ps`
cannot see and `pkill` cannot kill. Had to use the PowerShell tool:
`Get-Process | Where-Object { $_.ProcessName -match 'python|uv|uvicorn' }`
then `Stop-Process -Id <id> -Force`. Same applies to a Next.js dev server
started via `nohup npm run dev &` — its actual listener is a child `node`
process; find it via `Get-NetTCPConnection -LocalPort 5173 -State Listen`
then walk to the owning PID.

## Git state

Per the last known `git status --short` (**not yet committed — still
pending**):

```
 M backend/services.py
 M web/src/app/dashboard/page.tsx
 M web/src/app/simulator/page.tsx
 M web/src/components/dashboard/AssessmentGrid.tsx
 M web/src/components/worker/POChecklist.tsx
 M web/src/lib/derive.ts
```

Also new/untracked: this file (`docs/SESSION_HANDOFF.md`).

**Next session should commit this batch** (lint + build were both
confirmed clean before the dashboard fix; dashboard fix itself was
lint-checked clean but not re-run through a full `npm run build` — do that
once more before committing, it's cheap). Suggested commit message:

```
fix: real overage handling end-to-end, dashboard all-deliveries gap

- backend: log_line now creates a real OVERAGE discrepancy and resolves
  it synchronously through the policy engine (was previously silent —
  policy.py already had the AUTO_ACCEPT rule, nothing ever called it)
- worker checklist: distinct badge for over-received lines
- dashboard: "All deliveries" view no longer hides non-escalated
  deliveries from the assessment grid
- simulator: standalone "Run overage scenario" button

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
```

Do NOT commit `.env.local` or any `argusai.db*` files — both are
gitignored already (verified this session), but always `git status
--short` before staging to be sure nothing snuck in.

## Recap of gaps flagged earlier this session (some now resolved, some still open)

- ✅ Logfire on Modal — user confirmed "done" this session.
- ✅ Real human voice testing — user confirmed "tested on human voice done"
  this session.
- ✅ Vercel deployment — now exists (`https://argusai.vercel.app`),
  confirmed by this session's CORS error screenshot. (Nobody explicitly
  announced deploying it — it just now exists. Worth asking the user who
  set it up / whether Sahil also needs its URL for reference.)
- 🔴 **CORS on the deployed backend — see top of this file, ACTIVE.**
- ⚠️ Real phone/mobile hardware testing — status unknown, not confirmed
  either way this session. Ask the user.
- ⚠️ `docs/FRONTEND_STATUS.md` is stale (written before simulator/export/
  dashboard-wow/voice/polish work completed, and before this session's
  overage fix). Not updated. Low priority unless someone new needs to
  onboard from it.

## Recommended immediate next steps, in order

1. Resolve the CORS blocker (see top). This is the only thing standing
   between "frontend deployed" and "frontend actually usable on a phone
   against the real backend."
2. `npm run build` once more in `web/` to be safe, then commit the pending
   batch above.
3. Ask the user whether Sahil already knows about the Vercel URL /
   whether he needs anything from this session communicated to him
   (CORS fix, the overage backend fix both need his Modal deploy access
   unless this session's `modal` CLI check comes back positive).
