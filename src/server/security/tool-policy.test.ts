import { describe, expect, it } from "vitest";
import { evaluateToolRequest } from "./tool-policy";

const noScope = { allowedTools: [], forbiddenActions: [] };

describe("evaluateToolRequest", () => {
  it("read_file: low risk, always allow", () => {
    const decision = evaluateToolRequest({ toolName: "read_file", ...noScope });
    expect(decision).toMatchObject({ verdict: "ALLOW", risk: "low" });
  });

  it("write_file: medium risk, asks by default", () => {
    const decision = evaluateToolRequest({ toolName: "write_file", ...noScope });
    expect(decision).toMatchObject({ verdict: "ASK", risk: "medium" });
  });

  it("write_file: medium risk, allowed when pre-approved for this mission (in scope)", () => {
    const decision = evaluateToolRequest({
      toolName: "write_file",
      allowedTools: ["write_file"],
      forbiddenActions: [],
    });
    expect(decision).toMatchObject({ verdict: "ALLOW", risk: "medium" });
  });

  it("delete_file: high risk, always asks even if pre-approved", () => {
    const asked = evaluateToolRequest({ toolName: "delete_file", ...noScope });
    expect(asked).toMatchObject({ verdict: "ASK", risk: "high" });

    const preApproved = evaluateToolRequest({
      toolName: "delete_file",
      allowedTools: ["delete_file"],
      forbiddenActions: [],
    });
    expect(preApproved).toMatchObject({ verdict: "ASK", risk: "high" });
  });

  it("send_email: high risk, requires approval", () => {
    const decision = evaluateToolRequest({ toolName: "send_email", ...noScope });
    expect(decision).toMatchObject({ verdict: "ASK", risk: "high" });
  });

  it("execute_command: critical risk, always gated", () => {
    const decision = evaluateToolRequest({
      toolName: "execute_command",
      allowedTools: ["execute_command"],
      forbiddenActions: [],
    });
    expect(decision).toMatchObject({ verdict: "ASK", risk: "critical" });
  });

  it("denies a tool explicitly forbidden for the mission, regardless of risk", () => {
    const decision = evaluateToolRequest({
      toolName: "read_file",
      allowedTools: [],
      forbiddenActions: ["read_file"],
    });
    expect(decision.verdict).toBe("DENY");
  });

  it("forbidden overrides pre-approval", () => {
    const decision = evaluateToolRequest({
      toolName: "write_file",
      allowedTools: ["write_file"],
      forbiddenActions: ["write_file"],
    });
    expect(decision.verdict).toBe("DENY");
  });

  it("fails closed on unknown tools: treated as high-risk, asks rather than silently allowing", () => {
    const decision = evaluateToolRequest({ toolName: "launch_missiles", ...noScope });
    expect(decision).toMatchObject({ verdict: "ASK", risk: "high" });
  });
});
