"use client";

import { useState, type FormEvent } from "react";

export interface LogLineInput {
  material_description: string;
  quantity: number;
  unit_of_measure: string;
  damage_noted?: string;
  pallet_number?: number;
}

const UNITS = ["EA", "CTN", "PAL"];

// Stubbed push-to-talk control. Real Gemini Live wiring (mic -> PCM16 ->
// WSS -> function calls) is deferred until Sahil's backend is live; this
// lets the whole worker flow be built and demoed without it.
export function MicButton({ onSubmit }: { onSubmit: (input: LogLineInput) => Promise<void> }) {
  const [description, setDescription] = useState("");
  const [quantity, setQuantity] = useState("");
  const [unit, setUnit] = useState(UNITS[0]);
  const [pallet, setPallet] = useState("");
  const [damage, setDamage] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    if (!description.trim() || !quantity) return;
    setSubmitting(true);
    try {
      await onSubmit({
        material_description: description.trim(),
        quantity: Number(quantity),
        unit_of_measure: unit,
        damage_noted: damage.trim() || undefined,
        pallet_number: pallet ? Number(pallet) : undefined,
      });
      setDescription("");
      setQuantity("");
      setDamage("");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-3 rounded-lg border border-zinc-200 p-4 dark:border-zinc-800">
      <div className="flex items-center gap-2 text-xs font-medium uppercase tracking-wide text-zinc-500 dark:text-zinc-400">
        <span className="h-2 w-2 rounded-full bg-red-500" />
        Push-to-talk (stub &mdash; real voice wired up later)
      </div>
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        <input
          className="col-span-2 rounded border border-zinc-300 bg-white px-3 py-2 text-sm dark:border-zinc-700 dark:bg-zinc-900"
          placeholder="Material, e.g. M8 bolts"
          value={description}
          onChange={(e) => setDescription(e.target.value)}
        />
        <input
          className="rounded border border-zinc-300 bg-white px-3 py-2 text-sm dark:border-zinc-700 dark:bg-zinc-900"
          placeholder="Qty"
          type="number"
          min="0"
          value={quantity}
          onChange={(e) => setQuantity(e.target.value)}
        />
        <select
          className="rounded border border-zinc-300 bg-white px-3 py-2 text-sm dark:border-zinc-700 dark:bg-zinc-900"
          value={unit}
          onChange={(e) => setUnit(e.target.value)}
        >
          {UNITS.map((u) => (
            <option key={u} value={u}>
              {u}
            </option>
          ))}
        </select>
      </div>
      <div className="grid grid-cols-2 gap-2">
        <input
          className="rounded border border-zinc-300 bg-white px-3 py-2 text-sm dark:border-zinc-700 dark:bg-zinc-900"
          placeholder="Pallet #"
          type="number"
          min="0"
          value={pallet}
          onChange={(e) => setPallet(e.target.value)}
        />
        <input
          className="rounded border border-zinc-300 bg-white px-3 py-2 text-sm dark:border-zinc-700 dark:bg-zinc-900"
          placeholder="Damage noted (optional)"
          value={damage}
          onChange={(e) => setDamage(e.target.value)}
        />
      </div>
      <button
        type="submit"
        disabled={submitting}
        className="w-full rounded-full bg-zinc-900 px-4 py-2 text-sm font-medium text-white transition-opacity disabled:opacity-50 dark:bg-white dark:text-zinc-900"
      >
        {submitting ? "Logging…" : "Log line"}
      </button>
    </form>
  );
}
