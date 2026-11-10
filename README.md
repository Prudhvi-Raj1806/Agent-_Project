# RAJ (codename JARVIS, `jarvis-ui`)

Raj's personal AI operating system — the personal intelligence, orchestration,
and authority layer. Owns identity, mission state, and approval policy;
delegates execution to Hermes Agent and fast classification to Laya. Never
reimplements an agent loop, a model router, or a tool protocol — see
`docs/ARCHITECTURE.md` ("JARVIS Architecture v2") for the full rationale and
the adapter-pattern design this follows. `CLAUDE.md` points any Claude Code
session at that doc first.

## Status

Active build, Next.js/TypeScript. A separate from-scratch Python rebuild
(`Rex`) was tried and abandoned on 2026-10-18 in favor of reworking this
codebase in place against the real, verified Hermes Agent API.

## Where things live

- `src/server/missions/` — the Mission Store (SQLite), state machine, security
  policy gate, audit log, event bus, and the orchestrator that drives a
  mission end to end: `Mission -> Laya (classify) -> OmniRouter (model
  selection) -> Hermes (execute) -> Verification -> completion`.
- `src/server/hermes/` — `RuntimeAdapter`-shaped boundary (architecture doc
  §15). `agent-adapter.ts` is the one real adapter, targeting Hermes Agent's
  actual `api_server` platform (`/v1/runs`, `/v1/runs/{id}/events` SSE,
  `/v1/runs/{id}/approval`, `/v1/runs/{id}/stop`). `mock-adapter.ts` is the
  local-dev fallback when no Hermes instance is configured. There is no third,
  invented-contract path anymore — it was deleted 2026-10-18 for being
  unimplemented by anything and confusable with the real adapter.
- `src/server/laya/` — `DecisionModelAdapter` (architecture doc §17):
  `classify`/`health`, targeting a self-hosted Laya deployment. Falls back to
  a conservative default when unavailable rather than blocking a mission.
- `src/server/omnirouter/` — JARVIS's own routing-policy layer (architecture
  doc §7's division of labor: this decides *which* configured provider/model
  to use, including a real local OmniRoute gateway as one of several
  entries; it is not a reimplementation of OmniRoute's own transport).
- `src/server/security/` — the global approval policy (§11): a deny-list of
  tool-name substrings that always need a human, sitting above whatever
  approval mechanism the active runtime has of its own.

## Known limitation, baked into the adapter on purpose

Hermes's cross-run session continuity is unconfirmed (architecture doc §18) —
`agent-adapter.ts` sends a `session_id` on submit defensively, but
`orchestrator.ts` also folds the mission's own prior-progress context into
every resumed run's prompt text, and does not rely on `session_id` alone
until that's verified against a live Hermes instance.

## Setup

```bash
npm install
cp .env.example .env.local   # point HERMES_AGENT_URL/HERMES_AGENT_API_KEY, LAYA_BASE_URL at real instances
npm run test                 # vitest — passes fully against mocks/fixtures with nothing configured
npm run dev
```

Without a real Hermes Agent or Laya instance running, the app still works
end to end against the mock Hermes adapter (output clearly labeled
`source: "mock"`) and Laya's conservative fallback.

## Not here yet (by design, not oversight)

OpenClaw adapter, voice, and anything beyond the current MVP slice — per the
architecture doc's build order (§14), these come after the current loop is
proven against a real Hermes instance, not before.
