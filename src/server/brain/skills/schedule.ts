import type { BrainSkill, SkillSources } from "./types";

/** How many items are read out by name before the rest are only counted. */
const NAMED = 4;

function joinSpoken(parts: string[]): string {
  if (parts.length <= 1) return parts.join("");
  if (parts.length === 2) return `${parts[0]} and ${parts[1]}`;
  return `${parts.slice(0, -1).join(", ")}, and ${parts[parts.length - 1]}`;
}

export function scheduleSkill(sources: Pick<SkillSources, "schedule">): BrainSkill {
  return {
    id: "schedule.read",
    description: "asks what is on the calendar or schedule today",
    examples: ["what's on my calendar today", "do I have anything today", "what's next on my schedule"],
    needsInternet: false,
    async run() {
      const today = (await sources.schedule()).filter((item) => item.day === "today");
      if (today.length === 0) return { ok: true, reply: "Nothing is scheduled today." };

      const named = today.slice(0, NAMED).map((item) => `${item.title} at ${item.time}`);
      if (today.length === 1) return { ok: true, reply: `One thing today: ${named[0]}.` };

      const rest = today.length - named.length;
      const spoken = joinSpoken(rest > 0 ? [...named, `${rest} more`] : named);
      return { ok: true, reply: `${today.length} things today: ${spoken}.` };
    },
  };
}
