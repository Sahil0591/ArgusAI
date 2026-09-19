# ArgusAI — Build Plan

## Vision

Hands-free voice agent for warehouse goods receipt. A clerk talks through a delivery, ArgusAI logs lines against a purchase order, detects discrepancies, applies policy (auto-accept small issues, escalate big ones), and produces SAP-ready documents.

## Partners

| Partner | Role |
|---------|------|
| Google DeepMind | Gemini Live API (voice), Gemini Flash (vision) |
| Pydantic | Pydantic AI agents + typed outputs, Logfire tracing |
| Modal | Backend hosting (single container, Volume for SQLite) |
| Conduct | SAP-shaped data and export format |

## Phases

### Phase 0 — Plan ✅
- [x] Research voice agent architecture patterns and API constraints
- [x] Write PLAN.md
- [x] Write ARCHITECTURE.md
- [x] Write docs/api-notes.md (verified Gemini model IDs and API details)
- [x] Confirm git remote exists

### Phase 1 — Skeleton ✅
- [x] Create backend/ package structure
- [x] FastAPI app with /health, CORS
- [x] Modal app file (min_containers=1, max_containers=1, Volume)
- [x] .env.example
- [x] Deploy to Modal, confirm /health responds
- Deployed URL: https://sahil0591-argusai--argusai-web.modal.run

### Phase 2 — Data and Models ✅
- [x] Seed data: vendors, materials, purchase orders (backend/seed/*.json)
- [x] All Pydantic models (SpokenLine, ReceiptLine, Discrepancy, DamageAssessment, PolicyConfig, PolicyDecision, SupplierClaim, GoodsReceiptDocument, QualityNotification)
- [x] SQLite store with append-only event log
- [x] pytest unit tests for models and store (21 passed)

### Phase 3 — Voice Backend ✅
- [x] POST /live/token — ephemeral Gemini Live token (verified with real API)
- [x] GET /live/tools — function declarations + system instruction
- [x] Tool endpoints: log_line, close_pallet, report_damage, delivery_status
- [x] needs_review fallback on tool failure
- [x] Service layer with PO matching (fuzzy string match for voice input)
- [x] Acceptance: all endpoints verified locally and deployed to Modal

### Phase 4 — Photos and Vision ✅
- [x] POST /photos — upload photo for pending damage report
- [x] Vision agent: Pydantic AI agent with gemini-3.6-flash, output_type=DamageAssessment
- [x] Fallback when vision fails (store photo, mark needs_review)
- [x] Test with sample image (backend/seed/photos/sample_damage.jpg)
- Note: gemini-2.5-flash deprecated, updated to gemini-3.6-flash

### Phase 5 — Policy Engine ✅
- [x] PolicyConfig with configurable thresholds
- [x] Rule evaluation: shortage <=2% -> auto-accept; damage <=EUR100 -> auto-accept with claim; above thresholds / wrong material / confidence <0.7 -> escalate
- [x] Claim drafting: sync template + async LLM upgrade via Pydantic AI
- [x] Decision reasons (human-readable)
- [x] Unit tests for each decision path (12 tests, all passing)

### Phase 6 — Stream, Decisions, Simulator
- [ ] GET /stream — SSE for phone page and dashboard
- [ ] POST /escalations/{id}/decision — idempotent accept/reject
- [ ] scripts/simulate_delivery.py — full delivery end-to-end
- [ ] Acceptance: simulator runs full delivery against deployed backend

### Phase 7 — Export and Handoff
- [ ] GoodsReceiptDocument + QualityNotification export (JSON)
- [ ] Logfire traces verified
- [ ] README.md updated
- [ ] DEMO.md — 2-minute demo script
- [ ] docs/FRONTEND.md — full frontend handoff

## Open Questions

- Gemini Live API concurrency limits at current API tier?
- Modal Volume SQLite performance under concurrent writes (single container so should be fine)?
- Exact SAP movement type 101 field names to verify against Conduct expectations?
