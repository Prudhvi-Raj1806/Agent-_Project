# JARVIS Phase Status

Last updated: 2026-09-21 (end of session), after Production Sprint 04 (Security Boundary Hardening — Phase 05). Earlier same-day updates: Production Sprint 03 (Verification v2 + Safe Recovery Foundations — Phase 06), Production Sprint 02 (ToolExecutor as the single side-effect execution boundary), Production Sprint 01 (Mission Integrity + Unified Tool Boundary, initial Tool Registry slice), real Hermes Agent verification (Phase 02), full budget enforcement + real checkpoints (Phase 01), and the World State reconciliation module (Phase 03). Before that, step-budget alone, then full budget dimensions; before that, 2026-09-17, after the Mission Task-DAG vertical slice.

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

**Risks:** All budget accounting (`budgetState` map) is in-memory only, same as the pre-existing `controllers` map — does not survive a process restart. The repetition detector is a `JSON.stringify` structural-equality heuristic, not semantic equality — documented, not silently assumed away.

**Fixed 2026-09-21 (Production Sprint 01) — pause/resume stale-execution race:** the race described in earlier snapshots of this doc (a paused, stale pipeline run resolving after resume and stomping the newer run's state) is now closed. `orchestrator.ts` gives every pipeline execution a run-generation number (`startNewRun`, checked via `isStaleRun` at every point a run's own adapter call could resolve after being superseded: the health check, the tool-request gate, the main `adapter.execute()` resolution on both its success and error paths, and the post-approval resume-to-RUNNING transition); `pauseMission`/`cancelMission` invalidate the current generation outright. Deliberately does not rely on `AbortSignal.aborted` alone, since that only proves *this run* was told to stop, not that it actually did — the regression test (`orchestrator.stale-run.test.ts`) reproduces the race with a Hermes adapter fake that ignores its abort signal entirely and confirmed (by temporarily removing the new guard) that the pre-fix code really did let a stale run overwrite a newer one's state.

**Recommended next step:** none required for this phase — it's complete on its own honest terms. Anything further here (real decomposition, `maxUsd`) is really Phase 07 or a Hermes-contract change, not Phase 01 work.

**Verification performed 2026-09-20 session:** 5 new/extended automated tests (repository CRUD + orchestrator lifecycle mirroring, including a dedicated no-duplicate-on-resume case) — full suite 86/86 passing at the time. Live end-to-end check: created a real mission via `POST /api/missions` against the running dev server, then read `data/jarvis.sqlite` directly and confirmed a `mission_tasks` row was written with `status` correctly mirroring the mission's actual (`FAILED`) outcome.

**Verification performed 2026-09-21 session:** 9 new automated tests total (1 step-budget, 3 tool-call-budget, 3 token-budget, 1 checkpoint-pause assertion, plus 3 checkpoints-repository tests) — full suite 120/120 passing, `tsc --noEmit` clean, lint clean. Live checks against the real running dev server + real Hermes Agent: real cancellation reaching `CANCELLED`, and a real checkpoint row confirmed via direct SQLite query after pausing a real mission.

**Verification performed 2026-09-21, Production Sprint 01 (later same day):** 2 new tests in `orchestrator.stale-run.test.ts` (the race reproduction + a normal-case control), using a controllable fake `HermesAdapter` that settles `execute()` manually and ignores its `AbortSignal` — the only way to deterministically force the "resolves after being superseded" timing. Full suite 145/145 passing (up from 120), `tsc --noEmit` clean, lint clean, `next build` succeeds.

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

