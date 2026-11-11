# Veda (codename JARVIS, `jarvis-ui`)

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

## Phone access

The dashboard works from a phone over [Tailscale](https://tailscale.com), never over the open network.

1. **Start the server from a normal terminal** (not from inside another app's sandbox) with `npm run dev` or `npm start`. Both bind to `127.0.0.1`, so nothing else on your Wi-Fi can reach it. Settings → Phone and remote access warns if the server is reachable on a network address.
2. **Once, in the [Tailscale admin console](https://login.tailscale.com/admin/dns):** turn on MagicDNS and HTTPS certificates for your tailnet.
3. **In Settings → Phone and remote access on the PC:** press **Enable phone access** (this runs `tailscale serve` for you), then switch **Allow the phone to connect** on. The panel shows the address and a QR code.
4. **On the phone**, signed into the same Tailscale account, scan the QR code or open the address.

Turning the switch off, or pressing Disable, cuts the phone off at once. Changes made from the phone are recorded in the audit log.

## Name and personality

Both names are changed in **Settings → Name and personality**: what the assistant is called (default "Veda") and what it calls you. `JARVIS_OWNER_NAME` in `.env.local` is only the default for your name; a name saved in Settings wins.

The personality is Hermes's own `SOUL.md`, in Hermes's home folder. The panel edits that file directly (up to 4,000 characters), and each save first copies the previous version beside it as `SOUL.md.bak-dashboard-<time>`. Renaming the assistant does not rewrite the personality, so update the name there too.

## Mini brain

A small local model hears every typed or spoken request first. It answers small talk itself, runs a fixed list of local skills (time, schedule, system status, briefing, opening VS Code or Obsidian, notes, screenshot, weather, music), and hands anything else to Hermes, saying "That needs Hermes. Handing it over."

- **Needs:** [Ollama](https://ollama.com) running, with the `phi4-mini` model (`ollama pull phi4-mini`). If Ollama is stopped the dashboard starts it; if the model can't be reached, requests go to Hermes as before.
- **Force a hand-off:** start a request with "Hermes," to skip the mini brain.
- **Settings → Mini brain:** switch it off, pick another installed model, see whether the model is loaded, and run a quick test.
- **Speed:** keep Hermes on a different model. While Hermes is generating on the same local model, the mini brain has to wait its turn.

Every outcome is written to the event log (`brain.routed`, `brain.skill.completed`, `brain.chat.completed`), and so is every failure: `brain.timeout` (with the stage that was too slow: routing, check or chat), `brain.unclear`, `brain.chat.discarded` and `brain.handoff.failed`. A request that leaves no record never reached the server.

Routing is checked against the real model on demand, because it needs Ollama:

```bash
npm run brain:eval
```

It runs about 160 phrases and the chat-honesty check. Routing is not perfect (about 92% on those phrases, lower on new phrasing), which is why requests that start with a do-something verb go to Hermes by rule, every chat pick is confirmed with a second question, and a chat reply that claims an action is discarded and handed to Hermes.
