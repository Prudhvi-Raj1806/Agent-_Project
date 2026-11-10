"use client";

import { ShieldAlert } from "lucide-react";
import { formatApprovalInput, riskLabel } from "@/lib/jarvis/approval";
import type { PendingToolApproval } from "@/server/missions/types";
import { cn } from "@/lib/utils";

const riskTone: Record<PendingToolApproval["risk"], string> = {
  low: "text-status-success",
  medium: "text-status-warning",
  high: "text-status-error",
  critical: "text-status-error",
};

/**
 * The owner's ALLOW/DENY prompt for a tool call Hermes has paused on. Shows
 * exactly what the policy reported — tool, risk, reason, and the command or
 * input — and nothing Jarvis inferred on its own.
 */
export function HudApproval({
  approval,
  busy,
  onDecide,
}: {
  approval: PendingToolApproval;
  busy: boolean;
  onDecide: (approved: boolean) => void;
}) {
  const input = formatApprovalInput(approval.input);
  return (
    <div
      role="alertdialog"
      aria-label={`Approval needed for ${approval.toolName}`}
      className="w-full border border-status-warning/50 bg-glass px-3.5 py-3 backdrop-blur-sm"
    >
      <div className="flex items-center gap-2 font-mono text-[10px] uppercase tracking-[0.22em]">
        <ShieldAlert className="size-3.5 text-status-warning" />
        <span className="text-status-warning">Approval needed</span>
        <span className="text-text-dim">/</span>
        <span className="text-foreground">{approval.toolName}</span>
        <span className={cn("ml-auto", riskTone[approval.risk])}>{riskLabel[approval.risk]}</span>
      </div>
      <p className="mt-2 text-xs leading-snug text-muted-foreground">{approval.reason}</p>
      {input && (
        <pre className="mt-2 max-h-20 overflow-auto whitespace-pre-wrap break-all border border-border bg-surface-1 px-2 py-1.5 font-mono text-[11px] text-foreground">
          {input}
        </pre>
      )}
      <div className="mt-3 flex items-center justify-end gap-2">
        <button
          type="button"
          onClick={() => onDecide(false)}
          disabled={busy}
          className="border border-border px-3 py-1 font-mono text-[11px] uppercase tracking-wider text-muted-foreground transition-colors hover:bg-surface-3 disabled:opacity-40"
        >
          Deny
        </button>
        <button
          type="button"
          onClick={() => onDecide(true)}
          disabled={busy}
          className="border border-accent-cyan/50 px-3 py-1 font-mono text-[11px] uppercase tracking-wider text-accent-cyan transition-colors hover:bg-accent-cyan/10 disabled:opacity-40"
        >
          Allow once
        </button>
      </div>
    </div>
  );
}
