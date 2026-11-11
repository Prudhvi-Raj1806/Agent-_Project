import { beforeEach, describe, expect, it, vi } from "vitest";
import { handleRequest, lastAnswerMs, resetBrainStateForTests, type BrainDeps } from "./index";
import type { BrainSkill } from "./skills/types";
import { ModelTimeoutError, ModelUnavailableError, type ModelClient } from "./types";

type ChatInput = Parameters<ModelClient["chat"]>[0];
type Step = string | Error | ((input: ChatInput) => string | Promise<string>);

const systemSkill: BrainSkill = {
  id: "system.read",
  description: "asks about this PC",
  examples: ["how's the cpu doing", "is my memory full"],
  needsInternet: false,
  run: async () => ({ ok: true, reply: "CPU at 14 percent." }),
};

/** The model answers each call from the script, in order. Running out of script fails the test. */
function scriptedClient(...script: Step[]) {
  const seen: ChatInput[] = [];
  const client: ModelClient = {
    chat: async (input) => {
      seen.push(input);
      const step = script[seen.length - 1];
      if (step === undefined) throw new Error("The model was called more often than the test expects.");
      if (step instanceof Error) throw step;
      return typeof step === "function" ? step(input) : step;
    },
    status: async () => ({ running: true, installed: [], loaded: [] }),
  };
  return { client, seen };
}

function makeDeps(client: ModelClient, overrides: Partial<BrainDeps> = {}) {
  const events: { type: string; metadata: Record<string, unknown> }[] = [];
  let clock = 1_000;
  const deps: BrainDeps = {
    settings: () => ({ enabled: true, model: "phi4-mini" }),
    client,
    skills: [systemSkill],
    persona: async () => ({ text: "You are Veda.", source: "starter" }),
    handoff: vi.fn(async () => ({ missionId: "mission_1" })),
    startModelServer: vi.fn(async () => false),
    emit: (type, metadata) => events.push({ type, metadata }),
    now: () => (clock += 250),
    ...overrides,
  };
  return { deps, events };
}

const pick = (choice: string) => `{"choice":"${choice}"}`;
const TALK = '{"answer":"talk"}';
const ask = (text: string, deps: BrainDeps) => handleRequest({ text, history: [] }, deps);

beforeEach(() => {
  resetBrainStateForTests();
});

describe("a skill", () => {
  it("runs and its reply is returned, with the decision and the outcome logged", async () => {
    const { client } = scriptedClient(pick("system.read"));
    const { deps, events } = makeDeps(client);

    expect(await ask("how's the cpu", deps)).toEqual({
      kind: "reply",
      choice: "system.read",
      ok: true,
      text: "CPU at 14 percent.",
    });
    expect(events.map((e) => e.type)).toEqual(["brain.routed", "brain.skill.completed"]);
    expect(events[0].metadata).toMatchObject({ choice: "system.read", text: "how's the cpu" });
    expect(typeof events[0].metadata.ms).toBe("number");
  });

  it("logs only the first 200 characters of the request", async () => {
    const { client } = scriptedClient(pick("system.read"));
    const { deps, events } = makeDeps(client);
    await ask("x".repeat(500), deps);
    expect(events[0].metadata.text).toHaveLength(200);
  });

  it("reports a failed skill as a reply that is not ok", async () => {
    const failing = { ...systemSkill, run: async () => ({ ok: false, reply: "I can't read the system numbers right now." }) };
    const { client } = scriptedClient(pick("system.read"));
    const { deps, events } = makeDeps(client, { skills: [failing] });

    expect(await ask("how's the cpu", deps)).toMatchObject({ kind: "reply", ok: false });
    expect(events.map((e) => e.type)).toEqual(["brain.routed", "brain.skill.failed"]);
  });
});

