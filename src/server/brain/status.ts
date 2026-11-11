import { defaultBrainDeps } from "./defaults";
import { lastAnswerMs, type BrainDeps } from "./index";
import { sameModel } from "./ollama";

export interface BrainStatus {
  enabled: boolean;
  /** The chosen model, as set in Settings. */
  model: string;
  ollamaRunning: boolean;
  modelInstalled: boolean;
  modelLoaded: boolean;
  /** Every model Ollama has, for the picker. */
  installed: string[];
  /** "soul" when chat uses Hermes's personality, "starter" when that is too long or missing. */
  persona: "soul" | "starter";
  lastAnswerMs: number | null;
}

export async function getBrainStatus(deps: BrainDeps = defaultBrainDeps()): Promise<BrainStatus> {
  const { enabled, model } = deps.settings();
  const [server, persona] = await Promise.all([deps.client.status(), deps.persona()]);
  const has = (names: string[]) => names.some((name) => sameModel(name, model));
  return {
    enabled,
    model,
    ollamaRunning: server.running,
    modelInstalled: has(server.installed),
    modelLoaded: has(server.loaded),
    installed: server.installed,
    persona: persona.source,
    lastAnswerMs: lastAnswerMs(),
  };
}

/**
 * Loads the model so the first real request doesn't pay the cold start. Only
 * ever a one-token call to a server that is already running: opening a page
 * must never start a service.
 */
export async function warmBrain(deps: BrainDeps = defaultBrainDeps()): Promise<BrainStatus> {
  const status = await getBrainStatus(deps);
  if (!status.enabled || !status.ollamaRunning || !status.modelInstalled || status.modelLoaded) return status;
  await deps.client
    .chat({ model: status.model, messages: [{ role: "user", content: "hi" }], maxTokens: 1, timeoutMs: 60_000 })
    .catch(() => {});
  return getBrainStatus(deps);
}
