import { describe, expect, it } from "vitest";
import { buildBriefing } from "./briefing";
import type { ScheduleItem, SystemStatus, WeatherStatus } from "@/lib/data/types";

const system: SystemStatus = {
  metrics: [
    { kind: "cpu", label: "CPU", percent: 14 },
    { kind: "gpu", label: "GPU", percent: null },
    { kind: "ram", label: "RAM", percent: 62 },
    { kind: "disk", label: "Disk", percent: 40 },
  ],
  temperatureC: null,
  uptime: "3h 12m",
  networkDownMbps: null,
  networkUpMbps: null,
};

const weather: WeatherStatus = { temperatureC: 31, condition: "clear", label: "Clear" };
const schedule: ScheduleItem[] = [
  { id: "1", time: "10:00 PM", title: "Standup", day: "today" },
  { id: "2", time: "9:00 AM", title: "Review", day: "tomorrow" },
];

const evening = new Date(2026, 9, 12, 20, 0, 0);

describe("buildBriefing", () => {
  it("greets by time of day and reports live numbers", () => {
    const text = buildBriefing({ now: evening, system, schedule, weather });
    expect(text).toContain("Good evening");
    expect(text).toContain("CPU at 14 percent");
    expect(text).toContain("memory at 62 percent");
    expect(text).toContain("31 degrees");
    expect(text).toContain("Standup at 10:00 PM");
  });

  it("never invents a figure for a signal that is unavailable", () => {
    const text = buildBriefing({ now: evening, system, schedule, weather });
    expect(text).not.toMatch(/GPU/i);
    expect(text).not.toMatch(/null|NaN|undefined/);
  });

  it("degrades cleanly when weather and schedule are missing", () => {
    const text = buildBriefing({ now: new Date(2026, 9, 12, 8, 0, 0), system, schedule: [], weather: null });
    expect(text).toContain("Good morning");
    expect(text).toContain("Nothing is scheduled");
    expect(text).not.toContain("degrees");
  });
});
