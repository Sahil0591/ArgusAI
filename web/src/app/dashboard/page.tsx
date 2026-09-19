"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { apiClient } from "@/lib/api-client";
import { useEventStream } from "@/lib/use-event-stream";
import { useAppStore } from "@/lib/store";
import { deriveAssessmentFeed, enrichEscalations } from "@/lib/derive";
import { EscalationQueue } from "@/components/manager/EscalationQueue";
import { LiveFeed } from "@/components/dashboard/LiveFeed";
import { AssessmentGrid } from "@/components/dashboard/AssessmentGrid";
import { DeliveryFilter } from "@/components/dashboard/DeliveryFilter";
import { DeliveriesHistory } from "@/components/dashboard/DeliveriesHistory";
import type { AssessmentFeedItem, DeliverySummary, EscalationView } from "@/lib/types";

const REFRESH_ON = new Set([
  "damage_reported",
  "photo_uploaded",
  "assessment_complete",
  "policy_decision",
  "escalation_created",
  "escalation_decided",
]);

type Tab = "queue" | "assessments" | "feed" | "history";

const TABS: { id: Tab; label: string }[] = [
  { id: "queue", label: "Queue" },
  { id: "assessments", label: "Assessments" },
  { id: "feed", label: "Feed" },
  { id: "history", label: "History" },
];

export default function DashboardPage() {
  useEventStream();

  const [deliveries, setDeliveries] = useState<DeliverySummary[]>([]);
  const [selectedDelivery, setSelectedDelivery] = useState<string | "all">("all");
  const [escalations, setEscalations] = useState<EscalationView[]>([]);
  const [assessmentFeed, setAssessmentFeed] = useState<AssessmentFeedItem[]>([]);
  const [activeTab, setActiveTab] = useState<Tab>("queue");

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
    let refreshTimer: ReturnType<typeof setTimeout> | null = null;
    let refreshInFlight = false;
    let refreshQueued = false;

    const scheduleRefresh = () => {
      refreshQueued = true;
      if (refreshTimer) return;
      refreshTimer = setTimeout(async () => {
        refreshTimer = null;
        if (refreshInFlight || !refreshQueued) return;
        refreshQueued = false;
        refreshInFlight = true;
        try {
          await refresh();
        } catch {
          // A transient refresh failure should not create a request loop.
        } finally {
          refreshInFlight = false;
          if (refreshQueued) scheduleRefresh();
        }
      }, 250);
    };

    const unsubscribe = useAppStore.subscribe((state) => {
      const newEvents = state.events.slice(processedCount);
      processedCount = state.events.length;
      if (newEvents.some((e) => REFRESH_ON.has(e.type))) {
        scheduleRefresh();
      }
    });

    return () => {
      unsubscribe();
      if (refreshTimer) clearTimeout(refreshTimer);
    };
  }, [refresh]);

  const handleDecide = async (id: string, decision: "accepted" | "rejected") => {
    await apiClient.decideEscalation(id, { decision, decided_by: "manager" });
    await refresh();
  };

  return (
    <main className="mx-auto flex w-full max-w-4xl flex-1 flex-col gap-6 px-4 py-6">
      {/* Header - always visible */}
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold text-foreground">Manager Dashboard</h1>
          <p className="text-sm text-muted-foreground">
            Only exceptions land here &mdash; routine problems resolve automatically.
          </p>
        </div>
        <DeliveryFilter deliveries={deliveries} value={selectedDelivery} onChange={setSelectedDelivery} />
      </div>

      {/* Mobile tab bar - hidden on md+ */}
      <div className="md:hidden">
        <div
          className="relative flex overflow-x-auto border-b border-border"
          style={{ scrollbarWidth: "none", msOverflowStyle: "none" } as React.CSSProperties}
        >
          {TABS.map((tab) => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={[
                "relative shrink-0 whitespace-nowrap px-4 pb-2 pt-1 text-sm font-medium transition-colors",
                activeTab === tab.id ? "text-foreground" : "text-muted-foreground",
              ].join(" ")}
            >
              {tab.label}
              {activeTab === tab.id && (
                <motion.div
                  layoutId="tab-underline"
                  className="absolute bottom-0 left-0 right-0 h-0.5 bg-foreground"
                  transition={{ type: "spring", stiffness: 500, damping: 40 }}
                />
              )}
            </button>
          ))}
        </div>

        {/* Mobile: animated tab content */}
        <div className="mt-4 overflow-hidden">
          <AnimatePresence mode="wait" initial={false}>
            <motion.div
              key={activeTab}
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -8 }}
              transition={{ duration: 0.18, ease: "easeOut" }}
            >
              {activeTab === "queue" && (
                <EscalationQueue escalations={escalations} onDecide={handleDecide} />
              )}
              {activeTab === "assessments" && (
                <AssessmentGrid items={assessmentFeed} />
              )}
              {activeTab === "feed" && (
                <LiveFeed events={feedEvents} />
              )}
              {activeTab === "history" && (
                <DeliveriesHistory deliveries={deliveries} />
              )}
            </motion.div>
          </AnimatePresence>
        </div>
      </div>

      {/* Desktop layout - all sections visible, hidden below md */}
      <div className="hidden md:flex md:flex-col md:gap-6">
        <EscalationQueue escalations={escalations} onDecide={handleDecide} />
        <AssessmentGrid items={assessmentFeed} />
        <DeliveriesHistory deliveries={deliveries} />
        <LiveFeed events={feedEvents} />
      </div>
    </main>
  );
}
