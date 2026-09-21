# JARVIS Phase Status

Last updated: 2026-09-21 (end of session), after real Hermes Agent verification (Phase 02), full budget enforcement + real checkpoints (Phase 01), and the World State reconciliation module (Phase 03). Earlier same-day updates: step-budget alone, then full budget dimensions. Before that, 2026-09-17, after the Mission Task-DAG vertical slice.

Status vocabulary (exactly these values, per project convention):
`NOT STARTED | IN PROGRESS | PARTIALLY COMPLETE | COMPLETE | BLOCKED | REJECTED | SUPERSEDED`

A phase is only marked COMPLETE when its roadmap deliverables are actually implemented and verified in code — not because a component, route, schema, or mock exists with that name. Evidence cites real files; anything mocked or simulated is labeled as such.

---

## Phase 00 — Foundation & Architecture

**Status: COMPLETE**

Clean module boundaries already exist and are independently testable: `src/server/missions` (mission runtime), `src/server/hermes` (intelligence boundary — 3 swappable adapters behind one interface), `src/server/omnirouter` (model/provider routing), `src/server/events` (world-state event bus + SSE), `src/server/security` (policy + tool gate + audit), `src/server/verification` (deterministic verdicts). Frontend/backend boundary is clean (API routes + SSE, no server internals leak to the client). DB boundary is isolated behind `src/server/db/{client,util,schema}.ts` — repositories are the only code that touches SQL.

