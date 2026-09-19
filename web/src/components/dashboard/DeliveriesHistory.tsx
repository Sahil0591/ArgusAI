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
          <li className="px-4 py-4 text-sm text-muted-foreground/70">No deliveries yet.</li>
        )}
        {deliveries.map((d) => (
          <li key={d.id} className="flex min-h-[48px] items-center justify-between gap-4 px-4 py-4 text-sm">
            <div className="min-w-0">
              <span className="block font-medium text-foreground">{d.po_number}</span>
              <span className="block text-xs text-muted-foreground sm:inline sm:ml-1.5 sm:text-sm">{d.vendor_id}</span>
            </div>
            <div className="flex shrink-0 items-center gap-3">
              <span
                className={
                  d.status === "completed"
                    ? "rounded-full bg-success-bg px-2.5 py-0.5 text-xs font-medium text-success"
                    : "rounded-full bg-warning-bg px-2.5 py-0.5 text-xs font-medium text-warning"
                }
              >
                {d.status === "completed" ? "Completed" : "In progress"}
              </span>
              <a
                href={apiClient.exportReportPdfUrl(d.id)}
                target="_blank"
                rel="noopener noreferrer"
                className="rounded-md border border-border px-3 py-2 text-xs font-medium text-foreground hover:border-foreground/30 hover:bg-surface-secondary"
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
