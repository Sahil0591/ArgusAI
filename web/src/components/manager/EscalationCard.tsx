"use client";

import { useState } from "react";
import clsx from "clsx";
import type { EscalationView } from "@/lib/types";

const SEVERITY_STYLES: Record<string, string> = {
  low: "bg-zinc-100 text-zinc-700 dark:bg-zinc-800 dark:text-zinc-300",
  medium: "bg-amber-100 text-amber-800 dark:bg-amber-900 dark:text-amber-200",
  high: "bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200",
};

export function EscalationCard({
  escalation,
  onDecide,
}: {
  escalation: EscalationView;
  onDecide: (id: string, decision: "accepted" | "rejected") => Promise<void>;
}) {
  const [busy, setBusy] = useState(false);
  const decided = escalation.status !== "pending";

  const handle = async (decision: "accepted" | "rejected") => {
    setBusy(true);
    try {
      await onDecide(escalation.id, decision);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="flex flex-col gap-3 rounded-lg border border-zinc-200 p-4 dark:border-zinc-800">
      <div className="flex items-start justify-between gap-3">
        <div>
          <div className="font-medium text-zinc-900 dark:text-zinc-100">{escalation.material_description}</div>
          <div className="text-sm text-zinc-500 dark:text-zinc-400">
            {escalation.discrepancy?.damage_description ?? escalation.discrepancy?.type ?? "Unknown issue"}
            {escalation.discrepancy && (
              <>
                {" "}
                &middot; &euro;
                {escalation.discrepancy.total_value_eur.toFixed(2)}
              </>
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

      {escalation.policy_decision && (
        <p className="text-sm text-zinc-600 dark:text-zinc-300">{escalation.policy_decision.reason}</p>
      )}

      <div className="flex items-center gap-2">
        <button
          onClick={() => handle("accepted")}
          disabled={busy || decided}
          className={clsx(
            "flex-1 rounded-full px-4 py-2 text-sm font-medium transition-opacity disabled:opacity-50",
            escalation.status === "accepted"
              ? "bg-green-600 text-white"
              : "bg-zinc-900 text-white dark:bg-white dark:text-zinc-900"
          )}
        >
          {escalation.status === "accepted" ? "Accepted" : "Accept"}
        </button>
        <button
          onClick={() => handle("rejected")}
          disabled={busy || decided}
          className={clsx(
            "flex-1 rounded-full border px-4 py-2 text-sm font-medium transition-opacity disabled:opacity-50",
            escalation.status === "rejected"
              ? "border-red-600 bg-red-600 text-white"
              : "border-zinc-300 text-zinc-700 dark:border-zinc-700 dark:text-zinc-300"
          )}
        >
          {escalation.status === "rejected" ? "Rejected" : "Reject"}
        </button>
      </div>
    </div>
  );
}
