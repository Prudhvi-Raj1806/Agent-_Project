"use client";

import { useRouter } from "next/navigation";
import { Trash2 } from "lucide-react";
import { ConfirmDialog } from "@/components/primitives/confirm-dialog";
import { useConfirm } from "@/lib/use-confirm";

export function DeleteEventButton({ id, title }: { id: string; title: string }) {
  const router = useRouter();
  const { confirm, dialogProps } = useConfirm();

  async function remove() {
    await fetch(`/api/schedule/${id}`, { method: "DELETE" });
    router.refresh();
  }

  return (
    <>
      <button
        type="button"
        onClick={() =>
          confirm({
            title: "Delete this event?",
            description: `"${title}" will be removed from your schedule.`,
            confirmLabel: "Delete",
            onConfirm: remove,
          })
        }
        aria-label="Delete event"
        className="flex size-6 shrink-0 items-center justify-center rounded-md text-muted-foreground opacity-0 transition-opacity hover:bg-surface-2 hover:text-status-error group-hover:opacity-100"
      >
        <Trash2 className="size-3.5" />
      </button>
      <ConfirmDialog {...dialogProps} />
    </>
  );
}
