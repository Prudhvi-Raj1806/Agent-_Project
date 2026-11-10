import { HermesAgentAdapter } from "./agent-adapter";
import { HermesMockAdapter } from "./mock-adapter";
import type { HermesAdapter } from "./types";

/**
 * The only place that decides mock vs. real. `HERMES_AGENT_URL` +
 * `HERMES_AGENT_API_KEY` point at a real Hermes Agent's `api_server`
 * platform (see agent-adapter.ts); unset, JARVIS falls back to the mock.
 *
 * Until 2026-10-19 this also had a second "real" branch (`HERMES_API_URL`)
 * targeting a bespoke wire contract JARVIS invented for a Hermes that never
 * existed (contract.ts/http-adapter.ts/retry.ts) — deleted per
 * docs/ARCHITECTURE.md §20. agent-adapter.ts + mock-adapter.ts are the only
 * two HermesAdapter implementations now.
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
