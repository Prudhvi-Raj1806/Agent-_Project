import { beforeEach, describe, expect, it, vi } from "vitest";
import { getDb, resetDbForTests } from "@/server/db/client";
import { evaluateToolRequest } from "@/server/security/tool-policy";
import { getVoiceVerifier, setVoicePasscode } from "@/server/voice/passcode";
import type { ActionRunResult } from "./types";

const mockRun: Record<string, ReturnType<typeof vi.fn>> = {
  "open-vscode": vi.fn<() => Promise<ActionRunResult>>(async () => ({ ok: true, message: "opened vscode" })),
  "take-notes": vi.fn<() => Promise<ActionRunResult>>(async () => ({ ok: true, message: "opened notes" })),
  "take-screenshot": vi.fn<() => Promise<ActionRunResult>>(async () => ({ ok: true, message: "screenshot saved" })),
  "open-obsidian": vi.fn<() => Promise<ActionRunResult>>(async () => ({ ok: true, message: "opened obsidian" })),
  "summarize-clipboard": vi.fn<() => Promise<ActionRunResult>>(async () => ({ ok: true, message: "summarized" })),
  "welcome-routine": vi.fn<() => Promise<ActionRunResult>>(async () => ({ ok: true, message: "welcomed" })),
  "control-computer": vi.fn<() => Promise<ActionRunResult>>(async () => ({ ok: true, message: "locked" })),
};

// Every id below matches a real entry in security/tool-policy.ts's
// DEFAULT_TOOL_RULES — this mock only swaps out the OS-touching `run`
// handlers (never actually opening apps / taking screenshots / locking the
// workstation in a test process); the policy-relevant id/risk shape is real.
vi.mock("./registry", () => ({
  ACTION_REGISTRY: {
    "open-vscode": { id: "open-vscode", label: "Open VS Code", risk: "safe", run: mockRun["open-vscode"] },
    "take-notes": { id: "take-notes", label: "Take Notes", risk: "safe", run: mockRun["take-notes"] },
    "take-screenshot": { id: "take-screenshot", label: "Take a Screenshot", risk: "safe", run: mockRun["take-screenshot"] },
    "open-obsidian": { id: "open-obsidian", label: "Open Obsidian", risk: "safe", run: mockRun["open-obsidian"] },
    "summarize-clipboard": { id: "summarize-clipboard", label: "Summarize Clipboard", risk: "safe", run: mockRun["summarize-clipboard"] },
    "welcome-routine": { id: "welcome-routine", label: "Welcome Routine", risk: "safe", run: mockRun["welcome-routine"] },
    "control-computer": { id: "control-computer", label: "Control Computer", risk: "risky", run: mockRun["control-computer"] },
  },
}));

vi.mock("@/server/security/tool-policy", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/server/security/tool-policy")>();
  return { ...actual, evaluateToolRequest: vi.fn(actual.evaluateToolRequest) };
});

function latestAuditRow(): { action: string; resource_id: string; result: string; reason: string | null } | undefined {
  return getDb()
    .prepare(`SELECT * FROM audit_events ORDER BY created_at DESC, id DESC LIMIT 1`)
    .get() as { action: string; resource_id: string; result: string; reason: string | null } | undefined;
}

function auditCount(): number {
  return (getDb().prepare(`SELECT COUNT(*) as n FROM audit_events`).get() as { n: number }).n;
}