**Re-verified live, Production Sprint 05 (2026-09-22, a separate session on the same machine):** confirms nothing above has silently drifted. Health, a real PASS mission, a real FAILED-on-inconclusive-verification mission, real cancellation, and a real unreachable-Hermes failure were all re-run against a freshly-started real stack (the OmniRoute gateway and Hermes Agent gateway are not persistent across sessions — see JARVIS_MASTER_MEMORY.md's "Local real-infrastructure dependencies" — so this had to be re-proven, not assumed). The read-only-tool-call visibility gap reproduced identically: zero gate events for a real file-listing tool call. Live DENY was again not attempted, for the same real-side-effect-risk reason as before. See JARVIS_CURRENT_STAGE.md's Production Sprint 05 section for full detail. No code changed this sprint — this was verification-only.

**Recommended next step (superseded below — see Production Sprint 06):** investigate Hermes Agent's tool-flagging rules directly (which tool categories call `request_tool_approval()` at all, under what config) before attempting another live tool-call test — testing blind risked exactly what happened: a real action ran with no JARVIS visibility. Once the actual flagged/unflagged boundary is understood, decide whether JARVIS needs its own independent enforcement layer (e.g., a network/filesystem sandbox around the Hermes Agent process itself) rather than relying on Hermes Agent to self-report every tool call it makes.

**Investigated and partially fixed, Production Sprint 06 (2026-09-22).** Read Hermes Agent's own installed source directly (not guessed): there is no per-tool risk classification anywhere in its tool registry — approval is command/path pattern matching (`tools/approval_detection.py`'s `DANGEROUS_PATTERNS`/`HARDLINE_PATTERNS` for shell; a narrow sensitive-path allowlist for writes), and the `api_server` platform is **hardcoded** (`tools/approval_context.py:134`'s `_UNATTENDED_APPROVAL_PLATFORMS`, not a config value) into an unattended context that structurally bypasses the interactive approval round-trip almost entirely. Live tests this sprint (read, write, and — newly, a harmless shell command, the one category Sprint 05 declined to test) confirmed the gap is **not** limited to read-only calls: ordinary writes and shell commands also produce zero `tool.requested` events. But the same investigation found Hermes Agent's api_server also emits a second, unconditional `tool.started`/`tool.completed` event pair for every tool call, independent of approval status — verified on the raw wire for all three categories. JARVIS's own contract (`hermes/contract.ts`'s `HermesToolEventFrame`, `hermes/types.ts`'s `onToolEvent` callback, `missions/orchestrator.ts`'s existing handler, the `EventType` union, and the mission-inspector UI) already fully supported consuming this — only `hermes/agent-adapter.ts` never translated Hermes's real frames into a call to it. Fixed this sprint: `agent-adapter.ts` now forwards `tool.started`/`tool.completed` through the existing `onToolEvent` path, verified live end-to-end against the real running stack (a real `tool.started`/`tool.completed` pair, correctly correlated, now appears in a real mission's event history). New regression test in `agent-adapter.test.ts`. **This closes JARVIS's tool-call visibility gap, not its governance gap** — `tool.started` does not pause Hermes for a decision the way `approval.request` does, so JARVIS can now audit what Hermes did but still cannot allow/ask/deny a call Hermes's own approval system doesn't already choose to flag. See JARVIS_CURRENT_STAGE.md's Production Sprint 06 section for the full capability table, trust boundary, and configuration findings.

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

**Status: PARTIALLY COMPLETE** (Production Sprint 01 added the initial registry slice; Production Sprint 02, same day, made `tools/executor.ts` the single governed boundary for every tool-executing surface — see below for what's still deliberately narrow)

**Implemented & verified:** `src/server/tools/{types,registry,executor}.ts`. `types.ts` defines the `ToolDefinition` shape (id, description, risk, capabilities, permission, inputSchema, sideEffects, verificationStrategy, `execute()`). `registry.ts` builds the registry from `src/server/actions/registry.ts`'s `ACTION_REGISTRY` — every Quick Action is represented as a tool, with `risk` derived from `security/tool-policy.ts`'s own rule table rather than a second, independently-maintained mapping. `executor.ts` exports:
- `executeTool(id, verifyToken)` — Quick Actions' real execution boundary: Request → Tool Registry (lookup) → Policy → Permission (voice-verification token, only reached on ASK) → Execution (`tool.execute()`) → Audit.
- `evaluateGovernedToolCall(request, auditTarget)` / `recordToolCallResolution(auditTarget, approved, reason)` — added Production Sprint 02 (2026-09-21). The shared policy-evaluation-and-audit primitives now used by **both** `executeTool` above and `missions/orchestrator.ts`'s `handleToolRequest` (the gate for every Hermes-mediated tool call). `evaluateGovernedToolCall` calls `evaluateToolRequest` and audits an immediate ALLOW/DENY verdict; `recordToolCallResolution` audits an ASK verdict once it resolves (a token for Quick Actions, a human `WAITING_USER` decision for Hermes calls) — kept separate because the two surfaces' ASK-resolution mechanics and actor semantics genuinely differ, and unifying them would move mission-state logic into `tools/executor.ts`, which the sprint's own scope explicitly forbids.

`src/server/actions/service.ts`'s `runQuickAction` — and, through it, the Quick Action API route — is a thin wrapper around `executeTool`. Tested: `src/server/tools/registry.test.ts` (registry shape/derivation), `src/server/tools/executor.test.ts` (added Production Sprint 02 — `evaluateGovernedToolCall`/`recordToolCallResolution` directly, ALLOW/ASK/DENY), the full `actions/service.test.ts` suite (13 tests, Quick Actions through `executeTool`), and `src/server/missions/tool-request-boundary.test.ts` (added Production Sprint 02 — a structural regression test that mocks `tools/executor.ts` out and asserts the real `security/tool-policy.ts`'s `evaluateToolRequest` is never called directly by `missions/orchestrator.ts`, proving Hermes tool calls reach policy only through the executor).

