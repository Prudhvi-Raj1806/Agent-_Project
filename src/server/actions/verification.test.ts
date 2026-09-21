import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * Sprint 03 Section 7's "at least one real postcondition": `take-notes` and
 * `take-screenshot` now declare a real `verify` function (a genuine
 * filesystem observation), instead of relying on their own self-reported
 * {ok, message}. `node:fs/promises` is mocked here — same technique already
 * used elsewhere in this codebase for `node:child_process`/`systeminformation`
 * — so these tests exercise the real production `verify` functions without
 * depending on actual disk state in CI.
 */

const fsAccessMock = vi.fn<(path: string) => Promise<void>>();
vi.mock("node:fs/promises", () => ({
  default: { access: fsAccessMock, mkdir: vi.fn(), writeFile: vi.fn() },
}));

describe("take-notes / take-screenshot — real observation-backed verification", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("take-notes: PASS when data/notes.md is genuinely observed to exist", async () => {
    fsAccessMock.mockResolvedValueOnce(undefined);
    const { ACTION_REGISTRY } = await import("./registry");

    const result = await ACTION_REGISTRY["take-notes"].verify!({ ok: true, message: "Opened notes.md." });

    expect(result.verdict).toBe("PASS");
    expect(result.strategy).toBe("file-exists");
  });

  it("take-notes: FAIL when the file is observed NOT to exist — a self-reported ok is not enough", async () => {
    fsAccessMock.mockRejectedValueOnce(new Error("ENOENT"));
    const { ACTION_REGISTRY } = await import("./registry");

    const result = await ACTION_REGISTRY["take-notes"].verify!({ ok: true, message: "Opened notes.md." });

    expect(result.verdict).toBe("FAIL");
    expect(result.reasons.join(" ")).toMatch(/not found/i);
  });

  it("take-screenshot: PASS when the exact reported path is genuinely observed to exist", async () => {
    fsAccessMock.mockResolvedValueOnce(undefined);
    const { ACTION_REGISTRY } = await import("./registry");

    const result = await ACTION_REGISTRY["take-screenshot"].verify!({
      ok: true,
      message: "Screenshot saved.",
      detail: "data/screenshots/screenshot-123.png",
    });

    expect(result.verdict).toBe("PASS");
    expect(fsAccessMock).toHaveBeenCalledWith(expect.stringContaining("screenshot-123.png"));
  });

  it("take-screenshot: FAIL when the reported path is observed NOT to exist", async () => {
    fsAccessMock.mockRejectedValueOnce(new Error("ENOENT"));
    const { ACTION_REGISTRY } = await import("./registry");

    const result = await ACTION_REGISTRY["take-screenshot"].verify!({
      ok: true,
      message: "Screenshot saved.",
      detail: "data/screenshots/screenshot-123.png",
    });

    expect(result.verdict).toBe("FAIL");
  });

  it("take-screenshot: UNCERTAIN when no path was reported at all — insufficient evidence, not a guess in either direction", async () => {
    const { ACTION_REGISTRY } = await import("./registry");

    const result = await ACTION_REGISTRY["take-screenshot"].verify!({ ok: true, message: "Screenshot saved." });

    expect(result.verdict).toBe("UNCERTAIN");
    expect(fsAccessMock).not.toHaveBeenCalled(); // nothing to observe without a path
  });

  it("verifyToolOutcome short-circuits to FAIL on execution failure without ever touching the filesystem", async () => {
    const { getTool } = await import("@/server/tools/registry");
    const { verifyToolOutcome } = await import("@/server/tools/verification");

    const tool = getTool("take-notes")!;
    const result = await verifyToolOutcome(tool, { ok: false, message: "Couldn't open the notes file." });

    expect(result?.verdict).toBe("FAIL");
    expect(fsAccessMock).not.toHaveBeenCalled();
  });

  it("a self-reported tool (e.g. open-vscode) has no verify function — verifyToolOutcome returns null, not a fabricated verdict", async () => {
    const { getTool } = await import("@/server/tools/registry");
    const { verifyToolOutcome } = await import("@/server/tools/verification");

    const tool = getTool("open-vscode")!;
    const result = await verifyToolOutcome(tool, { ok: true, message: "Opened VS Code." });

    expect(result).toBeNull();
  });
});
