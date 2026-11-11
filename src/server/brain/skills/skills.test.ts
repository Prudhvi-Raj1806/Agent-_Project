import { describe, expect, it, vi } from "vitest";
import type { ScheduleItem, SystemStatus, WeatherStatus } from "@/lib/data/types";
import { buildBriefing } from "@/lib/jarvis/briefing";
import {
  SpotifyNoActiveDeviceError,
  SpotifyNotConnectedError,
  SpotifyPremiumRequiredError,
} from "@/server/spotify/client";
import type { SpotifyNowPlaying } from "@/server/spotify/types";
import { createSkills } from "./index";
import type { SkillSources } from "./types";

const now = new Date(2026, 10, 11, 20, 0, 0);
const system: SystemStatus = {
  metrics: [
    { kind: "cpu", label: "CPU", percent: 14 },
    { kind: "ram", label: "Memory", percent: 62 },
  ],
  temperatureC: null,
  uptime: "1h",
  networkDownMbps: null,
  networkUpMbps: null,
};
const weather: WeatherStatus = { temperatureC: 31, condition: "clear", label: "Clear" };
const item = (title: string, time: string, day: "today" | "tomorrow" = "today"): ScheduleItem => ({
  id: title,
  title,
  time,
  day,
});
const playing: SpotifyNowPlaying = {
  isPlaying: true,
  track: { id: "t", title: "Bloom", artist: "The Paper Kites", albumArtUrl: null, durationMs: 1, progressMs: 0 },
  device: null,
};

function sources(overrides: Partial<SkillSources> = {}): SkillSources {
  return {
    now: () => now,
    ownerName: () => "Raj",
    system: async () => system,
    schedule: async () => [],
    weather: async () => weather,
    runAction: async () => ({ ok: true, message: "Done." }),
    music: {
      play: async () => {},
      pause: async () => {},
      next: async () => {},
      previous: async () => {},
      nowPlaying: async () => playing,
    },
    ...overrides,
  };
}

const run = (id: string, overrides: Partial<SkillSources> = {}) => {
  const skill = createSkills(sources(overrides)).find((s) => s.id === id);
  if (!skill) throw new Error(`No skill "${id}".`);
  return skill.run();
};
const failing = (err: Error) => async () => {
  throw err;
};

describe("the skill list", () => {
  const skills = createSkills(sources());

  it("is exactly the sixteen skills of the first version", () => {
    expect(skills.map((s) => s.id).sort()).toEqual(
      [
        "action.open-obsidian",
        "action.open-vscode",
        "action.take-notes",
        "action.take-screenshot",
        "action.welcome-routine",
        "briefing",
        "control-computer",
        "music.next",
        "music.now-playing",
        "music.pause",
        "music.play",
        "music.previous",
        "schedule.read",
        "system.read",
        "time.read",
        "weather.read",
      ].sort(),
    );
  });

  it("gives the router a description and two to four examples for each", () => {
    for (const skill of skills) {
      expect(skill.description.length, skill.id).toBeGreaterThan(5);
      expect(skill.examples.length, skill.id).toBeGreaterThanOrEqual(2);
      expect(skill.examples.length, skill.id).toBeLessThanOrEqual(4);
    }
  });

  it("marks only weather and music as needing the internet", () => {
    expect(skills.filter((s) => s.needsInternet).map((s) => s.id).sort()).toEqual([
      "music.next",
      "music.now-playing",
      "music.pause",
      "music.play",
      "music.previous",
      "weather.read",
    ]);
  });

  it("turns an unexpected failure into a spoken one instead of throwing", async () => {
    expect(await run("schedule.read", { schedule: failing(new Error("database is locked")) })).toEqual({
      ok: false,
      reply: "Something went wrong with that.",
    });
  });
});

describe("schedule.read", () => {
  it("says so when nothing is scheduled today", async () => {
    expect(await run("schedule.read")).toEqual({ ok: true, reply: "Nothing is scheduled today." });
    expect(await run("schedule.read", { schedule: async () => [item("Review", "9:00 AM", "tomorrow")] })).toEqual({
      ok: true,
      reply: "Nothing is scheduled today.",
    });
  });

  it("reads one item", async () => {
    expect(await run("schedule.read", { schedule: async () => [item("Standup", "10:00 PM")] })).toEqual({
      ok: true,
      reply: "One thing today: Standup at 10:00 PM.",
    });
  });

  it("reads two items", async () => {
    expect(
      await run("schedule.read", { schedule: async () => [item("A", "9:00 AM"), item("B", "1:00 PM")] }),
    ).toEqual({ ok: true, reply: "2 things today: A at 9:00 AM and B at 1:00 PM." });
  });

  it("reads several items, leaving out tomorrow's", async () => {
    const schedule = async () => [
      item("A", "9:00 AM"),
      item("B", "1:00 PM"),
      item("C", "4:00 PM"),
      item("Z", "8:00 AM", "tomorrow"),
    ];
    expect(await run("schedule.read", { schedule })).toEqual({
      ok: true,
      reply: "3 things today: A at 9:00 AM, B at 1:00 PM, and C at 4:00 PM.",
    });
  });

  it("names the first four and counts the rest", async () => {
    const schedule = async () => ["A", "B", "C", "D", "E", "F"].map((t) => item(t, "9:00 AM"));
    expect(await run("schedule.read", { schedule })).toEqual({
      ok: true,
      reply: "6 things today: A at 9:00 AM, B at 9:00 AM, C at 9:00 AM, D at 9:00 AM, and 2 more.",
    });
  });
});

