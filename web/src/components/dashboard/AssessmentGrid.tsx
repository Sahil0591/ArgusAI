"use client";

import { AnimatePresence, motion } from "framer-motion";
import clsx from "clsx";
import type { AssessmentFeedItem } from "@/lib/types";

const DECISION_STYLES: Record<string, string> = {
  auto_accept: "border-success-border bg-success-bg",
  auto_accept_with_claim: "border-success-border bg-success-bg",
  escalate: "border-danger-border bg-danger-bg",
};

export function AssessmentGrid({ items }: { items: AssessmentFeedItem[] }) {
  if (items.length === 0) return null;

  return (
    <div className="overflow-hidden rounded-lg border border-border bg-surface">
      <div className="border-b border-border bg-surface-secondary px-4 py-2 text-sm font-medium text-muted-foreground">
        Discrepancies &mdash; resolving in parallel
      </div>
      <div className="grid grid-cols-2 gap-3 p-4 sm:grid-cols-3">
        <AnimatePresence>
          {items.map((item) => (
            <motion.div
              key={item.discrepancy_id}
              layout
              initial={{ opacity: 0, scale: 0.9 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.2, ease: "easeOut" }}
              className={clsx(
                "rounded-lg border p-3 text-sm transition-colors",
                item.status === "assessing"
                  ? "border-border bg-surface-secondary"
                  : (item.decision && DECISION_STYLES[item.decision.decision]) || "border-border bg-surface-secondary"
              )}
            >
              <div className="truncate font-medium text-foreground">{item.material_description}</div>
              {item.status === "assessing" ? (
                <div className="mt-2 flex items-center gap-1.5 text-xs text-muted-foreground">
                  <motion.span
                    className="h-1.5 w-1.5 rounded-full bg-muted-foreground"
                    animate={{ opacity: [0.3, 1, 0.3] }}
                    transition={{ duration: 1.2, repeat: Infinity }}
                  />
                  Assessing…
                </div>
              ) : (
                <div className="mt-2 text-xs text-foreground/80">
                  {item.assessment && (
                    <div className="mb-1 font-medium capitalize">
                      {item.assessment.severity} &middot; {(item.assessment.confidence * 100).toFixed(0)}%
                    </div>
                  )}
                  {item.decision?.decision.replace(/_/g, " ")}
                </div>
              )}
            </motion.div>
          ))}
        </AnimatePresence>
      </div>
    </div>
  );
}
