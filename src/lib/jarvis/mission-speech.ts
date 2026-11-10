import type { Mission, MissionStatus } from "@/server/missions/types";

const SETTLED: ReadonlySet<MissionStatus> = new Set([
  "COMPLETED",
  "FAILED",
  "CANCELLED",
  "BLOCKED",
  "WAITING_USER",
  "WAITING_EXTERNAL",
  "PAUSED",
]);

/** True once a mission has finished or stopped to wait on something — i.e. when there's something to say. */
export function isSettledStatus(status: MissionStatus): boolean {
  return SETTLED.has(status);
}

const MAX_SPOKEN_CHARS = 400;

/** Trims to a speakable length, cutting at a sentence boundary when one exists. */
function speakable(text: string): string {
  const clean = text.replace(/\s+/g, " ").trim();
  if (clean.length <= MAX_SPOKEN_CHARS) return clean;
  const cut = clean.slice(0, MAX_SPOKEN_CHARS);
  const lastStop = Math.max(cut.lastIndexOf(". "), cut.lastIndexOf("! "), cut.lastIndexOf("? "));
  return lastStop > 80 ? cut.slice(0, lastStop + 1) : `${cut.trimEnd()}…`;
}

/**
 * What Jarvis says aloud for a settled mission. It reports what the mission
 * actually established: an unverified result is spoken as unverified, a
 * failed verification replaces the optimistic summary, and a simulated run
 * is labelled as simulated — never presented as a confirmed outcome.
 */
export function missionSpeech(mission: Mission): string {
  switch (mission.status) {
    case "WAITING_USER": {
      const tool = mission.pendingToolApproval?.toolName;
      return tool
        ? `I need your approval to use ${tool} before I continue. Open the Work screen to review it.`
        : "I need your approval before I continue. Open the Work screen to review it.";
    }
    case "WAITING_EXTERNAL":
      return "I'm waiting on an external system before I can continue.";
    case "PAUSED":
      return "That mission is paused.";
    case "BLOCKED":
      return "That mission is blocked and can't continue.";
    case "CANCELLED":
      return "That mission was cancelled.";
    case "FAILED": {
      const detail = mission.result?.summary?.trim();
      return detail ? `That mission failed. ${speakable(detail)}` : "That mission failed.";
    }
    case "COMPLETED":
      break;
    default:
      return "That mission is still running.";
  }

  const verdict = mission.verification?.verdict;
  if (verdict === "FAIL") {
    const reason = mission.verification?.reasons[0];
    return speakable(`I finished, but verification failed.${reason ? ` ${reason}` : ""}`);
  }

  // `output` is what the agent actually produced; `summary` is often a generic
  // status line ("Hermes Agent run completed"), so it's only the fallback.
  const body = (mission.result?.output?.trim() || mission.result?.summary?.trim() || "").trim();
  if (!body) return "The mission completed, but there is nothing to report.";

  const spoken = speakable(body);
  const parts = [/[.!?…]$/.test(spoken) ? spoken : `${spoken}.`];
  if (verdict === "UNCERTAIN") parts.push("I couldn't independently verify that.");
  if (mission.result?.source === "mock") parts.push("This was a simulated run.");
  return parts.join(" ");
}
