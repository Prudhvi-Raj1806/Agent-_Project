import { getUiSystemStatus } from "@/server/system/view";
import { systemSkill } from "./system";
import { timeSkill } from "./time";
import type { BrainSkill, SkillSources } from "./types";

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

/** The fixed list of things the mini brain can do itself. Nothing outside it can ever run. */
export function createSkills(sources: SkillSources): BrainSkill[] {
  return [timeSkill(sources), systemSkill(sources)].map(neverThrows);
}

export function defaultSkillSources(): SkillSources {
  return {
    now: () => new Date(),
    system: () => getUiSystemStatus(),
  };
}
