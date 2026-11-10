# JARVIS Architecture v2

Sep 26, 2026

## 0. Vision & Method

**Scope note:** this is a standalone document for JARVIS, Raj's personal AI operating system. It is not a Kaizen artifact and does not carry forward the prior `docs/JARVIS_ARCHITECTURE.md` / `JARVIS_REARCHITECTURE_RESEARCH.md` / `JARVIS_CURRENT_STAGE.md` set — those are treated as scrapped. Nothing here assumes their conclusions; anything they got right is re-derived independently below, and where this document disagrees with them, this document wins.

**Vision (unchanged from the brief):** JARVIS should understand Raj and his preferences, maintain persistent memory, understand ongoing projects and goals, accept natural-language requests, execute real work, use computers/browsers/files/APIs/applications, delegate difficult work to specialized agents, operate asynchronously, react to events, schedule recurring work, communicate through multiple channels, verify important results, ask for approval when required, learn reusable workflows, maintain context across sessions, work locally and remotely, use the best available model per task, expose what it's doing through a useful interface, and remain under Raj's control.

**Governing principle, tested rather than assumed:** *JARVIS is the personal intelligence, memory, and authority layer that decides what needs to happen and who should do it — not another agent runtime, browser, protocol implementation, model router, or messaging gateway.* This document exists to check that principle against verified current capability (Sept 2026), not to defend it.

**Method:** every claim about an external system below is checked against a primary source — official docs, official GitHub repos/source files, or direct API/behavior documentation — not blog summaries. Where only secondary sources exist, the claim is marked UNKNOWN rather than assumed true. Stale-knowledge risk is explicit: anything that could have shipped or changed after Jan 2026 training cutoff was re-verified via search/fetch this session, dated Sept 26, 2026.

## 1. Capability Matrix

Classification key: **REAL** (verified in primary sources) · **PARTIAL** (exists but limited/indirect) · **THIRD-PARTY** (available only via an ecosystem plugin/skill, not core) · **NOT AVAILABLE** · **UNKNOWN** (no primary source found either way).

| Capability | Hermes Agent | OpenClaw | Grok Bot | MCP (protocol) |
| --- | --- | --- | --- | --- |
| Agent loop / planning | REAL | REAL | REAL (opaque, product-internal) | N/A — protocol, not a loop |
| Tool calling | REAL | REAL | REAL | REAL (this is the point of MCP) |
| Terminal | REAL | REAL (per-node, exec-approval gated) | REAL (own cloud computer) | N/A |
| Filesystem | REAL | REAL | REAL | N/A |
| Browser | THIRD-PARTY (via MCP servers, e.g. Playwright) | THIRD-PARTY (via MCP servers/nodes) | REAL, native, strongest of the four | N/A |
| Computer use | PARTIAL (via tool calls, not a dedicated model) | PARTIAL (via nodes) | REAL, native | N/A |
| Web search / extraction | REAL (built-in tool) | THIRD-PARTY (skill) | REAL | N/A |
| Code execution | REAL | REAL | REAL | N/A |
| MCP support | REAL, native client | REAL, native | REAL, but only as a **consumer** of servers you expose — not callable by others | — |
| Skills / reusable workflows | REAL — self-generated after 5+ tool-call tasks, agentskills.io format | REAL — ClawHub registry | UNKNOWN (not documented externally) | N/A |
| Memory (persistent) | REAL — skill library + trajectory export | REAL — MEMORY.md / SOUL.md pattern | UNKNOWN | N/A |
| User profile / context files | PARTIAL (via memory/skills, not a first-class object) | REAL (per-agent workspace + persona) | UNKNOWN | N/A |
| Scheduling / cron | REAL — `POST /api/jobs`, cron-like | REAL | UNKNOWN | N/A |
| Event triggers / webhooks | REAL (gateway) | REAL (gateway) | UNKNOWN | N/A |
| Messaging (WhatsApp/Telegram/Discord/Slack) | REAL — 15+ platforms, one gateway process | REAL — this is OpenClaw's core purpose | NOT AVAILABLE (app-only, no messaging-channel product) | N/A |
| Multi-agent delegation | REAL — HiClaw/K8s, cross-runtime messaging | REAL — bindings route to isolated agents | REAL — Bots delegate to Bots | N/A |
| Approvals | REAL — run-level `waiting_for_approval` status + `/v1/runs/{id}/approval` | REAL — exec-approval levels (deny/allowlist/full) | REAL (asks when needed, opaque mechanism) | N/A (delegated to client/host) |
| Sandboxing | PARTIAL (tool-level, not full agent isolation documented) | REAL (per-node isolation) | REAL (isolated cloud computer per Bot) | N/A |
| Remote / cloud execution | PARTIAL — self-hosted, you provide the box | PARTIAL — self-hosted, you provide the box | REAL — xAI-hosted | N/A |
| Persistent sessions | REAL (Runs API tracks state via `run_id`) | REAL (per-agent session store) | REAL | N/A |
| Background execution | REAL (Jobs API) | REAL | REAL | N/A |
| **Programmatic external control** | **REAL** — OpenAI-compatible `/v1/chat/completions`, `/v1/responses`, `/v1/runs`, `/api/jobs`, bearer-token auth; also ACP over stdio | REAL — Gateway WebSocket RPC | **NOT AVAILABLE** — no documented API/ACP for third-party orchestration | REAL (this is the entire point of the protocol) |
| Model/provider abstraction | NOT AVAILABLE natively (bring your own via `providers.md` config) | NOT AVAILABLE natively | N/A | N/A |
| Local model support | REAL (Ollama and others via provider config; requires ≥64K context) | REAL | N/A | N/A |
| Streaming | REAL (SSE, token-by-token + `hermes.tool.progress` events) | UNKNOWN (likely, undocumented in what was checked) | REAL (product UI) | N/A |
| Observability / execution history | PARTIAL (run status, trajectory export) | PARTIAL | UNKNOWN | N/A |
| Retries / failure recovery | REAL (`Idempotency-Key` header on API) | UNKNOWN | UNKNOWN | N/A |
| Secrets handling | PARTIAL (env-based, `API_SERVER_KEY`) | REAL (`auth-profiles.json` per agent) | REAL (opaque, your own app credentials) | N/A |
| Skill/plugin ecosystem | REAL, young (agentskills.io, 10 releases as of early 2026) | REAL, mature (ClawHub, 200k+ stars) — **also carries real supply-chain risk (ClawHavoc, Jan 2026)** | NOT DOCUMENTED externally | N/A |
| Desktop UI | THIRD-PARTY (community, e.g. "Hermes Agent Desktop") | REAL (web admin dashboard) | REAL (native product) | N/A |
| Mobile access | REAL (Termux on Android per Nous docs) | REAL (via messaging channels) | REAL (iOS app) | N/A |

**The one row that decides the architecture:** Grok Bot's strongest capability (real, native computer use) is exactly the one JARVIS cannot reach, because there is no programmatic control surface. A feature existing in a product is not the same as a feature JARVIS can call.

## 2. What JARVIS Must Own vs. Delegate vs. Integrate

Be ruthless — the brief's own suggested examples are checked, not assumed.

### A. JARVIS MUST OWN

