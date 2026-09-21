import { nowIso } from "@/server/db/util";
import { emitEvent } from "@/server/events/service";
import { getHermesAdapter } from "@/server/hermes/factory";
import type { HermesResult, HermesToolRequest, ToolDecision } from "@/server/hermes/types";
import { logger } from "@/server/logging/logger";
import { selectModel } from "@/server/omnirouter/router";
import { recordAudit } from "@/server/security/audit";
import { getOwnerActor, getSystemActor } from "@/server/security/policy";
import { evaluateToolRequest } from "@/server/security/tool-policy";
import { verify } from "@/server/verification/verifier";
import { createCheckpoint } from "./checkpoints/service";
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
  violation: BudgetViolation,
  opts?: { controller?: AbortController; result?: HermesResult }
): void {
  opts?.controller?.abort();
  emitEvent({
    type: "mission.budget_exceeded",
    missionId,
    source: "orchestrator",
    status: "failed",
    metadata: { ...violation },
  });
  const finalMission = safeTransition(missionId, "FAILED", opts?.result ? { result: opts.result } : undefined);
  emitEvent({ type: "mission.failed", missionId, source: "orchestrator", status: "failed", metadata: { reason: violation.reason } });
  mirrorTaskStatus(missionId, finalMission, "failed", opts?.result);
  clearBudgetState(missionId);
}

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
 * `tool.requested` frame Hermes reports, before Hermes is told it may
 * proceed (see hermes/http-adapter.ts's handling of that frame).
 */
async function handleToolRequest(
  missionId: string,
  controller: AbortController,
  request: HermesToolRequest
): Promise<ToolDecision> {
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
      metadata: { toolCallId: request.toolCallId, toolName: request.toolName, reason: budgetViolation.reason },
    });
    failMissionOnBudgetViolation(missionId, budgetViolation, { controller });
    return { decision: "deny", reason: budgetViolation.reason };
  }

  const policy = evaluateToolRequest({
    toolName: request.toolName,
    allowedTools: mission.allowedTools,
    forbiddenActions: mission.forbiddenActions,
  });

  if (policy.verdict === "DENY") {
    recordAudit({
      actorId: getSystemActor().id,
      action: "tool.deny",
      resourceType: "tool_call",
      resourceId: request.toolCallId,
      result: "denied",
      reason: policy.reason,
    });
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
    recordAudit({
      actorId: getSystemActor().id,
      action: "tool.allow",
      resourceType: "tool_call",
      resourceId: request.toolCallId,
      result: "allowed",
      reason: policy.reason,
    });
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
  if (!controller.signal.aborted) {
    safeTransition(missionId, "RUNNING");
    setHermesAgentStatus(missionId, "working");
  }

  recordAudit({
    actorId: resolvedByHuman ? getOwnerActor().id : getSystemActor().id,
    action: decision.decision === "allow" ? "tool.allow" : "tool.deny",
    resourceType: "tool_call",
    resourceId: request.toolCallId,
    result: decision.decision === "allow" ? "allowed" : "denied",
    reason: decision.reason,
  });
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
  emitEvent({ type: "mission.started", missionId, source: "orchestrator", status: "running" });
  const task = ensureRootTask(missionId, mission.objective);
  emitEvent({
    type: "mission.task.created",
    missionId,
    source: "orchestrator",
    status: task.status,
    metadata: { taskId: task.id, title: task.title },
  });
  await executePipeline(missionId, 0);
}

export function resumeMission(missionId: string): Mission {
  const mission = transitionMission(missionId, "RUNNING");
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
  void executePipeline(missionId, mission.progress);
  return mission;
}

export function pauseMission(missionId: string): Mission {
  const mission = transitionMission(missionId, "PAUSED");
  controllers.get(missionId)?.abort();
  controllers.delete(missionId);
  setHermesAgentStatus(missionId, "waiting");
  emitEvent({ type: "mission.paused", missionId, source: "orchestrator", status: "paused" });
  mirrorTaskStatus(missionId, mission, "blocked");
  const checkpoint = createCheckpoint(missionId, "paused", {
    status: mission.status,
    progress: mission.progress,
    currentObjective: mission.currentObjective,
    agents: mission.agents,
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
  clearBudgetState(missionId);
  setHermesAgentStatus(missionId, "idle");
  emitEvent({ type: "mission.cancelled", missionId, source: "orchestrator", status: "cancelled" });
  mirrorTaskStatus(missionId, mission, "cancelled");
  return mission;
}

async function executePipeline(missionId: string, fromPercent: number): Promise<void> {
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
    emitEvent({ type: "mission.failed", missionId, source: "orchestrator", status: "failed", metadata: { reason } });
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
    if (!health.healthy) {
      const reason = "Hermes runtime is unreachable or unhealthy.";
      emitEvent({ type: "agent.failed", missionId, agentId: "hermes", source: "hermes", status: "failed", metadata: { reason, health } });
      const finalMission = safeTransition(missionId, "FAILED");
      emitEvent({ type: "mission.failed", missionId, source: "orchestrator", status: "failed", metadata: { reason } });
      mirrorTaskStatus(missionId, finalMission, "failed");
      clearBudgetState(missionId);
      return;
    }
  }

  const controller = new AbortController();
  controllers.set(missionId, controller);
  setHermesAgentStatus(missionId, "working");
  emitEvent({ type: "agent.started", missionId, agentId: "hermes", source: "hermes", status: "started" });

  let hermesResult: HermesResult;
  try {
    hermesResult = await adapter.execute(
      {
        missionId,
        objective: mission.objective,
        routing,
        fromPercent,
        allowedTools: mission.allowedTools,
        forbiddenActions: mission.forbiddenActions,
      },
      {
        signal: controller.signal,
        onProgress: (percent, note) => {
          if (controller.signal.aborted) return;
          const maxSteps = mission.budget?.maxSteps;
          if (maxSteps != null) {
            const state = getBudgetState(missionId);
            state.steps += 1;
            if (state.steps > maxSteps) {
              failMissionOnBudgetViolation(
                missionId,
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
          if (controller.signal.aborted) return;
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
        onToolRequest: (request) => handleToolRequest(missionId, controller, request),
      }
    );
  } catch (err) {
    controllers.delete(missionId);
    if (controller.signal.aborted) return; // pause()/cancelMission() already transitioned state.
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
    emitEvent({ type: "mission.failed", missionId, source: "orchestrator", status: "failed", metadata: { error: String(err) } });
    mirrorTaskStatus(missionId, finalMission, "failed");
    clearBudgetState(missionId);
    return;
  }
  controllers.delete(missionId);

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

  if (verdict.verdict === "FAIL") {
    emitEvent({ type: "verification.failed", missionId, source: "verifier", status: "failed", metadata: { ...verdict } });
    const finalMission = safeTransition(missionId, "FAILED", { result: hermesResult, verification: verdict });
    emitEvent({ type: "mission.failed", missionId, source: "orchestrator", status: "failed", metadata: { verdict } });
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

  logger.info("mission.pipeline.completed", { missionId, durationMs: Date.now() - startedAt, verdict: verdict.verdict });
}
