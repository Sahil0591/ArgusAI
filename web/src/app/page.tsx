"use client";

import { useId, useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { apiClient } from "@/lib/api-client";
import { PURCHASE_ORDERS, getVendor } from "@/lib/po-catalog";
import type { DeliverySummary } from "@/lib/types";

export default function Home() {
  const router = useRouter();
  const poFieldId = useId();
  const [poNumber, setPoNumber] = useState(PURCHASE_ORDERS[0].EBELN);
  const [starting, setStarting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [deliveries, setDeliveries] = useState<DeliverySummary[]>([]);

  useEffect(() => {
    apiClient.listDeliveries().then(setDeliveries).catch(() => {});
  }, []);

  const startDelivery = async () => {
    setStarting(true);
    setError(null);
    const deliveryId = crypto.randomUUID();
    try {
      await apiClient.startDelivery(deliveryId, { po_number: poNumber });
      router.push(`/receive/${deliveryId}`);
    } catch (err) {
      setError((err as Error).message);
      setStarting(false);
    }
  };

  return (
    <main className="flex flex-1 flex-col items-center px-4 py-12 sm:px-6 sm:py-16">
      <div className="w-full max-w-sm text-center">
        <span className="mx-auto flex h-11 w-11 items-center justify-center rounded-xl bg-accent text-lg font-bold text-accent-foreground">
          A
        </span>
        <h1 className="mt-4 text-3xl font-semibold tracking-tight text-foreground">ArgusAI</h1>
        <p className="mt-2 text-[15px] leading-relaxed text-muted-foreground">
          Check incoming deliveries by talking. Routine problems resolve on their own; a human is only involved by
          exception.
        </p>

        <div className="mt-8 flex flex-col gap-3 rounded-xl border border-border bg-surface p-5 text-left shadow-sm">
          <div>
            <label htmlFor={poFieldId} className="mb-1.5 block text-xs font-medium text-muted-foreground">
              Purchase order
            </label>
            <select
              id={poFieldId}
              value={poNumber}
              onChange={(e) => setPoNumber(e.target.value)}
              className="w-full rounded-lg border border-border bg-canvas px-3 py-2.5 text-sm text-foreground"
            >
              {PURCHASE_ORDERS.map((po) => (
                <option key={po.EBELN} value={po.EBELN}>
                  {po.EBELN} &mdash; {getVendor(po.LIFNR)?.NAME1 ?? po.LIFNR}
                </option>
              ))}
            </select>
          </div>
          <button
            onClick={startDelivery}
            disabled={starting}
            className="mt-1 w-full rounded-lg bg-accent px-5 py-3.5 text-base font-semibold text-accent-foreground transition-opacity disabled:opacity-50"
          >
            {starting ? "Starting..." : "Start new delivery"}
          </button>
          {error && <p className="text-sm text-danger">{error}</p>}
        </div>
      </div>

      {deliveries.length > 0 && (
        <div className="mt-8 w-full max-w-sm">
          <h2 className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            Recent deliveries
          </h2>
          <ul className="overflow-hidden rounded-xl border border-border bg-surface divide-y divide-border">
            {deliveries.slice(0, 8).map((d) => (
              <li key={d.id} className="flex min-h-[48px] items-center justify-between gap-3 px-4 py-3">
                <div className="min-w-0">
                  <span className="block font-medium text-foreground font-mono text-sm">{d.po_number}</span>
                  <span className="block text-xs text-muted-foreground truncate">{getVendor(d.vendor_id)?.NAME1 ?? d.vendor_id}</span>
                </div>
                <div className="flex shrink-0 items-center gap-2">
                  <span
                    className={
                      d.status === "completed"
                        ? "rounded-full bg-success-bg px-2.5 py-0.5 text-xs font-medium text-success"
                        : "rounded-full bg-warning-bg px-2.5 py-0.5 text-xs font-medium text-warning"
                    }
                  >
                    {d.status === "completed" ? "Completed" : "In progress"}
                  </span>
                  <Link
                    href={`/receive/${d.id}`}
                    className="rounded-md border border-border px-2.5 py-1 text-xs font-medium text-foreground hover:bg-surface-secondary"
                  >
                    {d.status === "completed" ? "View" : "Continue"}
                  </Link>
                </div>
              </li>
            ))}
          </ul>
        </div>
      )}
    </main>
  );
}
