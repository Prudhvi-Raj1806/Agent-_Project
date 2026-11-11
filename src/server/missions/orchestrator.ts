import { nowIso } from "@/server/db/util";
import { emitEvent } from "@/server/events/service";
import { getHermesAdapter } from "@/server/hermes/factory";
import type { HermesResult, HermesToolRequest, ToolDecision } from "@/server/hermes/types";
import { getDecisionModelAdapter } from "@/server/laya/factory";
import { logger } from "@/server/logging/logger";
import { selectModel } from "@/server/omnirouter/router";
import { recordAudit } from "@/server/security/audit";
import { getOwnerActor, getSystemActor } from "@/server/security/policy";
import { evaluateGovernedToolCall, recordToolCallResolution } from "@/server/tools/executor";
import { classifyHermesError, classifyPolicyDenial, classifyVerificationFailure } from "@/server/verification/classification";
import { executionIdentityKey } from "@/server/verification/execution-identity";
import { verify } from "@/server/verification/verifier";
import { createCheckpoint } from "./checkpoints/service";
import { decideMissionCompletion } from "./completion-policy";
import { ensureRootTask, markRootTaskStatus } from "./tasks/service";
import type { MissionTaskResult, MissionTaskStatus } from "./tasks/service";
import {
  InvalidTransitionError,
  NotFoundError,
  clearPendingToolApproval,
  getMission,
  setPendingToolApproval,
  transitionMission,
  updateMissionAgents,
  updateMissionDecision,
  updateMissionProgress,
} from "./service";
import type { Mission, MissionAgentAssignment, MissionStatus, PendingToolApproval, TransitionOptions } from "./types";

/**
 * The vertical slice: Mission -> OmniRouter -> Hermes -> Verification ->
 * completion. This is the only module that drives a mission's status
 * beyond the direct user commands (pause/resume/cancel) exposed here.
 */

const controllers = new Map<string, AbortController>();

/**
 * Execution-generation guard against the pause/resume stale-execution race:
 * a paused pipeline run (`run A`) can still be in flight (its Hermes adapter
 * call hasn't actually unwound yet) when the mission is resumed and a new
 * run (`run B`) starts. If run A's `adapter.execute()` promise later settles
 * — successfully or not, and regardless of whether it honored the abort
 * signal — it must not be allowed to mutate mission/task state on B's
 * behalf. `currentRunGeneration` holds, per mission, the generation number
 * of the one run currently entitled to write mission state. `startNewRun`
 * is called exactly once per `executePipeline` invocation (from
 * `beginMission`/`resumeMission`, before the pipeline is even started) and
 * overwrites whatever generation was previously current — which is itself
 * enough to invalidate a still-in-flight prior run, without relying on the
 * timing of that prior run's own abort signal. `invalidateRun` (from
 * `pauseMission`/`cancelMission`) additionally clears the slot outright, so
 * a run that resolves while the mission is merely paused (not yet resumed)
 * is equally rejected.
 */
const currentRunGeneration = new Map<string, number>();
let runGenerationCounter = 0;

function startNewRun(missionId: string): number {
  const generation = ++runGenerationCounter;
  currentRunGeneration.set(missionId, generation);
  return generation;
}

function invalidateRun(missionId: string): void {
  currentRunGeneration.delete(missionId);
}

/** True once this run has been superseded (a newer run started) or the mission was paused/cancelled. */
function isStaleRun(missionId: string, generation: number): boolean {
  return currentRunGeneration.get(missionId) !== generation;
}

function logStaleRun(missionId: string, generation: number, where: string): void {
  logger.warn("mission.run.stale", {
    missionId,
    generation,
    currentGeneration: currentRunGeneration.get(missionId) ?? null,
    where,
  });
}

/** Removes this run's own controller from the map, but never a newer run's controller that may have replaced it. */
function clearOwnController(missionId: string, controller: AbortController): void {
  if (controllers.get(missionId) === controller) {
    controllers.delete(missionId);
  }
}

