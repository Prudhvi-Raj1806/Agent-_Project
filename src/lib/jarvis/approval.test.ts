import { describe, expect, it } from "vitest";
import { formatApprovalInput } from "./approval";

describe("formatApprovalInput", () => {
  it("shows a shell command verbatim", () => {
    expect(formatApprovalInput("  npm install left-pad ")).toBe("npm install left-pad");
  });

  it("renders structured input as JSON", () => {
    expect(formatApprovalInput({ path: "a.txt" })).toBe('{"path":"a.txt"}');
  });

  it("is empty when there is no input", () => {
    expect(formatApprovalInput(undefined)).toBe("");
    expect(formatApprovalInput(null)).toBe("");
  });

  it("marks a clipped command as truncated", () => {
    const out = formatApprovalInput("x".repeat(1000));
    expect(out.endsWith("(truncated)")).toBe(true);
    expect(out.length).toBeLessThan(320);
  });

  it("does not throw on unserialisable input", () => {
    const circular: Record<string, unknown> = {};
    circular.self = circular;
    expect(() => formatApprovalInput(circular)).not.toThrow();
  });
});