- **Identity** — who Raj is, preferences, standing constraints. No runtime has a first-class concept of this that's portable across runtimes.
- **Global memory policy** — what must survive regardless of which runtime executed a task. Verified gap: Hermes memory is skill/trajectory-shaped (how to do things), OpenClaw memory is per-agent-workspace-shaped (MEMORY.md/SOUL.md); neither is a portable "who is the user" store.
- **Mission state** — goals, status, which runtime handle(s) are working them, spanning sessions and runtimes. Confirmed neither Hermes's Runs API nor OpenClaw's session store models a cross-runtime mission; both are runtime-scoped.
- **Authority / approval policy at the JARVIS level** — both runtimes have their own approval mechanisms (Hermes: `waiting_for_approval` + approval endpoint; OpenClaw: deny/allowlist/full), but neither knows about the other's decisions or a policy that should apply globally (e.g. "never auto-send money regardless of runtime").
- **Cross-runtime task routing** — deciding whether a request goes to Hermes, a channel, gets escalated, or is asked back to Raj.
- **Unified observability** — one mission timeline across runtimes; each runtime's own logs stay local to it.

### B. JARVIS SHOULD DELEGATE

- Agent loop, planning, tool execution → **Hermes**, via its verified `/v1/runs` + `/v1/chat/completions` API (see §4).
- Terminal, filesystem, code execution → Hermes (already sandboxed/approval-gated there).
- Multi-channel messaging transport → **OpenClaw Gateway**, only if phone/WhatsApp access is wanted — not by default.
- Scheduling/cron → Hermes's Jobs API (`/api/jobs`); do not build a second scheduler.
- Tool protocol → **MCP**, spoken natively by Hermes and OpenClaw already.
- Skill library / reusable-workflow learning → Hermes's own compounding-skill mechanism; don't try to centralize this in JARVIS, it's tightly coupled to Hermes's reflection loop.

### C. JARVIS SHOULD INTEGRATE BUT NOT OWN

- **Model/provider routing and fallback** → OmniRoute. Verified: neither Hermes nor OpenClaw ship this natively ("bring your own provider" config); building a second one duplicates real, actively maintained engineering.
- **Fast pre-classification / routing decisions** → Laya, run locally, called from JARVIS's Mission Router before a full LLM call.
- **Grok Bot** — confirmed no external orchestration API exists. Usable only as a manually triggered specialist for legacy no-API logins; never a Mission Router leaf.

This re-derives — rather than assumes — the brief's suggested MUST-OWN / MUST-NOT-OWN lists: they hold up, with the one correction that Grok Bot cannot be delegated to programmatically at all (previous draft plans that treated it as a peer runtime in the routing diagram are wrong and are dropped here).

## 3. Hermes Agent — Deep Audit

**Identity:** open-source, Python, self-hosted, Nous Research, launched Feb 25, 2026 (github.com/NousResearch/hermes-agent). Architectural bet: agents should be persistent, compounding systems, not stateless executors.

**Verified integration surface (primary source — official docs, fetched this session):**

- `POST /v1/chat/completions` — OpenAI-compatible chat endpoint; drop-in for any OpenAI-format client.
- `POST /v1/responses` — server-side conversation state.
- `POST /v1/runs` — creates a trackable run, returns `run_id`; this is the right primitive for JARVIS to dispatch missions against.
- `POST /v1/runs/{run_id}/approval` — resolves a run stuck at `waiting_for_approval`. This is the concrete hook for JARVIS's global approval policy to intercept before Hermes proceeds.
- `POST /api/jobs` — schedules background/cron-like work; JARVIS does not need its own scheduler.
- SSE streaming with `hermes.tool.progress` custom events — lets JARVIS surface live status without polling.
- `Idempotency-Key` header — safe retries from JARVIS's side.
- Auth via bearer token (`API_SERVER_KEY`); **the docs explicitly warn the API server gives full access to Hermes's toolset including terminal commands** — this key must be treated as a high-privilege secret in JARVIS's secret store.
- **ACP mode**, separately: Hermes can run as an ACP server over stdio for editor/IDE hosts (VS Code, Zed, JetBrains) and "Buzz" collaboration channels. Deliberately excludes messaging delivery and cron — ACP is for interactive editor-style sessions, not what JARVIS needs for backend orchestration. **Use the HTTP API, not ACP, for JARVIS ↔ Hermes.**

**Learning loop (the actual differentiator vs. generic agent frameworks):** after any task with 5+ tool calls, Hermes observes the completed workflow, abstracts it into a skill document (agentskills.io Markdown standard), and persists it; future similar tasks query the skill library instead of re-planning from scratch.

**Also confirmed:** multi-channel gateway (15+ messaging platforms), HiClaw/Kubernetes integration for multi-agent teams with cross-runtime message delivery to other runtimes including OpenClaw, trajectory export + Atropos RL integration.

