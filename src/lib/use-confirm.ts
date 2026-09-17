"use client";

import { useCallback, useState } from "react";
import type { ConfirmDialogProps } from "@/components/primitives/confirm-dialog";

interface ConfirmRequest {
  title: string;
  description: string;
  confirmLabel?: string;
  destructive?: boolean;
  onConfirm: () => Promise<void> | void;
}

/** Pairs with <ConfirmDialog {...dialogProps} />: call confirm({...}) instead of running a destructive action directly. */
export function useConfirm() {
  const [pending, setPending] = useState(false);
  const [request, setRequest] = useState<ConfirmRequest | null>(null);

  const confirm = useCallback((next: ConfirmRequest) => setRequest(next), []);
  const cancel = useCallback(() => setRequest(null), []);

  const handleConfirm = useCallback(async () => {
    if (!request) return;
    setPending(true);
    try {
      await request.onConfirm();
    } finally {
      setPending(false);
      setRequest(null);
    }
  }, [request]);

  const dialogProps: ConfirmDialogProps = {
    open: request !== null,
    title: request?.title ?? "",
    description: request?.description ?? "",
    confirmLabel: request?.confirmLabel,
    destructive: request?.destructive,
    pending,
    onConfirm: handleConfirm,
    onCancel: cancel,
  };

  return { confirm, dialogProps };
}
