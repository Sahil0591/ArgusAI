"use client";

import { apiClient } from "@/lib/api-client";
import type { DeliverySummary } from "@/lib/types";

export function DeliveriesHistory({ deliveries }: { deliveries: DeliverySummary[] }) {
  return (
    <div className="overflow-hidden rounded-lg border border-border bg-surface">
      <div className="border-b border-border bg-surface-secondary px-4 py-2 text-sm font-medium text-muted-foreground">
        Past deliveries
      </div>
      <ul className="divide-y divide-border">
        {deliveries.length === 0 && (
          <li className="px-4 py-3 text-sm text-muted-foreground/70">No deliveries yet.</li>
        )}
        {deliveries.map((d) => (
          <li key={d.id} className="flex items-center justify-between gap-4 px-4 py-3 text-sm">
            <div className="min-w-0">
              <span className="font-medium text-foreground">{d.po_number}</span>
              <span className="ml-2 text-muted-foreground">{d.vendor_id}</span>
            </div>
            <div className="flex shrink-0 items-center gap-3">
              <span className={d.status === "completed" ? "text-green-500" : "text-yellow-500"}>
                {d.status === "completed" ? "Completed" : "In progress"}
              </span>
              <a
                href={apiClient.exportReportPdfUrl(d.id)}
                target="_blank"
                rel="noopener noreferrer"
                className="rounded border border-border px-2 py-0.5 text-xs text-muted-foreground hover:border-foreground/30 hover:text-foreground"
              >
                Download PDF
              </a>
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}