/**
 * Budget accounting (`Mission.budget`). In-memory only, like `controllers`:
 * survives pause/resume within this process but not a restart, and is
 * cleared on every terminal mission transition. Three dimensions:
 *  - `steps`: one `onProgress` callback — the only iteration unit every
 *    Hermes adapter (mock or real) reports uniformly.
 *  - `toolCalls`: one `handleToolRequest` invocation, regardless of the
 *    eventual ALLOW/ASK/DENY outcome.
 *  - `lastToolCallSignature`/`lastToolCallRepeatCount`: a heuristic stuck-
 *    loop detector — consecutive tool calls with the same name and
 *    `JSON.stringify`-identical input. Structurally different input that is
 *    semantically identical (e.g. reordered object keys) will not be
 *    detected as a repeat; documented limitation, not a bug.
 */
interface MissionBudgetState {
  steps: number;
  toolCalls: number;
  lastToolCallSignature: string | null;
  lastToolCallRepeatCount: number;
}

const budgetState = new Map<string, MissionBudgetState>();

function getBudgetState(missionId: string): MissionBudgetState {
  let state = budgetState.get(missionId);
  if (!state) {
    state = { steps: 0, toolCalls: 0, lastToolCallSignature: null, lastToolCallRepeatCount: 0 };
    budgetState.set(missionId, state);
  }
  return state;
}

function clearBudgetState(missionId: string): void {
  budgetState.delete(missionId);
}

interface BudgetViolation {
  dimension: "maxSteps" | "maxToolCalls" | "maxRepeatedToolCalls" | "maxTokens";
  limit: number;
  actual: number;
  reason: string;
}

/** Checked once per `handleToolRequest` call, before the security policy gate runs. */
function checkToolCallBudget(missionId: string, budget: Mission["budget"], request: HermesToolRequest): BudgetViolation | null {
  const state = getBudgetState(missionId);

  state.toolCalls += 1;
  const signature = `${request.toolName}::${JSON.stringify(request.input ?? null)}`;
  if (state.lastToolCallSignature === signature) {
    state.lastToolCallRepeatCount += 1;
  } else {
    state.lastToolCallSignature = signature;
    state.lastToolCallRepeatCount = 1;
  }

  if (budget?.maxRepeatedToolCalls != null && state.lastToolCallRepeatCount > budget.maxRepeatedToolCalls) {
    return {
      dimension: "maxRepeatedToolCalls",
      limit: budget.maxRepeatedToolCalls,
      actual: state.lastToolCallRepeatCount,
      reason: `Mission repeated the same tool call ("${request.toolName}") ${state.lastToolCallRepeatCount} times in a row (max ${budget.maxRepeatedToolCalls}) — likely stuck in a loop.`,
    };
  }

  if (budget?.maxToolCalls != null && state.toolCalls > budget.maxToolCalls) {
    return {
      dimension: "maxToolCalls",
      limit: budget.maxToolCalls,
      actual: state.toolCalls,
      reason: `Mission exceeded its tool-call budget (${state.toolCalls} > ${budget.maxToolCalls} max tool calls).`,
    };
  }

  return null;
}

/**
 * Fails the mission in response to any budget dimension being exceeded —
 * shared by the step, tool-call, and token checks. `controller` is only
 * given for violations caught mid-execution (steps, tool calls) so the
 * pipeline can actually be aborted; `maxTokens` is checked post-hoc, once
 * Hermes has already reported its final usage, so there is nothing left to
 * abort — the mission still fails, since a mission that ran over its token
 * budget must not be treated as a successful, in-budget completion, even
 * though the spend itself couldn't be prevented. `result`, when given,
 * preserves the real `HermesResult` (including its usage figures) on the
 * failed mission instead of discarding it.
 */
