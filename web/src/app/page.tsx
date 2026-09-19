"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { apiClient } from "@/lib/api-client";
import { PURCHASE_ORDERS, getVendor } from "@/lib/po-catalog";

export default function Home() {
  const router = useRouter();
  const [poNumber, setPoNumber] = useState(PURCHASE_ORDERS[0].EBELN);
  const [starting, setStarting] = useState(false);
  const [error, setError] = useState<string | null>(null);

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
    <main className="flex flex-1 flex-col items-center justify-center gap-6 px-6 text-center">
      <div>
        <h1 className="text-3xl font-semibold tracking-tight text-zinc-900 dark:text-zinc-100">ArgusAI</h1>
        <p className="mt-2 max-w-md text-zinc-500 dark:text-zinc-400">
          Check incoming deliveries by talking. Routine problems resolve on their own; a human is only involved by
          exception.
        </p>
      </div>
      <div className="flex flex-col items-center gap-3">
        <select
          value={poNumber}
          onChange={(e) => setPoNumber(e.target.value)}
          className="rounded border border-zinc-300 bg-white px-3 py-2 text-sm dark:border-zinc-700 dark:bg-zinc-900"
        >
          {PURCHASE_ORDERS.map((po) => (
            <option key={po.EBELN} value={po.EBELN}>
              {po.EBELN} &mdash; {getVendor(po.LIFNR)?.NAME1 ?? po.LIFNR}
            </option>
          ))}
        </select>
        <button
          onClick={startDelivery}
          disabled={starting}
          className="rounded-full bg-zinc-900 px-6 py-3 text-sm font-medium text-white transition-opacity disabled:opacity-50 dark:bg-white dark:text-zinc-900"
        >
          {starting ? "Starting…" : "Start new delivery"}
        </button>
        {error && <p className="text-sm text-red-600 dark:text-red-400">{error}</p>}
      </div>
    </main>
  );
}
