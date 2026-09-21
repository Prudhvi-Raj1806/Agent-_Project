import { describe, expect, it } from "vitest";
import { HermesError } from "@/server/hermes/errors";
import {
  classifyHermesError,
  classifyPermissionDenial,
  classifyPolicyDenial,
  classifyVerificationFailure,
} from "./classification";

describe("failure classification (Sprint 03 Section 8)", () => {
  it("VERIFICATION_FAILED for a FAIL verdict", () => {
    expect(classifyVerificationFailure("FAIL")).toBe("VERIFICATION_FAILED");
  });

  it("VERIFICATION_UNCERTAIN for an UNCERTAIN verdict", () => {
    expect(classifyVerificationFailure("UNCERTAIN")).toBe("VERIFICATION_UNCERTAIN");
  });

  it("UNKNOWN for a PASS verdict — a failure classifier should never be asked to classify a success, but it must not invent a category if it is", () => {
    expect(classifyVerificationFailure("PASS")).toBe("UNKNOWN");
  });

  it("TRANSIENT for a retryable HermesError", () => {
    const err = new HermesError("NETWORK", "connection reset", { retryable: true });
    expect(classifyHermesError(err)).toBe("TRANSIENT");
  });

  it("PERMANENT for a non-retryable HermesError", () => {
    const err = new HermesError("VALIDATION", "bad request", { retryable: false });
    expect(classifyHermesError(err)).toBe("PERMANENT");
  });

  it("UNKNOWN for a plain Error (not a HermesError) — no invented category from insufficient evidence", () => {
    expect(classifyHermesError(new Error("something broke"))).toBe("UNKNOWN");
  });

  it("UNKNOWN for a non-Error thrown value", () => {
    expect(classifyHermesError("a string was thrown")).toBe("UNKNOWN");
  });

  it("POLICY_DENIED for a policy denial", () => {
    expect(classifyPolicyDenial()).toBe("POLICY_DENIED");
  });

  it("PERMISSION_DENIED for a permission denial — distinct from a policy denial", () => {
    expect(classifyPermissionDenial()).toBe("PERMISSION_DENIED");
    expect(classifyPermissionDenial()).not.toBe(classifyPolicyDenial());
  });
});
