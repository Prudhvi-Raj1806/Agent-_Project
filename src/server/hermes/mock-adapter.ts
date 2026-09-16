import { logger } from "@/server/logging/logger";
import type { HermesHealth } from "./contract";
import type { HermesAdapter, HermesExecuteCallbacks, HermesExecuteInput, HermesResult } from "./types";

function sleep(ms: number, signal: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    if (signal.aborted) {
      reject(new DOMException("Aborted", "AbortError"));
      return;
    }
    const timer = setTimeout(resolve, ms);
    signal.addEventListener(
      "abort",
      () => {
        clearTimeout(timer);
        reject(new DOMException("Aborted", "AbortError"));
      },
      { once: true }
    );
  });
}

const STEPS = ["Gathering context for the objective", "Working the objective", "Synthesizing output"];
const STEP_DELAY_MS = 500;

/**
 * Simulates Hermes execution locally — no real agent runtime is involved.
 * Every result is labeled `source: "mock"` and says so in its own output,
 * so a mission can never be mistaken for genuinely-verified autonomous
 * work. Swap in a real adapter (http-adapter.ts) once Hermes is reachable.
 */
export class HermesMockAdapter implements HermesAdapter {
  readonly mode = "mock" as const;

  async checkHealth(): Promise<HermesHealth> {
    return { healthy: true, version: "mock", latencyMs: 0 };
  }

  async execute(input: HermesExecuteInput, callbacks: HermesExecuteCallbacks): Promise<HermesResult> {
    const startPercent = input.fromPercent ?? 0;
    const span = 100 - startPercent;

    for (let i = 0; i < STEPS.length; i++) {
      if (callbacks.signal.aborted) throw new DOMException("Aborted", "AbortError");
      await sleep(STEP_DELAY_MS, callbacks.signal);
      const percent = Math.round(startPercent + (span * (i + 1)) / STEPS.length);
      callbacks.onProgress(percent, STEPS[i]);
    }

    logger.info("hermes.mock.execute", { missionId: input.missionId, model: input.routing.modelName });

    return {
      success: true,
      summary: `Mock Hermes completed: ${input.objective}`,
      output:
        `[MOCK HERMES — no real agent runtime connected]\n\n` +
        `Objective: ${input.objective}\n` +
        `Model routed: ${input.routing.modelName} (${input.routing.providerName})\n\n` +
        `This is a simulated result for local development. Connect a real Hermes runtime via ` +
        `HERMES_API_URL to replace this output with genuine agent execution.`,
      source: "mock",
    };
  }
}