**Caveats:** young project (10 releases vs. OpenClaw's 82+ as of early 2026), smaller ecosystem, requires a model with ≥64K token context, self-hosted (you provide compute).

**Verdict: (A) primary execution runtime**, integrated via its HTTP API — not modified, not replaced, not run through ACP for this use case.

## 4. OpenClaw — Deep Audit

**Identity:** MIT-licensed, Node.js, created by Peter Steinberger (ex-PSPDFKit), launched Nov 2025 as Clawdbot, rebranded twice in four days (Jan 2026 trademark dispute) to OpenClaw. 200k+ GitHub stars, 600+ contributors — the most mature project in this comparison by ecosystem size.

**Architecture (verified via official architecture docs and HackMD deep-dive):** one long-running Gateway process is the control plane. Five layers: input sources (chat apps) → integration Gateway → agent core (orchestrator + read/decide/act loop) → execution engine (skills) → external systems. The Gateway hosts multiple fully isolated agents in one process, each with its own workspace (`~/.openclaw/workspace-<agentId>`), state directory, session store, auth-profiles file, and persona, routed via declarative "bindings."

**Security, unusually well documented for this space:** exec approvals enforced locally via `~/.openclaw/exec-approvals.json` with three explicit levels — `deny`, `allowlist`, `full`. This is real, working policy infrastructure; JARVIS should call into it, not re-implement it.

**ACP support:** OpenClaw also implements the Agent Client Protocol via `@agentclientprotocol/sdk`, bridging the Gateway to editors — a capability Hermes's ACP mode overlaps with but arrived at independently.

**Confirmed real risk — ClawHavoc (Jan 2026):** hundreds of skills in the ClawHub registry contained malware, including an Atomic Stealer payload that harvested API keys, injected keyloggers, and wrote malicious content directly into MEMORY.md/SOUL.md for persistence across sessions. This is not a hypothetical — it is the concrete argument for a skill-review gate in JARVIS's security policy (§11).

**Relationship to Hermes:** no evidence of a formal partnership; the connection is Hermes's own HiClaw/Kubernetes integration enabling cross-runtime message delivery *to* OpenClaw-hosted agents, not the reverse, and not a merged architecture. Treat them as two independently-developed, loosely-interoperable systems, not a matched pair.

**Verdict: (A) optional integration for the communications/channel layer, never the primary runtime.** OpenClaw's edge over Hermes is messaging-channel maturity and its own ACP bridge, not the agent loop itself. If Raj wants WhatsApp/Telegram access to JARVIS, OpenClaw's Gateway sits in front of Hermes as a channel adapter — it does not replace or duplicate Hermes's agent loop.

## 5. Grok Bot / xAI — Deep Audit

**Identity:** xAI/SpaceXAI's always-on agent product, launched Aug 11, 2026. Each "Bot" runs on its own persistent cloud computer with a browser, filesystem, and terminal; signs into existing tools with the user's own credentials, like a human; keeps working after the device closes. Bots delegate to other Bots in shared threads. Distributed jointly with Cursor; **no free tier** — $120/seat/mo (Cursor Teams Premium), $200/mo (Cursor Ultra), or bundled in SuperGrok Heavy ($300/mo).

**The load-bearing distinction, checked explicitly:** "available to humans in Grok Bot" ≠ "available through an API/protocol JARVIS can integrate with." Grok Bot can *consume* MCP servers and connectors exposed to it — xAI documentation explicitly recommends this integration path when a connector exists. No documented ACP-equivalent, webhook, or API surface was found that lets external software dispatch a task *to* a Bot and track/orchestrate it as a subordinate runtime. The control relationship runs one direction only: you point Grok Bot at your tools, you cannot point your tools at Grok Bot.

**Separately, xAI ships a real API:** `grok-4.7` on the xAI API (Sept 2026 release) is a genuine frontier model — 500K context, agentic-task-tuned, priced per token — fully accessible programmatically. This is a **model**, reachable like any other via OmniRoute, and has nothing to do with Grok Bot's computer-use product. Don't conflate "Grok as a model" (integrate freely, cheaply, via API) with "Grok Bot as a runtime" (cannot be orchestrated).

**Implication for JARVIS:** Grok Bot's computer-use is genuinely the strongest reviewed here — own cloud computer, real credentialed logins to legacy apps with no API. That is valuable exactly once: a task against a tool with no API and no MCP server, where a human-triggered credentialed login is the only path. It cannot be a Mission Router leaf because the router has nothing to call. It also runs against the self-hosted, under-Raj's-control design goal — it is someone else's cloud computer, on a subscription with no free tier.

**Verdict: (C) integrate manually, case by case. Never architect the Mission Router around it.**

## 6. Laya vs. Jev — Not Conflated

Both belong to a category TypeSafe AI's Jev launch (Sept 15, 2026) named "System 1" models: non-autoregressive — no token-by-token generation — they take a state (an email, a ticket, a JSON blob, an agent trace) and one or more typed questions, and return a typed decision (choice / score / yes-no) with a calibrated probability, in a single forward pass. This is a decision model, not a generic LLM — it cannot write prose, and describing it as "a small chatbot" would be technically wrong.

|  | Laya | Jev |
| --- | --- | --- |
| Developer | ConvAI Innovations | TypeSafe AI |
| License | Apache-2.0, open weights | Closed, waitlist-only |
| Backbone | ModernBERT-large, \~421M params | Undisclosed |
| Runs locally | Yes — `pip install laya`; MLX/CoreML/Ascend NPU ports exist | No — hosted only |
| Latency | \~33ms/question on a T4 GPU; 7–14ms on Apple M3 Max via MLX | Comparable, hosted-only |
| Independent benchmark (sysone-bench, Sept 21 2026, 751 states, 9 suites) | Ahead on AG News (0.940 vs 0.910), MNLI (0.983 vs 0.867) | Ahead on triage, guardrails, moderation, banking77, multilingual intent |
| Confidence-gating result | At 0.85 confidence threshold: keeps 58% of traffic at 0.878 accuracy | At 0.85: keeps 78% of traffic at 0.917 accuracy |

Jev has the edge on several benchmarks and a better confidence-gating curve. It is still disqualified for JARVIS: closed, waitlist-only, hosted-only reintroduces exactly the "send my state to someone else's servers" dependency JARVIS's self-hosted design is meant to avoid, and there's no guarantee of continued access.

**Verdict: Laya, as a routing/decision model, not a primary model.** Its role: the first stage of JARVIS's Mission Router — given an incoming request's state, decide category, urgency, and confidence before deciding whether Hermes can proceed unattended or a full LLM planning call (via OmniRoute) is needed. Not suitable for and not intended for generation, open-ended planning, or verification of complex claims — those stay with a full model.

**Decision (Raj, 2026-10-12): adopted now, not deferred.** Laya is in the MVP build, wired into the Mission Router from the start — not held back until the rule-based router proves insufficient as earlier drafts of this doc assumed. Standing instruction: Laya stays the `DecisionModelAdapter` default until something clearly better replaces it (per the §17 test) — swap the adapter, not the architecture, when that happens.

## 7. OmniRoute — Inference Transport, Not Routing Policy

**Identity:** MIT-licensed, local-first AI gateway (`diegosouzapw/OmniRoute`). Exposes one OpenAI-compatible endpoint (`http://localhost:20128/v1`) and forwards to 350+ providers / 1200+ models, with quota-aware auto-fallback, a 12-engine token compression pipeline (15–95% claimed savings), cost/health/latency tracking, and its own native MCP server so a coding agent can inspect provider health and switch models live. Runs 100% locally, no cloud telemetry by design.

**Why JARVIS should not build a second one:** provider/model routing is a continuously moving target — new models and pricing tiers weekly — and OmniRoute already treats this as continuous route selection with active multi-contributor development, not a one-time config file. Duplicating this is pure waste.

**Division of labor, explicit:** OmniRoute owns *inference transport* — which provider/model actually serves a given request, failover, cost, compression. JARVIS owns *routing policy* — which capability tier a mission needs (cheap/fast triage vs. frontier/careful reasoning), decided by Laya plus JARVIS's approval rules — then hands that decision to OmniRoute to execute against whichever provider is currently healthiest and cheapest. Point Hermes's own model-provider config at OmniRoute's local endpoint instead of a single hardcoded provider.

## 8. MCP and Local Model Runtimes

**MCP:** as of Jan 2026, Anthropic donated MCP to the Agentic AI Foundation under the Linux Foundation; OpenAI, Google DeepMind, Microsoft, AWS, Cloudflare, GitHub, and Bloomberg are members. \~97M SDK downloads/month, \~10,000+ active public servers (official registry pull, May 2026: 9,652 latest server records). The 2026-07-28 spec made the transport stateless (dropped session IDs, single-endpoint), a deliberate move toward web-scale reliability rather than prototype convenience.

Of the three candidate shapes:

```
JARVIS → Runtime → MCP / native tools          ← chosen
JARVIS → Custom Tool Registry → MCP → Runtime  ← rejected
JARVIS → Custom Protocol                       ← rejected
```

**Decision: JARVIS never talks to tools directly and never wraps MCP in a custom registry.** Both Hermes and OpenClaw already speak MCP as native clients (verified in §3–§4). A tool registry or protocol layer on top would only re-solve a problem already solved at a scale and governance level a personal project can't match.

**Local model runtimes (Ollama, vLLM, etc.):** current as of Sept 2026 — Ollama remains the standard local-model runtime with OpenAI-compatible tool-calling support; several 2026-era open models (Qwen 3.6, Gemma 4 class) are specifically benchmarked for local function-calling/agent use. Hermes's own docs confirm local models are a supported provider path, gated only by the ≥64K-context requirement. **Role in JARVIS:** an OmniRoute-routed option, not a separate integration — OmniRoute's provider abstraction already covers local models the same way it covers hosted ones, so this doesn't need its own architectural component.

## 9. Memory / Knowledge Systems

The governing test: **"what information about Raj must survive regardless of which agent/runtime/model executes the task?"** Only that layer belongs to JARVIS.

| Option | What it actually is | Verdict for JARVIS |
| --- | --- | --- |
| Hermes memory | Skill library + trajectory export — working memory about *how to do things* | Keep runtime-local; don't centralize, it's coupled to Hermes's own reflection loop |
| OpenClaw memory | MEMORY.md/SOUL.md per agent workspace — channel/persona-scoped context | Keep runtime-local, if OpenClaw is adopted at all |
| Obsidian | A note-taking app with a plugin ecosystem, not an agent memory system | Not a fit — no API-native agent integration; would add a UI dependency for no architectural gain |
| Graph RAG | Structured entity/relation extraction over a corpus, then retrieval by traversal | Overkill at personal scale; real engineering cost for a single-user knowledge base that's still small |
| Vector databases | Embedding-based semantic retrieval | Same — solves a scale problem Raj doesn't have yet |
| Plain structured files (current approach) | What Raj already uses — `/profile.md`, `/areas/*.md`, `/people/*.md` | **Keep.** Trivially inspectable, trivially editable by Raj directly, scales to thousands of facts, and is already integrated with how this assistant reads/writes context |

**Decision:** don't build a database as a first move. JARVIS-owned memory is exactly the identity/preference/mission-state tier from §2A, kept as structured files. Revisit only if retrieval quality becomes an actual measured bottleneck — not preemptively, and not because Graph RAG or vector DBs are trendy.

## 10. Computer / Browser Control

JARVIS does not build this. Ranked options for Raj's case:

1. **MCP servers (Playwright / browser-use) called from Hermes** — covers any normal web UI, API, or app a standard automation library can drive. This is the large majority of tasks, and it stays inside one runtime, one approval model, one audit trail (Hermes's `/v1/runs` + approval endpoint).
2. **Grok Bot, manually triggered** (§5) — reserved for the narrow case of a legacy system with no API and no clean automation path, requiring a genuinely credentialed human-like login. Raj triggers it directly; JARVIS's router never does.
3. **OpenClaw nodes**, if OpenClaw is adopted for messaging — per-node execution can carry a browser/computer task close to a specific channel or device, but this is a side benefit of adopting OpenClaw, never a reason to adopt it on its own.

JARVIS's only responsibility here is **policy**: which task categories may touch a browser/computer at all, and which require approval first — enforced once, centrally, through the same approval hook used for everything else (§11), not re-implemented per runtime.

## 11. Security Model — Layered, Not Duplicated

Don't build a custom sandbox first. Reuse what's verified to exist, and add only the layer that's genuinely missing.

```
JARVIS GLOBAL POLICY          ← Raj's own layer: which action categories EVER need approval,
        │                        regardless of which runtime executes them
RUNTIME-SPECIFIC POLICY       ← Hermes: waiting_for_approval + /v1/runs/{id}/approval
        │                        OpenClaw: exec-approval levels (deny/allowlist/full)
TOOL EXECUTION                 ← MCP servers, sandboxed per the runtime's own model
```

**Concrete, current risk to design against:** ClawHavoc (Jan 2026) put real malware into the ClawHub skill registry — an Atomic Stealer payload that harvested API keys and wrote persistent instructions directly into agent memory files. The lesson generalizes past OpenClaw specifically: any skill/plugin registry (ClawHub, agentskills.io, an MCP server registry) is untrusted code from strangers by default.

**JARVIS's global policy, concretely:**

- Skills/plugins are reviewed (by Raj or a diff/scan step) before install into either runtime — never auto-installed from a registry search result.
- New skills run in the most restrictive available permission mode until proven safe (Hermes: gated tool access; OpenClaw: `allowlist`, not `full`).
- **Nothing writes to JARVIS's own identity/memory files except through JARVIS's own write path** — a runtime or a skill never gets direct write access to the identity/mission store, closing exactly the vector ClawHavoc used (writing into MEMORY.md/SOUL.md for persistence).
- The `API_SERVER_KEY` used for Hermes's HTTP API is treated as a high-privilege secret (the docs are explicit that this key gives full terminal access) — stored in JARVIS's secret store, never embedded in a skill or committed anywhere.

**Addendum — documented policy vs. tested policy:** everything above is designed, not yet verified against a running instance. The open question: does Hermes's `waiting_for_approval` actually block the tool call from executing, or does it only flag the action after it already ran? Hermes's own governance tracking lists the execution-boundary work as a later sprint, not shipped — so §13's approval flow should be read as an assumption pending that sprint, not a settled fact. If it turns out to be the latter, JARVIS's global policy needs its own hold-before-submit mechanism rather than trusting Hermes's gate.

**Live result (2026-11-10, Hermes v0.21.5, `gemini-2.5-flash`):** for a terminal command matching Hermes's own dangerous-pattern list (`rm -rf`, "recursive delete"), the approval gate **blocks before execution**. Probe: a run was asked to `rm -rf` a scratch directory holding one file; on `approval.request` the file existed, it still existed 3 s into the pending state, a `deny` (with `request_id` and `execution_generation`) returned HTTP 200, `tool.completed` reported `BLOCKED: Command denied by user` with `exit_code: -1`, and the file survived to run completion. Limits of this result, stated plainly: (1) only the terminal dangerous-pattern path was tested — commands Hermes's pattern list does not flag are never gated, so JARVIS's own tool policy still must not assume Hermes gates everything; (2) `tool.started` is emitted *before* `approval.request` for the same call, so a consumer must not read `tool.started` as "executing"; (3) the approve-and-execute path and non-terminal (plugin) approvals were not exercised; (4) the model matters: Antigravity/Copilot-CLI routes via OmniRoute were unusable that day (upstream "client no longer supported"), local Qwen via Ollama failed on tool-message templating, and `gemini-flash-latest` was returning 503s.

**Addendum — single point of failure:** every runtime verb in this document funnels through one project, Hermes. The $90M raise noted in §18 is a reliability signal, not a mitigation. Aiden (§16) is the fallback candidate — bench-testing it behind the same `RuntimeAdapter` interface is the actual continuity plan, and is worth scheduling before Hermes becomes a hard daily dependency, not after an outage forces the question.

## 12. Concept Definitions

| Concept | Definition, as used in this architecture |
| --- | --- |
| **JARVIS** | The personal intelligence, memory, and authority layer: understands Raj, routes work, enforces approval policy, persists mission state across runtimes. Not itself an agent runtime. |
| **Agent** | An executing instance inside a runtime — a Hermes run (`run_id`), or an OpenClaw agent (its own workspace/session). |
| **Runtime** | A system that runs agent loops and tools — Hermes (primary), OpenClaw (optional channel/comms). |
| **Model** | The LLM (or decision model) doing generation or classification — selected via OmniRoute for generation, Laya for fast classification. |
| **Tool** | A callable capability, native to a runtime or exposed via MCP. |
| **Skill** | Reusable procedural knowledge — Hermes's self-generated agentskills.io documents, or OpenClaw's ClawHub entries. Runtime-owned, reviewed before install per §11. |
| **Mission** | A Raj-level goal with state that can span sessions and runtimes — the JARVIS-owned object that a Hermes run or OpenClaw session is merely one execution of. |
| **Memory** | Split by tier: JARVIS-canonical (identity, preferences, mission history — must survive any runtime) vs. runtime-local (Hermes skill library, OpenClaw MEMORY.md) — see §9. |
| **Event** | A trigger — a user message, a Hermes Jobs API cron tick, an OpenClaw webhook, an approval response — normalized by JARVIS into a mission create/resume. |
| **Authority** | Who may approve what. JARVIS's global policy sits above runtime-specific approval mechanisms and can override them when they conflict. |
| **Verification** | Policy for when a result needs a second check: low-stakes → accept runtime result; medium → secondary model check; high → human approval via JARVIS's policy, routed through the runtime's own approval hook (§11). |
| **Execution environment** | Local process, Docker, remote host — owned entirely by the runtime backend, never by JARVIS. |
| **Connector** | An app/API integration, reached via a runtime's native tools or its MCP client. |
| **Channel** | A messaging surface (Telegram, WhatsApp, etc.) — owned by OpenClaw's Gateway if adopted, never built by JARVIS. |

## 13. Proposed Architecture

```
                              JARVIS  (small codebase Raj owns)
              Identity Store · Mission Store · Approval Policy · Mission Router
                        (Laya = local fast pre-classifier, in-process)
                                       │
                         POST /v1/runs │ GET status (SSE) │ POST /v1/runs/{id}/approval
                                       │
                              Hermes Agent  (primary runtime)
              agent loop · skill library · /api/jobs cron · MCP client · terminal/fs
                                       │
                    ┌──────────────────┼──────────────────────┐
              OmniRoute            MCP servers        OpenClaw Gateway
           (localhost:20128,   (Playwright/browser-   (optional — only if
            model/provider      use, calendars,         WhatsApp/Telegram
            fallback, cost)     APIs, etc.)              access is wanted)
                                                              │
                                                    manually triggered, when
                                                    no API/MCP path exists:
                                                      Grok Bot (legacy logins)
```

**What changed from the scrapped drafts:** the interfaces are now pinned to verified endpoints (`/v1/runs`, `/v1/runs/{id}/approval`, `/api/jobs`, SSE) rather than "OpenAI-compatible API and/or ACP" left ambiguous; Grok Bot is explicitly outside the routable diagram, not a peer of Hermes/OpenClaw; and Laya's role is named precisely (in-process classifier inside the Mission Router, not a separate service most requests round-trip to).

This stays deliberately thin at the top. If a box in this diagram ever needs logic beyond "call the existing API with a policy-derived parameter," that is the signal a real gap exists — worth reconsidering only then.

**Open risk, not yet closed (see §18):** this diagram draws submit → approve → status as if it already composes on Hermes's real API. It doesn't yet — §18 found that Hermes's approval path and its session-continuity path don't connect, and nothing in this doc has verified whether `waiting_for_approval` blocks the action before it runs or only reports it after the fact. Until the Hermes adapter re-injects context per run (§18's requirement) and that approval-timing question is checked against a live Hermes instance, this diagram is the target shape, not a proven one.

## 14. Decision Table and Build Plan

| Component | Use existing | Build | Why |
| --- | --- | --- | --- |
| Agent runtime | Hermes | — | Verified API surface, compounding skill loop |
| Tool system | Hermes + MCP | — | Native MCP client, don't wrap it |
| Model routing / transport | OmniRoute | — | Actively maintained, provider churn is a full-time problem |
| Fast classification | Laya (local) | — | Open, fast, self-hosted, good enough for routing |
| Scheduling | Hermes `/api/jobs` | — | Already cron-like |
| Messaging channels | OpenClaw Gateway (optional) | — | Only if phone access wanted |
| Identity / preferences | — | **Yes, minimal** | No runtime has a portable concept of this |
| Mission store | — | **Yes, minimal** | No runtime models cross-runtime goals |
| Approval policy | — | **Yes, thin layer over Hermes/OpenClaw's own approval hooks** | Global rules must outrank any single runtime's default |
| Computer/browser control | MCP servers via Hermes; Grok Bot manually for edge cases | — | Don't build a driver |
| Security sandbox | Hermes + OpenClaw's existing mechanisms | Policy config only | Don't duplicate real isolation work |

**Build order:**

1. Stand up Hermes with its API server enabled (`API_SERVER_KEY` set, treated as a high-privilege secret).
2. Point Hermes's model-provider config at OmniRoute's local endpoint.
3. Build the minimal JARVIS layer: identity store (structured files, per §9), mission store, a Mission Router function, and an approval-policy config that intercepts Hermes's `waiting_for_approval` callback.
4. Wire Laya into the Mission Router as the first classification step.
5. Defer OpenClaw until phone/WhatsApp access is actually wanted; add as a channel adapter in front of Hermes, never a second agent loop.
6. Skip Grok Bot integration entirely until a specific no-API legacy-app task appears.
7. Before installing any third-party skill into either runtime: review it, run it in the most restrictive permission mode, confirm it cannot write to JARVIS's own identity/mission files.

This reaches the full vision in §0 — natural-language requests, persistent cross-runtime memory, delegation, scheduling, multi-channel reach, tiered approval — without JARVIS itself implementing an agent loop, a browser driver, a model router, or a messaging gateway.

## 15. Extensibility — The Adapter Pattern

**The problem this section solves:** every ecosystem sweep so far (Sept 26, Oct 5) has found something new — Nex-N2.5-Pro, Aiden, Dots, Agent-S, OpenAI's Agents API. This will keep happening every few weeks for years. If adding one of these ever requires touching JARVIS's core routing logic, the architecture has already failed its own governing principle (§0). This section makes "integrate the new thing" a bounded, mechanical act instead of a redesign.

**The rule:** JARVIS's core (Mission Router, Mission Store, Approval Policy) never talks to Hermes, OpenClaw, Aiden, or anything else directly. It talks to one internal interface. Every external system is wrapped in a small **adapter** that implements that interface and hides everything specific to that system behind it. Adding a new runtime, model, or tool means writing one new adapter file — never touching the router, the store, or any existing adapter.

**The interface, kept deliberately small** (four verbs, not a framework):

```
RuntimeAdapter {
  submit(mission) → handle          # dispatch a unit of work; returns a trackable handle
  status(handle)  → state, output   # poll or subscribe (SSE/WS under the hood, adapter's choice)
  approve(handle, decision)         # resolve a pending approval, however the backend expresses it
  cancel(handle)                    # best-effort stop
}
```

Every runtime integration in this document already maps onto exactly these four verbs, which is itself evidence the interface is sized correctly rather than invented for this section:

- **Hermes adapter:** `submit` → `POST /v1/runs`; `status` → SSE stream / run polling; `approve` → `POST /v1/runs/{id}/approval`; `cancel` → run cancellation.
- **OpenClaw adapter** (if used): `submit`/`status` over its Gateway WebSocket RPC; `approve` maps to its exec-approval levels.
- **Aiden adapter** (if ever bench-tested in): `submit`/`status` via its HTTP daemon + SSE; `approve` via its evidence/verification gate.
- **OpenAI Agents API adapter** (if ever adopted as an alternative to self-hosting): `submit` → its session-create call; `status` → its event stream; `approve`/`cancel` map directly — it was built around the same shape because every serious runtime converges on durable-session-plus-approval-callback, which is why this interface generalizes rather than being Hermes-specific.
- **Agent-S adapter** (computer-use specialist, §16): `submit` wraps a `gui_agents` call; no native approval concept, so the adapter enforces JARVIS's policy gate before `submit` is ever called, rather than inside the runtime.

**Models and tools don't need adapters at all** — that problem is already solved: OmniRoute is the model adapter layer (one more model, like Nex-N2.5-Pro, is a config line, never a code change), and MCP is the tool adapter layer (one more MCP server is a connection string). The `RuntimeAdapter` interface above is only for things that run an agent loop on JARVIS's behalf.

**What this buys, concretely:** when something new launches — and per §16, something always is — the test is: *does it fit through the four verbs?* If yes, it's a day of adapter-writing, not a redesign. If no (e.g. a consumer product with no programmable surface at all, like Grok Bot or Dots), it's simply not integrated at the runtime layer — confirmed as a limitation of that product, not a gap in JARVIS's design. This is also the test that should gate every future "should we add X" conversation: name the adapter's four methods for X before deciding to integrate it. If you can't, X isn't integrable yet, no matter how capable it looks.

## 16. Ecosystem Update — October 2026

Five findings since §14 was written, run through the adapter test in §15. None of them change the primary-runtime decision; all of them confirm the pattern already identified.

| Finding | What it is | Through the adapter test | Verdict |
| --- | --- | --- | --- |
| **Nex-N2.5-Pro** (nex-agi) | 397B multimodal model, Apache 2.0, 262K context, native computer-use + visual grounding, free on OpenRouter | Not a runtime — a model. No adapter needed, it's a config line in OmniRoute | Add as an OmniRoute-routed option for tasks needing native visual grounding |
| **Aiden** (taracod) | Solo-maintained personal-agent runtime, AGPL-3.0, 668 stars. Real HTTP daemon + SSE, native MCP client, and a Jobs→Evidence→Verification model that's stricter than Hermes's default trust-the-tool-output behavior | Fits the `RuntimeAdapter` interface (submit/status/approve/cancel all present) | Worth a bench test *alongside* Hermes, not a replacement — solo maintainer is a real reliability risk Hermes no longer has (§3, §17) |
| **OpenAI Dots** (launched \~Oct 2026) | OpenAI's always-on consumer personal agent, direct answer to Meta Muse | Checked directly against OpenAI's own Agents API docs: **not exposed through it.** Consumer-only, same as Grok Bot | Confirms the pattern is lab-wide, not Grok-specific: no adapter possible, not integrated, ever (unless this changes) |
| **OpenAI Agents API** (separate from Dots) | A *hosted* alternative to self-hosting Hermes — "durable cloud agents with a managed Codex harness," sessions/orchestration/recovery managed by OpenAI, MCP support, subagents, sandboxes | Fits the `RuntimeAdapter` interface cleanly (§15) | Not adopted now — would trade self-hosted model-agnosticism for OpenAI-model lock-in — but the adapter is cheap to write later if the tradeoff ever looks better |
| **Agent-S** (simular-ai) | Open-source computer-use framework, Apache 2.0, 12.2k stars, peer-reviewed (ICLR/COLM/TMLR), 73% on OSWorld 2.0, real Python SDK (`gui_agents`), model-agnostic | Not a full runtime — a specialist library, called the way an MCP tool is called, from inside Hermes | **Adopted**: replaces "a Playwright-style MCP server" in §10 as the named computer-use engine for native desktop GUI tasks beyond the browser |

**Net effect on the architecture (§13, §14):** no change to runtime ownership. Hermes remains primary. Two concrete additions: Agent-S named as the computer-use specialist in §10's build order, and Aiden flagged for a future bench-test behind the same `RuntimeAdapter` interface — never as a parallel integration path that needs its own router logic.

## 17. Extension Points — Full-System Modularity

**Why this section exists:** §15 generalized one category — new agent runtimes — into the `RuntimeAdapter` interface. Raj's actual requirement is broader: when *anything* new launches (Dots, Jev, Laya all shipped within weeks of each other), integrating it should never require touching JARVIS's core. §15 already proves this for runtimes. This section proves it for every other category, and closes the one real gap §15 left open: decision/routing models never got their own named interface.

**The five categories, and whether each already has a stable seam:**

| New thing | Stable interface | Mechanism to add one | Already solved? |
| --- | --- | --- | --- |
| Agent runtime (Hermes-class) | `RuntimeAdapter` (§15) | Write one adapter file implementing submit/status/approve/cancel | Yes — §15 |
| Generative model | OmniRoute | Add a config line | Yes — §7 |
| Decision/routing model (Laya/Jev-class) | `DecisionModelAdapter` (new, below) | Write one adapter file implementing classify/health | **No — this was the gap** |
| Tool | MCP | Add a connection string | Yes — §8 |
| Skill / workflow | Runtime skill library (Hermes dir / agentskills.io convention) | Drop a skill directory; no redeploy | Yes — §2B |

**The gap: decision models never had their own interface.** Laya and Jev are not agent runtimes — there's nothing to approve or cancel, because a classification call either returns a typed answer or it doesn't; forcing them through `RuntimeAdapter` would mean stubbing two methods that don't mean anything. They're also not just another OmniRoute model — OmniRoute's contract is generative (prompt in, tokens/stream out), while a System-1 decision model's contract is a single typed judgment with a confidence score, often under a latency budget tight enough that JARVIS's router depends on it responding fast or failing over cleanly. That's a third shape, so it gets a third small interface:

```
DecisionModelAdapter {
  classify(state, question, schema) → decision, confidence   # one typed judgment, not a token stream
  health()                          → ok | degraded           # router falls back to LLM routing when degraded
}
```

Laya maps onto this directly today (local Python/HTTP call → decision + confidence). A Jev-successor or any future System-1 model plugs in the same way: one new adapter file, zero changes to the Mission Router.

**Skills and tools were already solved, stated explicitly so the pattern reads as complete:** a new MCP server is a connection string, owned by the runtime, never touching JARVIS core (§8). A new skill is a directory dropped into Hermes's skill library or registered via the agentskills.io convention — JARVIS never loads or routes to skills directly, so a new one is invisible to JARVIS's own code (§2B). Neither needed a new interface; they're listed here only so this table is the single place that answers "is X modular yet" for any category.

**The generalized test (replaces the narrower §15 version):** for anything new that launches, first ask which of the five rows it is. If it's a runtime, model, decision model, tool, or skill, the seam above already exists — the work is one adapter file or one config line, never a core change. If it doesn't fit any of the five rows cleanly, that's new information, not a reason to improvise: either a sixth category genuinely needs defining (rare — the five map onto everything shipped since §0 was written), or, as with Grok Bot and OpenAI Dots (§16), it's a consumer product with no programmable surface at all — correctly left unintegrated, not a gap in this architecture.

## 18. Ecosystem Update — October 12, 2026

Second sweep, re-verified against primary sources (official docs, GitHub releases, Wikipedia) rather than aggregator blogs — several of which showed up in search and were discarded as unverifiable content-farm noise (e.g. a claimed "Clef" decision model has no primary source anywhere; treated as noise, not a finding).

| Finding | What it is | Through the adapter test (§15/§17) | Verdict |
| --- | --- | --- | --- |
| **Hermes API server, now officially documented** | Official docs confirm `POST /v1/runs`, `GET /v1/runs/{id}`, `GET /v1/runs/{id}/events` (SSE), `POST /v1/runs/{id}/approval`, `POST /v1/runs/{id}/stop` | Maps exactly onto `RuntimeAdapter`'s four verbs — primary-sourced, not inferred | Confirmed — build the Hermes adapter against this surface as-is |
| **Hermes session-continuity gap** | Open GitHub issue: `/v1/runs` ignores the session-id header; each run starts with no memory of prior runs on that mission. Approvals exist only on the runs path, continuity only on the chat path — the two don't compose today | Not a `RuntimeAdapter` problem — a reason the Mission Store can't delegate history to Hermes | Confirms the existing decision (JARVIS owns mission history), sharpens the implementation: the Hermes adapter must re-inject relevant mission context into every run it submits — build this in from day one, not as a later patch |
| **Nous Research: $90M Series B, $1.5B valuation (Oct 11)** | Funds an enterprise Hermes product across Slack/Telegram/WhatsApp | Not an adapter question — a reliability signal on the primary-runtime choice | Strengthens §3's pick of Hermes as primary; no architecture change |
| **OpenClaw: MIT, Foundation-stewarded, v2.0 shipped** | Confirmed no sandboxing or secrets-encryption by default (independent review) | Runtime-policy input, not an adapter question | Confirms §11: JARVIS's global policy layer can never assume an integrated runtime is secure by default — stays mandatory regardless of which optional runtime is behind it |
| **Laya vs. Jev, vendor-confirmed** | Laya: Convai Innovations, Apache 2.0, self-hostable, ModernBERT-large (+ mmBERT multilingual), 512-token budget. Jev: TypeSafe AI, hosted-only, no published license | Laya fits the local self-hosted profile §6/§17 already assumed; Jev is the hosted alternative if that tradeoff is ever wanted | No change — Laya remains the default `DecisionModelAdapter` target |
| **Agent-S3 (simular-ai)** | OSWorld 62.6% alone / 69.9% with multi-run selection (bBoN), vs. 61.4% prior SOTA. No public REST API/SDK details on the open framework itself; Simular's own hosted agent ("Sai", GA Sept 23) is a separate consumer product that works via screen control, not integrations | Still a specialist library called like a tool from inside Hermes, not a runtime | No change to §16's adoption — benchmark number updated, source noted as a different OSWorld revision than the one previously cited, so not a like-for-like comparison |
| **OpenAI Dots** | Re-confirmed consumer-only: "dots themselves have no public API." The underlying model (GPT-6 Astra) *is* available via standard API/OpenRouter/Bedrock routes | Dots-the-product: no adapter possible, as before. The model: an ordinary OmniRoute config line | No change — sharper primary-source wording on an existing verdict |
| **MCP roadmap (as of Aug 22 2026)** | Five priority areas: agentic messaging primitives, HTTP-transport unification, agent identity & enterprise auth (DPoP, workload identity federation), improved primitives, SDK DX | None required now — MCP is still integrate-not-build | Watch the Agent Identity work specifically: JARVIS acting unattended on Raj's behalf, and spawning narrower-authority sub-requests, is exactly the problem that workstream is solving. Revisit when it ships; not a blocker for MVP |
| **Sierra's Personal Agent Protocol (PAP)** — new, Oct 11 | Open standard in development with Meta, Shopify, Stripe, Walmart: lets a *personal agent* identify itself and get permission to act with a business. Spec v0.1 not yet shipped | Doesn't fit any of §17's five rows cleanly — it's not a runtime/model/tool/skill, it's a protocol for how JARVIS-the-personal-agent would present itself externally | **Watch, don't build toward.** Nothing to integrate yet — the spec doesn't exist. Relevant because JARVIS is structurally the kind of thing PAP is designed for; revisit on v0.1 |
| Laya — adoption decision | Raj's call (Oct 12): use Laya now as the Mission Router's fast classifier, not deferred to post-MVP | No adapter question — a build-sequencing decision | Adopted. Noted in §6 with the standing instruction: stays default until something better replaces it |
| Cactus Whistle (STT) | 16.9MB on-device speech-to-text model, Apache-2.0 weights (closed C++ engine binary), 7 languages, announced 2026-10-02 by Cactus Compute. Independent check: beats Whisper-base on only 2 of 6 comparable benchmarks, not "mostly beats" as marketed | A model, not a runtime — same bucket as any OmniRoute entry (an OpenAI-compatible /v1/audio/transcriptions wrapper already exists third-party) | Watch, not adopted. No voice/STT need exists anywhere in this doc yet — nothing to attach it to. 10 days old, 7 languages, marketing overstates vs. independent benchmark. If voice input is ever wanted, it's an OmniRoute config line, not a new adapter — revisit then, not now |

**Net effect on the architecture (§13, §14, §17):** no core change. Every finding either confirms a standing decision or sharpens an implementation detail inside an adapter that was already planned. The one genuinely new thing (PAP) has nothing to integrate yet by design, which is itself the correct outcome of the adapter test, not a gap.

**Addendum (2026-10-18) — Hermes Agent's real `api_server` surface, re-checked against current official docs:** this sharpens, and partly corrects, the picture above and in §3/§15.

- `POST /v1/runs/{id}/approval` requires `execution_generation` alongside `request_id` and `choice` — a stale or missing generation gets HTTP 409. Earlier adapter code (both this doc's and the agent-_project codebase's) omitted it; fixed in agent-_project's `agent-adapter.ts` on this date. Only `once`/`deny` are confirmed `choice` values — `session`/`always`, claimed from source in an earlier pass, are not in the current docs and are not sent.
- New information, not yet reconciled: `POST /v1/runs` now documents an optional `session_id` field. This is a different mechanism than the `X-Hermes-Session-Id` header that GitHub issue #84406 reports as ignored — re-checked, the issue is still open with no resolution stated. Whether the body field actually restores history, or is an equally unverified path, is unknown from here. Standing instruction unchanged: fold prior mission context into the prompt text on every run regardless (§18's original guidance) — `session_id` is sent defensively, never relied on, until confirmed live.
- `GET /v1/capabilities` exists for feature detection (`run_submission`, `run_status`, `run_events_sse`, `run_stop`, `run_approval`) — worth using to detect what a given Hermes deployment actually supports, rather than assuming.
- **Live result (2026-11-10, Hermes v0.21.5, `gemini-2.5-flash`) — body `session_id` on `POST /v1/runs` does restore in-session history.** Run A (`session_id=S`) was told a codeword; run B with the same `S` recalled it; control run C with a different `session_id` answered NONE. All three used zero tool calls. This confirms the *body field*; the `X-Hermes-Session-Id` header (issue #84406) was not tested. **Standing instruction still holds** — fold mission context into the prompt on every run — because (1) continuity is Hermes-side state JARVIS doesn't own, and (2) an earlier, contaminated attempt showed Hermes's own `memory` tool can persist facts to `memories/USER.md` and leak them *across* sessions (a control session recalled a codeword it was never given). Hermes's agent-driven memory writes are therefore a cross-run state channel JARVIS doesn't govern; treat anything Hermes remembers on its own as untrusted input, and keep prompts that must not persist explicit about it.

## 19. Reference Check — FatihMakes's Mark-Series (Plugin Modularity)

**What was checked:** FatihMakes's public "Mark" series — a personal, actively-iterated voice AI assistant, versioned with Roman numerals (Mark-X → Mark-XXXIX-OR → Mark-LIV → Mark-LVI, the last tagged "newest, latest, most advanced"). Read directly from the repos' own READMEs.

**Verdict stated first, because it matters for how to read everything below:** this is not a peer architecture for JARVIS — it's close to the opposite of one. Mark is a fat, self-contained desktop client that reimplements, in its own codebase, exactly the things §0 says JARVIS must never build: its own agent loop (`main.py`'s tool dispatch), its own speech stack (`faster-whisper`, `piper-tts`, `openwakeword`), its own computer-control (`pyautogui`, OpenCV), its own avatar/HUD (PyQt6). That's a legitimate choice for a single-developer hobby project with no Hermes-equivalent to delegate to — but copying that shape into JARVIS would undo every integrate-don't-build decision this document has made since §2. **Nothing here is grounds for "redo the architecture."** What it is good for: one specific, working answer to "how do you make plugins modular," worth stealing the pattern from without stealing the surrounding shape.

**The plugin pattern, as implemented (consistent across LIV and LVI):**

1. **One file, one plugin.** Each skill is a single Python file in `plugins/` (or `actions/` for bundled, computer-controlling ones), declaring a metadata dict (`TOOL`) and a handler function. No base class, no registration call to remember.
2. **Auto-discovery, not a registry.** The loader scans the folder at launch and validates each file against the expected shape. Adding a skill means adding a file — nothing else in the codebase changes, which is the same promise §15/§17 make for runtimes and models, just applied one layer further down.
3. **Per-plugin crash isolation.** A broken plugin's import or execution error is caught and logged; it cannot take the host process down. This is the one piece of discipline the adapter pattern has not yet stated explicitly for JARVIS's own code and should: a bad adapter or a bad future plugin must degrade, not cascade.
4. **A `_template.py` plus an underscore convention** (underscore-prefixed files are shared helpers, not plugins) makes "how do I write one" discoverable by reading the folder, not a separate doc.
5. **Lazy imports.** Heavy dependencies load on first use, not at discovery time, so having many plugins installed doesn't slow every launch.

**The independent confirmation worth noting:** Mark-LVI separately added an optional `providers/` package — a small Engine/LLM/STT/TTS contract (the README states it as four session methods and five event fields) that `main.py` depends on only through that interface. Deleting the folder cleanly reverts to default behavior. That is the adapter pattern, reinvented from scratch by someone solving a completely different problem under a completely different philosophy — a useful sanity check that §15's shape (small, fixed verb count, swap-the-file-not-the-core) is the right one, not a parallel to imitate further.

**What this changes in JARVIS, concretely — one addition, not a redo:**

The §17 table's "new skill/workflow" row currently resolves to "drop a directory into Hermes's skill library" — correct, but it's Hermes's convention, not one JARVIS defines. JARVIS's own code (`jarvis.cli`, `jarvis.router`) has no plugin surface of its own, because nothing in the MVP needs one yet. Mark's pattern is the concrete shape to reach for when that need shows up — pinned to a concrete trigger so this doesn't rot the way the scrapped drafts did: the first time a JARVIS-level action (checking a mission's status, reading a local file, firing a notification hook) would otherwise force a full Hermes round-trip just to do something fast, local, and LLM-free. That's the signal, not a calendar date. Record now, build later, same treatment already given to OpenClaw and OmniRoute in §14:

- One file per JARVIS-level plugin, under `jarvis/plugins/`, declaring a metadata dict and a `run()` function.
- Discovered at `MissionRouter` startup, not registered by hand.
- A failing plugin is caught, logged, and excluded for that process lifetime — never a crash.

**No change** to the runtime, model, or decision-model choices in §3/§6/§7/§18 — Mark's repos have nothing to say about Hermes, OmniRoute, or Laya specifically. This section only sharpens one row of one table.

## 20. Build Location Decision (2026-10-18) — agent-_project, Not Rex

**Decision (Raj, 2026-10-18):** the JARVIS build moved into `agent-_project` (Next.js/TypeScript), reworked in place. The from-scratch Python rebuild (`Rex`, started earlier the same day) is abandoned. This reverses that morning's "scrap it, start clean in Python" call — recorded here rather than silently overwritten, per this doc's own discipline of not hiding a reversed decision.

**Why the reversal mattered less than it first looked:** the original call to scrap `agent-_project` was made on the assumption that its entire Hermes integration was invented against a hypothetical contract. That assumption was wrong. The repo already contained two things: a dead, never-implemented bespoke contract (`contract.ts`/`http-adapter.ts`) and, separately, a real adapter (`agent-adapter.ts`) correctly targeting Hermes Agent's actual `api_server` platform — written with more operational detail (exact endpoint paths, SSE event names, approval-choice vocabulary) than this doc had recorded anywhere. Rex duplicated work that was already done, in the wrong language for no longer-relevant reasons.

**What changed in `agent-_project` to make it match this doc, concretely:**

- Deleted the dead `contract.ts`/`http-adapter.ts`/`retry.ts` path (+ tests) and the `HERMES_API_URL` branch in `factory.ts`. `agent-adapter.ts` (real) + `mock-adapter.ts` (dev fallback) are the only two `RuntimeAdapter` implementations now — no third path to confuse with the real one.
- Fixed a real bug in `agent-adapter.ts`: `POST /v1/runs/{id}/approval` was missing the required `execution_generation` field (§18's 2026-10-18 addendum) — every real approval would have 409'd.
- Fixed a real bug in `orchestrator.ts`: resuming a paused mission silently restarted the objective from scratch, because `fromPercent` was never actually forwarded to a real Hermes run. Now folds prior progress into the resumed prompt — the same mitigation §18 already prescribed for the session-continuity gap, just not yet applied in code until today.
- Added `src/server/laya/` — `DecisionModelAdapter` (classify/health), wired into the mission orchestrator as a non-blocking pre-classification step. This was the one genuine gap: nothing like it existed in `agent-_project` before today.
- `src/server/omnirouter/` was checked against §7's division of labor (OmniRoute = inference transport, JARVIS = routing policy) and found not to violate it — it's JARVIS's own provider/account/model routing-policy layer, with a real local OmniRoute gateway as one configured entry among several. No change made there; recorded here so a future pass doesn't re-raise it as a finding.

**Status:** 65/65 tests pass against this code; `tsc --noEmit` clean. Rex is left untouched on disk, marked abandoned in its own README, not deleted — same respect-prior-work treatment the original scaffold got back when the decision ran the other way.

**No change** to the runtime, model, or decision-model choices themselves (§3/§6/§7) — Hermes, Laya, and OmniRoute's roles are exactly what §2/§6/§7/§17 already said. This section records where the code lives and what was fixed to match the doc, not a new architectural call.
