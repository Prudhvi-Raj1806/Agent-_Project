# JARVIS Current Stage

Snapshot of actual implementation state as of 2026-09-21 (end of session), after real Hermes verification (Phase 02), full budget enforcement + checkpoints (Phase 01), and the World State reconciliation module (Phase 03). Prior snapshot was earlier the same day, after step-budget enforcement alone; before that, 2026-09-20, after the Performance Stabilization sprint. This document is a factual snapshot, not a plan — see `JARVIS_PHASE_STATUS.md` for phase-by-phase roadmap tracking and `JARVIS_MASTER_MEMORY.md` for durable architecture decisions.

Labels used below follow the project's Honesty Rule: **REAL** (genuinely implemented and exercised), **MOCK** (explicitly simulated, self-labeled as such), **SCHEMA-ONLY** (table exists, no code touches it), **UNVERIFIED** (real code path exists but hasn't been proven against a live external dependency).

## Build/test health (verified 2026-09-21, end of session)

- `npm test` — **120 passing (22 files)**, up from 93 at the start of the session. New files: `tool-call-budget.test.ts`, `token-budget.test.ts`, `agent-adapter.test.ts`, `world-state/service.test.ts`, `checkpoints/repository.test.ts`.
- `npx tsc --noEmit` — clean, no errors.
- `npm run lint` — clean, no warnings.
- `npm run build` — succeeds (`next build`, Turbopack, all 48 routes generated, including the new `/api/world-state`).
- Live verification this session was against the **real running dev server and real local infrastructure**, not just unit tests — see below.

## Real Hermes Agent, verified live (Phase 02) — 2026-09-21

**This is the headline change of the session:** for the first time, `HERMES_AGENT_URL`/`HERMES_AGENT_API_KEY` (configured in `.env.local` since 2026-09-15, previously unreachable) point at a genuinely running, healthy, real Hermes Agent — not a fixture, not a mock.

**What was actually running (nothing JARVIS's own code manages — see JARVIS_MASTER_MEMORY.md's "Local real-infrastructure dependencies"):**
1. `omniroute serve` — the real OmniRoute model-routing gateway (v3.8.50), port 20128. Was not running at session start; brought up this session. Takes ~20-25s to report healthy after starting.
2. `hermes gateway run` — the real Hermes Agent gateway (v0.21.0, `api_server` platform), port 8642, configured to route model calls through (1). Was not running at session start; brought up this session. Config (`API_SERVER_KEY`, matching `HERMES_AGENT_API_KEY`) was already correctly set up from 2026-09-15 — only the process itself wasn't running.

**Verified, against the real stack, via the actual running `npm run dev` server (not a test):**
- `GET /api/hermes/health` → `{"mode":"real","healthy":true,"version":"0.21.0","latencyMs":3}` (first attempt raced the gateway's own cold-start and returned a 2s timeout — expected, not a bug; the retry succeeded).
- **A real mission end-to-end:** `POST /api/missions` with objective "Say hello and confirm you are a real, working agent runtime." → polled to `COMPLETED` in ~16s → `result: {source: "hermes", output: "Hello! I'm Hermes Agent, fully online and ready to assist you."}` → `verification: {verdict: "PASS"}`. Real model output, not mock text.
- **Real cancellation:** created a mission, cancelled it ~1s later via `POST /api/missions/:id/cancel` → mission genuinely reached `CANCELLED` against the live runtime (not just against a test fixture).
- **Real checkpointing:** created a mission, paused it → confirmed via a direct SQLite query that a real row landed in the `checkpoints` table with genuine captured state (see the Checkpoints section below).

**What's still only fixture-tested, not live-tested (an honest remaining gap, not a blocker):** tool-call approval/denial against the *live* Hermes Agent (its actual tool set — file/terminal/browser tools — wasn't exercised this session; only health, plain-text execution, and cancellation were run against the real process). The approval-gate *code path* itself is now covered by 11 new fixture-based tests in `agent-adapter.test.ts` (see below) that faithfully replicate Hermes Agent's real wire format — read directly from its own installed source, not guessed — but a fixture is not the live process. `HermesHttpAdapter` (the generic bespoke-contract adapter, for a *different, non-installed* runtime) remains entirely fixture-only, as before.

