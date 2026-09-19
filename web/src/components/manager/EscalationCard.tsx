"use client";

import { useState } from "react";
import clsx from "clsx";
import { apiClient } from "@/lib/api-client";
import type { EscalationView } from "@/lib/types";

const SEVERITY_STYLES: Record<string, string> = {
  low: "bg-surface-secondary text-muted-foreground",
  medium: "bg-warning-bg text-warning",
  high: "bg-danger-bg text-danger",
};

export function EscalationCard({
  escalation,
  onDecide,
}: {
  escalation: EscalationView;
  onDecide: (id: string, decision: "accepted" | "rejected") => Promise<void>;
}) {
  const [busy, setBusy] = useState(false);
  const pending = escalation.status === "pending";

  const handle = async (decision: "accepted" | "rejected") => {
    setBusy(true);
    try {
      await onDecide(escalation.id, decision);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div
      className={clsx(
        "flex flex-col gap-3 rounded-lg border p-4",
        pending ? "border-warning-border bg-warning-bg/40" : "border-border bg-surface"
      )}
    >
      <div className="flex items-start justify-between gap-3">
        <div>
          <div className="font-medium text-foreground">{escalation.material_description}</div>
          <div className="text-sm text-muted-foreground">
            {escalation.discrepancy?.damage_description ?? escalation.discrepancy?.type ?? "Unknown issue"}
            {escalation.discrepancy && (
              <span className="font-mono tabular-nums"> &middot; &euro;{escalation.discrepancy.total_value_eur.toFixed(2)}</span>
            )}
          </div>
        </div>
        {escalation.damage_assessment && (
          <span
            className={clsx(
              "shrink-0 rounded-full px-2 py-0.5 text-xs font-medium",
              SEVERITY_STYLES[escalation.damage_assessment.severity]
            )}
          >
            {escalation.damage_assessment.severity} &middot; {(escalation.damage_assessment.confidence * 100).toFixed(0)}%
          </span>
        )}
      </div>

      {escalation.photo_id && (
        <a href={apiClient.photoUrl(escalation.photo_id)} target="_blank" rel="noreferrer" className="group overflow-hidden rounded-lg border border-border bg-black">
          {/* Evidence is served by the backend at runtime, so Next cannot optimize it statically. */}
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={apiClient.photoUrl(escalation.photo_id)}
            alt={`Evidence photo for ${escalation.material_description}`}
            className="max-h-64 w-full object-contain transition-transform group-hover:scale-[1.02]"
          />
          <div className="bg-surface-secondary px-3 py-2 text-xs text-muted-foreground">Open evidence photo</div>
        </a>
      )}

      {escalation.policy_decision && <p className="text-sm text-foreground/80">{escalation.policy_decision.reason}</p>}

      <div className="flex items-center gap-2">
        <button
          onClick={() => handle("accepted")}
          disabled={busy || !pending}
          className={clsx(
            "flex-1 rounded-lg px-4 py-2 text-sm font-medium transition-opacity disabled:opacity-60",
            escalation.status === "accepted" ? "bg-green-600 text-white" : "bg-accent text-accent-foreground"
          )}
        >
          {escalation.status === "accepted" ? "Accepted" : "Accept"}
        </button>
        <button
          onClick={() => handle("rejected")}
          disabled={busy || !pending}
          className={clsx(
            "flex-1 rounded-lg border px-4 py-2 text-sm font-medium transition-opacity disabled:opacity-60",
            escalation.status === "rejected"
              ? "border-red-600 bg-red-600 text-white"
              : "border-border text-foreground hover:bg-surface-secondary"
          )}
        >
          {escalation.status === "rejected" ? "Rejected" : "Reject"}
        </button>
      </div>
    </div>
  );
}
