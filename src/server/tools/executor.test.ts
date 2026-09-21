import { beforeEach, describe, expect, it, vi } from "vitest";
import { getDb, resetDbForTests } from "@/server/db/client";
import { evaluateToolRequest } from "@/server/security/tool-policy";
import { evaluateGovernedToolCall, recordToolCallResolution } from "./executor";

vi.mock("@/server/security/tool-policy", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/server/security/tool-policy")>();
  return { ...actual, evaluateToolRequest: vi.fn(actual.evaluateToolRequest) };
});

/**
 * Unit coverage for the governance primitives `missions/orchestrator.ts`'s
 * `handleToolRequest` (Hermes-mediated tool calls) and
 * `tools/executor.ts`'s own `executeTool` (Quick Actions) both call — the
 * one place `security/tool-policy.ts`'s `evaluateToolRequest` is reached
 * from. `actions/service.test.ts` already exercises this indirectly through
 * `executeTool`; this file tests the shared primitives directly, including
 * the case `executeTool` never exercises (ASK, since Quick Actions'
 * `resourceType` is always "tool", never "tool_call").
 */

function latestAuditRow(): { action: string; resource_type: string; resource_id: string; result: string } | undefined {
  return getDb()
    .prepare(`SELECT * FROM audit_events ORDER BY created_at DESC, id DESC LIMIT 1`)
    .get() as { action: string; resource_type: string; resource_id: string; result: string } | undefined;
}

function auditCount(): number {
  return (getDb().prepare(`SELECT COUNT(*) as n FROM audit_events`).get() as { n: number }).n;
}

describe("evaluateGovernedToolCall — shared policy+audit boundary", () => {
  beforeEach(() => {
    resetDbForTests(":memory:");
    vi.mocked(evaluateToolRequest).mockClear();
  });

  it("ALLOW: evaluates policy and audits immediately", () => {
    const decision = evaluateGovernedToolCall(
      { toolName: "read_file", allowedTools: [], forbiddenActions: [] },
      { actorId: "system", resourceType: "tool_call", resourceId: "call-1" }
    );

    expect(decision).toMatchObject({ verdict: "ALLOW", risk: "low" });
    const row = latestAuditRow();
    expect(row).toMatchObject({ action: "tool.allow", resource_type: "tool_call", resource_id: "call-1", result: "allowed" });
  });

  it("DENY: evaluates policy and audits immediately, before any execution could occur", () => {
    const decision = evaluateGovernedToolCall(
      { toolName: "read_file", allowedTools: [], forbiddenActions: ["read_file"] },
      { actorId: "system", resourceType: "tool_call", resourceId: "call-2" }
    );

    expect(decision.verdict).toBe("DENY");
    const row = latestAuditRow();
    expect(row).toMatchObject({ action: "tool.deny", resource_type: "tool_call", resource_id: "call-2", result: "denied" });
  });

  it("ASK: evaluates policy but does NOT audit — resolution is a separate step with its own actor", () => {
    const before = auditCount();
    const decision = evaluateGovernedToolCall(
      { toolName: "write_file", allowedTools: [], forbiddenActions: [] },
      { actorId: "system", resourceType: "tool_call", resourceId: "call-3" }
    );

    expect(decision.verdict).toBe("ASK");
    expect(auditCount()).toBe(before); // no audit row written yet
  });

  it("fails closed to an audited DENY when the policy decision itself cannot be established (Sprint 04 Section 10)", () => {
    vi.mocked(evaluateToolRequest).mockImplementationOnce(() => {
      throw new Error("simulated policy evaluation failure");
    });

    const decision = evaluateGovernedToolCall(
      { toolName: "read_file", allowedTools: [], forbiddenActions: [] },
      { actorId: "system", resourceType: "tool_call", resourceId: "call-6" }
    );

    expect(decision.verdict).toBe("DENY"); // never ALLOW when the security decision itself failed
    const row = latestAuditRow();
    expect(row).toMatchObject({ action: "tool.deny", resource_type: "tool_call", resource_id: "call-6", result: "denied" });
  });

  it("fails closed to DENY on a genuinely malformed request (missing forbiddenActions), without a handler ever running", () => {
    // `forbiddenActions.includes(...)` inside evaluateToolRequest throws on a
    // malformed (non-array) input — this is a real malformed-request case,
    // not a contrived mock, and it's exactly the shape Section 15 asks for.
    const malformed = { toolName: "read_file", allowedTools: [] } as unknown as {
      toolName: string;
      allowedTools: string[];
      forbiddenActions: string[];
    };

    const decision = evaluateGovernedToolCall(malformed, { actorId: "system", resourceType: "tool_call", resourceId: "call-7" });

    expect(decision.verdict).toBe("DENY");
    const row = latestAuditRow();
    expect(row).toMatchObject({ action: "tool.deny", resource_type: "tool_call", resource_id: "call-7", result: "denied" });
  });
});

describe("recordToolCallResolution — audits an ASK's eventual approval/denial", () => {
  beforeEach(() => {
    resetDbForTests(":memory:");
  });

  it("records an approved resolution with the given actor and reason", () => {
    recordToolCallResolution({ actorId: "owner", resourceType: "tool_call", resourceId: "call-4" }, true, "owner approved");

    const row = latestAuditRow();
    expect(row).toMatchObject({ action: "tool.allow", resource_type: "tool_call", resource_id: "call-4", result: "allowed" });
  });

  it("records a denied resolution", () => {
    recordToolCallResolution({ actorId: "owner", resourceType: "tool_call", resourceId: "call-5" }, false, "owner denied");

    const row = latestAuditRow();
    expect(row).toMatchObject({ action: "tool.deny", resource_type: "tool_call", resource_id: "call-5", result: "denied" });
  });
});
