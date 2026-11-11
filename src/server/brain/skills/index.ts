import { runQuickAction } from "@/server/actions/service";
import { getUiSchedule } from "@/server/schedule/view";
import { getOwnerName } from "@/server/settings/brand";
import { getNowPlaying, pause, play, skipNext, skipPrevious } from "@/server/spotify/client";
import { getUiSystemStatus } from "@/server/system/view";
import { getCurrentWeather } from "@/server/weather/service";
import { actionSkills } from "./actions";
import { briefingSkill } from "./briefing";
import { controlComputerSkill } from "./control-computer";
import { musicSkills } from "./music";
import { scheduleSkill } from "./schedule";
import { systemSkill } from "./system";
import { timeSkill } from "./time";
import type { BrainSkill, SkillSources } from "./types";
import { weatherSkill } from "./weather";

export type { BrainSkill, SkillSources } from "./types";

const UNEXPECTED = { ok: false, reply: "Something went wrong with that." };

/** No skill may throw to its caller: an unexpected failure becomes a spoken one. */
function neverThrows(skill: BrainSkill): BrainSkill {
  return {
    ...skill,
    async run() {
      try {
        return await skill.run();
      } catch {
        return UNEXPECTED;
      }
    },
  };
}

/**
 * The fixed list of things the mini brain can do itself. Nothing outside it
 * can ever run, and each entry is something a dashboard button already does.
 */
export function createSkills(sources: SkillSources): BrainSkill[] {
  return [
    timeSkill(sources),
    scheduleSkill(sources),
    systemSkill(sources),
    briefingSkill(sources),
    ...actionSkills(sources),
    controlComputerSkill(),
    weatherSkill(sources),
    ...musicSkills(sources),
  ].map(neverThrows);
}

export function defaultSkillSources(): SkillSources {
  return {
    now: () => new Date(),
    ownerName: () => getOwnerName(),
    system: () => getUiSystemStatus(),
    schedule: () => getUiSchedule(),
    weather: () => getCurrentWeather(),
    // No verify token: every action the brain may run is "safe", and a risky one would be refused here.
    runAction: async (id) => {
      const { ok, message } = await runQuickAction(id, null);
      return { ok, message };
    },
    music: {
      play: () => play(),
      pause: () => pause(),
      next: () => skipNext(),
      previous: () => skipPrevious(),
      nowPlaying: () => getNowPlaying(),
    },
  };
}