function failMissionOnBudgetViolation(
  missionId: string,
  generation: number,
  violation: BudgetViolation,
  opts?: { controller?: AbortController; result?: HermesResult }
): void {
  if (isStaleRun(missionId, generation)) {
    logStaleRun(missionId, generation, "failMissionOnBudgetViolation");
    return;
  }
  opts?.controller?.abort();
  emitEvent({
    type: "mission.budget_exceeded",
    missionId,
    source: "orchestrator",
    status: "failed",
    metadata: { ...violation },
  });
  const finalMission = safeTransition(missionId, "FAILED", opts?.result ? { result: opts.result } : undefined);
  // A budget is a governance constraint, not an execution error — POLICY_DENIED, same family as a tool-policy DENY.
  emitEvent({
    type: "mission.failed",
    missionId,
    source: "orchestrator",
    status: "failed",
    metadata: { reason: violation.reason, classification: classifyPolicyDenial() },
  });
  mirrorTaskStatus(missionId, finalMission, "failed", opts?.result);
  clearBudgetState(missionId);
}

/**
 * §6/§17/§20: Laya as a non-blocking pre-classifier, not a gate. Fire-and-
 * forget — never awaited by `executePipeline`, so a slow or unreachable
 * Laya (the fallback adapter always reports "degraded") can never add
 * latency to, or block, a mission's actual execution. The judgment is
 * recorded on the mission (`mission.decision`) and announced as a
 * `mission.classified` event for routing/audit visibility; nothing in the
 * pipeline consumes it yet, matching §17's stated gap being closed one piece
 * at a time.
 *
 * Two earlier versions of this existed side by side: one awaited the call
 * before starting the mission (adding up to Laya's timeout to every
 * mission), one fired it and forgot (never persisting the result). This keeps
 * the persistence of the first and the non-blocking behaviour of the second.
 * Without a real Laya the fallback answers "unknown" at zero confidence,
 * which is recorded as exactly that rather than as a guessed option.
 */
function classifyMissionNonBlocking(missionId: string, objective: string): void {
  void getDecisionModelAdapter()
    .classify({ state: objective, question: CLASSIFY_QUESTION, schema: CLASSIFY_OPTIONS })
    .then((result) => {
      updateMissionDecision(missionId, { choice: result.decision, confidence: result.confidence });
      emitEvent({
        type: "mission.classified",
        missionId,
        source: "laya",
        status: "classified",
        metadata: { question: CLASSIFY_QUESTION, decision: result.decision, confidence: result.confidence },
      });
    })
    .catch((err) => {
      logger.warn("mission.classify.failed", { missionId, error: err instanceof Error ? err.message : String(err) });
    });
}

const CLASSIFY_QUESTION = "Can this mission proceed unattended, or does it need full planning?";
const CLASSIFY_OPTIONS = ["unattended", "needs_planning"];

const HERMES_AGENT_ID = "hermes";

/** Only one agent exists in Phase 1 (Hermes) — this becomes a real roster once sub-agents exist. */
function setHermesAgentStatus(missionId: string, status: MissionAgentAssignment["status"]): void {
  updateMissionAgents(missionId, [{ id: HERMES_AGENT_ID, role: "Hermes", status }]);
}

interface PendingApprovalEntry {
  resolve: (decision: ToolDecision) => void;
}

/** Tool calls currently paused on a human ALLOW/DENY, keyed by `${missionId}:${toolCallId}`. */
const pendingApprovals = new Map<string, PendingApprovalEntry>();

function approvalKey(missionId: string, toolCallId: string): string {
  return `${missionId}:${toolCallId}`;
}

/** Called by the tool-approvals API route when the owner answers an ASK. */
export function resolveToolApproval(missionId: string, toolCallId: string, approved: boolean, reason?: string): void {
  const key = approvalKey(missionId, toolCallId);
  const pending = pendingApprovals.get(key);
  if (!pending) {
    throw new NotFoundError(`No pending tool approval for toolCallId "${toolCallId}" on mission ${missionId}.`);
  }
  pendingApprovals.delete(key);
  pending.resolve({ decision: approved ? "allow" : "deny", reason });
}