describe("briefing", () => {
  it("is the same briefing the Brief me button speaks", async () => {
    const schedule = [item("Standup", "10:00 PM")];
    expect(await run("briefing", { schedule: async () => schedule })).toEqual({
      ok: true,
      reply: buildBriefing({ now, ownerName: "Raj", system, schedule, weather }),
    });
  });

  it("still briefs when the weather can't be reached", async () => {
    const result = await run("briefing", { weather: failing(new Error("offline")) });
    expect(result.ok).toBe(true);
    expect(result.reply).toBe(buildBriefing({ now, ownerName: "Raj", system, schedule: [], weather: null }));
  });
});

describe("quick actions", () => {
  it.each(["open-vscode", "open-obsidian", "take-notes", "take-screenshot", "welcome-routine"])(
    "action.%s runs that quick action and speaks its message",
    async (id) => {
      const runAction = vi.fn(async () => ({ ok: true, message: "Opened it." }));
      expect(await run(`action.${id}`, { runAction })).toEqual({ ok: true, reply: "Opened it." });
      expect(runAction).toHaveBeenCalledExactlyOnceWith(id);
    },
  );

  it("says why when the action fails", async () => {
    const runAction = async () => ({ ok: false, message: "VS Code isn't installed." });
    expect(await run("action.open-vscode", { runAction })).toEqual({
      ok: false,
      reply: "I couldn't do that: VS Code isn't installed.",
    });
  });
});

describe("control-computer", () => {
  it("only points to the button, and never runs anything", async () => {
    const runAction = vi.fn(async () => ({ ok: true, message: "x" }));
    expect(await run("control-computer", { runAction })).toEqual({
      ok: true,
      reply: "That one needs your passcode. Use the Control Computer button.",
    });
    expect(runAction).not.toHaveBeenCalled();
  });
});

describe("weather.read", () => {
  it("reads the temperature and conditions", async () => {
    expect(await run("weather.read")).toEqual({ ok: true, reply: "It's 31 degrees and clear." });
  });

  it("says so when the weather can't be reached", async () => {
    const offline = { ok: false, reply: "I can't reach the weather right now." };
    expect(await run("weather.read", { weather: async () => null })).toEqual(offline);
    expect(await run("weather.read", { weather: failing(new Error("offline")) })).toEqual(offline);
  });
});

describe("music", () => {
  it.each([
    ["music.play", "play", "Playing."],
    ["music.pause", "pause", "Paused."],
    ["music.next", "next", "Skipped."],
    ["music.previous", "previous", "Going back."],
  ] as const)("%s calls Spotify and confirms", async (id, method, reply) => {
    const call = vi.fn(async () => {});
    const music = { ...sources().music, [method]: call };
    expect(await run(id, { music })).toEqual({ ok: true, reply });
    expect(call).toHaveBeenCalledOnce();
  });

  it("names the track that is playing", async () => {
    expect(await run("music.now-playing")).toEqual({ ok: true, reply: "Playing Bloom by The Paper Kites." });
  });

  it("says nothing is playing when paused or there is no track", async () => {
    const quiet = { ok: true, reply: "Nothing is playing." };
    const music = (state: SpotifyNowPlaying) => ({ ...sources().music, nowPlaying: async () => state });
    expect(await run("music.now-playing", { music: music({ ...playing, isPlaying: false }) })).toEqual(quiet);
    expect(await run("music.now-playing", { music: music({ isPlaying: true, track: null, device: null }) })).toEqual(quiet);
  });

  it.each([
    [new SpotifyNotConnectedError(), "Spotify isn't connected. Connect it in Settings."],
    [new SpotifyNoActiveDeviceError(), "No Spotify player is open."],
    [new SpotifyPremiumRequiredError(), "Spotify needs Premium for that."],
    [new TypeError("fetch failed"), "I can't reach Spotify right now."],
  ])("explains a Spotify failure (%s)", async (err, reply) => {
    const music = { ...sources().music, pause: failing(err), nowPlaying: failing(err) };
    expect(await run("music.pause", { music })).toEqual({ ok: false, reply });
    expect(await run("music.now-playing", { music })).toEqual({ ok: false, reply });
  });
});
