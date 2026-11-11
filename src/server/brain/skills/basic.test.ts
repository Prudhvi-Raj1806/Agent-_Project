import { describe, expect, it } from "vitest";
import type { SystemStatus } from "@/lib/data/types";
import { createSkills } from "./index";
import type { SkillSources } from "./types";

const systemWith = (cpu: number | null, ram: number | null): SystemStatus => ({
  metrics: [
    { kind: "cpu", label: "CPU", percent: cpu },
    { kind: "ram", label: "Memory", percent: ram },
  ],
  temperatureC: null,
  uptime: "1h",
  networkDownMbps: null,
  networkUpMbps: null,
});

function sources(overrides: Partial<SkillSources> = {}): SkillSources {
  return {
    now: () => new Date(2026, 10, 11, 14, 18, 0),
    system: async () => systemWith(14, 62),
    ...overrides,
  } as SkillSources;
}

const run = (id: string, overrides: Partial<SkillSources> = {}) => {
  const skill = createSkills(sources(overrides)).find((s) => s.id === id);
  if (!skill) throw new Error(`No skill "${id}".`);
  return skill.run();
};

describe("time.read", () => {
  it("reads the clock and the date", async () => {
    expect(await run("time.read")).toEqual({ ok: true, reply: "It's 2:18 PM, Wednesday, November 11." });
  });
});

describe("system.read", () => {
  it("reports processor and memory load", async () => {
    expect(await run("system.read")).toEqual({ ok: true, reply: "CPU at 14 percent, memory at 62 percent." });
  });

  it("leaves out a number this PC can't report, never inventing one", async () => {
    expect(await run("system.read", { system: async () => systemWith(null, 62) })).toEqual({
      ok: true,
      reply: "Memory at 62 percent.",
    });
    expect(await run("system.read", { system: async () => systemWith(14, null) })).toEqual({
      ok: true,
      reply: "CPU at 14 percent.",
    });
  });

  it("says so when it can't read anything", async () => {
    const failed = { ok: false, reply: "I can't read the system numbers right now." };
    expect(await run("system.read", { system: async () => systemWith(null, null) })).toEqual(failed);
    expect(
      await run("system.read", {
        system: async () => {
          throw new Error("boom");
        },
      }),
    ).toEqual(failed);
  });
});