/**
 * Execution-time tool gate: Tool request -> permission check -> risk
 * evaluation -> ALLOW / ASK / DENY -> tool execution. Runs once per
 * `approval.request` frame Hermes reports, before Hermes is told it may
 * proceed (see hermes/agent-adapter.ts's handling of that frame).
 */
async function handleToolRequest(
  missionId: string,
  generation: number,
  controller: AbortController,
  request: HermesToolRequest
): Promise<ToolDecision> {
  if (isStaleRun(missionId, generation)) {
    logStaleRun(missionId, generation, "handleToolRequest");
    return { decision: "deny", reason: "This pipeline run has been superseded (mission was paused/resumed) — denying by default." };
  }

  const mission = getMission(missionId);
  if (!mission) return { decision: "deny", reason: "Mission no longer exists." };

  emitEvent({
    type: "tool.requested",
    missionId,
    agentId: HERMES_AGENT_ID,
    source: "hermes",
    status: "requested",
    metadata: { toolCallId: request.toolCallId, toolName: request.toolName, input: request.input },
  });

  const budgetViolation = checkToolCallBudget(missionId, mission.budget, request);
  if (budgetViolation) {
    recordAudit({
      actorId: getSystemActor().id,
      action: "tool.deny",
      resourceType: "tool_call",
      resourceId: request.toolCallId,
      result: "denied",
      reason: budgetViolation.reason,
    });
    emitEvent({
      type: "tool.denied",
      missionId,
      agentId: HERMES_AGENT_ID,
      source: "orchestrator",
      status: "denied",
      metadata: {
        toolCallId: request.toolCallId,
        toolName: request.toolName,
        reason: budgetViolation.reason,
        executionIdentity: executionIdentityKey({ missionId, taskId: null, toolCallId: request.toolCallId }),
      },
    });
    failMissionOnBudgetViolation(missionId, generation, budgetViolation, { controller });
    return { decision: "deny", reason: budgetViolation.reason };
  }

  const auditTarget = { actorId: getSystemActor().id, resourceType: "tool_call", resourceId: request.toolCallId };
  const policy = evaluateGovernedToolCall(
    {
      toolName: request.toolName,
      allowedTools: mission.allowedTools,
      forbiddenActions: mission.forbiddenActions,
    },
    auditTarget
  );

  if (policy.verdict === "DENY") {
    emitEvent({
      type: "tool.denied",
      missionId,
      agentId: HERMES_AGENT_ID,
      source: "security",
      status: "denied",
      metadata: { toolCallId: request.toolCallId, toolName: request.toolName, risk: policy.risk, reason: policy.reason },
    });
    emitEvent({
      type: "security.blocked",
      missionId,
      source: "security",
      status: "denied",
      metadata: { toolCallId: request.toolCallId, toolName: request.toolName, reason: policy.reason },
    });
    return { decision: "deny", reason: policy.reason };
  }

  if (policy.verdict === "ALLOW") {
    emitEvent({
      type: "tool.approved",
      missionId,
      agentId: HERMES_AGENT_ID,
      source: "security",
      status: "approved",
      metadata: { toolCallId: request.toolCallId, toolName: request.toolName, risk: policy.risk, reason: policy.reason },
    });
    return { decision: "allow", reason: policy.reason };
  }

  // ASK — pause execution until the owner decides.
  const approval: PendingToolApproval = {
    toolCallId: request.toolCallId,
    toolName: request.toolName,
    input: request.input,
    risk: policy.risk,
    reason: policy.reason,
    requestedAt: nowIso(),
  };
  setPendingToolApproval(missionId, approval);
  safeTransition(missionId, "WAITING_USER");
  setHermesAgentStatus(missionId, "waiting");
  emitEvent({
    type: "security.approval_required",
    missionId,
    agentId: HERMES_AGENT_ID,
    source: "security",
    status: "waiting",
    metadata: { toolCallId: request.toolCallId, toolName: request.toolName, risk: policy.risk, reason: policy.reason },
  });

  const key = approvalKey(missionId, request.toolCallId);
  let resolvedByHuman = true;
  const decision = await new Promise<ToolDecision>((resolve) => {
    const onAbort = () => {
      pendingApprovals.delete(key);
      resolvedByHuman = false;
      resolve({ decision: "deny", reason: "Mission was paused or cancelled while awaiting approval." });
    };
    pendingApprovals.set(key, { resolve });
    controller.signal.addEventListener("abort", onAbort, { once: true });
  });

  clearPendingToolApproval(missionId);
  if (!controller.signal.aborted && !isStaleRun(missionId, generation)) {
    safeTransition(missionId, "RUNNING");
    setHermesAgentStatus(missionId, "working");
  }

  recordToolCallResolution(
    { actorId: resolvedByHuman ? getOwnerActor().id : getSystemActor().id, resourceType: "tool_call", resourceId: request.toolCallId },
    decision.decision === "allow",
    decision.reason
  );
  emitEvent({
    type: decision.decision === "allow" ? "tool.approved" : "tool.denied",
    missionId,
    agentId: HERMES_AGENT_ID,
    source: "security",
    status: decision.decision === "allow" ? "approved" : "denied",
    metadata: { toolCallId: request.toolCallId, toolName: request.toolName, reason: decision.reason },
  });

  return decision;
}

