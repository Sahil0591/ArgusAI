# API Notes — Verified 2026-09-19

## Gemini Model IDs

| Purpose | Model ID | Verified |
|---------|----------|----------|
| Live API (voice) | `gemini-3.8-live` | Yes — listed as "Default Live API model for most low-latency voice agent experiences" on ai.google.dev/gemini-api/docs/models |
| Vision (damage assessment) | `gemini-2.5-flash` | Yes — multimodal, supports structured output, good price-performance. `gemini-3.8-flash` also works but costs more. |

## Ephemeral Tokens (Live API)

Source: ai.google.dev/gemini-api/docs/live-api/ephemeral-tokens

Python SDK:
```python
import datetime
from google import genai

client = genai.Client(api_key=GEMINI_API_KEY)
now = datetime.datetime.now(tz=datetime.timezone.utc)

token = client.auth_tokens.create(
    config={
        "uses": 1,
        "expire_time": now + datetime.timedelta(minutes=30),
        "new_session_expire_time": now + datetime.timedelta(minutes=1),
    }
)
# token.name is the ephemeral token string
```

- Token grants Live API access only
- `new_session_expire_time`: window to start a session (default 1 min)
- `expire_time`: window to send messages on an open session (default 30 min)
- Client uses `token.name` as the API key when connecting

## Live API Function Calling

Source: ai.google.dev/gemini-api/docs/live-api/tools

- Functions declared as `{ "function_declarations": [{ "name": "...", "parameters": {...} }] }`
- Client receives tool calls via `response.tool_call`
- Client sends results via `session.send_tool_response(function_responses=[...])`
- No automatic tool handling — client must manually call backend and return results
- Each `FunctionResponse` needs: `id` (from the call), `name`, `response` (dict)

## Live API Audio Format

- Input: raw 16-bit PCM, 16kHz, little-endian
- Output: raw 16-bit PCM, 24kHz, little-endian
- Image input: JPEG ≤ 1 FPS
- Protocol: WebSocket (WSS)

## Pydantic AI with Gemini

Using `pydantic-ai-slim[google]` which includes the google-genai provider.

```python
from pydantic_ai import Agent
agent = Agent("google-genai:gemini-2.5-flash", output_type=DamageAssessment)
```

Image input via `BinaryContent` or `ImageUrl` in the message parts.

## Modal Deployment

- `Secret.from_dotenv()` auto-discovers .env files
- Volume for persistent storage (SQLite + photos)
- `web_server` with `min_containers=1, max_containers=1`

## Known Pitfalls (for frontend)

- HTTPS required for getUserMedia (mic + camera) — localhost exception only on desktop, not mobile
- iOS Safari suspends microphone when screen locks; wake lock API cannot override this — use Android
- Browser autoplay rules may block audio output; user gesture required to start audio context
- Gemini Live WebSocket connects directly from browser to Google — audio never passes through our backend