**Deliberately still narrow (real limits on what "Tool Registry" means today, not oversights):** only Quick Actions are `ToolDefinition` registry entries with a local `execute()` — and that will likely stay true, not just "not yet done." Hermes's tools (`read_file`, `write_file`, `execute_command`, ...) are executed by Hermes's own runtime, never by JARVIS, so adding them to the registry as locally-executable tools would misrepresent the architecture; what Production Sprint 02 actually closed was the *duplicate policy/audit call site*, not a missing registry entry for each Hermes tool. No input schema exists yet (every current registered tool is zero-argument); no required-capabilities/permission model beyond a single "owner" actor; no timeout/rollback-support metadata; no verification strategy beyond "self-reported" (Phase 06's gap, not Phase 04's).

**Also investigated, Production Sprint 02 (Section 7 — Hermes tool visibility):** Hermes receives no tool list from JARVIS at all today — not a hardcoded or incomplete one. `mission.allowedTools`/`forbiddenActions` default to `[]` and are only ever set by whatever a mission-creation API caller passes explicitly (confirmed: no UI lets an owner pick from a list; `mission-inspector.tsx` only *displays* these arrays). `HermesAgentAdapter.execute()` (the real adapter) doesn't forward `allowedTools` to Hermes Agent at all — only the generic `HermesHttpAdapter` (fixture-only, no real runtime speaks its contract) includes it in the submit payload. Since there is no static/incomplete list to correct, and building one would be exactly the "huge dynamic tool-discovery system" the sprint said not to build, no code change was made here — this is a documented, honest finding, not a fix.

**Recommended next step:** none required for this phase's current scope. A future increment could give Hermes tool names their own lightweight identity distinct from Quick Action ids (today `DEFAULT_TOOL_RULES` already covers both namespaces in one table, which is sufficient) — worth doing only once a concrete need appears (e.g. a UI that lets an owner pre-approve specific Hermes tools per mission).

---

## Phase 05 — Security + Policy + Permissions

**Status: PARTIALLY COMPLETE**

**Implemented & verified:** mission-creation-time policy (`security/policy.ts` — rejects empty objectives and contradictory allowed/forbidden-tool overlap); execution-time tool gate (`security/tool-policy.ts` — deterministic ALLOW/ASK/DENY table, high/critical risk *never* auto-allows even if pre-approved, unknown tools fail closed to ASK); a genuine append-only audit log (`audit_events` table, written on every mission-creation and tool decision); secret redaction in structured logs (`logging/logger.ts`, regex-based key redaction). All tested against every code path that actually reaches it.

**Fixed 2026-09-21 (Production Sprint 01) — Quick Actions policy/audit bypass closed.** Before this sprint, `src/app/api/actions/[id]/run/route.ts` called `ACTION_REGISTRY[id].run()` directly — a second execution path that never touched `tool-policy.ts` or `audit.ts`, gated only by a hardcoded `action.risk === "risky"` check for one specific action. Every Quick Action id is now a `toolName` in `DEFAULT_TOOL_RULES` (extended with 7 new entries) and is policy-evaluated + audited via `src/server/tools/executor.ts`'s `executeTool` before it runs (see Phase 04). DENY blocks execution; an ASK verdict requires the pre-existing voice-verification token (now driven by the policy's verdict, not the action's own hardcoded risk field) before it may run; every decision — allowed or denied — is audited. `src/server/actions/registry.ts`'s `summarize-clipboard` action's direct `fetch` to `api.anthropic.com` (with a hardcoded, since-stale model id) is also closed — see Phase 02's OmniRouter note and `src/server/providers/completion.ts`. Tested: `actions/service.test.ts` (13 tests) covering all 7 actions' policy/audit/execution wiring, DENY (forced, since none of today's 7 actions are DENY-classified — the wiring itself is what's under test), ASK with a missing/invalid/valid/already-consumed token, and an honest execution failure.