**A real finding from live testing — Hermes Agent's read-only tools bypass JARVIS's tool gate entirely.** Gave a real mission the objective "List the files in your current working directory using a tool... actually call the tool and report the real results." It completed successfully, with a real result (`C:\Users\Prudh\...` directory contents — Hermes Agent operates in its own workspace, the user's home directory, not scoped to this project). Checked the full event history for this mission: **zero** `tool.requested`/`security.approval_required`/`tool.approved`/`tool.denied` events. Hermes Agent ran a real, file-system-reading tool without ever emitting an `approval.request` SSE frame — meaning JARVIS's execution-time security gate (`handleToolRequest` in `orchestrator.ts`, extensively tested and fail-closed *for anything it actually sees*) never had a chance to evaluate this call at all.

Root cause, confirmed by reading Hermes Agent's own source (`tools/approval_context.py`, `tools/approval.py`): Hermes Agent has its own internal notion of which tool calls are "flagged" for approval in the first place (`request_tool_approval()` is only called for tools its own code explicitly wraps). Read-only actions like listing/reading files are apparently not flagged at all, independent of the configured `approvals.mode` (default `"manual"`, confirmed unset/default on this install) — so neither JARVIS's `tool.requested` gate nor even Hermes Agent's own approval prompt ever engages for them. This is a real mismatch between the architecture's stated invariant ("no tool should execute directly from raw model output... required flow: MODEL/HERMES → TOOL REQUEST → POLICY → EXECUTION") and what the real integration actually does: **that flow only covers tool calls Hermes Agent itself chooses to surface.** Deliberately did not chase this further by trying to provoke a write/delete/execute-class tool call on the user's real home directory to see whether *those* get gated — that would be a real-world side-effect risk to run without the user's explicit go-ahead, not a safe thing to do just to satisfy a checklist. Flagging this prominently instead so it's a known, visible gap rather than a false sense of coverage. See `JARVIS_PHASE_STATUS.md` (Phase 02, Phase 05) for the follow-up this implies.

**New test coverage — `src/server/hermes/agent-adapter.test.ts` (11 tests, previously zero coverage for this adapter):** health check, model-forwarding omission (JARVIS's internal routing id is deliberately never sent to Hermes), progress streaming, real usage parsing, the approval gate (both an explicit decision and the default-deny-when-unwired case), `run.failed`/`run.cancelled` handling, best-effort `/stop` on abort, and a 401/403 auth-error path. The fixture's wire shapes were verified against Hermes Agent's actual installed source (`api_server.py`, `api_server_runs.py`) rather than inferred from the adapter's own code — all 11 passed on the first run, which is itself a strong signal the adapter's existing implementation was already correct.

## Phase 01 — full budget enforcement + real checkpoints (2026-09-21)

**Budget, all four declared dimensions now honestly resolved (three enforced, one correctly deferred):**
1. **`maxSteps`** — one `onProgress` callback = one step; enforced live, mid-execution.
2. **`maxToolCalls`** — total tool-call attempts across the mission; enforced live, in `handleToolRequest`, before the security policy gate.
3. **`maxRepeatedToolCalls`** — a stuck-loop guard (consecutive identical tool name + `JSON.stringify`-identical input); enforced live, same gate.
4. **`maxTokens`** — enforced **post-hoc**, against `HermesResult.usage.totalTokens` once Hermes reports it on completion (real Hermes Agent genuinely reports `input_tokens`/`output_tokens`/`total_tokens` on its `run.completed` event — verified against its own source, `_USAGE_FIELDS` in `api_server_runs.py`). Cannot preempt the spend (Hermes only reports totals at the end, not incrementally) but does prevent a mission that ran over budget from being treated as a successful, in-budget completion — it's failed instead, with the real result (including the real usage figures) still attached for inspection.

`maxUsd` remains the one genuinely unenforced field — no adapter, mock or real, reports a cost figure anywhere (`usage.cost_usd` exists in Hermes Agent's own internal subagent-lifecycle events but is never included in the terminal `run.completed` event JARVIS actually consumes). Honestly documented as blocked, not approximated.

All four dimensions share one `mission.budget_exceeded` event (`metadata.dimension` distinguishes them) and one in-memory `budgetState` map in `orchestrator.ts` (survives pause/resume, cleared on every terminal transition, lost on process restart — same non-persisted category as the pre-existing `controllers` map).

**Checkpoints — real, for the first time.** The `checkpoints` SQLite table existed in the schema since before this session but had zero corresponding code (a second, entirely dormant representation alongside the equally-unused `Mission.checkpoints` JSON column — a "two competing systems for one responsibility" situation, now resolved in favor of the dedicated table, matching how `mission_tasks` was built). Added `src/server/missions/checkpoints/{types,repository,service}.ts`, mirroring the `tasks` module's pattern exactly. Wired into `pauseMission()` — the one clear, owner-initiated moment worth checkpointing today — capturing real state (`status`, `progress`, `currentObjective`, `agents`) at the point of pause. Emits a new `mission.checkpoint.created` event. `Mission.checkpoints` (the JSON column) is now explicitly documented as superseded dead schema, not silently duplicated. No automatic periodic checkpointing and no resume-from-checkpoint logic — those are genuinely separate, larger features, not implied by "checkpoints now exist."

**Test coverage added:** `tool-call-budget.test.ts` (3), `token-budget.test.ts` (3), 1 step-budget test in `orchestrator.test.ts`, `checkpoints/repository.test.ts` (3), plus a checkpoint assertion added to the existing pause/cancel orchestrator test.

## World State reconciliation (Phase 03) — 2026-09-21

Built `src/server/world-state/{types,service}.ts` + `GET /api/world-state`. `getWorldState()` queries all nine domains (system, missions, files, spotify, schedule, weather, news, omnirouter, hermes) in parallel and returns one snapshot, each entry wrapped as `{data, fetchedAt, knownCacheTtlMs, error}`. A domain that throws (e.g. Spotify not connected) reports `error` and `data: null` — isolated to that entry, never crashing the rest of the snapshot or fabricating a fallback value. Deliberately **not** a new cache or poller: every call queries live and delegates to each domain's own existing caching (system 5s, weather 15min, news 20min, the rest always-live) — `knownCacheTtlMs` documents each domain's own contract rather than adding a redundant aggregation-level cache on top.

**Verified live** against the real running dev server (`GET /api/world-state`): real CPU/RAM/disk telemetry, real recent-files listing (including the very files created this session), a genuine `"Spotify is not connected."` error isolated to just that entry, real weather (24°C, rain), real live RSS news (actual current articles with real URLs), real OmniRoute provider status (`online`, matching the gateway actually running), and real Hermes health (`healthy: true`, matching the live gateway). Not exercised through a test double at any point in that verification — this was the actual production code path against actual live data.

**Tested:** `src/server/world-state/service.test.ts` (5 tests) — full reconciliation shape, per-domain error isolation, legitimate-empty vs. error distinction, and `isWorldStateEntryStale()`'s threshold logic.

## Performance stabilization sprint (2026-09-20)

**Trigger:** user-reported "running JARVIS makes the laptop extremely slow," RAM spikes, and slow screen renders.

**Method:** measured before guessing. Started the real dev server, timed every route with `curl`, benchmarked each `systeminformation` call in isolation, and inspected live Windows process memory (`Get-CimInstance Win32_Process`).

**Root cause found and fixed — uncached, over-fetching system telemetry (highest-confidence, fully measured):**
`src/server/system/service.ts` (`getSystemSnapshot` / `getSystemDetailSnapshot`, used by Home, Work, and the System page — the latter polled client-side) called into the `systeminformation` package with **zero caching**, on every request. Individually benchmarked on this machine: `si.graphics()` ~3.5s, `si.networkStats()` ~4.1s, `si.osInfo()` ~2s, `si.battery()` ~1.4s, `si.cpuTemperature()` ~1s — several backed by Windows WMI queries that spawn child processes. Worse, the code called `si.networkStats()` **twice**, blocking on an extra artificial 200ms sleep in between, every single call.
Measured impact before the fix: `GET /` (Home) logged real request times of **28s and 98s** during normal use; a direct, uncontended `curl` to `/api/system` took **8–20s per call**. The System page polled this same expensive path every 3 seconds — a genuine unbounded resource-consumption pattern, not just a slow page.
**Fix:** added a shared in-flight-dedupe + 5s-TTL cache (`cached()` helper in `service.ts`) around both snapshot functions, so concurrent requests (a page load racing a poll, multiple tabs) share one real `systeminformation` pass instead of each triggering their own. Also removed the redundant second `networkStats()` call + sleep — network throughput now derives from the natural spacing between cached snapshots (first sample in a fresh process honestly reports `null`, matching the project's honesty rule, and is accurate from the second sample on). Bumped the System page's client poll interval from 3s → 5s to match the cache TTL (no benefit polling faster than the cache refreshes).
**Result:** `GET /api/system` — cold call ~9s (the real, now-unavoidable floor for a first WMI pass on this machine), cached calls **8ms** (down from 8–20s). `GET /` (Home) — cold ~5.8s, warm **79ms** (down from up to 98s). Verified concurrent-request dedupe directly: 3 simultaneous requests after cache expiry took ~8.3s total (one real pass), not 3×.
**Regression tests added:** `src/server/system/service.test.ts` (7 tests) — cache reuse across repeated calls, in-flight dedupe under concurrency, TTL expiry triggering a real refresh, single (not double) `networkStats()` call, correct null-then-real network-throughput sequencing, and that `getSystemSnapshot`/`getSystemDetailSnapshot` share one network warm-up flag.

**Other findings from the audit (no fix needed — architecture already sound):**
- `AppShell` (providers for Spotify + clap-wake) lives in `layout.tsx`, so it mounts once and persists across all route navigation — not remounted per page. No duplicate global providers found.
- Mission SSE (`useLiveMissions`) opens one `EventSource` per *active* mission, keyed on the set of active mission IDs (not on every field update), and closes all of them on unmount/id-set-change. No leak, no duplication.
- The server-side event bus (`src/server/events/bus.ts`) is a single process-wide `EventEmitter` with `setMaxListeners(200)`; each SSE route subscribes/unsubscribes cleanly on request abort.
- `useSpotifyPlayer()` (5s poll) is called independently by three components (`NowPlayingPanel`, `FocusMusicPanel`, `MusicView`), but since each lives on a different route and Next.js App Router unmounts page-level components on navigation, only one is ever polling at a time in practice — not a real duplicate-polling bug today. Worth revisiting only if a future screen renders more than one of these simultaneously.
- The clap-wake detector's mic/RAF loop is opt-in (off by default, per-user `localStorage` toggle) and fully torn down (`cancelAnimationFrame`, `AudioContext.close()`, mic tracks stopped) when disabled or unmounted.
- Client-side JS heap does not grow across repeated navigation (measured via `performance.memory` — see Build/test health above) — no evidence of a client-side render/listener leak.
- **Environment note, out of this repo's scope:** at audit time, several *unrelated* projects' dev processes (`Spotameet`, `omniroute`) were found running duplicated/orphaned `tsx watch` chains and a `--max-old-space-size=4096` server, together holding roughly 1GB+ RSS and occupying port 3000 (JARVIS's own dev server had to auto-select a different port). This is real machine load contributing to "the laptop is slow" but is not JARVIS code — flagged for the user to clean up manually, not touched by this sprint. (Note, 2026-09-21: `omniroute` is now deliberately running again, this time on purpose — see the Real Hermes section above.)

**Remaining/deferred:** the ~5-9s *cold* cost (cache miss after a 5s idle gap) is a real floor on this hardware and could be hidden further with a background stale-while-revalidate refresh — deliberately not added, since a perpetual background timer would reintroduce always-on polling/child-process cost even while the app isn't being viewed, trading one resource problem for another. Revisit only if cold hits are reported as still noticeable in practice.

## Subsystem-by-subsystem reality check

| Subsystem | Status | Notes |
|---|---|---|
| Mission lifecycle | REAL | 9-state machine, enforced transitions, persisted, tested. |
| Mission task decomposition | REAL (trivial) | One root task per mission, DAG-capable schema, no multi-step decomposition yet. |
| Mission checkpoints | REAL (minimal) | One real checkpoint on pause, dedicated table, tested + live-verified. No auto-checkpointing or resume-from-checkpoint yet. |
| Mission budget enforcement | REAL (3 of 4 dims) | `maxSteps`/`maxToolCalls`/`maxRepeatedToolCalls` live; `maxTokens` post-hoc; `maxUsd` honestly unenforced (no cost data anywhere). |
| Hermes — mock adapter | MOCK | Self-labels `source: "mock"` in every result. |
| Hermes — Agent adapter | REAL, live-verified | Real Hermes Agent v0.21.0, real mission execution, real cancellation, all verified against the actual running process this session. Tool-approval path fixture-tested only (11 tests), not yet live-tested against Hermes Agent's real tools. |
| Hermes — generic HTTP adapter | REAL code / UNVERIFIED live | Targets JARVIS's own bespoke contract; no runtime speaking that exact contract is installed anywhere. Fixture-tested only. |
| OmniRouter (JARVIS's own) | REAL (routing logic) / SIMULATED (quota) | Regex-based classification and provider selection are real; `quotaSource: "simulated"` is explicit, and "online" status is presence-of-env-var, not a validated API call. Separate from the real third-party `omniroute` CLI gateway — see JARVIS_MASTER_MEMORY.md. |
| Events + SSE | REAL | Persisted, replayable, live-streamed. |
| World State (unified) | REAL | `src/server/world-state/`, reconciles 9 domains, tested + live-verified this session. |
| Security policy + tool gate | REAL, but not a universal gate against the real Hermes Agent | Deterministic, fail-closed, tested — for everything it actually sees. Live testing this session found Hermes Agent's read-only tools never reach it at all (see the Real Hermes Agent section above) — a real, currently-open gap, not yet mitigated. |
| Audit log | REAL | Append-only SQLite table, written on every policy decision. |
| Verification | REAL (deterministic substring match) | Not semantic; explicitly documented as a floor. |
| Tool Registry | NOT BUILT | 9-entry hardcoded table inside the security module; not a standalone system. |
| Autonomous Planner | NOT BUILT | Single-shot objective only. |
| Computer Control | STUB | 7 fixed local script actions, self-labeled "Phase 1 stub" in code. |
| Browser Control | NOT BUILT | Zero code. |
| Memory | SCHEMA-ONLY | `memory_entries` table, no code. |
| Knowledge/RAG | SCHEMA-ONLY | `knowledge_references` table, no code. |
| Communications/WhatsApp | NOT BUILT | Zero code. |
| Voice | REAL (narrow scope) | Browser STT gates a passcode unlock; real optional ElevenLabs TTS. Not a conversational voice loop. |
| Attention/Proactive | NOT BUILT | Clap-detector is a manual trigger, not an attention system. |
| Spotify | REAL | Full OAuth2 + Web Playback SDK integration. |
| Weather | REAL | Open-Meteo + ip-api.com, keyless. |
| News | REAL | Live RSS via `rss-parser`, 4 feeds, per-feed failure isolation. |
| System telemetry | REAL | `systeminformation` package; unmeasurable values return `null`, never fabricated. |
| Files (recent) | REAL | Live filesystem walk of the project directory. |
| Cloud/multi-device | NOT BUILT | Local SQLite file only. |
| Electron | NOT BUILT | Correctly deferred. |

## Known gaps / honest limitations carried forward

- A mission with a paused-then-resumed stale pipeline run can, in a narrow race, have its old run's terminal write land after a new resumed run has taken over (pre-existing in the orchestrator's single-controller model; not introduced or fixed this session).
- Tool-approval waits (`WAITING_USER`) do not change the mirrored task's status — it stays `"running"` through the wait. Documented as intentional scope-limiting, not an oversight.
- `budget.maxUsd` is the only budget field left honestly unenforced — no cost figure exists anywhere in the system to check it against.
- All budget accounting is in-memory only (`budgetState` in `orchestrator.ts`), like the pre-existing `controllers` map — it does not survive a process restart.
- The repetition detector compares tool input by `JSON.stringify` structural equality, not semantic equality — a documented heuristic, not a guarantee.
- **(Security-relevant, most important gap found this session)** JARVIS's execution-time tool gate only sees tool calls Hermes Agent chooses to report via an `approval.request` frame. Live-verified that read-only tools (file listing) execute without ever emitting one — JARVIS never gets a chance to allow/ask/deny them. Whether write/delete/execute-class tools behave differently (get gated, or *also* bypass JARVIS) is unknown and was deliberately not tested live this session (would mean risking a real side effect on the user's actual filesystem just to check). Until this is resolved or at least characterized further, do not treat JARVIS's tool gate as covering everything a real Hermes Agent mission can do — it covers everything Hermes Agent *asks about*, which this session showed is a strictly smaller set.
- The OmniRoute gateway and Hermes Agent gateway are standing local processes this session started, not something `npm run dev` manages — see JARVIS_MASTER_MEMORY.md. If a future session finds `/api/hermes/health` unhealthy again, check whether these are still running before assuming a regression.
- World State has no caching or polling of its own by design (see the dedicated section above) — a very chatty caller could still trigger a lot of underlying work if it calls `getWorldState()` far more often than each domain's own cache TTL; nothing currently does, but nothing throttles a future caller either.
