import { buildBriefing } from "@/lib/jarvis/briefing";
import type { BrainSkill, SkillSources } from "./types";

type Needed = Pick<SkillSources, "now" | "ownerName" | "system" | "schedule" | "weather">;

export function briefingSkill(sources: Needed): BrainSkill {
  return {
    id: "briefing",
    description: "asks for the spoken briefing: a short rundown of the system, the weather and the day",
    examples: ["brief me", "give me the rundown", "morning briefing"],
    needsInternet: false,
    async run() {
      const [system, schedule] = await Promise.all([sources.system(), sources.schedule()]);
      // The briefing leaves the weather out when it can't be reached, so being offline never blocks it.
      const weather = await sources.weather().catch(() => null);
      return {
        ok: true,
        reply: buildBriefing({ now: sources.now(), ownerName: sources.ownerName(), system, schedule, weather }),
      };
    },
  };
}
