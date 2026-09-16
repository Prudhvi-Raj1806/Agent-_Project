"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";

export interface ActionRunFeedback {
  actionId: string;
  ok: boolean;
  message: string;
  detail?: string;
}

// Mirrors src/server/actions/registry.ts's risk assignments — the client
// only needs to know WHICH actions to gate, not the run handlers themselves.
const RISKY_ACTION_IDS = new Set(["control-computer"]);

const FEEDBACK_TTL_MS = 5_000;

/**
 * Actions that are pure client-side navigation/UI, not a server-executed
 * OS action — kept out of the actions registry since there's nothing for a
 * server to run. `router` is threaded in since these need Next's router.
 */
function clientOnlyHandlers(router: ReturnType<typeof useRouter>): Record<string, () => void> {
  return {
    "start-work-mode": () => router.push("/work"),
    "start-deep-work": () => router.push("/focus"),
    "start-research": () => window.dispatchEvent(new CustomEvent("jarvis:focus-command-bar")),
    "open-browser": () => window.open("about:blank", "_blank", "noopener,noreferrer"),
  };
}

export function useRunAction() {
  const router = useRouter();
  const [pendingId, setPendingId] = useState<string | null>(null);
  const [feedback, setFeedback] = useState<ActionRunFeedback | null>(null);
  const [verifyingAction, setVerifyingAction] = useState<{ id: string; label: string } | null>(null);
  const feedbackTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    return () => {
      if (feedbackTimer.current) clearTimeout(feedbackTimer.current);
    };
  }, []);

  const showFeedback = useCallback((next: ActionRunFeedback) => {
    setFeedback(next);
    if (feedbackTimer.current) clearTimeout(feedbackTimer.current);
    feedbackTimer.current = setTimeout(() => setFeedback(null), FEEDBACK_TTL_MS);
  }, []);

  const runAction = useCallback(
    async (id: string, token?: string) => {
      setPendingId(id);
      try {
        const res = await fetch(`/api/actions/${id}/run`, {
          method: "POST",
          headers: token ? { "x-verify-token": token } : undefined,
        });
        const data = await res.json();
        showFeedback({ actionId: id, ok: Boolean(data.ok), message: data.message, detail: data.detail });
      } catch {
        showFeedback({ actionId: id, ok: false, message: "Couldn't reach JARVIS." });
      } finally {
        setPendingId(null);
      }
    },
    [showFeedback]
  );

  const trigger = useCallback(
    (id: string, label: string) => {
      const clientHandler = clientOnlyHandlers(router)[id];
      if (clientHandler) {
        clientHandler();
        return;
      }
      if (RISKY_ACTION_IDS.has(id)) {
        setVerifyingAction({ id, label });
        return;
      }
      void runAction(id);
    },
    [runAction, router]
  );

  const handleVerified = useCallback(
    (token: string) => {
      if (!verifyingAction) return;
      const { id } = verifyingAction;
      setVerifyingAction(null);
      void runAction(id, token);
    },
    [verifyingAction, runAction]
  );

  return {
    pendingId,
    feedback,
    verifyingAction,
    trigger,
    handleVerified,
    closeVerify: () => setVerifyingAction(null),
  };
}