describe("runQuickAction — the one execution boundary for Quick Actions", () => {
  beforeEach(() => {
    resetDbForTests(":memory:");
    vi.clearAllMocks();
  });

  it("returns 404 for an unknown action without evaluating policy or writing an audit entry", async () => {
    const { runQuickAction } = await import("./service");
    const before = auditCount();

    const outcome = await runQuickAction("does-not-exist", null);

    expect(outcome).toMatchObject({ ok: false, message: "Unknown tool.", status: 404 });
    expect(auditCount()).toBe(before);
  });

  for (const id of ["open-vscode", "take-notes", "take-screenshot", "open-obsidian", "summarize-clipboard", "welcome-routine"]) {
    it(`policy-evaluates, audits, and executes the low-risk action "${id}"`, async () => {
      const { runQuickAction } = await import("./service");

      const outcome = await runQuickAction(id, null);

      expect(evaluateToolRequest).toHaveBeenCalledWith({ toolName: id, allowedTools: [id], forbiddenActions: [] });
      expect(mockRun[id]).toHaveBeenCalledTimes(1);
      expect(outcome).toMatchObject({ ok: true, status: 200 });

      const row = latestAuditRow();
      expect(row).toMatchObject({ action: "tool.allow", resource_id: id, result: "allowed" });
    });
  }

  it("ASK: blocks the critical-risk action without a voice-verification token, and never executes it", async () => {
    const { runQuickAction } = await import("./service");

    const outcome = await runQuickAction("control-computer", null);

    expect(outcome).toMatchObject({ ok: false, status: 403 });
    expect(mockRun["control-computer"]).not.toHaveBeenCalled();

    const row = latestAuditRow();
    expect(row).toMatchObject({ action: "tool.deny", resource_id: "control-computer", result: "denied" });
  });

  it("ASK: blocks the critical-risk action given an invalid token", async () => {
    const { runQuickAction } = await import("./service");

    const outcome = await runQuickAction("control-computer", "not-a-real-token");

    expect(outcome.status).toBe(403);
    expect(mockRun["control-computer"]).not.toHaveBeenCalled();
  });

  it("ASK: a real, valid voice-verification token satisfies the approval and lets it execute", async () => {
    setVoicePasscode("open the pod bay doors");
    const verification = getVoiceVerifier().verify({ transcript: "open the pod bay doors" });
    if (!verification.ok || !verification.token) throw new Error("test setup failed to mint a token");

    const { runQuickAction } = await import("./service");
    const outcome = await runQuickAction("control-computer", verification.token);

    expect(outcome).toMatchObject({ ok: true, status: 200 });
    expect(mockRun["control-computer"]).toHaveBeenCalledTimes(1);

    const row = latestAuditRow();
    expect(row).toMatchObject({ action: "tool.allow", resource_id: "control-computer", result: "allowed" });
  });

  it("a token is single-use — it cannot satisfy a second ASK after being consumed once", async () => {
    setVoicePasscode("open the pod bay doors");
    const verification = getVoiceVerifier().verify({ transcript: "open the pod bay doors" });
    if (!verification.ok || !verification.token) throw new Error("test setup failed to mint a token");

    const { runQuickAction } = await import("./service");
    await runQuickAction("control-computer", verification.token);
    const second = await runQuickAction("control-computer", verification.token);

    expect(second.status).toBe(403);
    expect(mockRun["control-computer"]).toHaveBeenCalledTimes(1); // not called again
  });

  it("DENY prevents execution and is audited (forced, since no current action is DENY-classified)", async () => {
    vi.mocked(evaluateToolRequest).mockReturnValueOnce({ verdict: "DENY", risk: "high", reason: "forced deny for test" });

    const { runQuickAction } = await import("./service");
    const outcome = await runQuickAction("open-vscode", null);

    expect(outcome).toMatchObject({ ok: false, status: 403, message: "forced deny for test" });
    expect(mockRun["open-vscode"]).not.toHaveBeenCalled();

    const row = latestAuditRow();
    expect(row).toMatchObject({ action: "tool.deny", resource_id: "open-vscode", result: "denied" });
  });

  it("a genuine execution failure is reported honestly as ok:false / 500, not masked as a policy denial", async () => {
    mockRun["open-vscode"].mockResolvedValueOnce({ ok: false, message: "VS Code isn't installed.", detail: "ENOENT" });

    const { runQuickAction } = await import("./service");
    const outcome = await runQuickAction("open-vscode", null);

    expect(outcome).toMatchObject({ ok: false, status: 500, message: "VS Code isn't installed." });
    // Policy still allowed it — the failure came from execution, not the gate.
    const row = latestAuditRow();
    expect(row).toMatchObject({ action: "tool.allow", resource_id: "open-vscode", result: "allowed" });
  });
});
