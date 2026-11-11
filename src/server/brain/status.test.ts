import { beforeEach, describe, expect, it, vi } from "vitest";
import { resetBrainStateForTests, type BrainDeps } from "./index";
import { getBrainStatus, warmBrain } from "./status";
import type { ModelClient, ModelStatus } from "./types";

function makeDeps(model: ModelStatus, overrides: Partial<BrainDeps> = {}) {
  const chat = vi.fn<ModelClient["chat"]>(async () => "");
  const client: ModelClient = { chat, status: async () => model };
  const deps: BrainDeps = {
    settings: () => ({ enabled: true, model: "phi4-mini" }),
    client,
    skills: [],
    persona: async () => ({ text: "You are Veda.", source: "soul" }),
    handoff: async () => ({ hermesDown: true }),
    startModelServer: vi.fn(async () => false),
    emit: () => {},
    now: () => 0,
    ...overrides,
  };
  return { deps, chat };
}

const DOWN: ModelStatus = { running: false, installed: [], loaded: [] };
const INSTALLED: ModelStatus = { running: true, installed: ["phi4-mini:latest", "gemma4:latest"], loaded: [] };
const LOADED: ModelStatus = { ...INSTALLED, loaded: ["phi4-mini:latest"] };

beforeEach(() => {
  resetBrainStateForTests();
});

describe("getBrainStatus", () => {
  it("reports a stopped model server", async () => {
    expect(await getBrainStatus(makeDeps(DOWN).deps)).toEqual({
      enabled: true,
      model: "phi4-mini",
      ollamaRunning: false,
      modelInstalled: false,
      modelLoaded: false,
      installed: [],
      persona: "soul",
      lastAnswerMs: null,
    });
  });

  it("matches the chosen model to its :latest tag", async () => {
    expect(await getBrainStatus(makeDeps(INSTALLED).deps)).toMatchObject({
      ollamaRunning: true,
      modelInstalled: true,
      modelLoaded: false,
      installed: ["phi4-mini:latest", "gemma4:latest"],
    });
    expect(await getBrainStatus(makeDeps(LOADED).deps)).toMatchObject({ modelLoaded: true });
  });

  it("names a chosen model that isn't installed", async () => {
    const { deps } = makeDeps(INSTALLED, { settings: () => ({ enabled: true, model: "qwen9" }) });
    expect(await getBrainStatus(deps)).toMatchObject({ model: "qwen9", modelInstalled: false, modelLoaded: false });
  });

  it("carries the switch and which personality is in use", async () => {
    const { deps } = makeDeps(LOADED, {
      settings: () => ({ enabled: false, model: "phi4-mini" }),
      persona: async () => ({ text: "x", source: "starter" }),
    });
    expect(await getBrainStatus(deps)).toMatchObject({ enabled: false, persona: "starter" });
  });
});

describe("warmBrain", () => {
  it("loads the model with a one-token call when it is installed but not loaded", async () => {
    const { deps, chat } = makeDeps(INSTALLED);
    await warmBrain(deps);
    expect(chat).toHaveBeenCalledOnce();
    expect(chat.mock.calls[0][0]).toMatchObject({ model: "phi4-mini", maxTokens: 1 });
  });

  it.each([
    ["already loaded", LOADED, {}],
    ["the model server is stopped", DOWN, {}],
    ["the model isn't installed", { ...INSTALLED, installed: ["gemma4:latest"] }, {}],
    ["the mini brain is switched off", INSTALLED, { settings: () => ({ enabled: false, model: "phi4-mini" }) }],
  ])("does nothing when %s", async (_label, model, overrides) => {
    const { deps, chat } = makeDeps(model as ModelStatus, overrides as Partial<BrainDeps>);
    await warmBrain(deps);
    expect(chat).not.toHaveBeenCalled();
    expect(deps.startModelServer).not.toHaveBeenCalled();
  });

  it("returns the status even when the warm-up call fails", async () => {
    const { deps, chat } = makeDeps(INSTALLED);
    chat.mockRejectedValue(new Error("slow"));
    expect(await warmBrain(deps)).toMatchObject({ ollamaRunning: true });
  });
});
