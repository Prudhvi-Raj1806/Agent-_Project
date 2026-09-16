import { describe, expect, it } from "vitest";
import { authorizeMissionCreation } from "./policy";

describe("security policy", () => {
  it("denies a mission with no objective", () => {
    const decision = authorizeMissionCreation({ objective: "" });
    expect(decision.allowed).toBe(false);
  });

  it("denies a mission where a tool is both allowed and forbidden", () => {
    const decision = authorizeMissionCreation({
      objective: "Do something",
      allowedTools: ["browser", "terminal"],
      forbiddenActions: ["terminal"],
    });
    expect(decision.allowed).toBe(false);
    expect(decision.reason).toContain("terminal");
  });

  it("allows a well-formed mission", () => {
    const decision = authorizeMissionCreation({
      objective: "Research JARVIS architecture",
      allowedTools: ["browser"],
      forbiddenActions: ["terminal"],
    });
    expect(decision.allowed).toBe(true);
  });
});