**Fixed 2026-09-21 (Production Sprint 02) — the remaining dual call-site into `tool-policy.ts` closed.** Production Sprint 01 left one honestly-documented gap: `missions/orchestrator.ts`'s `handleToolRequest` (the gate for every Hermes-mediated tool call) still called `evaluateToolRequest` and `recordAudit` directly and independently of `executeTool`'s equivalent logic — two call sites reaching one shared rule table, not one call site. `handleToolRequest` now calls `tools/executor.ts`'s `evaluateGovernedToolCall` (policy + immediate-verdict audit) and `recordToolCallResolution` (audit for an ASK's eventual resolution) — the exact same primitives `executeTool` uses for Quick Actions — instead of reaching into `tool-policy.ts`/`audit.ts` itself. Behavior is unchanged (same events, same mission-state transitions, same audit rows — verified by the full pre-existing test suite passing unmodified, including `missions/tool-approval.test.ts` and `missions/tool-call-budget.test.ts`), only the code path changed. New regression coverage: `tools/executor.test.ts` (`evaluateGovernedToolCall`/`recordToolCallResolution` directly) and `missions/tool-request-boundary.test.ts` (mocks `tools/executor.ts` out and asserts the real `evaluateToolRequest` is never called directly by the orchestrator — a structural proof the dual call-site cannot silently return). This does not touch or resolve the still-open gap described immediately below (Hermes Agent's own incomplete self-reporting of tool calls) — that is a different problem, upstream of JARVIS's gate entirely; this fix is about JARVIS's own code having exactly one path to its gate, not about Hermes Agent reporting every call it makes.

**Newly discovered gap, 2026-09-21 (live testing against the real Hermes Agent, not a code regression — this was always true, just unverified until now):** the execution-time tool gate can only evaluate tool calls Hermes Agent chooses to report via an `approval.request` event. A live mission asking Hermes Agent to list files completed with a real result and **zero** tool-gate events — Hermes Agent's own internal approval system doesn't flag read-only actions at all (confirmed in its source), so JARVIS's tool gate — however correctly it's implemented and tested — never got a chance to run. This means the architecture's own stated invariant ("no tool should execute directly from raw model output... required flow: MODEL/HERMES → TOOL REQUEST → POLICY → EXECUTION") does **not** currently hold end-to-end for the real Hermes Agent integration; it holds only for the subset of tool calls Hermes Agent surfaces. See JARVIS_CURRENT_STAGE.md/Phase 02 for the live-test detail. Whether higher-risk tool categories (write/delete/execute) behave the same way is unknown and wasn't tested live (real side-effect risk on the user's actual filesystem, not something to probe casually). Note this is orthogonal to the Quick Actions fix above — Quick Actions are owner-invoked directly, not Hermes-mediated, so they were never exposed to this particular gap; they had their own, now-closed, gap instead.

**Newly discovered gap, 2026-09-21 (live testing against the real Hermes Agent, not a code regression — this was always true, just unverified until now):** the execution-time tool gate can only evaluate tool calls Hermes Agent chooses to report via an `approval.request` event. A live mission asking Hermes Agent to list files completed with a real result and **zero** tool-gate events — Hermes Agent's own internal approval system doesn't flag read-only actions at all (confirmed in its source), so JARVIS's tool gate — however correctly it's implemented and tested — never got a chance to run. This means the architecture's own stated invariant ("no tool should execute directly from raw model output... required flow: MODEL/HERMES → TOOL REQUEST → POLICY → EXECUTION") does **not** currently hold end-to-end for the real Hermes Agent integration; it holds only for the subset of tool calls Hermes Agent surfaces. See JARVIS_CURRENT_STAGE.md/Phase 02 for the live-test detail. Whether higher-risk tool categories (write/delete/execute) behave the same way is unknown and wasn't tested live (real side-effect risk on the user's actual filesystem, not something to probe casually).

**Fixed 2026-09-21 (Production Sprint 04) — hardening within this phase's actual reach.** Sprint 04 was chartered to close the Hermes-Agent-self-reporting gap above if possible. It re-verified (by re-reading `hermes/agent-adapter.ts`'s `stream()` method, not by re-running the same live test) that the gap is unchanged and current: `callbacks.onToolRequest` — the entry point to JARVIS's governed gate — is invoked from exactly one `switch` case, `"approval.request"`; there is no other path in JARVIS's own code that could intercept a tool call Hermes Agent never reports. **Conclusion, stated precisely: this cannot be closed by changing JARVIS's own execution boundary**, because a call Hermes Agent doesn't report never reaches JARVIS as a request in the first place — no amount of "policy runs before execution" logic inside `tools/executor.ts` can gate a call it's never told about. Actually closing it requires either Hermes Agent's own (external, not-this-repo) approval system reporting more tool categories, or JARVIS independently sandboxing/observing the Hermes Agent process's side effects without relying on its self-reporting — the latter is a process-boundary/sandboxing system, explicitly out of scope for Sprint 04 (and every sprint through 04) per its own non-negotiable rules ("do not build Computer/Browser Control," "do not introduce speculative infrastructure"). Building a partial version of that boundary anyway, just to say something changed, would be the kind of invented security guarantee the project's own Honesty Rule forbids. So instead, Sprint 04 did what was actually in its reach:
- A full repository-wide re-audit (fetch/exec/spawn/writeFile/ACTION_REGISTRY/`.execute()` search) confirmed no *other*, JARVIS-controlled side-effect path bypasses policy — the only `.execute()` on a `ToolDefinition` is inside `tools/executor.ts` itself; the only direct model-provider call is the sanctioned `providers/completion.ts` abstraction.
- `tools/executor.ts`'s `evaluateGovernedToolCall` now fails closed to an **explicit, audited** DENY if the policy evaluation itself throws (a malformed request, an unexpected internal error) — previously an accidental side effect of control flow (the throw incidentally prevented execution) with no audit trail and no defined verdict, now a designed, tested property.
- The single-call-site invariant (a "gate cannot be bypassed" property, not the Hermes self-reporting property) now has a repository-wide structural regression test (`security/governed-boundary.test.ts`), not just the one file-scoped behavioral test Sprint 02 added.
- `audit_events` append-only is now DB-enforced via SQLite triggers, not just an application convention (`security/audit.test.ts` proves a direct SQL UPDATE/DELETE against the table — bypassing `recordAudit` — is rejected). Honestly scoped: this defends the ordinary application-code path, not raw filesystem tampering.
- `logging/logger.ts`'s secret redaction is now value-based as well as field-name-based — closing the specific gap the prior audit named (a real secret logged under an innocuous key, or embedded in a larger string, previously passed through unredacted).

See `JARVIS_CURRENT_STAGE.md`'s Production Sprint 04 section for full detail, including the honest reasoning for why the headline gap stays open and a new, separately-documented (not fixed) finding: Spotify playback control routes are real external side effects with no policy/audit gate at all, currently out of scope because no agentic/Hermes-reachable path to them exists.

**Still missing:** sandboxing, filesystem/network boundary enforcement beyond the tool-name gate (confirmed, not just assumed, as of Sprint 04 — closing it requires exactly this), a secret vault (secrets currently live in `.env.local` only; value-based redaction in logs is a narrower, real mitigation added this sprint, not a vault), formal blast-radius scoring, and treating external content (web pages, messages, documents) as untrusted — moot today since Phases 09/11/12 (browser, knowledge ingestion, WhatsApp) don't exist yet to bring in that content. Also newly documented (Sprint 04, not previously tracked): Spotify playback control routes have no policy/audit gate at all — low priority while no agentic path to them exists, but a real gap if one is ever added.

**Recommended next step (superseded below — see Production Sprint 06):** the Hermes-Agent-self-reporting gap is now understood precisely enough that the only real next move is a scoped decision, not more investigation: either accept the current boundary's limits explicitly (document it as a permanent, load-bearing caveat on any future Hermes-mediated capability) or commission a dedicated sandboxing/process-boundary phase for the Hermes Agent runtime itself — which is a meaningfully sized effort (new infrastructure, not a policy tweak) and should be scoped and approved as its own phase, not folded into a future "hardening" sprint's spare capacity the way this one was asked to.

**Investigated to a conclusive trust-boundary decision, Production Sprint 06 (2026-09-22).** The gap is real, source-verified (not guessed), and — for the api_server platform specifically — **not closeable by JARVIS-side configuration alone**: `tools/approval_context.py:134`'s `_UNATTENDED_APPROVAL_PLATFORMS` frozenset, which routes api_server around the interactive approval round-trip, is hardcoded in Hermes Agent's own installed Python source, not a config key either JARVIS or its operator can flip. Live testing this sprint extended Sprint 05's single read-only test to write and shell-command categories — both also bypass the gate entirely in this installation (`terminal.backend: local`, no `approvals:` block configured). Genuinely available, real, but *unused* mitigations exist on the Hermes side (`command_allowlist`, `approvals.deny` — unconditional, shell-command-scoped) and were not tightened this sprint. Separately, this sprint closed the **visibility** half of the gap (not the governance half) by wiring `hermes/agent-adapter.ts` to forward Hermes's already-existing, always-on `tool.started`/`tool.completed` events through JARVIS's pre-existing (previously unused, by this adapter) `onToolEvent` observation path — every read/write/shell-command call Hermes Agent makes via api_server is now recorded in JARVIS's real event history with tool name, an argument preview, duration, and success/failure, even though JARVIS still cannot pre-approve or block it. **Formal decision, stated precisely: Planner/Replanner autonomy remains blocked on this gap** — visibility is necessary but not sufficient for safe delegation; see JARVIS_CURRENT_STAGE.md's Production Sprint 06 section for the full trust boundary, capability table, and the two concrete paths (tighten Hermes's own config to mirror JARVIS's risk taxonomy, or scope Planner's autonomy to what JARVIS can actually govern) that would unblock it.

---

## Phase 06 — Verification + Recovery

**Status: PARTIALLY COMPLETE** (substantially advanced by Production Sprint 03, 2026-09-21 — the execution-vs-verification distinction is now real and enforced, plus one genuine observation-backed postcondition; semantic/independent verification, retry, rollback, and Agent Autopsy remain explicitly out of scope)

**Implemented & verified (pre-Sprint-03):** `src/server/verification/verifier.ts` — deterministic, non-LLM verdicts (`PASS | FAIL | UNCERTAIN`). Execution failure or empty output → `FAIL`. Zero success criteria → `UNCERTAIN` (can never `PASS` on completion alone). Otherwise, every criterion must literally appear (case-insensitive substring) in the output, or it's `FAIL`, naming what's missing. Unchanged in behavior this sprint — now additionally tags every result `strategy: "text-match"`.

**Implemented & verified (Production Sprint 03, 2026-09-21):**

- **Execution ≠ verified outcome, enforced at the mission level.** `src/server/missions/completion-policy.ts`'s `decideMissionCompletion` is the one function that decides a mission's COMPLETED/FAILED outcome from a `VerificationResult`. Before this sprint, `missions/orchestrator.ts`'s completion block treated `verdict !== "FAIL"` as "complete the mission" — meaning a genuinely `UNCERTAIN` verdict (Hermes succeeded, but there was insufficient evidence to call it verified) silently reached `COMPLETED`, indistinguishable from a real `PASS`. Fixed: `UNCERTAIN` with declared success criteria now fails the mission (classified `VERIFICATION_UNCERTAIN`, distinct from `VERIFICATION_FAILED`); `UNCERTAIN` with no criteria declared still completes (the one deliberate, documented exception — a mission that never asked to be verified never failed to verify, preserving all pre-existing tests and behavior for missions with no verifiable postcondition).
- **Execution ≠ verified outcome, enforced at the tool level.** `src/server/tools/verification.ts`'s `verifyToolOutcome` runs a tool's own declared `verify` function, if it has one — deliberately outside `tools/executor.ts` (ToolExecutor stays execution-only; ADRs: don't make it responsible for verification logic). A tool with no `verify` function (the "self-reported" case — most Quick Actions) gets `null` back, not a fabricated `VerificationResult` built from its bare `{ok, message}` — a self-report and an independent observation must never look the same shape to a caller.
- **One real, observation-backed postcondition, in production** (Section 7's explicit ask): `take-notes` and `take-screenshot` (`src/server/actions/registry.ts`) now declare `verificationStrategy: "file-exists"` and a real `verify` function that checks, via `node:fs/promises`, whether the file the action was supposed to produce genuinely exists on disk — not just that the shell command that wrote it returned exit 0. `take-screenshot`'s check uses the exact path the action itself reported (`result.detail`); if no path was reported at all, the verdict is honestly `UNCERTAIN` (nothing to observe), never guessed as PASS or FAIL. Wired into `actions/service.ts`'s `runQuickAction`, which now runs `verifyToolOutcome` after a successful `executeTool` call and attaches the result to the outcome (skipped entirely for a blocked/unknown action — nothing was executed, nothing to observe).
- **Minimal failure classification** (Section 8): `src/server/verification/classification.ts` — `TRANSIENT | PERMANENT | POLICY_DENIED | PERMISSION_DENIED | VERIFICATION_FAILED | VERIFICATION_UNCERTAIN | UNKNOWN`. Every classifier prefers `UNKNOWN` over guessing (e.g. "no healthy provider" and "Hermes unhealthy" are both classified `UNKNOWN` — the evidence doesn't distinguish a momentary outage from a permanent misconfiguration). Real signals are used where they exist: `HermesError.retryable` → `TRANSIENT`/`PERMANENT`; a tool-policy `DENY` or a budget violation → `POLICY_DENIED`; a missing/invalid voice-verification token → `PERMISSION_DENIED` (distinct from a blanket policy denial); a verification `FAIL`/`UNCERTAIN` → `VERIFICATION_FAILED`/`VERIFICATION_UNCERTAIN`. Attached as event/outcome metadata (`mission.failed`'s `classification` field, `ToolExecutionOutcome.classification`) — not a new logging system, not a retry engine; no automatic retries exist anywhere. Explicitly meant to be *usable later* by a future Planner/Replanner, not consumed by one yet.
- **Execution-identity foundation** (Section 9): `src/server/verification/execution-identity.ts` — a stable key (`missionId:taskId:toolCallId`) built entirely from IDs that already exist. No new database, no dedup/suppression logic, no automatic retry — just a deterministic name for "this specific execution attempt" that a future idempotency system could key off of. Attached to the tool-call budget-violation event and to `pauseMission`'s checkpoint state.
- **Checkpoint integration** (Section 10): `pauseMission`'s existing checkpoint (Phase 01) now also captures the mission's current `verification` result (if any) and its execution-identity key — recovery-relevant context, using the existing checkpoint mechanism, no second one built.

**Still missing (all deliberately out of scope for this sprint, per its own rules):** semantic verification (an LLM/model-based "does this look successful?" check — explicitly forbidden this sprint), independent (second-opinion) verification, automatic retries (execution-identity exists to support this *later*, nothing retries today), idempotency *enforcement* (only the identity key exists — nothing suppresses a repeated execution), rollback, a full recovery engine, failure diagnosis / Agent Autopsy, state-change verification for anything beyond the two file-observation cases (no process-existence or other system-state observation is wired into production — see below), and a Planner/Replanner to actually consume the failure classification.

**A deliberately scoped-down piece, documented rather than built:** the architecture's own example (`OPEN_APP Spotify` → observe the process exists → verify) implies process-existence observation for the app-launching Quick Actions (`open-vscode`, `open-obsidian`, `welcome-routine`). This was **not** wired into production this sprint — `systeminformation`'s process-listing call is not one of the calls this project has benchmarked as fast (the 2026-09-20 performance sprint found several `systeminformation` calls taking 1-4s each on this machine, backed by WMI queries), and using it as a synchronous per-action verification step risks reintroducing exactly the "repeated system scans" / unbounded-latency pattern Sprint 03's own rules warn against (Section 15) without a benchmark proving otherwise. Filesystem observation (`fs.access`) carries no such risk, which is why it — not process observation — became the one real production postcondition.

**Recommended next step:** if process-existence observation is wanted for the app-launching actions, benchmark `systeminformation`'s process-listing call on this hardware first (matching the rigor of the 2026-09-20 perf sprint) before wiring it into production verification — do not add it speculatively. Otherwise, state-change verification for anything beyond files has no real target until Phase 08/09 build genuine computer/browser control with richer, already-fast observation primitives.

---

## Phase 07 — Autonomous Planner + Replanner

**Status: NOT STARTED**

Missions are single-shot: one objective string to Hermes, one result back. No dependency-aware task graph execution, no replanning loop, no unknowns registry or assumption ledger in active use (the `Mission` fields exist but are always empty — see Phase 01), no stop-condition/budget enforcement, no loop/stuck detection.

**Dependencies:** meaningfully blocked on Phase 02 (a real, reachable Hermes runtime capable of actual reasoning) and benefits from Phase 01's task-DAG foundation (now in place) to have somewhere to put the plan once one exists.

**Dependency note, Production Sprint 06 (2026-09-22):** Phase 02 now has a verified live Hermes connection, but that alone does not unblock this phase. Planner implementation remains blocked on the unresolved Hermes side-effect capability boundary (Phase 02/05's tool-visibility gap): a Planner that delegates missions to Hermes would be delegating to a runtime that can independently read, write, and run shell commands with no JARVIS-side pre-execution governance for any of those categories in this installation (source-verified — see JARVIS_CURRENT_STAGE.md's Production Sprint 06 section). Sprint 06 closed the *visibility* half of that gap (JARVIS can now audit every such call after or concurrently with the fact) but explicitly not the *governance* half. Do not start Planner until either Hermes's own approval configuration is tightened to mirror JARVIS's risk taxonomy, or Planner's own autonomy is deliberately scoped to what JARVIS can actually govern today.

**Recommended next step:** do not start until Phase 02 has a verified live Hermes connection — planning against a mock or an unreachable runtime can't be meaningfully tested. (Now satisfied — see the dependency note above for the remaining, different blocker.)

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

Incidental hardening already present from earlier phases: fail-closed tool defaults (Phase 05), value-based + field-name-based secret redaction in logs (Phase 05, extended Production Sprint 04), DB-enforced append-only audit log (Phase 05, DB-level as of Production Sprint 04 — previously application-convention only), never-fabricate discipline enforced in code (mock labeling, `UNCERTAIN` verdicts, `usage: []` instead of fake numbers). No Agent Flight Recorder/Autopsy, no chaos/fault-injection testing, no dependency/version tracking beyond `package.json`/`package-lock.json`.

---

## Summary: what to do next

**Phases 00, 01, and 03 are COMPLETE** on their own honest terms. Phase 02 is genuinely live (health, execution, cancellation all verified against the real Hermes Agent process). Phase 06 (Verification + Recovery) made a real, substantial jump in Sprint 03 — the execution-vs-verified-outcome distinction is now enforced in code, not just documented as an aspiration, plus one real observation-backed postcondition, failure classification, and an execution-identity foundation — but remains PARTIALLY COMPLETE by design (no semantic verification, no retries, no recovery engine, per that sprint's own explicit non-goals).

**The most important open item in the whole system is now precisely characterized, not just flagged: JARVIS's execution-time tool gate (Phase 05) cannot see a tool call the real Hermes Agent never reports, and this cannot be fixed by changing JARVIS's own code.** Production Sprint 04 was specifically chartered to close this and, after re-verifying it against the current adapter source, concluded honestly that doing so requires infrastructure (a sandbox/process boundary around Hermes Agent, independent of its self-reporting) explicitly out of scope for that sprint. Sprint 04 instead hardened everything within its actual reach: a repo-wide re-audit found no other bypass, the shared policy-evaluation call now fails closed explicitly and audited (not by accident) on internal errors, the single-call-site invariant has a repository-wide structural regression test, audit append-only is DB-enforced, and secret redaction is value-based as well as field-name-based. See that sprint's section above and in `JARVIS_CURRENT_STAGE.md` for full detail.

The next candidates, in priority order:

1. **Decide the Hermes-Agent-sandbox question (Phase 05).** This is no longer "investigate the bypass" — Sprint 04 did that as far as it can be done without building the fix. What remains is a real scoping/approval decision: commission a dedicated sandboxing/process-boundary phase for the Hermes Agent runtime (a meaningfully sized infrastructure effort, not a policy tweak), or explicitly accept the current boundary's limits as a permanent, documented caveat on any future Hermes-mediated capability. Either is honest; silently deferring it again is not.
2. **Phase 07 (Autonomous Planner)** — genuinely unblocked (Phase 02 has a real, reachable Hermes runtime; Phase 06 has real verification and failure classification for a planner to react to). Worth sequencing *after* (1) is at least decided, since a planner that can call tools inherits the same gate-bypass exposure, and once it exists, Phase 01's deliberately-deferred items (real decomposition, `risks`/`unknowns`/`assumptions`) and genuine retry logic (execution-identity is only a foundation today) become real.
3. **Phase 06 remainder** — process-existence observation for app-launching Quick Actions, gated on first benchmarking `systeminformation`'s process-listing call on this hardware (see Phase 06 above) — do not wire it in speculatively. Otherwise, further state-change verification has no real target until Phase 08/09 build genuine computer/browser control.
4. **Bring Spotify's playback-control routes into the Tool Registry / policy model** (found during Sprint 04's audit, low urgency today) — only if Hermes or any future agentic surface gains a reason to reach them; not urgent while they remain owner-direct-UI-only.
5. Everything past that (08 Computer Control, 09 Browser Control) is best sequenced once there's a second real tool-executing surface to design against, per each phase's own "recommended next step" above — and, given (1), probably after the sandbox question is settled rather than before.
