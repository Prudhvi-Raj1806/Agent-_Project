import type { ProviderSeed } from "./types";

/**
 * Placeholder infrastructure configuration. This stands in for a future
 * account-management surface (a settings UI backed by its own table) — for
 * now it's the fixed catalog OmniRouter seeds into the database on first
 * run. A provider only reports "online" if its env var is actually set; we
 * never fabricate a healthy provider.
 */
export const PROVIDER_SEED: ProviderSeed[] = [
  {
    id: "anthropic",
    name: "Anthropic",
    apiKeyEnvVar: "ANTHROPIC_API_KEY",
    accounts: [
      { id: "anthropic-personal", label: "Personal" },
      { id: "anthropic-development", label: "Development" },
    ],
    models: [
      {
        id: "claude-opus",
        name: "Claude Opus",
        capabilities: ["long-context", "coding", "reasoning"],
        contextWindow: 200_000,
      },
      {
        id: "claude-sonnet",
        name: "Claude Sonnet",
        capabilities: ["long-context", "coding", "reasoning", "fast"],
        contextWindow: 200_000,
      },
      { id: "claude-haiku", name: "Claude Haiku", capabilities: ["fast"], contextWindow: 200_000 },
    ],
  },
  {
    id: "openai",
    name: "OpenAI",
    apiKeyEnvVar: "OPENAI_API_KEY",
    accounts: [{ id: "openai-primary", label: "Primary" }],
    models: [
      { id: "gpt-5", name: "GPT-5", capabilities: ["long-context", "coding", "reasoning"], contextWindow: 400_000 },
      { id: "gpt-5-mini", name: "GPT-5 mini", capabilities: ["fast"], contextWindow: 400_000 },
    ],
  },
  {
    id: "deepseek",
    name: "DeepSeek",
    apiKeyEnvVar: "DEEPSEEK_API_KEY",
    accounts: [{ id: "deepseek-primary", label: "Primary" }],
    models: [
      { id: "deepseek-v3", name: "DeepSeek V3", capabilities: ["coding", "fast"], contextWindow: 128_000 },
    ],
  },
  {
    // A real, locally-running OmniRoute gateway (github.com/diegosouzapw/OmniRoute),
    // not a cloud provider — "online" reflects that OMNIROUTE_API_KEY has been set
    // to authenticate against it, same presence-only convention as the rest of this
    // seed. The model catalog is a single catch-all: OmniRoute itself decides which
    // of its many configured upstream providers actually serves a given request, so
    // JARVIS has no fixed model list to enumerate here — see omnirouter/router.ts.
    id: "omniroute",
    name: "OmniRoute",
    apiKeyEnvVar: "OMNIROUTE_API_KEY",
    accounts: [{ id: "omniroute-local", label: "Local Gateway" }],
    models: [
      {
        id: "omniroute-auto",
        name: "OmniRoute (auto-routed)",
        capabilities: ["long-context", "coding", "reasoning", "fast"],
        contextWindow: 200_000,
      },
    ],
  },
];
