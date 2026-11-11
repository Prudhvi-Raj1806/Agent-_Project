import { describe, expect, it } from "vitest";
import { voiceTestLine } from "./voice-test-line";

describe("voiceTestLine", () => {
  it("introduces the assistant by its current name", () => {
    expect(voiceTestLine("Nova")).toBe("Nova here. Voice check.");
    expect(voiceTestLine("Veda")).toBe("Veda here. Voice check.");
  });
});
