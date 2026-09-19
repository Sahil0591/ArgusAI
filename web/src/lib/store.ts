// Global live-event log fed by the SSE stream (see use-event-stream.ts).
// Deliberately minimal: the real backend's SSE payloads for
// escalation_created/escalation_decided are partial ({escalation_id,
// discrepancy_id, reason} / {escalation_id, decision, decided_by}), not
// full objects, so there's no reliable way to keep a denormalized
// escalations map in sync from the stream alone. Pages instead watch for
// the relevant event types and re-fetch + re-derive (see lib/derive.ts)
// when they land.

import { create } from "zustand";
import type { StreamEvent } from "./types";

interface AppState {
  events: StreamEvent[];
  lastEventId: number;
  addEvent: (event: StreamEvent) => void;
}

const MAX_EVENTS = 1000;

export const useAppStore = create<AppState>((set) => ({
  events: [],
  lastEventId: 0,

  addEvent: (event) =>
    set((state) => {
      if (state.events.some((existing) => existing.event_id === event.event_id)) return state;
      return {
        events: [...state.events, event].slice(-MAX_EVENTS),
        lastEventId: Math.max(state.lastEventId, event.event_id),
      };
    }),
}));
