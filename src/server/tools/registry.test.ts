import { describe, expect, it } from "vitest";
import { getTool, listTools } from "./registry";

describe("Tool Registry — Quick Actions represented as tools", () => {
  it("lists every Quick Action as a tool with a risk level derived from tool-policy.ts (single source of truth)", () => {
    const ids = listTools().map((t) => t.id);
    expect(ids).toEqual(
      expect.arrayContaining([
        "open-vscode",
        "take-notes",
        "take-screenshot",
        "open-obsidian",
        "summarize-clipboard",
        "welcome-routine",
        "control-computer",
      ])
    );

    expect(getTool("control-computer")?.risk).toBe("critical"); // matches tool-policy.ts's DEFAULT_TOOL_RULES
    expect(getTool("open-vscode")?.risk).toBe("low");
  });

  it("returns undefined for an unknown id, and does not fabricate a definition", () => {
    expect(getTool("does-not-exist")).toBeUndefined();
  });

  it("every registered tool declares the full capability shape (id, risk, permission, side effects, verification)", () => {
    for (const tool of listTools()) {
      expect(tool.id).toBeTruthy();
      expect(tool.description).toBeTruthy();
      expect(["low", "medium", "high", "critical"]).toContain(tool.risk);
      expect(tool.permission).toBe("owner");
      expect(tool.sideEffects.length).toBeGreaterThan(0);
      expect(["self-reported", "file-exists"]).toContain(tool.verificationStrategy);
      expect(typeof tool.execute).toBe("function");
    }
  });

  it("take-notes and take-screenshot declare a real, observation-backed verification strategy — everything else stays self-reported (Sprint 03)", () => {
    expect(getTool("take-notes")?.verificationStrategy).toBe("file-exists");
    expect(typeof getTool("take-notes")?.verify).toBe("function");
    expect(getTool("take-screenshot")?.verificationStrategy).toBe("file-exists");
    expect(typeof getTool("take-screenshot")?.verify).toBe("function");

    for (const id of ["open-vscode", "open-obsidian", "summarize-clipboard", "welcome-routine", "control-computer"]) {
      expect(getTool(id)?.verificationStrategy).toBe("self-reported");
      expect(getTool(id)?.verify).toBeUndefined();
    }
  });
});
