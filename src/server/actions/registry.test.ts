import { promisify } from "node:util";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { RoutingDecision } from "@/server/omnirouter/types";

const execFileImpl = vi.fn(async (_file: string, args?: readonly string[]) => {
  if ((args ?? []).some((a) => a.includes("Get-Clipboard"))) {
    return { stdout: "some clipboard text\n", stderr: "" };
  }
  return { stdout: "", stderr: "" };
});
// Node's real `execFile` carries a `util.promisify.custom` implementation
// that resolves `{stdout, stderr}` directly — `promisify()` prefers that
// over its own callback-wrapping inference, so this mock must carry it too.
(execFileImpl as unknown as Record<symbol, unknown>)[promisify.custom] = execFileImpl;

vi.mock("node:child_process", () => ({ execFile: execFileImpl }));

const selectModelMock = vi.fn<() => RoutingDecision | null>();
vi.mock("@/server/omnirouter/router", () => ({ selectModel: selectModelMock }));

const runProviderCompletionMock = vi.fn();
vi.mock("@/server/providers/completion", () => ({ runProviderCompletion: runProviderCompletionMock }));

const routing: RoutingDecision = {
  providerId: "anthropic",
  providerName: "Anthropic",
  accountId: "anthropic-personal",
  accountLabel: "Personal",
  modelId: "claude-sonnet",
  modelName: "Claude Sonnet",
  classification: "fast-general",
  reason: ["test"],
};

describe("summarize-clipboard — must route through the model abstraction, never call a provider directly", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubGlobal("fetch", vi.fn());
  });

  it("calls selectModel() then runProviderCompletion() — and never touches fetch/Anthropic itself", async () => {
    selectModelMock.mockReturnValue(routing);
    runProviderCompletionMock.mockResolvedValue({ ok: true, text: "a concise summary" });

    const { ACTION_REGISTRY } = await import("./registry");
    const result = await ACTION_REGISTRY["summarize-clipboard"].run();

    expect(result).toEqual({ ok: true, message: "Clipboard summarized.", detail: "a concise summary" });
    expect(selectModelMock).toHaveBeenCalledTimes(1);
    expect(runProviderCompletionMock).toHaveBeenCalledTimes(1);
    expect(runProviderCompletionMock.mock.calls[0][0]).toMatchObject({ routing });
    expect(fetch).not.toHaveBeenCalled(); // the whole point of Step 3 — no direct provider API call
  });

  it("reports honestly (raw clipboard text) when no provider is healthy, without calling the provider abstraction", async () => {
    selectModelMock.mockReturnValue(null);

    const { ACTION_REGISTRY } = await import("./registry");
    const result = await ACTION_REGISTRY["summarize-clipboard"].run();

    expect(result.ok).toBe(true);
    expect(result.detail).toContain("some clipboard text");
    expect(runProviderCompletionMock).not.toHaveBeenCalled();
    expect(fetch).not.toHaveBeenCalled();
  });

  it("surfaces a provider-abstraction failure honestly instead of fabricating a summary", async () => {
    selectModelMock.mockReturnValue(routing);
    runProviderCompletionMock.mockResolvedValue({ ok: false, message: "Anthropic request failed (429): rate limited" });

    const { ACTION_REGISTRY } = await import("./registry");
    const result = await ACTION_REGISTRY["summarize-clipboard"].run();

    expect(result.ok).toBe(false);
    expect(result.detail).toContain("429");
    expect(fetch).not.toHaveBeenCalled();
  });
});
