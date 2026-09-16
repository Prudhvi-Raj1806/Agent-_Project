"use client";

import { ChevronDown, Code2, Globe, Layers, Loader2, NotebookPen, Search, Target } from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { VoiceVerifyDialog } from "@/components/primitives/voice-verify-dialog";
import type { QuickAction } from "@/lib/data/types";
import { useRunAction } from "@/lib/actions/use-run-action";
import { cn } from "@/lib/utils";

const iconMap: Record<string, LucideIcon> = {
  Code2,
  NotebookPen,
  Layers,
  Globe,
  Target,
  Search,
};

export function TopActions({
  actions,
  moreActions,
}: {
  actions: QuickAction[];
  moreActions?: QuickAction[];
}) {
  const { pendingId, feedback, verifyingAction, trigger, handleVerified, closeVerify } = useRunAction();

  return (
    <div className="flex flex-col gap-1.5">
      <div className="flex flex-wrap gap-2">
        {actions.map((action) => {
          const Icon = iconMap[action.icon];
          const isPending = pendingId === action.id;
          return (
            <Button
              key={action.id}
              variant="outline"
              size="lg"
              className="bg-surface-1"
              disabled={isPending}
              onClick={() => trigger(action.id, action.label)}
            >
              {isPending ? (
                <Loader2 className="animate-spin text-muted-foreground" strokeWidth={1.75} />
              ) : (
                Icon && <Icon className="text-muted-foreground" strokeWidth={1.75} />
              )}
              {action.label}
            </Button>
          );
        })}

        {moreActions && moreActions.length > 0 && (
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="outline" size="lg" className="bg-surface-1">
                More
                <ChevronDown className="text-muted-foreground" strokeWidth={1.75} />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent className="w-48">
              {moreActions.map((action) => (
                <DropdownMenuItem key={action.id} onSelect={() => trigger(action.id, action.label)}>
                  {action.label}
                </DropdownMenuItem>
              ))}
            </DropdownMenuContent>
          </DropdownMenu>
        )}
      </div>

      {feedback && (
        <p className={cn("text-xs", feedback.ok ? "text-status-success" : "text-status-error")}>
          {feedback.message}
        </p>
      )}

      <VoiceVerifyDialog
        open={verifyingAction !== null}
        actionLabel={verifyingAction?.label ?? ""}
        onClose={closeVerify}
        onVerified={handleVerified}
      />
    </div>
  );
}
