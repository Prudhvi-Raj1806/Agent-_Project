import type { BrainSkill, SkillSources } from "./types";

const UNREADABLE = { ok: false, reply: "I can't read the system numbers right now." };

export function systemSkill(sources: Pick<SkillSources, "system">): BrainSkill {
  return {
    id: "system.read",
    description: "asks how this PC is doing: processor, memory, load",
    examples: ["how's the cpu doing", "is my memory full", "how is the system running"],
    needsInternet: false,
    async run() {
      let status;
      try {
        status = await sources.system();
      } catch {
        return UNREADABLE;
      }
      const percentOf = (kind: string) => status.metrics.find((m) => m.kind === kind)?.percent ?? null;
      const cpu = percentOf("cpu");
      const ram = percentOf("ram");

      // A number this PC can't report is left out, never spoken as zero.
      const parts: string[] = [];
      if (cpu !== null) parts.push(`CPU at ${cpu} percent`);
      if (ram !== null) parts.push(`memory at ${ram} percent`);
      if (parts.length === 0) return UNREADABLE;

      const sentence = parts.join(", ");
      return { ok: true, reply: `${sentence.charAt(0).toUpperCase()}${sentence.slice(1)}.` };
    },
  };
}
