import { describe, expect, it } from "vitest";
import { PERSONA_LIMIT, checkPersonaText, starterPersona } from "./persona";

describe("starterPersona", () => {
  it("names the assistant and the owner and fits the limit", () => {
    const text = starterPersona("Nova", "Prudhvi");
    expect(text).toContain("You are Nova");
    expect(text).toContain("Prudhvi");
    expect(text).not.toMatch(/\{name\}|\{owner\}/);
    expect(text.length).toBeLessThanOrEqual(PERSONA_LIMIT);
  });

  it("passes its own check even with the longest allowed names", () => {
    const text = starterPersona("N".repeat(24), "O".repeat(24));
    expect(checkPersonaText(text)).toBe(text);
  });
});

describe("checkPersonaText", () => {
  it("accepts exactly 4,000 characters and refuses 4,001", () => {
    expect(PERSONA_LIMIT).toBe(4000);
    expect(checkPersonaText("a".repeat(4000))).toHaveLength(4000);
    expect(() => checkPersonaText("a".repeat(4001))).toThrow(/4,000/);
  });

  it("counts a Windows line ending as one character", () => {
    expect(checkPersonaText("a\r\nb")).toBe("a\nb");
    expect(checkPersonaText("a\r\n".repeat(2000))).toHaveLength(4000);
  });

  it("keeps the text as written apart from line endings", () => {
    expect(checkPersonaText("  You are Nova.\n\n- dry\n")).toBe("  You are Nova.\n\n- dry\n");
  });

  it.each([42, null, undefined, "", "   \n ", "has\u0000null"])("refuses %j", (bad) => {
    expect(() => checkPersonaText(bad)).toThrow();
  });
});
