"use client";

import { useState } from "react";
import Link from "next/link";
import { apiClient } from "@/lib/api-client";
import { PURCHASE_ORDERS } from "@/lib/po-catalog";

interface LogEntry {
  text: string;
  tone: "info" | "speech" | "error";
}

const DEMO_PO = "PO-4500003";
const inputClass = "rounded-lg border border-border bg-canvas px-3 py-2 text-sm text-foreground";
const ghostButtonClass =
  "w-fit rounded-lg border border-border px-4 py-1.5 text-sm font-medium text-foreground transition-colors hover:bg-surface-secondary disabled:opacity-50 disabled:hover:bg-transparent";

async function fetchSamplePhoto(): Promise<Blob> {
  const res = await fetch("/seed/sample-damage.jpg");
  if (!res.ok) throw new Error("Couldn't load sample photo");
  return res.blob();
}

function delay(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function LogList({ entries }: { entries: LogEntry[] }) {
  return (
    <ul className="space-y-1.5 text-sm">
      {entries.map((e, i) => (
        <li key={i} className={e.tone === "error" ? "text-danger" : e.tone === "speech" ? "text-muted-foreground" : "text-foreground"}>
          {e.text}
        </li>
      ))}
    </ul>
  );
}

export default function SimulatorPage() {
  // --- scripted demo run ---
  const [running, setRunning] = useState(false);
  const [log, setLog] = useState<LogEntry[]>([]);
  const [deliveryId, setDeliveryId] = useState<string | null>(null);

  const appendLog = (text: string, tone: LogEntry["tone"] = "info") => {
    setLog((prev) => [...prev, { text, tone }]);
  };

  const runScriptedDemo = async () => {
    setRunning(true);
    setLog([]);
    setDeliveryId(null);
    try {
      const id = crypto.randomUUID();
      appendLog(`Starting delivery against ${DEMO_PO}…`);
      await apiClient.startDelivery(id, { po_number: DEMO_PO });
      setDeliveryId(id);
      await delay(500);

      appendLog('Clerk: "50 PTFE spiral wound gaskets"');
      const l1 = await apiClient.logLine({
        delivery_id: id,
        material_description: "PTFE spiral wound gaskets",
        quantity: 50,
        unit_of_measure: "PC",
      });
      appendLog(l1.speech, "speech");
      await delay(900);

      appendLog('Clerk: "199 M6 pan head screws"');
      const l2 = await apiClient.logLine({
        delivery_id: id,
        material_description: "M6 pan head screws",
        quantity: 199,
        unit_of_measure: "PKG",
      });
      appendLog(l2.speech, "speech");
      await delay(900);

      appendLog("Clerk reports damage: M6 screws, crushed packaging");
      const d1 = await apiClient.reportDamage({
        delivery_id: id,
        material_description: "M6 pan head screws",
        description: "crushed packaging, screws scattered",
        quantity: 3,
      });
      appendLog(d1.speech, "speech");
      await delay(400);

      if (d1.discrepancy_id) {
        appendLog("Uploading photo…");
        const photo = await fetchSamplePhoto();
        const p1 = await apiClient.uploadPhoto(id, d1.discrepancy_id, photo);
        appendLog(p1.speech, "speech");
      }
      await delay(900);

      appendLog("Clerk reports damage: SKF bearings, cracked housings");
      const d2 = await apiClient.reportDamage({
        delivery_id: id,
        material_description: "SKF bearings",
        description: "cracked outer housing, boxes damaged in transit",
        quantity: 5,
      });
      appendLog(d2.speech, "speech");
      await delay(400);

      if (d2.discrepancy_id) {
        appendLog("Uploading photo…");
        const photo = await fetchSamplePhoto();
        const p2 = await apiClient.uploadPhoto(id, d2.discrepancy_id, photo);
        appendLog(p2.speech, "speech");
      }

      appendLog("Scripted run complete.");
    } catch (err) {
      appendLog(`Error: ${(err as Error).message}`, "error");
    } finally {
      setRunning(false);
    }
  };

  // --- overage scenario (received more than ordered) ---
  const [runningOverage, setRunningOverage] = useState(false);
  const [overageLog, setOverageLog] = useState<LogEntry[]>([]);
  const [overageDeliveryId, setOverageDeliveryId] = useState<string | null>(null);

  const appendOverageLog = (text: string, tone: LogEntry["tone"] = "info") => {
    setOverageLog((prev) => [...prev, { text, tone }]);
  };

  const runOverageScenario = async () => {
    setRunningOverage(true);
    setOverageLog([]);
    setOverageDeliveryId(null);
    try {
      const id = crypto.randomUUID();
      appendOverageLog(`Starting delivery against ${DEMO_PO}…`);
      await apiClient.startDelivery(id, { po_number: DEMO_PO });
      setOverageDeliveryId(id);
      await delay(500);

      appendOverageLog('Clerk: "58 PTFE spiral wound gaskets" (50 ordered)');
      const res = await apiClient.logLine({
        delivery_id: id,
        material_description: "PTFE spiral wound gaskets",
        quantity: 58,
        unit_of_measure: "PC",
      });
      appendOverageLog(res.speech, "speech");
      appendOverageLog("Overage auto-accepted — no manager review needed.");
    } catch (err) {
      appendOverageLog(`Error: ${(err as Error).message}`, "error");
    } finally {
      setRunningOverage(false);
    }
  };

  // --- manual step-by-step mode ---
  const [manualPo, setManualPo] = useState(PURCHASE_ORDERS[0].EBELN);
  const [manualDeliveryId, setManualDeliveryId] = useState<string | null>(null);
  const [manualBusy, setManualBusy] = useState(false);
  const [manualLog, setManualLog] = useState<LogEntry[]>([]);
  const [lastDiscrepancyId, setLastDiscrepancyId] = useState<string | null>(null);

  const [material, setMaterial] = useState("");
  const [quantity, setQuantity] = useState("");
  const [unit, setUnit] = useState("EA");
  const [damageDescription, setDamageDescription] = useState("");

  const appendManualLog = (text: string, tone: LogEntry["tone"] = "info") => {
    setManualLog((prev) => [...prev, { text, tone }]);
  };

  const startManualDelivery = async () => {
    setManualBusy(true);
    try {
      const id = crypto.randomUUID();
      await apiClient.startDelivery(id, { po_number: manualPo });
      setManualDeliveryId(id);
      setManualLog([]);
      setLastDiscrepancyId(null);
      appendManualLog(`Delivery started against ${manualPo}.`);
    } catch (err) {
      appendManualLog(`Error: ${(err as Error).message}`, "error");
    } finally {
      setManualBusy(false);
    }
  };

  const fireLogLine = async () => {
    if (!manualDeliveryId || !material || !quantity) return;
    setManualBusy(true);
    try {
      const res = await apiClient.logLine({
        delivery_id: manualDeliveryId,
        material_description: material,
        quantity: Number(quantity),
        unit_of_measure: unit,
      });
      appendManualLog(res.speech, "speech");
    } catch (err) {
      appendManualLog(`Error: ${(err as Error).message}`, "error");
    } finally {
      setManualBusy(false);
    }
  };

  const fireReportDamage = async () => {
    if (!manualDeliveryId || !material || !damageDescription) return;
    setManualBusy(true);
    try {
      const res = await apiClient.reportDamage({
        delivery_id: manualDeliveryId,
        material_description: material,
        description: damageDescription,
        quantity: quantity ? Number(quantity) : undefined,
      });
      appendManualLog(res.speech, "speech");
      if (res.discrepancy_id) setLastDiscrepancyId(res.discrepancy_id);
    } catch (err) {
      appendManualLog(`Error: ${(err as Error).message}`, "error");
    } finally {
      setManualBusy(false);
    }
  };

  const fireUploadPhoto = async () => {
    if (!manualDeliveryId || !lastDiscrepancyId) return;
    setManualBusy(true);
    try {
      appendManualLog("Uploading sample photo…");
      const photo = await fetchSamplePhoto();
      const res = await apiClient.uploadPhoto(manualDeliveryId, lastDiscrepancyId, photo);
      appendManualLog(res.speech, "speech");
    } catch (err) {
      appendManualLog(`Error: ${(err as Error).message}`, "error");
    } finally {
      setManualBusy(false);
    }
  };

  return (
    <main className="mx-auto flex w-full max-w-3xl flex-1 flex-col gap-8 px-4 py-6">
      <div>
        <h1 className="text-xl font-semibold text-foreground">Delivery Simulator</h1>
        <p className="text-sm text-muted-foreground">
          Drives the real backend without a mic or camera &mdash; the no-voice fallback demo path.
        </p>
      </div>

      <section className="flex flex-col gap-3 rounded-lg border border-border bg-surface p-4">
        <div>
          <h2 className="font-medium text-foreground">Run scripted demo</h2>
          <p className="text-sm text-muted-foreground">
            Replays the rehearsed script against {DEMO_PO}: a clean match, an auto-accepted shortage, a small
            auto-accepted damage claim, and a high-value escalation.
          </p>
        </div>
        <button
          onClick={runScriptedDemo}
          disabled={running}
          className="w-fit rounded-lg bg-accent px-5 py-2 text-sm font-medium text-accent-foreground transition-opacity disabled:opacity-50"
        >
          {running ? "Running…" : "Run scripted demo"}
        </button>

        {deliveryId && (
          <div className="flex gap-3 text-sm">
            <Link href={`/receive/${deliveryId}`} className="text-accent underline underline-offset-2">
              Open worker view
            </Link>
            <Link href="/dashboard" className="text-accent underline underline-offset-2">
              Open dashboard
            </Link>
          </div>
        )}

        {log.length > 0 && (
          <div className="rounded-lg border border-border bg-surface-secondary p-3">
            <LogList entries={log} />
          </div>
        )}
      </section>

      <section className="flex flex-col gap-3 rounded-lg border border-border bg-surface p-4">
        <div>
          <h2 className="font-medium text-foreground">Run overage scenario</h2>
          <p className="text-sm text-muted-foreground">
            A separate one-line delivery against {DEMO_PO}: 58 PTFE gaskets logged against 50 ordered. Overage is
            auto-accepted by policy, same as a minor shortage &mdash; no photo, no manager involved.
          </p>
        </div>
        <button
          onClick={runOverageScenario}
          disabled={runningOverage}
          className="w-fit rounded-lg bg-accent px-5 py-2 text-sm font-medium text-accent-foreground transition-opacity disabled:opacity-50"
        >
          {runningOverage ? "Running…" : "Run overage scenario"}
        </button>

        {overageDeliveryId && (
          <div className="flex gap-3 text-sm">
            <Link href={`/receive/${overageDeliveryId}`} className="text-accent underline underline-offset-2">
              Open worker view
            </Link>
            <Link href="/dashboard" className="text-accent underline underline-offset-2">
              Open dashboard
            </Link>
          </div>
        )}

        {overageLog.length > 0 && (
          <div className="rounded-lg border border-border bg-surface-secondary p-3">
            <LogList entries={overageLog} />
          </div>
        )}
      </section>

      <section className="flex flex-col gap-3 rounded-lg border border-border bg-surface p-4">
        <div>
          <h2 className="font-medium text-foreground">Manual step-by-step</h2>
          <p className="text-sm text-muted-foreground">
            Fire individual tool calls against a fresh delivery &mdash; useful for testing other POs or scenarios.
          </p>
        </div>

        {!manualDeliveryId ? (
          <div className="flex items-center gap-2">
            <select value={manualPo} onChange={(e) => setManualPo(e.target.value)} className={inputClass}>
              {PURCHASE_ORDERS.map((po) => (
                <option key={po.EBELN} value={po.EBELN}>
                  {po.EBELN}
                </option>
              ))}
            </select>
            <button
              onClick={startManualDelivery}
              disabled={manualBusy}
              className="rounded-lg bg-accent px-4 py-2 text-sm font-medium text-accent-foreground disabled:opacity-50"
            >
              Start delivery
            </button>
          </div>
        ) : (
          <>
            <div className="flex flex-wrap items-center gap-2 text-sm text-muted-foreground">
              Delivery{" "}
              <code className="rounded bg-surface-secondary px-1 font-mono text-xs">{manualDeliveryId.slice(0, 8)}</code>
              on {manualPo}
              <Link href={`/receive/${manualDeliveryId}`} className="text-accent underline underline-offset-2">
                worker view
              </Link>
              <Link href="/dashboard" className="text-accent underline underline-offset-2">
                dashboard
              </Link>
            </div>

            <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
              <input
                className={`col-span-2 ${inputClass}`}
                placeholder="Material"
                value={material}
                onChange={(e) => setMaterial(e.target.value)}
              />
              <input
                className={inputClass}
                placeholder="Qty"
                type="number"
                value={quantity}
                onChange={(e) => setQuantity(e.target.value)}
              />
              <select className={inputClass} value={unit} onChange={(e) => setUnit(e.target.value)}>
                <option>EA</option>
                <option>CTN</option>
                <option>PC</option>
                <option>PKG</option>
                <option>PAL</option>
              </select>
            </div>
            <button onClick={fireLogLine} disabled={manualBusy || !material || !quantity} className={ghostButtonClass}>
              Log line
            </button>

            <div className="flex gap-2">
              <input
                className={`flex-1 ${inputClass}`}
                placeholder="Damage description"
                value={damageDescription}
                onChange={(e) => setDamageDescription(e.target.value)}
              />
              <button
                onClick={fireReportDamage}
                disabled={manualBusy || !material || !damageDescription}
                className={ghostButtonClass}
              >
                Report damage
              </button>
            </div>

            <button onClick={fireUploadPhoto} disabled={manualBusy || !lastDiscrepancyId} className={ghostButtonClass}>
              Upload sample photo for last discrepancy
            </button>

            {manualLog.length > 0 && (
              <div className="rounded-lg border border-border bg-surface-secondary p-3">
                <LogList entries={manualLog} />
              </div>
            )}
          </>
        )}
      </section>
    </main>
  );
}