describe("chat", () => {
  it("replies in the persona, with the earlier exchanges", async () => {
    const { client, seen } = scriptedClient(pick("chat"), TALK, "Paris.");
    const { deps } = makeDeps(client);
    const history = [
      { role: "user" as const, content: "hi" },
      { role: "assistant" as const, content: "Hello." },
    ];

    expect(await handleRequest({ text: "capital of France?", history }, deps)).toEqual({
      kind: "reply",
      choice: "chat",
      ok: true,
      text: "Paris.",
    });
    expect(seen[2].messages[0].content).toContain("You are Veda.");
    expect(seen[2].messages.slice(1)).toEqual([...history, { role: "user", content: "capital of France?" }]);
  });

  it("says so when the reply takes too long", async () => {
    const { client } = scriptedClient(pick("chat"), TALK, new ModelTimeoutError("slow"));
    expect(await ask("tell me a story", makeDeps(client).deps)).toEqual({
      kind: "reply",
      choice: "chat",
      ok: false,
      text: "That took too long. Try again?",
    });
  });

  it("hands off instead of speaking a reply that claims an action", async () => {
    const { client } = scriptedClient(pick("chat"), TALK, "Raj, I've sent a birthday message to your brother.");
    const { deps, events } = makeDeps(client);

    expect(await ask("get a birthday note to my brother", deps)).toEqual({
      kind: "handoff",
      text: "That needs Hermes. Handing it over.",
      missionId: "mission_1",
    });
    expect(deps.handoff).toHaveBeenCalledExactlyOnceWith("get a birthday note to my brother");
    expect(events.map((e) => e.type)).toContain("brain.handoff");
  });

  it("treats an empty reply as unclear rather than speaking nothing", async () => {
    const { client } = scriptedClient(pick("chat"), TALK, "   ");
    expect(await ask("hmm", makeDeps(client).deps)).toMatchObject({ kind: "unclear" });
  });
});

describe("hand-off to Hermes", () => {
  it("says it is handing over and starts a mission with the original request", async () => {
    const { client } = scriptedClient(pick("hermes"));
    const { deps, events } = makeDeps(client);

    expect(await ask("check my inbox for anything urgent", deps)).toEqual({
      kind: "handoff",
      text: "That needs Hermes. Handing it over.",
      missionId: "mission_1",
    });
    expect(deps.handoff).toHaveBeenCalledExactlyOnceWith("check my inbox for anything urgent");
    expect(events.at(-1)).toEqual({ type: "brain.handoff", metadata: { missionId: "mission_1" } });
  });

  it.each([
    ["Hermes, email my landlord", "email my landlord"],
    ["hermes: email my landlord", "email my landlord"],
    ["HERMES email my landlord", "email my landlord"],
    ["  Hermes ,  what's the news", "what's the news"],
  ])("%j skips the model and hands over %j", async (text, objective) => {
    const { client, seen } = scriptedClient();
    const { deps } = makeDeps(client);

    expect(await ask(text, deps)).toMatchObject({ kind: "handoff", missionId: "mission_1" });
    expect(deps.handoff).toHaveBeenCalledExactlyOnceWith(objective);
    expect(seen).toHaveLength(0);
  });

  it.each(["Hermes's model is slow, why?", "hermes-agent status", "Hermesian poetry", "Hermes’s config"])(
    "%j is an ordinary request that merely starts with the word, not a hand-off prefix",
    async (text) => {
      const { client, seen } = scriptedClient(pick("chat"), TALK, "Because it is small.");
      const { deps } = makeDeps(client);

      expect(await ask(text, deps)).toMatchObject({ kind: "reply", choice: "chat" });
      expect(deps.handoff).not.toHaveBeenCalled();
      expect(seen).toHaveLength(3);
    },
  );

  it.each(["Hermes,", "hermes", "Hermes:  "])("%j alone is unclear and starts nothing", async (text) => {
    const { client } = scriptedClient();
    const { deps } = makeDeps(client);

    expect(await ask(text, deps)).toEqual({ kind: "unclear", text: "I didn't catch what you want. Say it another way?" });
    expect(deps.handoff).not.toHaveBeenCalled();
  });

  it("says so when Hermes isn't running", async () => {
    const { client } = scriptedClient(pick("hermes"));
    const { deps } = makeDeps(client, { handoff: async () => ({ hermesDown: true }) });

    expect(await ask("research laptops", deps)).toEqual({
      kind: "reply",
      choice: "hermes",
      ok: false,
      text: "Hermes isn't running. Start it from Settings, Services.",
    });
  });

  it("passes on the reason when the mission is refused", async () => {
    const { client } = scriptedClient(pick("hermes"));
    const { deps } = makeDeps(client, { handoff: async () => ({ refused: "That objective is not allowed." }) });

    expect(await ask("do the forbidden thing", deps)).toEqual({
      kind: "reply",
      choice: "hermes",
      ok: false,
      text: "That objective is not allowed.",
    });
  });
});

