"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { apiClient } from "@/lib/api-client";
import { useEventStream } from "@/lib/use-event-stream";
import { useAppStore } from "@/lib/store";
import { deriveAssessmentFeed, enrichEscalations } from "@/lib/derive";
import { EscalationQueue } from "@/components/manager/EscalationQueue";
import { LiveFeed } from "@/components/dashboard/LiveFeed";
import { AssessmentGrid } from "@/components/dashboard/AssessmentGrid";
import { DeliveryFilter } from "@/components/dashboard/DeliveryFilter";
import type { AssessmentFeedItem, DeliverySummary, EscalationView } from "@/lib/types";

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

  const [deliveries, setDeliveries] = useState<DeliverySummary[]>([]);
  const [selectedDelivery, setSelectedDelivery] = useState<string | "all">("all");
  const [escalations, setEscalations] = useState<EscalationView[]>([]);
  const [assessmentFeed, setAssessmentFeed] = useState<AssessmentFeedItem[]>([]);

  const allStreamEvents = useAppStore((s) => s.events);
  const feedEvents = useMemo(
    () => (selectedDelivery === "all" ? allStreamEvents : allStreamEvents.filter((e) => e.delivery_id === selectedDelivery)),
    [allStreamEvents, selectedDelivery]
  );

  useEffect(() => {
    apiClient.listDeliveries().then(setDeliveries).catch(() => {});
  }, []);

  const refresh = useCallback(async () => {
    const raw = await apiClient.listEscalations(selectedDelivery === "all" ? undefined : selectedDelivery);
    // Deliveries with zero escalations (e.g. an auto-accepted overage or
    // shortage) still need their events pulled for the assessment grid —
    // escalation-derived ids alone would silently hide anything that never
    // needed a manager, which is most of what the grid exists to show off.
    let deliveryIds: string[];
    if (selectedDelivery === "all") {
      const allDeliveries = await apiClient.listDeliveries().catch(() => []);
      deliveryIds = [...new Set([...allDeliveries.map((d) => d.id), ...raw.map((e) => e.delivery_id)])];
    } else {
      deliveryIds = [selectedDelivery];
    }
    const details = await Promise.all(deliveryIds.map((id) => apiClient.getDelivery(id).catch(() => null)));
    const validDetails = details.filter((d): d is NonNullable<typeof d> => d !== null);
    const eventsByDeliveryId = Object.fromEntries(validDetails.map((d) => [d.id, d.events]));

    setEscalations(enrichEscalations(raw, eventsByDeliveryId));
    setAssessmentFeed(validDetails.flatMap((d) => deriveAssessmentFeed(d.id, d.events)));
  }, [selectedDelivery]);

  useEffect(() => {
    // Standard mount-time (and filter-change) fetch; react-hooks/set-state-in-effect
    // flags any effect invoking a useCallback-memoized async setState-er,
    // including this well-understood pattern.
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
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold text-foreground">Manager Dashboard</h1>
          <p className="text-sm text-muted-foreground">
            Only exceptions land here &mdash; routine problems resolve automatically.
          </p>
        </div>
        <DeliveryFilter deliveries={deliveries} value={selectedDelivery} onChange={setSelectedDelivery} />
      </div>
      <EscalationQueue escalations={escalations} onDecide={handleDecide} />
      <AssessmentGrid items={assessmentFeed} />
      <LiveFeed events={feedEvents} />
    </main>
  );
}
