import { emitEvent } from "@/server/events/service";
import { getHermesAdapter } from "@/server/hermes/factory";
import { PolicyError, ValidationError } from "@/server/missions/errors";
import { startMission } from "@/server/missions/orchestrator";
import { createMission } from "@/server/missions/service";
import { getOwnerActor } from "@/server/security/policy";
import { getServiceController } from "@/server/services";
import { getSetting } from "@/server/settings/store";
import type { BrainDeps } from "./index";
import { createOllamaClient } from "./ollama";
import { resolvePersona } from "./persona";
import { createSkills, defaultSkillSources } from "./skills";

const START_WAIT_MS = 20_000;

/**
 * A hand-off is an ordinary mission: created and started through the same
 * service the Missions API uses, so policy, approvals and verification apply
 * exactly as they do for a request typed into the command bar today.
 */
async function handoff(objective: string): ReturnType<BrainDeps["handoff"]> {
  const health = await getHermesAdapter()
    .checkHealth()
    .catch(() => ({ healthy: false }));
  if (!health.healthy) return { hermesDown: true };
  try {
    const mission = createMission({ objective }, getOwnerActor());
    startMission(mission.id);
    return { missionId: mission.id };
  } catch (err) {
    if (err instanceof PolicyError || err instanceof ValidationError) return { refused: err.message };
    throw err;
  }
}

/** Starts Ollama through the dashboard's own Services control. Windows only, like every start/stop there. */
async function startModelServer(): Promise<boolean> {
  if (process.platform !== "win32") return false;
  const timedOut = new Promise<false>((resolve) => {
    setTimeout(() => resolve(false), START_WAIT_MS).unref?.();
  });
  const started = getServiceController()
    .run("ollama", "start")
    .then((status) => status.running)
    .catch(() => false);
  return Promise.race([started, timedOut]);
}

export function defaultBrainDeps(): BrainDeps {
  return {
    settings: () => ({ enabled: getSetting("brain.enabled"), model: getSetting("brain.model") }),
    client: createOllamaClient(),
    skills: createSkills(defaultSkillSources()),
    persona: resolvePersona,
    handoff,
    startModelServer,
    emit: (type, metadata) => {
      const missionId = typeof metadata.missionId === "string" ? metadata.missionId : null;
      emitEvent({ type, source: "brain", missionId, metadata });
    },
    now: () => performance.now(),
  };
}
