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

### Phase 1 — Skeleton
- [ ] Create backend/ package structure
- [ ] FastAPI app with /health, CORS
- [ ] Modal app file (min_containers=1, max_containers=1, Volume)
- [ ] .env.example
- [ ] Deploy to Modal, confirm /health responds

### Phase 2 — Data and Models
- [ ] Seed data: vendors, materials, purchase orders (backend/seed/*.json)
- [ ] All Pydantic models (SpokenLine, ReceiptLine, Discrepancy, DamageAssessment, PolicyConfig, PolicyDecision, SupplierClaim, GoodsReceiptDocument, QualityNotification)
- [ ] SQLite store with append-only event log
- [ ] pytest unit tests for models and store

### Phase 3 — Voice Backend
- [ ] POST /live/token — ephemeral Gemini Live token
- [ ] GET /live/tools — function declarations + system instruction
- [ ] Tool endpoints: log_line, close_pallet, report_damage, delivery_status
- [ ] needs_review fallback on tool failure
- [ ] Acceptance: endpoints work via curl/pytest, token accepted by Gemini Live API

### Phase 4 — Photos and Vision
- [ ] POST /photos — upload photo for pending damage report
- [ ] Vision agent: Pydantic AI agent with Gemini Flash, output_type=DamageAssessment
- [ ] Fallback when vision fails (store photo, escalate anyway)
- [ ] Test with sample image (backend/seed/photos/)

### Phase 5 — Policy Engine
- [ ] PolicyConfig with configurable thresholds
- [ ] Rule evaluation: shortage ≤2% → auto-accept; damage ≤€100 → auto-accept with claim; above thresholds / wrong material / confidence <0.7 → escalate
- [ ] Claim drafting via Pydantic AI agent
- [ ] Decision reasons (human-readable)
- [ ] Unit tests for each decision path

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
