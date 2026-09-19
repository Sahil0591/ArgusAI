# ArgusAI — Architecture

## System Overview

```
┌─────────────────────────────────────────────────────────────────┐
│  Clerk's Phone (browser)                                        │
│  ┌──────────────┐  ┌───────────┐  ┌──────────────────────────┐ │
│  │ Gemini Live   │  │ Camera    │  │ SSE listener             │ │
│  │ (WebSocket)   │  │ capture   │  │ (decisions, photo reqs)  │ │
│  └──────┬───────┘  └─────┬─────┘  └────────────┬─────────────┘ │
│         │ function calls  │ photos              │ events        │
└─────────┼────────────────┼──────────────────────┼───────────────┘
          │                 │                      │
          ▼                 ▼                      │
┌─────────────────────────────────────────────────────────────────┐
│  ArgusAI Backend (FastAPI on Modal, single container)           │
│                                                                 │
│  /live/token ──► Gemini API (ephemeral token)                  │
│  /live/tools ──► function declarations + system instruction     │
│                                                                 │
│  Tool endpoints:                                                │
│    POST /tools/log_line        → event log + PO matching       │
│    POST /tools/close_pallet    → pallet summary                │
│    POST /tools/report_damage   → damage event + photo request  │
│    GET  /tools/delivery_status → current state                 │
│                                                                 │
│  POST /photos                  → Vision Agent → DamageAssess.  │
│  GET  /stream                  → SSE (events, decisions, etc.) │
│  POST /escalations/{id}/decision → idempotent accept/reject    │
│  GET  /deliveries              → list                          │
│  GET  /deliveries/{id}         → detail                        │
│  GET  /deliveries/{id}/export  → SAP goods receipt JSON        │
│                                                                 │
│  ┌────────────┐  ┌──────────────┐  ┌────────────────────────┐  │
│  │ Policy     │  │ Vision Agent │  │ Claim Drafting Agent   │  │
│  │ Engine     │  │ (Gemini      │  │ (Pydantic AI)          │  │
│  │ (rules)    │  │  Flash)      │  │                        │  │
│  └────────────┘  └──────────────┘  └────────────────────────┘  │
│                                                                 │
│  SQLite on Modal Volume                                         │
│  ┌──────────┐ ┌────────────┐ ┌─────────────┐ ┌──────────┐     │
│  │ events   │ │ deliveries │ │ escalations │ │ photos   │     │
│  │ (append  │ │            │ │             │ │ (meta)   │     │
│  │  only)   │ │            │ │             │ │          │     │
│  └──────────┘ └────────────┘ └─────────────┘ └──────────┘     │
└─────────────────────────────────────────────────────────────────┘
          ▲                                        │
          │ SSE                                    │ SSE
          │                                        ▼
┌─────────────────────────────────────────────────────────────────┐
│  Manager Dashboard (browser)                                    │
│  Live feed, escalation cards with photo + assessment,           │
│  Accept/Reject buttons, SAP export download                     │
└─────────────────────────────────────────────────────────────────┘
```

## Data Flow: Speech → Decision → Speech

```
1. Clerk speaks: "Pallet 4, twenty cartons M8 bolts, two crushed"
   │
2. Gemini Live (in browser) transcribes → function call: log_line(...)
   │
3. Frontend calls POST /tools/log_line with parsed data
   │
4. Backend:
   a. Writes event to append-only log
   b. Matches against PO line (material + quantity)
   c. Detects discrepancies (damage: 2 crushed)
   d. Returns: { speech: "Logged. Two damaged — can you take a photo?",
   │              data: { event_id, discrepancy_id, photo_requested: true } }
   │
5. Frontend opens camera, clerk snaps photo
   │
6. Frontend calls POST /photos with image + discrepancy_id
   │
7. Backend:
   a. Stores photo on Volume
   b. Vision Agent analyzes → DamageAssessment
   c. Policy Engine evaluates:
   │  - If value ≤ €100 → AUTO_ACCEPT_WITH_CLAIM
   │    → drafts supplier claim, writes decision event
   │  - If value > threshold or confidence < 0.7 → ESCALATE
   │    → creates escalation record
   d. Broadcasts via SSE
   │
8a. AUTO path: clerk hears "Damage accepted, supplier claim filed"
8b. ESCALATE path:
    │
9.  Manager sees escalation card on dashboard
    │
10. Manager taps Accept/Reject → POST /escalations/{id}/decision
    │
11. Backend writes decision event, broadcasts via SSE
    │
12. Frontend injects decision text into Gemini Live session
    │
13. Clerk hears: "Manager approved — proceed with receiving"
```

