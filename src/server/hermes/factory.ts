import { HermesAgentAdapter } from "./agent-adapter";
import { HermesHttpAdapter } from "./http-adapter";
import { HermesMockAdapter } from "./mock-adapter";
import type { HermesAdapter } from "./types";

/**
 * The only place that decides mock vs. real, and — among "real" — which real
 * backend. `HERMES_AGENT_URL`/`HERMES_AGENT_API_KEY` point at a real Hermes
 * Agent's `api_server` platform (see agent-adapter.ts) and take priority;
 * `HERMES_API_URL` alone targets a runtime implementing JARVIS's own bespoke
 * contract (contract.ts) instead. Everything else just calls the interface.
 */
export function getHermesAdapter(): HermesAdapter {
  const agentUrl = process.env.HERMES_AGENT_URL;
  const agentApiKey = process.env.HERMES_AGENT_API_KEY;
  if (agentUrl && agentApiKey) return new HermesAgentAdapter(agentUrl, agentApiKey);

  const baseUrl = process.env.HERMES_API_URL;
  return baseUrl ? new HermesHttpAdapter(baseUrl) : new HermesMockAdapter();
}

export type { HermesAdapter, HermesExecuteCallbacks, HermesExecuteInput, HermesResult } from "./types";

/** Boolean presence check only, for the Settings page — never reads the key values. */
export function getHermesConnectionInfo(): { mode: "agent" | "http" | "mock" } {
  if (process.env.HERMES_AGENT_URL && process.env.HERMES_AGENT_API_KEY) return { mode: "agent" };
  if (process.env.HERMES_API_URL) return { mode: "http" };
  return { mode: "mock" };
}
