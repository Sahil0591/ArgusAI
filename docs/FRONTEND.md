# ArgusAI Frontend Handoff

**Backend**: https://sahil0591-argusai--argusai-web.modal.run (FastAPI on Modal, fully deployed)

---

## Overview

ArgusAI is a hands-free voice agent for warehouse goods receipt. Warehouse clerks use their phone to speak item counts and damage observations; the system transcribes, processes, and logs each line via Gemini Live. Managers watch a live dashboard and approve or reject escalated decisions.

Two pages are required:

| Page | User | Core function |
|------|------|---------------|
| Clerk (phone) | Warehouse operative | Voice session + camera for damage photos |
| Dashboard (manager) | Supervisor | Live event feed + escalation decisions |

---

## Suggested Stack

- Current app: Next.js in `web/`
- Tailwind CSS
- Deployment: Vercel or similar (HTTPS required for `getUserMedia`)

Set the backend `CORS_ORIGINS` environment variable to include local and production frontend origins, for example `http://localhost:5173,http://127.0.0.1:5173,https://<your-vercel-app>.vercel.app`.

---

## API Reference

Base URL: `https://sahil0591-argusai--argusai-web.modal.run`

All responses are JSON unless noted.

### Auth / Setup

#### POST /live/token

Returns a short-lived ephemeral token for connecting to the Gemini Live WebSocket. Call this immediately before opening the WebSocket - do not cache across sessions.

Response:
```json
{
  "token": "...",
  "expires_at": "2025-01-01T12:05:00Z",
  "model": "gemini-2.0-flash-live"
}
```

#### GET /live/tools

Returns the system instruction and Gemini function declarations for the current session. Call this once at app startup or when starting a new delivery session.

Response:
```json
{
  "system_instruction": "You are a warehouse goods-receipt agent...",
  "tools": [ /* Gemini function declaration objects */ ],
  "model": "gemini-2.0-flash-live"
}
```

---

### Delivery Management

#### POST /deliveries/{id}/start

Start a new delivery. Generate or accept a `delivery_id` (e.g. a UUID) from the client.

Request body:
```json
{ "po_number": "PO-12345" }
```

Response:
```json
{
  "delivery_id": "abc-123",
  "po_number": "PO-12345",
  "status": "in_progress"
}
```

#### GET /deliveries

Returns a list of all deliveries (summary objects).

#### GET /deliveries/{id}

Returns full delivery detail including all logged events.

---

### Tool Endpoints

These are called by the frontend when Gemini emits a `tool_call` event. After calling the endpoint, send the result back to Gemini via `session.send_tool_response()`.

#### POST /tools/log_line

Log a single line item spoken by the clerk.

Request body:
```json
{
  "delivery_id": "abc-123",
  "pallet_number": 3,
  "material_description": "Bolt M8x20",
  "quantity": 500,
  "unit_of_measure": "EA",
  "damage_noted": false,
  "raw_transcript": "five hundred bolts M8 by twenty no damage"
}
```

`pallet_number`, `unit_of_measure`, `damage_noted`, and `raw_transcript` are optional.

#### POST /tools/close_pallet

Mark a pallet as complete.

Request body:
```json
{ "delivery_id": "abc-123", "pallet_number": 3 }
```

#### POST /tools/report_damage

Report a damage observation. Returns a `discrepancy_id` which must be passed when uploading a photo.

Request body:
```json
{
  "delivery_id": "abc-123",
  "material_description": "Bolt M8x20",
  "description": "Box crushed, contents scattered",
  "quantity": 50
}
```

`quantity` is optional.

Response includes `discrepancy_id`.

#### GET /tools/delivery_status?delivery_id=X

Returns a summary of what has been logged so far in the delivery. Gemini calls this to give the clerk a running count.

---

### Photo Upload

After `report_damage` returns a `discrepancy_id`, prompt the clerk to take a photo.

#### POST /photos

Multipart form data fields:

| Field | Type | Description |
|-------|------|-------------|
| `file` | binary | JPEG or PNG from camera |
| `delivery_id` | string | Current delivery ID |
| `discrepancy_id` | string | From `report_damage` response |

Response:
```json
{
  "photo_id": "...",
  "assessment": "Visible crush damage to outer carton, inner product appears intact",
  "decision": "accept_with_note",
  "escalation_id": "esc-456",
  "speech": "Photo received. Minor damage noted. Logging for review."
}
```

