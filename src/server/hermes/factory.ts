import { HermesAgentAdapter } from "./agent-adapter";
import { HermesMockAdapter } from "./mock-adapter";
import type { HermesAdapter } from "./types";

/**
 * The only place that decides mock vs. real. `HERMES_AGENT_URL`/
 * `HERMES_AGENT_API_KEY` point at a real Hermes Agent's `api_server`
 * platform (see agent-adapter.ts); everything else just calls the
 * interface. The earlier third option — a runtime implementing JARVIS's
 * own invented Hermes contract — is gone: nothing ever implemented it,
 * and keeping it around was confusable with the real adapter above.
 */
export function getHermesAdapter(): HermesAdapter {
  const agentUrl = process.env.HERMES_AGENT_URL;
  const agentApiKey = process.env.HERMES_AGENT_API_KEY;
  if (agentUrl && agentApiKey) return new HermesAgentAdapter(agentUrl, agentApiKey);

  return new HermesMockAdapter();
}

export type { HermesAdapter, HermesExecuteCallbacks, HermesExecuteInput, HermesResult } from "./types";

/** Boolean presence check only, for the Settings page — never reads the key values. */
export function getHermesConnectionInfo(): { mode: "agent" | "mock" } {
  if (process.env.HERMES_AGENT_URL && process.env.HERMES_AGENT_API_KEY) return { mode: "agent" };
  return { mode: "mock" };
}
