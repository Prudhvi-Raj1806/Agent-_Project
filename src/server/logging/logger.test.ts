import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { logger } from "./logger";

/**
 * Sprint 04 Section 12 — the pre-existing redaction in this file was
 * field-name-based only (`SECRET_KEY_PATTERN` on the object key). A real
 * secret value logged under an unrelated key, or embedded as a substring of
 * a larger string (e.g. an error message that happens to include an API
 * key), passed through untouched. These tests cover the added value-based
 * pass: real, currently-configured secret values are redacted wherever they
 * appear in a logged field, regardless of the field's own name.
 */
describe("logger — value-based secret redaction", () => {
  let logSpy: ReturnType<typeof vi.spyOn>;
  let errorSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    logSpy = vi.spyOn(console, "log").mockImplementation(() => {});
    errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
  });

  afterEach(() => {
    logSpy.mockRestore();
    errorSpy.mockRestore();
    vi.unstubAllEnvs();
  });

  function loggedLine(spy: ReturnType<typeof vi.spyOn> = logSpy): Record<string, unknown> {
    const raw = spy.mock.calls.at(-1)?.[0] as string;
    return JSON.parse(raw);
  }

  it("redacts a known secret value even under an innocuously-named field", () => {
    vi.stubEnv("HERMES_AGENT_API_KEY", "sk-real-secret-value-123");
    logger.info("test.op", { note: "sk-real-secret-value-123" });

    const line = loggedLine();
    expect(line.note).toBe("[redacted]");
  });

  it("redacts a known secret value embedded as a substring of a larger string", () => {
    vi.stubEnv("SPOTIFY_CLIENT_SECRET", "spotify-secret-abcdef12");
    logger.error("test.op", { error: `Request failed: Authorization=Bearer spotify-secret-abcdef12 (401)` });

    const line = loggedLine(errorSpy);
    expect(line.error).not.toContain("spotify-secret-abcdef12");
    expect(line.error).toContain("[redacted]");
  });

  it("still redacts by field name, independent of the value-based pass", () => {
    logger.info("test.op", { apiKey: "whatever-value-not-in-env" });

    const line = loggedLine();
    expect(line.apiKey).toBe("[redacted]");
  });

  it("does not redact ordinary short strings that happen to be substrings of nothing secret", () => {
    logger.info("test.op", { status: "ok" });

    const line = loggedLine();
    expect(line.status).toBe("ok");
  });

  it("does not treat an unset/empty secret env var as a value to redact", () => {
    vi.stubEnv("HERMES_AGENT_API_KEY", "");
    logger.info("test.op", { note: "some ordinary log text" });

    const line = loggedLine();
    expect(line.note).toBe("some ordinary log text");
  });

  it("redacts secret values nested inside arrays and objects", () => {
    vi.stubEnv("OMNIROUTE_API_KEY", "omniroute-secret-value");
    logger.info("test.op", { list: ["fine", "omniroute-secret-value"], nested: { detail: "omniroute-secret-value here" } });

    const line = loggedLine();
    expect(line.list).toEqual(["fine", "[redacted]"]);
    expect((line.nested as Record<string, unknown>).detail).toBe("[redacted] here");
  });
});