`escalation_id` is present only when the policy engine creates an escalation. Play the `speech` field as TTS to the clerk.

---

### SSE Stream (Dashboard)

#### GET /stream?last_event_id=0

Server-sent events stream. Connect once when the dashboard loads. On reconnection, pass the last received `event_id` as `last_event_id` to avoid replaying events.

Each event has the shape:
```json
{
  "type": "line_logged",
  "delivery_id": "abc-123",
  "event_id": 42,
  "payload": { /* event-specific data */ },
  "needs_review": false,
  "timestamp": "2025-01-01T12:01:00Z"
}
```

Event types:

| Type | Description |
|------|-------------|
| `line_logged` | A line item was recorded |
| `damage_reported` | Damage observation added |
| `photo_uploaded` | Photo received and queued for assessment |
| `assessment_complete` | Vision model finished assessing a photo |
| `policy_decision` | Policy engine issued an accept/reject/escalate decision |
| `escalation_created` | New escalation requires manager action |
| `escalation_decided` | Manager resolved an escalation |
| `delivery_closed` | Delivery finalised |

Store the highest `event_id` seen and pass it on EventSource reconnect:

```js
function connectStream(lastId = 0) {
  const es = new EventSource(`${BASE_URL}/stream?last_event_id=${lastId}`);
  es.onmessage = (e) => {
    const event = JSON.parse(e.data);
    lastId = Math.max(lastId, event.event_id);
    // handle event
  };
  es.onerror = () => {
    es.close();
    setTimeout(() => connectStream(lastId), 3000);
  };
}
```

---

### Escalations

#### GET /escalations?delivery_id=X

Returns pending and resolved escalations for a delivery.

#### POST /escalations/{id}/decision

Manager approves or rejects an escalation.

Request body:
```json
{ "decision": "accepted", "decided_by": "manager@example.com" }
```

`decision` must be `"accepted"` or `"rejected"`.

Response:
```json
{
  "speech": "Escalation accepted. Full quantity will be rejected.",
  "escalation": { /* escalation object */ }
}
```

---

### Export

These are called after the delivery is closed.

#### GET /deliveries/{id}/export/gr

Returns a `GoodsReceiptDocument` JSON object formatted for SAP movement type 101.

#### GET /deliveries/{id}/export/qn

Returns a list of `QualityNotification` JSON objects, one per damage or discrepancy.

---

## Gemini Live API Integration (Voice)

The browser connects directly to Google's Gemini Live WebSocket. The backend is not a proxy - it only provides the ephemeral token and tool declarations.

### Session startup sequence

1. Call `GET /live/tools` to fetch `system_instruction`, `tools`, and `model`.
2. Call `POST /live/token` to get an ephemeral `token`.
3. Open WebSocket to `wss://generativelanguage.googleapis.com/ws/google.ai.generativelanguage.v1beta.GenerativeService.BidiGenerateContent?key=<token>`.
4. Send the session setup message using `system_instruction` and `tools` from step 1.
5. Begin streaming microphone PCM to the WebSocket.

### Audio format

| Direction | Format |
|-----------|--------|
| Input (mic to Gemini) | 16-bit PCM, 16 kHz, mono |
| Output (Gemini to speaker) | 16-bit PCM, 24 kHz, mono |

Use `AudioContext` with `createScriptProcessor` or `AudioWorklet` for mic capture and playback. Note that `AudioContext` requires a user gesture to start - do not attempt to open it on page load.

### Handling tool calls

When Gemini emits a `tool_call` event:

1. Identify the function name (e.g. `log_line`, `report_damage`).
2. POST to the corresponding `/tools/*` endpoint with the arguments Gemini provided.
3. Send the endpoint response back to Gemini:

```js
session.send_tool_response({
  function_responses: [{
    id: toolCall.functionCalls[0].id,
    name: toolCall.functionCalls[0].name,
    response: { result: endpointResponse }
  }]
});
```

The tool names Gemini uses match the endpoint paths: `log_line` -> `POST /tools/log_line`, `close_pallet` -> `POST /tools/close_pallet`, `report_damage` -> `POST /tools/report_damage`, `delivery_status` -> `GET /tools/delivery_status`.

### Known constraints

