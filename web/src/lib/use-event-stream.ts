"use client";

import { useEffect } from "react";
import { apiClient } from "./api-client";
import { useAppStore } from "./store";
import type { EventType, StreamEvent } from "./types";

// The backend sends NAMED SSE events (`event: line_logged\ndata: {...}\n\n`),
// so a plain EventSource.onmessage handler never fires — must listen per
// type. It also doesn't set the SSE `id:` field, so the browser's native
// reconnect/replay-dedup doesn't apply; reconnection with `?last_event_id=`
// and backoff is handled manually here instead.

const EVENT_TYPES: EventType[] = [
  "line_logged",
  "damage_reported",
  "photo_uploaded",
  "assessment_complete",
  "policy_decision",
  "escalation_created",
  "escalation_decided",
  "delivery_closed",
];

const INITIAL_BACKOFF_MS = 1000;
const MAX_BACKOFF_MS = 30000;

export function useEventStream() {
  const addEvent = useAppStore((s) => s.addEvent);

  useEffect(() => {
    let source: EventSource | null = null;
    let reconnectTimer: ReturnType<typeof setTimeout> | null = null;
    let backoff = INITIAL_BACKOFF_MS;
    let lastEventId = 0;
    let cancelled = false;

    const connect = () => {
      if (cancelled) return;
      source = new EventSource(apiClient.streamUrl(lastEventId));

      source.onopen = () => {
        backoff = INITIAL_BACKOFF_MS;
      };

      for (const type of EVENT_TYPES) {
        source.addEventListener(type, (e: MessageEvent) => {
          try {
            const event = JSON.parse(e.data) as StreamEvent;
            lastEventId = Math.max(lastEventId, event.event_id);
            addEvent(event);
          } catch {
            // Ignore malformed payloads rather than dropping the connection.
          }
        });
      }

      source.onerror = () => {
        source?.close();
        if (cancelled) return;
        reconnectTimer = setTimeout(connect, backoff);
        backoff = Math.min(backoff * 2, MAX_BACKOFF_MS);
      };
    };

    connect();

    return () => {
      cancelled = true;
      source?.close();
      if (reconnectTimer) clearTimeout(reconnectTimer);
    };
  }, [addEvent]);
}