/**
 * Mirrors a mission's outcome onto its root task — only if `finalMission` is
 * non-null, i.e. the mission transition this is paired with actually took
 * effect. Guards against a stale, aborted pipeline run stomping a task that
 * a fresher resumed run now owns (the same race `safeTransition`'s null
 * return already guards for the mission's own status).
 */
function mirrorTaskStatus(
  missionId: string,
  finalMission: Mission | null,
  status: MissionTaskStatus,
  result?: MissionTaskResult | null
): void {
  if (!finalMission) return;
  const task = markRootTaskStatus(missionId, status, result);
  if (!task) return;
  emitEvent({
    type: "mission.task.updated",
    missionId,
    source: "orchestrator",
    status: task.status,
    metadata: { taskId: task.id },
  });
}

/** Swallows a race against a concurrent pause/cancel instead of crashing an unawaited pipeline. */
function safeTransition(missionId: string, to: MissionStatus, opts?: TransitionOptions): Mission | null {
  try {
    return transitionMission(missionId, to, opts);
  } catch (err) {
    if (err instanceof InvalidTransitionError) {
      logger.warn("mission.transition.raced", { missionId, to, error: err.message });
      return null;
    }
    throw err;
  }
}

export function startMission(missionId: string): void {
  void beginMission(missionId);
}

async function beginMission(missionId: string): Promise<void> {
  const mission = getMission(missionId);
  if (!mission) return;

  transitionMission(missionId, "RUNNING");
  const generation = startNewRun(missionId);
  emitEvent({ type: "mission.started", missionId, source: "orchestrator", status: "running" });
  classifyMissionNonBlocking(missionId, mission.objective);
  const task = ensureRootTask(missionId, mission.objective);
  emitEvent({
    type: "mission.task.created",
    missionId,
    source: "orchestrator",
    status: task.status,
    metadata: { taskId: task.id, title: task.title },
  });
  await executePipeline(missionId, 0, generation);
}

export function resumeMission(missionId: string): Mission {
  const mission = transitionMission(missionId, "RUNNING");
  const generation = startNewRun(missionId); // supersedes whatever run (if any) was previously current for this mission
  setHermesAgentStatus(missionId, "working");
  emitEvent({ type: "mission.resumed", missionId, source: "orchestrator", status: "running" });
  const task = ensureRootTask(missionId, mission.objective);
  emitEvent({
    type: "mission.task.updated",
    missionId,
    source: "orchestrator",
    status: task.status,
    metadata: { taskId: task.id },
  });
  void executePipeline(missionId, mission.progress, generation);
  return mission;
}