- HTTPS is required for `getUserMedia` (mic and camera). `localhost` is treated as secure.
- iOS Safari suspends the microphone when the screen locks. Use Android for demos.
- Browser autoplay policy blocks audio output until after a user gesture. Ensure the clerk taps "Start" before opening the AudioContext and WebSocket.

---

## Page Specifications

### Clerk Page (phone)

This page is used by warehouse operatives. Optimise for one-handed use on a phone in portrait orientation.

**State machine:**

```
idle -> session_starting -> listening -> (tool_call in flight) -> listening
                                      -> damage_photo_prompt -> uploading -> listening
                         -> session_ended
```

**Required UI elements:**

- Large start/stop button (centred, thumb-reachable)
- Status indicator: idle / listening / processing / error
- Running log of items spoken this session (most recent at top)
- Camera shutter button that appears only after `report_damage` returns a `discrepancy_id`
- Playback of Gemini audio responses

**Session startup (on "Start" tap):**

1. Request microphone permission (`getUserMedia({ audio: true })`).
2. Call `POST /deliveries/{id}/start` with a new UUID and PO number (prompt user for PO number before session start).
3. Call `GET /live/tools` and `POST /live/token` in parallel.
4. Open Gemini WebSocket and send setup message.
5. Start streaming mic audio.

**Damage photo flow:**

1. When `report_damage` tool call arrives, show camera button.
2. On shutter tap, capture frame from `<video>` element (use `canvas.drawImage`).
3. POST to `/photos` as multipart.
4. Hide camera button.
5. Play the `speech` field from the response as TTS (or queue it for Gemini to speak if using Gemini audio).

---

### Dashboard Page (manager)

This page is used by supervisors monitoring one or more active deliveries. Optimise for a desktop browser.

**Required UI elements:**

- Delivery selector (dropdown or tab strip showing active deliveries)
- Live event feed (scrolling list, newest at top or auto-scrolled to bottom)
- Pending escalations panel (highlighted, requires action)
- Escalation decision buttons: Accept / Reject (per escalation)
- Delivery status summary (items counted, damage reports, pallets closed)

**SSE connection lifecycle:**

1. On page load, call `GET /deliveries` to populate the delivery selector.
2. Connect `GET /stream?last_event_id=0`.
3. On `escalation_created`, add to the pending panel and visually alert the manager.
4. On `escalation_decided`, remove from pending panel.
5. On error or connection drop, reconnect after 3 seconds using the last received `event_id`.

**Escalation decision flow:**

1. Manager taps Accept or Reject on a pending escalation.
2. POST to `POST /escalations/{id}/decision`.
3. Display the `speech` field from the response as on-screen text.
4. Remove the escalation from the pending panel.

**Export (after delivery closed):**

Provide download links or buttons that call `GET /deliveries/{id}/export/gr` and `GET /deliveries/{id}/export/qn` and trigger a file download.

---

## Environment Variables

The current Next.js frontend uses:

```env
NEXT_PUBLIC_API_BASE=https://<modal-user-or-workspace>--argusai-web.modal.run
```

If this UI is ever ported back to Vite, use the Vite public prefix instead:

```env
VITE_API_BASE=https://<modal-user-or-workspace>--argusai-web.modal.run
```

The Gemini WebSocket URL and API key handling are managed by the token returned from `POST /live/token`. No Gemini API key is stored in the frontend.

---

## Development Setup

```bash
cd web
cp .env.local.example .env.local
npm install
npm run dev
# dev server starts at http://localhost:5173
```

CORS is configured through the backend `CORS_ORIGINS` variable. No proxy configuration is needed during development when `NEXT_PUBLIC_API_BASE` points at the backend.

For production, add the deployed frontend origin to the Modal secret's `CORS_ORIGINS` value.

---

## Error Handling Notes

- `POST /live/token` returns a token valid for a short window. If WebSocket setup takes too long and the token expires, retry the full startup sequence from step 1.
- All `/tools/*` endpoints should be called as fire-and-forget from the Gemini tool call handler, but always await the response before calling `send_tool_response` - Gemini pauses until a response is received.
- If the SSE stream returns a non-2xx status, do not immediately reconnect in a tight loop. Use exponential backoff capped at 30 seconds.
- Photo upload may take several seconds (vision model inference). Show a loading state on the camera button; do not allow a second upload while one is in flight.
