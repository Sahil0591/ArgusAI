"use client";

import { useEffect, useMemo, useState, useCallback } from "react";
import { useParams } from "next/navigation";
import { apiClient } from "@/lib/api-client";
import { useEventStream } from "@/lib/use-event-stream";
import { useAppStore } from "@/lib/store";
import { deriveReceiptLines } from "@/lib/derive";
import { getVendor } from "@/lib/po-catalog";
import { DecisionBanner } from "@/components/worker/DecisionBanner";
import { POChecklist } from "@/components/worker/POChecklist";
import { MicButton, type LogLineInput } from "@/components/worker/MicButton";
import { PhotoCapture } from "@/components/worker/PhotoCapture";
import { TranscriptPanel } from "@/components/worker/TranscriptPanel";
import type { DeliveryDetail, EscalationDecidedEventData } from "@/lib/types";

const REFRESH_ON = new Set(["line_logged", "damage_reported", "policy_decision", "escalation_decided", "delivery_closed"]);

export default function ReceivePage() {
  const params = useParams<{ deliveryId: string }>();
  const deliveryId = params.deliveryId;

  useEventStream();

  const [delivery, setDelivery] = useState<DeliveryDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [banner, setBanner] = useState<string | null>(null);
  const [pendingPhoto, setPendingPhoto] = useState<{ discrepancyId: string; material: string } | null>(null);

  const allEvents = useAppStore((s) => s.events);
  const events = useMemo(() => allEvents.filter((e) => e.delivery_id === deliveryId), [allEvents, deliveryId]);

  const refresh = useCallback(() => {
    apiClient.getDelivery(deliveryId).then(setDelivery).catch(() => {});
  }, [deliveryId]);

  useEffect(() => {
    apiClient
      .getDelivery(deliveryId)
      .then(setDelivery)
      .catch((err) => setError((err as Error).message))
      .finally(() => setLoading(false));
  }, [deliveryId]);

  // Subscribe directly to the store (an external system, from React's
  // point of view) rather than reacting to a derived "lastEvent" value in
  // an effect — new events land asynchronously via this listener, which is
  // where setState belongs, not in an effect body watching derived state.
  useEffect(() => {
    let processedCount = useAppStore.getState().events.length;
    return useAppStore.subscribe((state) => {
      const newEvents = state.events.slice(processedCount);
      processedCount = state.events.length;
      for (const event of newEvents) {
        if (event.delivery_id !== deliveryId) continue;
        if (REFRESH_ON.has(event.type)) refresh();
        if (event.type === "escalation_decided") {
          const payload = event.payload as EscalationDecidedEventData;
          setBanner(
            payload.decision === "accepted"
              ? "Manager approved — proceed with receiving."
              : "Manager rejected this item — hold it aside for return."
          );
        }
      }
    });
  }, [deliveryId, refresh]);

  const receiptLines = useMemo(
    () => (delivery ? deriveReceiptLines(delivery.po_number, delivery.events) : []),
    [delivery]
  );

  const handleLogLine = async (input: LogLineInput) => {
    const { damage_noted, ...rest } = input;
    const logRes = await apiClient.logLine({ delivery_id: deliveryId, ...rest });

    // Damage must go through report_damage, not log_line's damage_noted
    // field: the backend's /photos value lookup only searches for
    // DAMAGE_REPORTED events, so damage noted inline on log_line prices at
    // EUR 0 once a photo is attached (verified live) — always
    // auto-accepting regardless of real value. report_damage is also what
    // the backend's own Gemini system instruction directs for this case.
    if (damage_noted) {
      const damageRes = await apiClient.reportDamage({
        delivery_id: deliveryId,
        material_description: input.material_description,
        description: damage_noted,
        quantity: input.quantity,
      });
      setBanner(damageRes.speech);
      if (damageRes.photo_requested && damageRes.discrepancy_id) {
        setPendingPhoto({ discrepancyId: damageRes.discrepancy_id, material: input.material_description });
      }
      return;
    }

    setBanner(logRes.speech);
  };

  const handlePhoto = async (file: File) => {
    if (!pendingPhoto) return;
    const res = await apiClient.uploadPhoto(deliveryId, pendingPhoto.discrepancyId, file);
    setBanner(res.speech);
    setPendingPhoto(null);
  };

  if (loading) {
    return <div className="p-8 text-zinc-500">Loading delivery…</div>;
  }

  if (error || !delivery) {
    return <div className="p-8 text-red-600 dark:text-red-400">Couldn&apos;t load delivery: {error}</div>;
  }

  const vendorName = getVendor(delivery.vendor_id)?.NAME1 ?? delivery.vendor_id;

  return (
    <main className="mx-auto flex w-full max-w-2xl flex-1 flex-col gap-4 px-4 py-6">
      <DecisionBanner message={banner} />
      <POChecklist poNumber={delivery.po_number} vendorName={vendorName} lines={receiptLines} />
      <MicButton onSubmit={handleLogLine} />
      {pendingPhoto && <PhotoCapture material={pendingPhoto.material} onCapture={handlePhoto} />}
      <TranscriptPanel events={events} />
    </main>
  );
}
