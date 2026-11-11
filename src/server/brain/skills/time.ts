import type { BrainSkill, SkillSources } from "./types";

export function timeSkill(sources: Pick<SkillSources, "now">): BrainSkill {
  return {
    id: "time.read",
    description: "asks what time or what day it is",
    examples: ["what time is it", "what's the date today", "what day is it"],
    needsInternet: false,
    async run() {
      const now = sources.now();
      const time = now.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" });
      const date = now.toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric" });
      return { ok: true, reply: `It's ${time}, ${date}.` };
    },
  };
}