export function pauseMission(missionId: string): Mission {
  const mission = transitionMission(missionId, "PAUSED");
  controllers.get(missionId)?.abort();
  controllers.delete(missionId);
  invalidateRun(missionId); // no run is current while paused, even if the aborted one hasn't unwound yet
  setHermesAgentStatus(missionId, "waiting");
  emitEvent({ type: "mission.paused", missionId, source: "orchestrator", status: "paused" });
  mirrorTaskStatus(missionId, mission, "blocked");
  // Sprint 03: fold in whatever verification result this mission already
  // carries (null if it's never completed a run yet) and a stable identity
  // key — recovery-relevant context a future resume/replan step can read,
  // without inventing a second checkpoint mechanism or a resume-from-
  // checkpoint feature (neither exists yet, deliberately — see
  // missions/checkpoints/service.ts).
  const checkpoint = createCheckpoint(missionId, "paused", {
    status: mission.status,
    progress: mission.progress,
    currentObjective: mission.currentObjective,
    agents: mission.agents,
    verification: mission.verification,
    executionIdentity: executionIdentityKey({ missionId, taskId: null, toolCallId: null }),
  });
  emitEvent({
    type: "mission.checkpoint.created",
    missionId,
    source: "orchestrator",
    status: "paused",
    metadata: { checkpointId: checkpoint.id, label: checkpoint.label },
  });
  return mission;
}

export function cancelMission(missionId: string): Mission {
  const mission = transitionMission(missionId, "CANCELLED");
  controllers.get(missionId)?.abort();
  controllers.delete(missionId);
  invalidateRun(missionId);
  clearBudgetState(missionId);
  setHermesAgentStatus(missionId, "idle");
  emitEvent({ type: "mission.cancelled", missionId, source: "orchestrator", status: "cancelled" });
  mirrorTaskStatus(missionId, mission, "cancelled");
  return mission;
}

