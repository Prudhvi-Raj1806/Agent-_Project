"use client";

import {
  BookOpen,
  Camera,
  CheckCircle2,
  ClipboardList,
  Code2,
  Loader2,
  MonitorCog,
  NotebookPen,
  XCircle,
  Zap,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { Panel, PanelBody, PanelHeader } from "@/components/primitives/panel";
import { VoiceVerifyDialog } from "@/components/primitives/voice-verify-dialog";
import type { QuickAction } from "@/lib/data/types";
import { useRunAction } from "@/lib/actions/use-run-action";
import { cn } from "@/lib/utils";

const iconMap: Record<string, LucideIcon> = {
  Code2,
  NotebookPen,
  Camera,
  BookOpen,
  ClipboardList,
  MonitorCog,
};

export function QuickActionsPanel({
  actions,
  className,
}: {
  actions: QuickAction[];
  className?: string;
}) {
  const { pendingId, feedback, verifyingAction, trigger, handleVerified, closeVerify } = useRunAction();

  return (
    <Panel className={className}>
      <PanelHeader
        icon={
          <span className="flex size-4 shrink-0 items-center justify-center rounded-full bg-accent-cyan text-background">
            <Zap className="size-2.5" strokeWidth={2.5} fill="currentColor" />
          </span>
        }
        title="Quick Actions"
      />
      <PanelBody className="no-scrollbar flex flex-col overflow-y-auto pt-2.5">
        <div className="grid grid-cols-2 content-start gap-2">
          {actions.map((action) => {
            const Icon = iconMap[action.icon];
            const isPending = pendingId === action.id;
            return (
              <button
                key={action.id}
                type="button"
                disabled={isPending}
                onClick={() => trigger(action.id, action.label)}
                className="flex items-center gap-2 rounded-md border border-border px-2.5 py-1.5 text-left text-xs text-foreground transition-colors hover:border-border-strong hover:bg-surface-2 disabled:opacity-60"
              >
                {isPending ? (
                  <Loader2 className="size-3.5 shrink-0 animate-spin text-muted-foreground" />
                ) : (
                  Icon && <Icon className="size-3.5 shrink-0 text-muted-foreground" strokeWidth={1.75} />
                )}
                <span className="leading-tight">{action.label}</span>
              </button>
            );
          })}
        </div>

        {feedback && (
          <p
            className={cn(
              "mt-2 flex items-start gap-1.5 text-[11px] leading-snug",
              feedback.ok ? "text-status-success" : "text-status-error"
            )}
          >
            {feedback.ok ? (
              <CheckCircle2 className="mt-0.5 size-3 shrink-0" />
            ) : (
              <XCircle className="mt-0.5 size-3 shrink-0" />
            )}
            <span>
              {feedback.message}
              {feedback.detail && <span className="block text-text-dim">{feedback.detail.slice(0, 140)}</span>}
            </span>
          </p>
        )}
      </PanelBody>

      <VoiceVerifyDialog
        open={verifyingAction !== null}
        actionLabel={verifyingAction?.label ?? ""}
        onClose={closeVerify}
        onVerified={handleVerified}
      />
    </Panel>
  );
}
