"use client";

import { useEffect, useMemo, useRef, useState, useCallback } from "react";
import { useParams } from "next/navigation";
import { apiClient } from "@/lib/api-client";
import { useEventStream } from "@/lib/use-event-stream";
import { useAppStore } from "@/lib/store";
import { deriveReceiptLines } from "@/lib/derive";
import { getVendor } from "@/lib/po-catalog";
import { GeminiLiveSession } from "@/lib/voice/gemini-live-client";
import { DecisionBanner } from "@/components/worker/DecisionBanner";
import { POChecklist } from "@/components/worker/POChecklist";
import { MicButton, type LogLineInput } from "@/components/worker/MicButton";
import { VoiceControl } from "@/components/worker/VoiceControl";
import { PhotoCapture } from "@/components/worker/PhotoCapture";
import { TranscriptPanel } from "@/components/worker/TranscriptPanel";
import { GoodsReceiptView } from "@/components/worker/GoodsReceiptView";
import type {
  DeliveryDetail,
  EscalationDecidedEventData,
  GoodsReceiptDocument,
  QualityNotification,
} from "@/lib/types";

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
  const [completing, setCompleting] = useState(false);
  const [completed, setCompleted] = useState<{
    goodsReceipt: GoodsReceiptDocument;
    qualityNotifications: QualityNotification[];
  } | null>(null);
  const [manualEntry, setManualEntry] = useState(false);
  const voiceSessionRef = useRef<GeminiLiveSession | null>(null);

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
          const message =
            payload.decision === "accepted"
              ? "Manager approved — proceed with receiving."
              : "Manager rejected this item — hold it aside for return.";
          setBanner(message);
          // Reaches the clerk's earbuds even mid-session, not just the
          // on-screen banner — this is the "hears the answer" loop from
          // the pitch, not something a tool call can trigger on its own.
          voiceSessionRef.current?.sayAloud(message);
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

  const handlePhoto = async (photo: Blob) => {
    if (!pendingPhoto) return;
    const res = await apiClient.uploadPhoto(deliveryId, pendingPhoto.discrepancyId, photo);
    setBanner(res.speech);
    setPendingPhoto(null);
  };

  const handleComplete = async () => {
    setCompleting(true);
    try {
      const [goodsReceipt, qualityNotifications] = await Promise.all([
        apiClient.exportGoodsReceipt(deliveryId),
        apiClient.exportQualityNotifications(deliveryId),
      ]);
      setCompleted({ goodsReceipt, qualityNotifications });
    } catch (err) {
      setBanner(`Couldn't complete delivery: ${(err as Error).message}`);
    } finally {
      setCompleting(false);
    }
  };

  if (loading) {
    return <div className="p-8 text-muted-foreground">Loading delivery…</div>;
  }

  if (error || !delivery) {
    return <div className="p-8 text-danger">Couldn&apos;t load delivery: {error}</div>;
  }

  const vendorName = getVendor(delivery.vendor_id)?.NAME1 ?? delivery.vendor_id;
  const hasReceivedLines = receiptLines.some((l) => l.received_qty > 0);

  if (completed) {
    return (
      <main className="mx-auto flex w-full max-w-2xl flex-1 flex-col gap-4 px-4 py-6">
        <div className="flex items-center gap-3">
          <span className="flex h-9 w-9 items-center justify-center rounded-full bg-success-bg text-success">
            <svg viewBox="0 0 20 20" fill="currentColor" className="h-5 w-5">
              <path
                fillRule="evenodd"
                d="M16.704 5.29a1 1 0 010 1.415l-7.5 7.5a1 1 0 01-1.415 0l-3.5-3.5a1 1 0 111.415-1.415L8.5 12.086l6.79-6.796a1 1 0 011.414 0z"
                clipRule="evenodd"
              />
            </svg>
          </span>
          <div>
            <h1 className="text-xl font-semibold text-foreground">Delivery complete</h1>
            <p className="text-sm text-muted-foreground">
              PO <span className="font-mono">{delivery.po_number}</span> &middot; {vendorName} &mdash; ready for SAP.
            </p>
          </div>
        </div>
        <GoodsReceiptView goodsReceipt={completed.goodsReceipt} qualityNotifications={completed.qualityNotifications} />
      </main>
    );
  }

  return (
    <main className="mx-auto flex w-full max-w-2xl flex-1 flex-col gap-4 px-4 py-6">
      <DecisionBanner message={banner} />
      <POChecklist poNumber={delivery.po_number} vendorName={vendorName} lines={receiptLines} />

      {manualEntry ? (
        <MicButton onSubmit={handleLogLine} />
      ) : (
        <VoiceControl
          deliveryId={deliveryId}
          onSpeech={setBanner}
          onPhotoRequested={(discrepancyId, material) => setPendingPhoto({ discrepancyId, material })}
          onSessionReady={(session) => {
            voiceSessionRef.current = session;
          }}
        />
      )}
      <button
        onClick={() => setManualEntry((v) => !v)}
        className="self-center text-xs text-muted-foreground underline decoration-border underline-offset-2 hover:text-foreground"
      >
        {manualEntry ? "Use voice instead" : "Having trouble? Use manual entry instead"}
      </button>

      {pendingPhoto && <PhotoCapture material={pendingPhoto.material} onCapture={handlePhoto} />}
      {hasReceivedLines && (
        <button
          onClick={handleComplete}
          disabled={completing}
          className="rounded-lg bg-accent px-5 py-2.5 text-sm font-medium text-accent-foreground transition-opacity disabled:opacity-50"
        >
          {completing ? "Completing…" : "Complete Delivery"}
        </button>
      )}
      <TranscriptPanel events={events} />
    </main>
  );
}