async function executePipeline(missionId: string, fromPercent: number, generation: number): Promise<void> {
  const startedAt = Date.now();
  const mission = getMission(missionId);
  if (!mission) return;

  emitEvent({
    type: "model.requested",
    missionId,
    source: "omnirouter",
    status: "requested",
    metadata: { objective: mission.objective },
  });

  const routing = selectModel({ objective: mission.objective });
  if (!routing) {
    const reason = "No healthy provider with available capacity for this task.";
    emitEvent({ type: "model.failed", missionId, source: "omnirouter", status: "failed", metadata: { reason } });
    const finalMission = safeTransition(missionId, "FAILED");
    // "UNKNOWN", not guessed as TRANSIENT/PERMANENT: routing failure alone
    // doesn't tell us whether a provider will ever become available again.
    emitEvent({
      type: "mission.failed",
      missionId,
      source: "orchestrator",
      status: "failed",
      metadata: { reason, classification: "UNKNOWN" },
    });
    mirrorTaskStatus(missionId, finalMission, "failed");
    clearBudgetState(missionId);
    return;
  }
  emitEvent({
    type: "model.selected",
    missionId,
    source: "omnirouter",
    status: "selected",
    metadata: { ...routing },
  });

  const adapter = getHermesAdapter();
  if (adapter.mode === "real") {
    const health = await adapter.checkHealth();
    if (isStaleRun(missionId, generation)) {
      logStaleRun(missionId, generation, "executePipeline:health-check");
      return;
    }
    if (!health.healthy) {
      const reason = "Hermes runtime is unreachable or unhealthy.";
      emitEvent({ type: "agent.failed", missionId, agentId: "hermes", source: "hermes", status: "failed", metadata: { reason, health } });
      const finalMission = safeTransition(missionId, "FAILED");
      // "UNKNOWN": a failed health check alone doesn't distinguish a momentary
      // outage (TRANSIENT) from a permanent misconfiguration (PERMANENT).
      emitEvent({
        type: "mission.failed",
        missionId,
        source: "orchestrator",
        status: "failed",
        metadata: { reason, classification: "UNKNOWN" },
      });
      mirrorTaskStatus(missionId, finalMission, "failed");
      clearBudgetState(missionId);
      return;
    }
  }

  const controller = new AbortController();
  controllers.set(missionId, controller);
  setHermesAgentStatus(missionId, "working");
  emitEvent({ type: "agent.started", missionId, agentId: "hermes", source: "hermes", status: "started" });

  // Hermes has no verified cross-run resume primitive (architecture doc §18) — on a
  // resume, fold what's known about the prior run into the prompt rather than relying
  // on fromPercent alone, which the real agent-adapter doesn't forward. Without this,
  // a paused-then-resumed mission silently restarts its objective from scratch.
  const priorContext =
    fromPercent > 0
      ? `This mission was previously paused at ${fromPercent}% progress. Last known state: ${
          mission.currentObjective ?? "no progress note recorded"
        }. Resume from there rather than starting over.`
      : undefined;

  let hermesResult: HermesResult;
  try {
    hermesResult = await adapter.execute(
      {
        missionId,
        objective: mission.objective,
        routing,
        priorContext,
        fromPercent,
        allowedTools: mission.allowedTools,
        forbiddenActions: mission.forbiddenActions,
      },
      {
        signal: controller.signal,
        onProgress: (percent, note) => {
          if (controller.signal.aborted || isStaleRun(missionId, generation)) return;
          const maxSteps = mission.budget?.maxSteps;
          if (maxSteps != null) {
            const state = getBudgetState(missionId);
            state.steps += 1;
            if (state.steps > maxSteps) {
              failMissionOnBudgetViolation(
                missionId,
                generation,
                {
                  dimension: "maxSteps",
                  limit: maxSteps,
                  actual: state.steps,
                  reason: `Mission exceeded its step budget (${state.steps} > ${maxSteps} max steps).`,
                },
                { controller }
              );
              return;
            }
          }
          updateMissionProgress(missionId, percent, note);
          emitEvent({
            type: "mission.progress",
            missionId,
            source: "orchestrator",
            status: "running",
            metadata: { percent, note },
          });
          emitEvent({
            type: "agent.progress",
            missionId,
            agentId: "hermes",
            source: "hermes",
            status: "working",
            metadata: { percent, note },
          });
        },
        onToolEvent: (toolEvent) => {
          if (controller.signal.aborted || isStaleRun(missionId, generation)) return;
          const metadata =
            toolEvent.type === "tool.started"
              ? { toolCallId: toolEvent.toolCallId, toolName: toolEvent.toolName, input: toolEvent.input }
              : toolEvent.type === "tool.completed"
                ? { toolCallId: toolEvent.toolCallId, toolName: toolEvent.toolName, output: toolEvent.output }
                : { toolCallId: toolEvent.toolCallId, toolName: toolEvent.toolName, error: toolEvent.error };
          emitEvent({
            type: toolEvent.type,
            missionId,
            agentId: "hermes",
            source: "hermes",
            status: toolEvent.type === "tool.failed" ? "failed" : toolEvent.type === "tool.completed" ? "completed" : "started",
            metadata,
          });
        },
        onToolRequest: (request) => handleToolRequest(missionId, generation, controller, request),
      }
    );
  } catch (err) {
    clearOwnController(missionId, controller);
    if (controller.signal.aborted) return; // pause()/cancelMission() already transitioned state.
    if (isStaleRun(missionId, generation)) {
      logStaleRun(missionId, generation, "executePipeline:catch");
      return;
    }
    setHermesAgentStatus(missionId, "failed");
    emitEvent({
      type: "agent.failed",
      missionId,
      agentId: "hermes",
      source: "hermes",
      status: "failed",
      metadata: { error: String(err) },
    });
    const finalMission = safeTransition(missionId, "FAILED");
    emitEvent({
      type: "mission.failed",
      missionId,
      source: "orchestrator",
      status: "failed",
      metadata: { error: String(err), classification: classifyHermesError(err) },
    });
    mirrorTaskStatus(missionId, finalMission, "failed");
    clearBudgetState(missionId);
    return;
  }
  clearOwnController(missionId, controller);

  // The pipeline's own adapter call resolved normally, but this run may have
  // been superseded (paused, then resumed into a newer run) while it was
  // in flight — some adapters don't reliably turn an abort into a rejection.
  // A stale run must never mutate mission/task state on a newer run's behalf.
  if (isStaleRun(missionId, generation)) {
    logStaleRun(missionId, generation, "executePipeline:resolved");
    return;
  }

  setHermesAgentStatus(missionId, hermesResult.success ? "completed" : "failed");
  emitEvent({
    type: "agent.completed",
    missionId,
    agentId: "hermes",
    source: "hermes",
    status: "completed",
    metadata: { success: hermesResult.success },
  });

  const maxTokens = mission.budget?.maxTokens;
  if (maxTokens != null && hermesResult.usage != null && hermesResult.usage.totalTokens > maxTokens) {
    failMissionOnBudgetViolation(
      missionId,
      generation,
      {
        dimension: "maxTokens",
        limit: maxTokens,
        actual: hermesResult.usage.totalTokens,
        reason: `Mission's real usage (${hermesResult.usage.totalTokens} tokens) exceeded its token budget (max ${maxTokens}). This is checked after Hermes reports final usage, so it cannot prevent the spend — it prevents the mission from being treated as a successful, in-budget completion.`,
      },
      { result: hermesResult }
    );
    return;
  }

  emitEvent({ type: "verification.started", missionId, source: "verifier", status: "started" });
  const latest = getMission(missionId);
  if (!latest) return;
  const verdict = verify({ successCriteria: latest.successCriteria, hermesResult });
  const hasSuccessCriteria = latest.successCriteria.length > 0;
  const completionOutcome = decideMissionCompletion(verdict, hasSuccessCriteria);

  if (completionOutcome === "FAILED") {
    // A real FAIL gets its own event type; an UNCERTAIN verdict that blocks
    // completion (criteria were declared, evidence was inconclusive) is
    // still a "verification.completed" — the verifier itself ran to
    // completion and returned a genuine answer, it just wasn't PASS. Only
    // the mission-level outcome (COMPLETED vs FAILED) is decided here.
    emitEvent({
      type: verdict.verdict === "FAIL" ? "verification.failed" : "verification.completed",
      missionId,
      source: "verifier",
      status: verdict.verdict.toLowerCase(),
      metadata: { ...verdict },
    });
    const classification = classifyVerificationFailure(verdict.verdict);
    const finalMission = safeTransition(missionId, "FAILED", { result: hermesResult, verification: verdict });
    emitEvent({
      type: "mission.failed",
      missionId,
      source: "orchestrator",
      status: "failed",
      metadata: { verdict, classification, hasSuccessCriteria },
    });
    mirrorTaskStatus(missionId, finalMission, "failed", hermesResult);
    clearBudgetState(missionId);
  } else {
    emitEvent({
      type: "verification.completed",
      missionId,
      source: "verifier",
      status: verdict.verdict.toLowerCase(),
      metadata: { ...verdict },
    });
    const finalMission = safeTransition(missionId, "COMPLETED", { result: hermesResult, verification: verdict });
    emitEvent({ type: "mission.completed", missionId, source: "orchestrator", status: "completed", metadata: { verdict } });
    mirrorTaskStatus(missionId, finalMission, "completed", hermesResult);
    clearBudgetState(missionId);
  }

  logger.info("mission.pipeline.completed", {
    missionId,
    durationMs: Date.now() - startedAt,
    verdict: verdict.verdict,
    outcome: completionOutcome,
  });
}