## Data Models

### Core Types

```
SpokenLine
  delivery_id: str
  pallet_number: int | None
  material_description: str
  quantity: float
  unit_of_measure: str
  damage_noted: str | None
  raw_transcript: str

ReceiptLine
  delivery_id: str
  po_number: str
  po_line: int
  material_number: str
  material_description: str
  ordered_qty: float
  received_qty: float
  unit_of_measure: str
  discrepancies: list[Discrepancy]

Discrepancy
  id: str (uuid)
  type: SHORTAGE | OVERAGE | WRONG_ITEM | DAMAGE
  expected_qty: float | None
  actual_qty: float | None
  damage_description: str | None
  unit_value_eur: float
  total_value_eur: float
  photo_id: str | None

DamageAssessment
  item: str
  severity: LOW | MEDIUM | HIGH
  affected_quantity: int
  confidence: float (0–1)
  description: str
  claim_sentence: str

PolicyConfig
  shortage_auto_accept_pct: float = 0.02
  damage_auto_accept_eur: float = 100.0
  vision_confidence_threshold: float = 0.7

PolicyDecision
  decision: AUTO_ACCEPT | AUTO_ACCEPT_WITH_CLAIM | ESCALATE
  reason: str
  claim: SupplierClaim | None

SupplierClaim
  vendor_name: str
  po_number: str
  material: str
  damage_description: str
  claimed_amount_eur: float
  draft_email: str

GoodsReceiptDocument
  # SAP movement type 101
  BLDAT: date          # document date
  BUDAT: date          # posting date
  lines: list[GRLine]

GRLine
  EBELN: str           # PO number
  EBELP: str           # PO item
  MATNR: str           # material number
  MAKTX: str           # material description
  MENGE: float         # received quantity
  MEINS: str           # unit of measure
  BWART: str = "101"   # movement type

QualityNotification
  QMTYP: str = "Q1"    # notification type (complaint)
  MATNR: str
  vendor: str
  description: str
  damage_assessment: DamageAssessment | None
  decision: str
  photos: list[str]
```

### SQLite Tables

```sql
-- Append-only event log
CREATE TABLE events (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  delivery_id TEXT NOT NULL,
  timestamp TEXT NOT NULL DEFAULT (datetime('now')),
  type TEXT NOT NULL,  -- line_logged, damage_reported, photo_uploaded,
                       -- assessment_complete, policy_decision, escalation_created,
                       -- escalation_decided, delivery_closed
  data TEXT NOT NULL,  -- JSON payload
  needs_review BOOLEAN NOT NULL DEFAULT FALSE
);

CREATE TABLE deliveries (
  id TEXT PRIMARY KEY,
  po_number TEXT NOT NULL,
  vendor_id TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'in_progress',  -- in_progress, completed
  started_at TEXT NOT NULL DEFAULT (datetime('now')),
  completed_at TEXT
);

CREATE TABLE escalations (
  id TEXT PRIMARY KEY,
  delivery_id TEXT NOT NULL,
  discrepancy_id TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending',  -- pending, accepted, rejected
  decided_at TEXT,
  decided_by TEXT
);

CREATE TABLE photos (
  id TEXT PRIMARY KEY,
  delivery_id TEXT NOT NULL,
  discrepancy_id TEXT NOT NULL,
  filename TEXT NOT NULL,
  uploaded_at TEXT NOT NULL DEFAULT (datetime('now'))
);
```

