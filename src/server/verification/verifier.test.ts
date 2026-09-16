import { describe, expect, it } from "vitest";
import type { HermesResult } from "@/server/hermes/types";
import { verify } from "./verifier";

const okResult: HermesResult = { success: true, summary: "done", output: "The widget was built and tested.", source: "mock" };
const failedResult: HermesResult = { success: false, summary: "failed", output: "", source: "mock" };

describe("verifier", () => {
  it("fails when the underlying execution reported failure", () => {
    expect(verify({ successCriteria: [], hermesResult: failedResult }).verdict).toBe("FAIL");
  });

  it("fails when there is no output at all", () => {
    const empty: HermesResult = { success: true, summary: "done", output: "   ", source: "mock" };
    expect(verify({ successCriteria: [], hermesResult: empty }).verdict).toBe("FAIL");
  });

  it("is UNCERTAIN when execution succeeded but no success criteria were defined", () => {
    const result = verify({ successCriteria: [], hermesResult: okResult });
    expect(result.verdict).toBe("UNCERTAIN");
    expect(result.reasons[0]).toMatch(/no success criteria/i);
  });

  it("passes when every success criterion appears in the output", () => {
    const result = verify({ successCriteria: ["built", "tested"], hermesResult: okResult });
    expect(result.verdict).toBe("PASS");
  });

  it("fails when a success criterion is missing from the output, and names it", () => {
    const result = verify({ successCriteria: ["built", "deployed"], hermesResult: okResult });
    expect(result.verdict).toBe("FAIL");
    expect(result.reasons.join(" ")).toContain("deployed");
  });
});
