import type { BrainSkill, SkillSources } from "./types";

const UNREACHABLE = { ok: false, reply: "I can't reach the weather right now." };

export function weatherSkill(sources: Pick<SkillSources, "weather">): BrainSkill {
  return {
    id: "weather.read",
    description: "asks about the weather or the temperature outside",
    examples: ["is it going to rain", "what's the temperature outside", "weather today"],
    needsInternet: true,
    async run() {
      let weather;
      try {
        weather = await sources.weather();
      } catch {
        return UNREACHABLE;
      }
      if (!weather) return UNREACHABLE;
      return { ok: true, reply: `It's ${weather.temperatureC} degrees and ${weather.label.toLowerCase()}.` };
    },
  };
}