describe("unclear", () => {
  it("says it was slow, not that it misheard, when routing times out", async () => {
    const { client } = scriptedClient(new ModelTimeoutError("slow"));
    const { deps } = makeDeps(client);

    expect(await ask("what time is it", deps)).toEqual({ kind: "unclear", text: "That took too long. Try again?" });
    expect(deps.handoff).not.toHaveBeenCalled();
  });

  it("asks for another try", async () => {
    const { client } = scriptedClient(pick("unclear"));
    expect(await ask("the uh", makeDeps(client).deps)).toEqual({
      kind: "unclear",
      text: "I didn't catch what you want. Say it another way?",
    });
  });
});

describe("when the mini brain is off or unavailable", () => {
  it("hands everything to Hermes silently when switched off", async () => {
    const { client, seen } = scriptedClient();
    const { deps } = makeDeps(client, { settings: () => ({ enabled: false, model: "phi4-mini" }) });

    expect(await ask("what time is it", deps)).toEqual({ kind: "handoff", text: "", missionId: "mission_1" });
    expect(seen).toHaveLength(0);
  });

  it("starts the model server and answers once it is up", async () => {
    const { client } = scriptedClient(new ModelUnavailableError("down"), pick("system.read"));
    const { deps } = makeDeps(client, { startModelServer: vi.fn(async () => true) });

    expect(await ask("how's the cpu", deps)).toMatchObject({ kind: "reply", choice: "system.read", ok: true });
    expect(deps.startModelServer).toHaveBeenCalledOnce();
  });

  it("hands off with a notice when the model server can't be started", async () => {
    const { client } = scriptedClient(new ModelUnavailableError("down"));
    const { deps, events } = makeDeps(client);

    expect(await ask("how's the cpu", deps)).toEqual({
      kind: "handoff",
      text: "",
      missionId: "mission_1",
      notice: "The mini brain is off.",
    });
    expect(events.map((e) => e.type)).toContain("brain.unavailable");
  });

  it("does not try to start it twice when the model is still missing after a start", async () => {
    const { client } = scriptedClient(new ModelUnavailableError("down"), new ModelUnavailableError("model missing"));
    const { deps } = makeDeps(client, { startModelServer: vi.fn(async () => true) });

    expect(await ask("how's the cpu", deps)).toMatchObject({ kind: "handoff", notice: "The mini brain is off." });
    expect(deps.startModelServer).toHaveBeenCalledOnce();
  });

  it("makes one start attempt for two requests that arrive together", async () => {
    let release: (up: boolean) => void = () => {};
    const startModelServer = vi.fn(() => new Promise<boolean>((resolve) => (release = resolve)));
    let calls = 0;
    const client: ModelClient = {
      chat: async () => {
        calls += 1;
        if (calls <= 2) throw new ModelUnavailableError("down");
        return pick("system.read");
      },
      status: async () => ({ running: true, installed: [], loaded: [] }),
    };
    const { deps } = makeDeps(client, { startModelServer });

    const both = Promise.all([ask("how's the cpu", deps), ask("how's the cpu", deps)]);
    await vi.waitFor(() => expect(startModelServer).toHaveBeenCalled());
    release(true);

    expect((await both).map((r) => r.kind)).toEqual(["reply", "reply"]);
    expect(startModelServer).toHaveBeenCalledOnce();
  });

  it("says so when even Hermes is down", async () => {
    const { client } = scriptedClient(new ModelUnavailableError("down"));
    const { deps } = makeDeps(client, { handoff: async () => ({ hermesDown: true }) });

    expect(await ask("how's the cpu", deps)).toMatchObject({ kind: "reply", choice: "hermes", ok: false });
  });
});

describe("lastAnswerMs", () => {
  it("is null until the model has answered, then how long the last answer took", async () => {
    expect(lastAnswerMs()).toBeNull();
    const { client } = scriptedClient(pick("system.read"));
    await ask("how's the cpu", makeDeps(client).deps);
    expect(lastAnswerMs()).toBeGreaterThan(0);
  });
});
