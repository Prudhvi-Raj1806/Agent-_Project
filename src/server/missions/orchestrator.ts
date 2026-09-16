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
  await executePipeline(missionId, 0);
}

export function resumeMission(missionId: string): Mission {
  const mission = transitionMission(missionId, "RUNNING");
  setHermesAgentStatus(missionId, "working");
  emitEvent({ type: "mission.resumed", missionId, source: "orchestrator", status: "running" });
  void executePipeline(missionId, mission.progress);
  return mission;
}

export function pauseMission(missionId: string): Mission {
  const mission = transitionMission(missionId, "PAUSED");
  controllers.get(missionId)?.abort();
  controllers.delete(missionId);
  setHermesAgentStatus(missionId, "waiting");
  emitEvent({ type: "mission.paused", missionId, source: "orchestrator", status: "paused" });
  return mission;
}

export function cancelMission(missionId: string): Mission {
  const mission = transitionMission(missionId, "CANCELLED");
  controllers.get(missionId)?.abort();
  controllers.delete(missionId);
  setHermesAgentStatus(missionId, "idle");
  emitEvent({ type: "mission.cancelled", missionId, source: "orchestrator", status: "cancelled" });
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
    safeTransition(missionId, "FAILED");
    emitEvent({ type: "mission.failed", missionId, source: "orchestrator", status: "failed", metadata: { reason } });
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
      safeTransition(missionId, "FAILED");
      emitEvent({ type: "mission.failed", missionId, source: "orchestrator", status: "failed", metadata: { reason } });
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
    safeTransition(missionId, "FAILED");
    emitEvent({ type: "mission.failed", missionId, source: "orchestrator", status: "failed", metadata: { error: String(err) } });
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

  emitEvent({ type: "verification.started", missionId, source: "verifier", status: "started" });
  const latest = getMission(missionId);
  if (!latest) return;
  const verdict = verify({ successCriteria: latest.successCriteria, hermesResult });

  if (verdict.verdict === "FAIL") {
    emitEvent({ type: "verification.failed", missionId, source: "verifier", status: "failed", metadata: { ...verdict } });
    safeTransition(missionId, "FAILED", { result: hermesResult, verification: verdict });
    emitEvent({ type: "mission.failed", missionId, source: "orchestrator", status: "failed", metadata: { verdict } });
  } else {
    emitEvent({
      type: "verification.completed",
      missionId,
      source: "verifier",
      status: verdict.verdict.toLowerCase(),
      metadata: { ...verdict },
    });
    safeTransition(missionId, "COMPLETED", { result: hermesResult, verification: verdict });
    emitEvent({ type: "mission.completed", missionId, source: "orchestrator", status: "completed", metadata: { verdict } });
  }

  logger.info("mission.pipeline.completed", { missionId, durationMs: Date.now() - startedAt, verdict: verdict.verdict });
}
