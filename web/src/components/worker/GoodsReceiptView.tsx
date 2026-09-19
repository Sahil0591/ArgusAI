import clsx from "clsx";
import type { GoodsReceiptDocument, QualityNotification } from "@/lib/types";

const DECISION_BADGE: Record<string, string> = {
  auto_accept: "bg-success-bg text-success border-success-border",
  auto_accept_with_claim: "bg-success-bg text-success border-success-border",
  accepted: "bg-success-bg text-success border-success-border",
  escalate: "bg-danger-bg text-danger border-danger-border",
  rejected: "bg-danger-bg text-danger border-danger-border",
};

export function GoodsReceiptView({
  goodsReceipt,
  qualityNotifications,
}: {
  goodsReceipt: GoodsReceiptDocument;
  qualityNotifications: QualityNotification[];
}) {
  return (
    <div className="flex flex-col gap-6">
      <div>
        <h2 className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
          Goods Receipt &middot; Movement Type 101
        </h2>
        <div className="overflow-hidden rounded-lg border border-border bg-surface">
          <div className="border-b border-border bg-surface-secondary px-4 py-2 font-mono text-xs text-muted-foreground">
            Document date {goodsReceipt.BLDAT} &middot; Posting date {goodsReceipt.BUDAT}
          </div>
          <table className="w-full text-left text-sm">
            <thead>
              <tr className="border-b border-border text-xs uppercase tracking-wide text-muted-foreground">
                <th className="px-4 py-2 font-medium">Material</th>
                <th className="px-4 py-2 font-medium">PO / Item</th>
                <th className="px-4 py-2 text-right font-medium">Qty</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {goodsReceipt.lines.map((line) => (
                <tr key={`${line.EBELN}-${line.EBELP}`}>
                  <td className="px-4 py-2">
                    <div className="text-foreground">{line.MAKTX}</div>
                    <div className="font-mono text-xs text-muted-foreground">{line.MATNR}</div>
                  </td>
                  <td className="px-4 py-2 font-mono text-muted-foreground">
                    {line.EBELN} / {line.EBELP}
                  </td>
                  <td className="px-4 py-2 text-right font-mono tabular-nums text-foreground">
                    {line.MENGE} {line.MEINS}
                  </td>
                </tr>
              ))}
              {goodsReceipt.lines.length === 0 && (
                <tr>
                  <td colSpan={3} className="px-4 py-3 text-muted-foreground">
                    No lines received.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {qualityNotifications.length > 0 && (
        <div>
          <h2 className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            Quality Notifications ({qualityNotifications.length})
          </h2>
          <div className="flex flex-col gap-3">
            {qualityNotifications.map((qn, i) => (
              <div key={i} className="rounded-lg border border-border bg-surface p-4">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <div className="font-mono font-medium text-foreground">{qn.MATNR}</div>
                    <div className="text-sm text-muted-foreground">{qn.description}</div>
                  </div>
                  <span
                    className={clsx(
                      "shrink-0 rounded-full border px-2 py-0.5 text-xs font-medium",
                      DECISION_BADGE[qn.decision] ?? "border-border bg-surface-secondary text-muted-foreground"
                    )}
                  >
                    {qn.decision.replace(/_/g, " ")}
                  </span>
                </div>
                {qn.damage_assessment && (
                  <p className="mt-2 text-sm text-foreground/80">{qn.damage_assessment.claim_sentence}</p>
                )}
                <div className="mt-2 text-xs text-muted-foreground">Vendor: {qn.vendor}</div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