**Not yet distinct, and correctly so** (deferred to their own later phases, not a Phase 00 gap): a standalone Tool Registry (Phase 04) — today tool metadata is a 9-entry table embedded in `security/tool-policy.ts`. A distinct "OpenClaw" infrastructure layer (implied by Phase 12's diagram) — today its role is filled by the single in-process event bus (`events/bus.ts`, explicitly scoped in its own comment to "one Node EventEmitter, one channel... good enough for a single-process `next dev`/`next start` server").

**Recommended next step:** none required now — revisit when Phase 04 or Phase 12 actually needs the split.

---

## Phase 01 — Mission Runtime

**Status: COMPLETE** (for this phase's own scope — see "Deliberately still out of scope" below for what's correctly deferred elsewhere)

**Implemented & verified:**
- Full 9-state lifecycle (`QUEUED/RUNNING/PAUSED/WAITING_USER/WAITING_EXTERNAL/BLOCKED/FAILED/COMPLETED/CANCELLED`) with a hard-coded transition table (`src/server/missions/state-machine.ts`) enforced by `assertTransition`, not just implied by naming.
- Persistent mission state (SQLite, `missions` table), full CRUD (`src/server/missions/repository.ts`, `service.ts`).
- Pause/resume/cancel via `AbortController` (`orchestrator.ts`), tested including the abort-race case, and verified against the real Hermes Agent runtime this session (see Phase 02).
- Progress tracking (`updateMissionProgress`), tool-approval wait states (`WAITING_USER`) with a real awaited-`Promise` gate, tested end-to-end against a live local fixture (`tool-approval.test.ts`).
- Task decomposition model — added 2026-09-20: `src/server/missions/tasks/{types,repository,service}.ts` + `mission_tasks` table. A mission now has a persistent, dependency-capable (`parentId`/`dependsOn`/`sequence`) task record, not just a bare objective string.
- **Full budget enforcement** (three of four dimensions live, one honestly deferred): `Mission.budget.maxSteps` (one Hermes `onProgress` callback = one step), `Mission.budget.maxToolCalls` (total tool-call attempts across the mission), and `Mission.budget.maxRepeatedToolCalls` (a stuck-loop guard) are all checked live in `handleToolRequest`/`onProgress`. `Mission.budget.maxTokens` is checked **post-hoc**, against `HermesResult.usage.totalTokens` once Hermes reports it on completion — real Hermes Agent genuinely reports token usage (verified against its own source), so this is real enforcement, just necessarily after-the-fact since Hermes doesn't report usage incrementally. Any violation aborts the pipeline (or, for `maxTokens`, overrides the outcome post-completion), fails the mission, mirrors the root task to `failed`, and emits `mission.budget_exceeded` with `{dimension, limit, actual, reason}` metadata. `Mission.budget.maxUsd` is the one field left genuinely unenforced — no adapter anywhere reports a cost figure to check it against; honestly documented as blocked, not approximated.
- **Real checkpoints** — added 2026-09-21: `src/server/missions/checkpoints/{types,repository,service}.ts`, using the pre-existing but previously-dormant `checkpoints` table (mirrors the `tasks` module's own pattern). Wired into `pauseMission()`, capturing real state at the one clear checkpoint-worthy moment that exists today. `Mission.checkpoints` (the JSON column on the `missions` table) is superseded dead schema, explicitly documented as such rather than silently duplicated.

**Deliberately still out of scope for Phase 01 itself (gated on other phases, not a Phase 01 gap):**
- Real multi-step decomposition — today the orchestrator creates exactly **one** root task mirroring the whole objective; `dependsOn`/`parentId` exist structurally but nothing populates them with more than one node. Genuine decomposition requires planning intelligence that doesn't exist yet (Phase 07).
- `risks`, `unknowns`, `assumptions` — all declared on `Mission`, persisted as JSON columns, but no code path writes non-default values into any of them. Same dependency as decomposition (Phase 07).
- `budget.maxUsd` enforcement — gated on any adapter reporting a real cost figure, which none do today.
- Automatic/periodic checkpointing and resume-from-checkpoint logic — the checkpoint *record* now exists and is real, but using it to actually resume a mission from a specific captured point is a separate, larger feature not implied by "checkpoints exist."

**Risks:** a pre-existing race (not introduced this session) — if a mission is paused and then resumed before its own stale, aborted pipeline run reaches a terminal branch, the stale run can still legally transition `RUNNING → FAILED/COMPLETED` and stomp the state a fresh resumed run now owns. Documented in `orchestrator.ts`; not fixed here to avoid scope creep on an unrelated pre-existing issue. All budget accounting (`budgetState` map) is in-memory only, same as the pre-existing `controllers` map — does not survive a process restart. The repetition detector is a `JSON.stringify` structural-equality heuristic, not semantic equality — documented, not silently assumed away.

**Recommended next step:** none required for this phase — it's complete on its own honest terms. Anything further here (real decomposition, `maxUsd`) is really Phase 07 or a Hermes-contract change, not Phase 01 work.

**Verification performed 2026-09-20 session:** 5 new/extended automated tests (repository CRUD + orchestrator lifecycle mirroring, including a dedicated no-duplicate-on-resume case) — full suite 86/86 passing at the time. Live end-to-end check: created a real mission via `POST /api/missions` against the running dev server, then read `data/jarvis.sqlite` directly and confirmed a `mission_tasks` row was written with `status` correctly mirroring the mission's actual (`FAILED`) outcome.

**Verification performed 2026-09-21 session:** 9 new automated tests total (1 step-budget, 3 tool-call-budget, 3 token-budget, 1 checkpoint-pause assertion, plus 3 checkpoints-repository tests) — full suite 120/120 passing, `tsc --noEmit` clean, lint clean. Live checks against the real running dev server + real Hermes Agent: real cancellation reaching `CANCELLED`, and a real checkpoint row confirmed via direct SQLite query after pausing a real mission.

---

## Phase 02 — Real Hermes Integration

**Status: PARTIALLY COMPLETE** (upgraded sharply this session — health, execution, structured responses, and cancellation are now genuinely live-verified; but live tool-call testing surfaced a real, unresolved security-boundary gap — see below — so this phase is not close to done)

**Implemented & verified:** a stable contract (`src/server/hermes/contract.ts`) and three adapters behind one `HermesAdapter` interface, chosen by `factory.ts` based on env vars: `HermesMockAdapter` (default; explicitly labels all output `source: "mock"` and says so in the text itself), `HermesHttpAdapter` (generic HTTP+SSE, JARVIS's own bespoke contract — no runtime implementing this exact contract is installed anywhere, so it remains fixture-only), `HermesAgentAdapter` (targets a real, installed Hermes Agent runtime — github.com/NousResearch/hermes-agent v0.21.0 — via its `api_server` platform). All three support structured requests/responses, tool-call streaming, health checks, retries with backoff, timeouts, and cancellation. Fail-closed: no tool-request handler configured → deny by default.

**Real Hermes Agent, verified live this session (2026-09-21) — see JARVIS_CURRENT_STAGE.md for full detail:**
```
GET /api/hermes/health → {"mode":"real","healthy":true,"version":"0.21.0","latencyMs":3}
```
`.env.local`'s `HERMES_AGENT_URL`/`HERMES_AGENT_API_KEY` (configured since 2026-09-15) now point at a genuinely running, healthy process — the OmniRoute gateway and Hermes Agent's own `api_server` gateway were both brought up this session (real, previously-installed third-party software; not something JARVIS's code manages — see JARVIS_MASTER_MEMORY.md). Verified against the real running dev server, not just tests:
- A real mission ran end-to-end: real model output (`source: "hermes"`), real verification `PASS`.
- A real mission was cancelled mid-execution and genuinely reached `CANCELLED`.
- A real mission was paused and genuinely wrote a checkpoint row (Phase 01).

**Test coverage:** `http-adapter.test.ts` (generic contract, fixture-only — the runtime it targets isn't installed), `mock-adapter.test.ts`, `tool-approval.test.ts` (full pipeline through a fixture), and — new this session — `agent-adapter.test.ts` (11 tests, previously zero coverage for the one adapter now verified live). Its fixture's wire shapes were read directly from Hermes Agent's own installed Python source (`api_server.py`/`api_server_runs.py`), not inferred — all 11 passed on the first run.

**A real, important finding from live testing — not yet resolved:** gave a real mission an objective requiring a tool call ("list the files in your current working directory... actually call the tool"). It completed successfully with a real result, but the mission's full event history shows **zero** `tool.requested`/`approval.request`-derived events. Confirmed by reading Hermes Agent's own source (`tools/approval_context.py`, `tools/approval.py`) that its own internal tool-approval system only triggers for tool calls its own code explicitly flags — read-only actions apparently aren't flagged at all, independent of the configured `approvals.mode`. **This means JARVIS's execution-time tool gate (Phase 05) never saw this tool call and had no opportunity to allow/ask/deny it** — it only gates what Hermes Agent chooses to ask about. Deliberately not chased further by provoking a write/delete/execute-class tool call on the user's real filesystem to see whether those behave differently — that's a real side-effect risk, not something to do just to fill in a status table. See JARVIS_CURRENT_STAGE.md for full detail; this is now also flagged under Phase 05 below, since it's fundamentally a security-boundary gap, not just a testing gap.

**Still genuinely unverified against the live process specifically** (fixture-tested only): tool-call approval/denial for whatever subset of Hermes Agent's tools *do* get flagged (unknown which, given the above), explicit timeout handling, and error-frame handling. These are real gaps, not just formalities — a fixture proves the *parsing* is correct; it doesn't prove Hermes Agent's actual tools integrate cleanly with JARVIS's security gate in practice, and this session's live test suggests they may not, for at least one real tool category.

**Recommended next step:** investigate Hermes Agent's tool-flagging rules directly (which tool categories call `request_tool_approval()` at all, under what config) before attempting another live tool-call test — testing blind risked exactly what happened: a real action ran with no JARVIS visibility. Once the actual flagged/unflagged boundary is understood, decide whether JARVIS needs its own independent enforcement layer (e.g., a network/filesystem sandbox around the Hermes Agent process itself) rather than relying on Hermes Agent to self-report every tool call it makes.

---

## Phase 03 — World State + Events

**Status: COMPLETE** (for this phase's own scope)

**Implemented & verified:**
- **Events:** a fixed `EventType` union (34 literals, +2 this session: `mission.budget_exceeded`/`mission.checkpoint.created`), real persistence (SQLite `events` table, indexed on `mission_id`/`timestamp`), real replay (`GET /api/missions/:id/events/history`), real live streaming (`GET /api/missions/:id/events` — genuine SSE: history replay, live subscribe, 15s keep-alive, cleanup on abort). `emitEvent()` is the single write path (persist + publish), enforced by convention and code structure.
- **World State** — built 2026-09-21: `src/server/world-state/{types,service}.ts` + `GET /api/world-state`. `getWorldState()` reconciles all nine live domains (system, missions, files, spotify, schedule, weather, news, omnirouter, hermes) into one snapshot, each entry wrapped with real provenance (`{data, fetchedAt, knownCacheTtlMs, error}`). A domain failure (e.g. Spotify not connected) is isolated to its own entry — `error` set, `data: null` — never crashes the rest of the snapshot or fabricates a fallback. No new caching or polling layer: delegates to each domain's own existing cache discipline (system 5s, weather 15min, news 20min, the rest always-live).

**Verified live** (not just tests) against the real running dev server: `GET /api/world-state` returned real CPU/RAM/disk telemetry, the actual recent files on disk, a genuine isolated `"Spotify is not connected."` error, real weather, real live RSS news articles, real OmniRoute provider status matching the gateway actually running, and real Hermes health matching the live Hermes Agent gateway (see Phase 02).

**Tested:** `src/server/world-state/service.test.ts` (5 tests) — full reconciliation, per-domain error isolation, legitimate-empty-vs-error distinction, staleness threshold logic.

**Deliberately still out of scope for Phase 03 itself (correctly deferred, not a gap):** `memory.created/updated` and `knowledge.updated` exist in the `EventType` enum but nothing ever emits them — moot until Phase 10/11 (Memory, Knowledge) exist to emit them. No cross-domain *reasoning* over World State (e.g. "the system is under load AND a mission is running AND it's late" style correlation) — that's Phase 14 (Attention) territory, which needs a reconciled snapshot to reason over in the first place; this phase built the snapshot, not the reasoning.

**Recommended next step:** none required for this phase. World State is available for any future consumer (a mission's context assembly, Phase 14's attention manager, a UI dashboard) to read via `getWorldState()` or `GET /api/world-state` — building a specific consumer is that consumer's phase, not this one's.

---

## Phase 04 — Tool Registry + Capability System

**Status: NOT STARTED**

What exists is a 9-entry hardcoded tool→risk table inside `src/server/security/tool-policy.ts` (`DEFAULT_TOOL_RULES`) — enough to gate execution (see Phase 05) but not a registry: no name/description/parameters schema, no per-tool required-capabilities/supported-platforms/timeout/verification-method/rollback-support metadata, and no standalone module. Hermes reports free-text tool names; JARVIS matches them against this fixed list rather than Hermes requesting from a real capability catalog.

**Recommended next step:** design the capability metadata shape once there's a second real tool-executing surface beyond the current stub Quick Actions (i.e., alongside Phase 08/09 work), so the registry is designed against two real consumers instead of one imagined one.

---

## Phase 05 — Security + Policy + Permissions

**Status: PARTIALLY COMPLETE**

**Implemented & verified:** mission-creation-time policy (`security/policy.ts` — rejects empty objectives and contradictory allowed/forbidden-tool overlap); execution-time tool gate (`security/tool-policy.ts` — deterministic ALLOW/ASK/DENY table, high/critical risk *never* auto-allows even if pre-approved, unknown tools fail closed to ASK); a genuine append-only audit log (`audit_events` table, written on every mission-creation and tool decision); secret redaction in structured logs (`logging/logger.ts`, regex-based key redaction). All tested against every code path that actually reaches it.

**Newly discovered gap, 2026-09-21 (live testing against the real Hermes Agent, not a code regression — this was always true, just unverified until now):** the execution-time tool gate can only evaluate tool calls Hermes Agent chooses to report via an `approval.request` event. A live mission asking Hermes Agent to list files completed with a real result and **zero** tool-gate events — Hermes Agent's own internal approval system doesn't flag read-only actions at all (confirmed in its source), so JARVIS's tool gate — however correctly it's implemented and tested — never got a chance to run. This means the architecture's own stated invariant ("no tool should execute directly from raw model output... required flow: MODEL/HERMES → TOOL REQUEST → POLICY → EXECUTION") does **not** currently hold end-to-end for the real Hermes Agent integration; it holds only for the subset of tool calls Hermes Agent surfaces. See JARVIS_CURRENT_STAGE.md/Phase 02 for the live-test detail. Whether higher-risk tool categories (write/delete/execute) behave the same way is unknown and wasn't tested live (real side-effect risk on the user's actual filesystem, not something to probe casually).

**Still missing:** sandboxing, filesystem/network boundary enforcement beyond the tool-name gate (now known to matter more than previously assumed — see above), a secret vault (secrets currently live in `.env.local` only), formal blast-radius scoring, and treating external content (web pages, messages, documents) as untrusted — moot today since Phases 09/11/12 (browser, knowledge ingestion, WhatsApp) don't exist yet to bring in that content.

**Recommended next step:** this phase's priorities just changed. Before anything else here, characterize exactly which of Hermes Agent's tool categories self-report to JARVIS and which don't (read `tools/approval.py`'s rule set directly, don't infer from one test). If write/delete/execute-class tools *also* bypass JARVIS's gate, a sandboxing/boundary layer around the Hermes Agent process itself (not just a policy check inside JARVIS) becomes a near-term need, not a speculative one — reprioritize ahead of Phase 08/09's originally-assumed dependency.

---

## Phase 06 — Verification + Recovery

**Status: PARTIALLY COMPLETE**

**Implemented & verified:** `src/server/verification/verifier.ts` — deterministic, non-LLM verdicts (`PASS | FAIL | UNCERTAIN`). Execution failure or empty output → `FAIL`. Zero success criteria → `UNCERTAIN` (can never `PASS` on completion alone). Otherwise, every criterion must literally appear (case-insensitive substring) in the output, or it's `FAIL`, naming what's missing. This is a genuine floor — never a rubber stamp — and is exercised on every mission via the orchestrator, not just in isolation.

**Still missing:** state-change verification (checking actual system/file/tool-result state, not just output text), semantic verification, independent (second-opinion) verification, retry classification, idempotency guarantees, rollback, checkpoint-based recovery, failure diagnosis / Agent Autopsy.

**Recommended next step:** state-change verification is the natural next increment, but it has no real target to verify against until Phase 08/09 tools produce actual system-state changes beyond the current 7 Quick Actions.

---

## Phase 07 — Autonomous Planner + Replanner

**Status: NOT STARTED**

Missions are single-shot: one objective string to Hermes, one result back. No dependency-aware task graph execution, no replanning loop, no unknowns registry or assumption ledger in active use (the `Mission` fields exist but are always empty — see Phase 01), no stop-condition/budget enforcement, no loop/stuck detection.

**Dependencies:** meaningfully blocked on Phase 02 (a real, reachable Hermes runtime capable of actual reasoning) and benefits from Phase 01's task-DAG foundation (now in place) to have somewhere to put the plan once one exists.

**Recommended next step:** do not start until Phase 02 has a verified live Hermes connection — planning against a mock or an unreachable runtime can't be meaningfully tested.

---

## Phase 08 — Computer Control

**Status: NOT STARTED**

`src/server/actions/registry.ts` has 7 hardcoded local automation actions (open VS Code, take notes, screenshot via a PowerShell script, open Obsidian, summarize clipboard, lock the workstation, a welcome routine) — explicitly labeled in its own code comment as a "Phase 1 stub... proof the verify-then-execute pipeline works end to end." This is fixed-script OS automation, not general computer control (no mouse/keyboard driving, no accessibility-tree reading, no generalized capability surface).

**Recommended next step:** do this after Phase 04/05 have a real capability/permission model to gate it — general computer control is exactly the kind of high-blast-radius surface Phase 05's roadmap section warns about building without policy first.

---

## Phase 09 — Browser Control

**Status: NOT STARTED**

No code anywhere in `src/`.

---

## Phase 10 — Memory

**Status: NOT STARTED**

`memory_entries` table exists in `src/server/db/schema.ts` (`id, kind, content, mission_id, created_at`) but has zero corresponding repository/service code — nothing reads or writes it. Schema-only.

---

## Phase 11 — Knowledge + Graph RAG + Obsidian

**Status: NOT STARTED**

`knowledge_references` table exists in schema (`id, title, uri, mission_id, created_at`) but has zero corresponding code. Schema-only.

---

## Phase 12 — Communications + WAHA

**Status: NOT STARTED**

No code anywhere in `src/`.

---

## Phase 13 — Voice + Multimodal Perception

**Status: PARTIALLY COMPLETE**

**Implemented & verified:** browser-side Speech Recognition (Web Speech API, client-only) feeds a transcript to a real server-side check (`src/server/voice/passcode.ts`) that compares it against a `scrypt`-hashed passcode and issues a short-lived (60s) single-use unlock token — explicitly documented in its own code as proving "you know the phrase," not voice biometrics. Real, optional ElevenLabs TTS (`src/server/voice/tts.ts`) with browser `SpeechSynthesis` fallback.

**Still missing:** this is a one-shot passcode-unlock gate, not the roadmap's conversational pipeline (wake word → streaming STT → conversation state → JARVIS → TTS, with barge-in/interruption/silence detection/conversational continuity). No multimodal perception layer (screen/camera/OS fusion into World State) exists.

**Recommended next step:** none planned imminently; revisit once there's a reason to build a real conversational loop rather than the current unlock-gate use case.

---

## Phase 14 — Attention + Proactive JARVIS

**Status: NOT STARTED**

The clap-detector (`src/lib/clap/`) is a real, well-tested double-clap signal detector, but it's a manual trigger for a fixed welcome routine — not an attention system that decides IGNORE/MONITOR/MENTION/NOTIFY/INTERRUPT/CREATE MISSION based on urgency/context/notification budget.

---

## Phase 15 — Cloud + Multi-device

**Status: NOT STARTED**

Single local SQLite file (`data/jarvis.sqlite`), no cloud sync, no deployment config beyond a generic Next.js app.

---

## Phase 16 — Electron Desktop

**Status: NOT STARTED** *(correctly, per roadmap ordering — do not start before the core system is functionally complete)*

Plain Next.js web app (`next dev`/`next start`); no `electron` dependency.

---

## Phase 17 — Hardening + Reliability

**Status: NOT STARTED** *(as a dedicated phase)*

Incidental hardening already present from earlier phases: fail-closed tool defaults (Phase 05), secret redaction in logs (Phase 05), append-only audit log (Phase 05), never-fabricate discipline enforced in code (mock labeling, `UNCERTAIN` verdicts, `usage: []` instead of fake numbers). No Agent Flight Recorder/Autopsy, no chaos/fault-injection testing, no dependency/version tracking beyond `package.json`/`package-lock.json`.

---

## Summary: what to do next

**Phases 00, 01, and 03 are now COMPLETE** on their own honest terms. Phase 02 went from "configured but unreachable" to "genuinely live — health, execution, and cancellation verified against the real process" in this same session, the single biggest jump of the day. But live testing also surfaced a real, unresolved finding that changes the priority order below: **JARVIS's execution-time tool gate (Phase 05) does not see every tool call the real Hermes Agent makes** — confirmed live, not theoretical. That's now the most important open item in the whole system, ahead of anything that was previously next in line.

The next candidates, in priority order:

1. **Characterize and address the tool-gate bypass (Phase 05).** Read Hermes Agent's own approval rules directly to find exactly which tool categories self-report to JARVIS and which don't, before running any more live tool-call tests (testing blind is how this was found in the first place — a real, ungated action ran on the user's real filesystem). If higher-risk categories (write/delete/execute) also bypass JARVIS, a process-level sandbox/boundary around Hermes Agent becomes necessary, not speculative.
2. **Phase 07 (Autonomous Planner)** — now genuinely unblocked (Phase 02 has a real, reachable Hermes runtime capable of actual reasoning). This is what would let Phase 01's deliberately-deferred items (real decomposition, `risks`/`unknowns`/`assumptions`) become real. Worth sequencing *after* (1), since a planner that can call tools inherits the same gate-bypass exposure.
3. **Phase 06 (state-change verification)** — still has no real target to verify against until Phase 08/09 tools produce actual system-state changes beyond the current 7 Quick Actions; not yet actionable.
4. Everything past that (04 Tool Registry, 08 Computer Control, 09 Browser Control) is best sequenced once there's a second real tool-executing surface to design against, per each phase's own "recommended next step" above — and, given (1), probably after the sandbox question is settled rather than before.