## API Contracts

### POST /live/token
Response: `{ "token": "<ephemeral_token>", "expires_at": "<iso_datetime>" }`

### GET /live/tools
Response:
```json
{
  "system_instruction": "You are a warehouse receiving assistant...",
  "tools": [
    {
      "function_declarations": [
        {
          "name": "log_line",
          "description": "Log a received line item against the purchase order",
          "parameters": {
            "type": "object",
            "properties": {
              "delivery_id": { "type": "string" },
              "pallet_number": { "type": "integer" },
              "material_description": { "type": "string" },
              "quantity": { "type": "number" },
              "unit_of_measure": { "type": "string" },
              "damage_noted": { "type": "string" }
            },
            "required": ["delivery_id", "material_description", "quantity"]
          }
        }
      ]
    }
  ]
}
```
(Similar declarations for close_pallet, report_damage, delivery_status.)

### POST /tools/log_line
Request: `{ "delivery_id": "...", "pallet_number": 4, "material_description": "M8 bolts", "quantity": 20, "unit_of_measure": "CTN", "damage_noted": "two crushed" }`
Response: `{ "speech": "Logged twenty cartons of M8 bolts. Two damaged — please take a photo.", "event_id": "...", "discrepancy": { ... }, "photo_requested": true }`

### POST /photos
Multipart form: file + delivery_id + discrepancy_id
Response: `{ "photo_id": "...", "assessment": { DamageAssessment }, "decision": { PolicyDecision } }`

### GET /stream
SSE with event types: `line_logged`, `damage_reported`, `photo_uploaded`, `assessment_complete`, `policy_decision`, `escalation_created`, `escalation_decided`, `delivery_completed`
Each event: `data: { "type": "...", "delivery_id": "...", "payload": { ... } }`

### POST /escalations/{id}/decision
Request: `{ "decision": "accepted" | "rejected", "decided_by": "manager" }`
Response: `{ "speech": "Manager approved — proceed with receiving.", "escalation": { ... } }`
Idempotent: second call returns same result without overwriting.

### GET /deliveries/{id}/export
Response: `{ "goods_receipt": { GoodsReceiptDocument }, "quality_notifications": [ { QualityNotification }, ... ] }`

## Gemini Integration

### Live API (Voice)
- Model: `gemini-3.8-live` (verify in docs/api-notes.md)
- Connection: browser → Gemini Live WebSocket (direct, not through backend)
- Backend provides ephemeral token (POST /live/token) so API key never reaches browser
- Backend provides function declarations (GET /live/tools) so frontend uses exactly what backend expects
- When Gemini makes a function call, frontend calls the corresponding backend tool endpoint
- Frontend injects text (e.g. manager decisions) into the live session for Gemini to speak

### Vision (Damage Assessment)
- Model: `gemini-2.5-flash` (verify in docs/api-notes.md)
- Pydantic AI agent with output_type=DamageAssessment
- Input: photo bytes + material description + PO line context
- Fallback: if vision fails, store photo and escalate anyway

## Deployment

### Modal
- Single container: `min_containers=1, max_containers=1`
- Volume for SQLite DB and uploaded photos
- Secrets: GEMINI_API_KEY, LOGFIRE_TOKEN
- CORS: configurable allowed origins (localhost in dev, Vercel domain in prod)

### Frontend (teammate's responsibility)
- Vite React TypeScript on Vercel
- Two pages: /receive/:deliveryId (clerk), /dashboard (manager)
- See docs/FRONTEND.md for full handoff

## Resilience

- Never drop an utterance: if a tool fails, write event with needs_review=true and return a short sentence
- If vision fails, store photo and escalate anyway
- If no live voice session, decisions still get recorded
- Idempotent escalation decisions: second decision restates instead of overwriting
