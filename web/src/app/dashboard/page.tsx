"use client";

import { useCallback, useEffect, useState } from "react";
import { apiClient } from "@/lib/api-client";
import { useEventStream } from "@/lib/use-event-stream";
import { useAppStore } from "@/lib/store";
import { enrichEscalations } from "@/lib/derive";
import { EscalationQueue } from "@/components/manager/EscalationQueue";
import type { EscalationView } from "@/lib/types";

const REFRESH_ON = new Set([
  "damage_reported",
  "photo_uploaded",
  "assessment_complete",
  "policy_decision",
  "escalation_created",
  "escalation_decided",
]);

export default function DashboardPage() {
  useEventStream();

  const [escalations, setEscalations] = useState<EscalationView[]>([]);

  const refresh = useCallback(async () => {
    const raw = await apiClient.listEscalations();
    const deliveryIds = [...new Set(raw.map((e) => e.delivery_id))];
    const details = await Promise.all(deliveryIds.map((id) => apiClient.getDelivery(id).catch(() => null)));
    const eventsByDeliveryId = Object.fromEntries(
      details.filter((d): d is NonNullable<typeof d> => d !== null).map((d) => [d.id, d.events])
    );
    setEscalations(enrichEscalations(raw, eventsByDeliveryId));
  }, []);

  useEffect(() => {
    // Standard mount-time fetch; react-hooks/set-state-in-effect flags any
    // effect invoking a useCallback-memoized async setState-er, including
    // this well-understood pattern.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    refresh().catch(() => {});
  }, [refresh]);

  // Subscribe directly to the store (an external system, from React's point
  // of view) rather than reacting to a derived "lastEvent" value in an
  // effect — new events land asynchronously via this listener.
  useEffect(() => {
    let processedCount = useAppStore.getState().events.length;
    return useAppStore.subscribe((state) => {
      const newEvents = state.events.slice(processedCount);
      processedCount = state.events.length;
      if (newEvents.some((e) => REFRESH_ON.has(e.type))) {
        refresh().catch(() => {});
      }
    });
  }, [refresh]);

  const handleDecide = async (id: string, decision: "accepted" | "rejected") => {
    await apiClient.decideEscalation(id, { decision, decided_by: "manager" });
    await refresh();
  };

  return (
    <main className="mx-auto flex w-full max-w-4xl flex-1 flex-col gap-6 px-4 py-6">
      <div>
        <h1 className="text-xl font-semibold text-zinc-900 dark:text-zinc-100">Manager Dashboard</h1>
        <p className="text-sm text-zinc-500 dark:text-zinc-400">
          Only exceptions land here &mdash; routine problems resolve automatically.
        </p>
      </div>
      <EscalationQueue escalations={escalations} onDecide={handleDecide} />
    </main>
  );
}
