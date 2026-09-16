import { describe, expect, it, vi } from "vitest";
import { HermesError } from "./errors";
import { withRetry } from "./retry";

describe("withRetry", () => {
  it("returns the result on first success without retrying", async () => {
    const fn = vi.fn().mockResolvedValue("ok");
    const result = await withRetry(fn, { attempts: 3, baseDelayMs: 1, signal: new AbortController().signal });
    expect(result).toBe("ok");
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it("retries retryable errors and succeeds once one attempt works", async () => {
    const fn = vi
      .fn()
      .mockRejectedValueOnce(new HermesError("NETWORK", "boom", { retryable: true }))
      .mockRejectedValueOnce(new HermesError("NETWORK", "boom", { retryable: true }))
      .mockResolvedValue("ok");
    const result = await withRetry(fn, { attempts: 3, baseDelayMs: 1, signal: new AbortController().signal });
    expect(result).toBe("ok");
    expect(fn).toHaveBeenCalledTimes(3);
  });

  it("does not retry a non-retryable error", async () => {
    const fn = vi.fn().mockRejectedValue(new HermesError("VALIDATION", "bad request", { retryable: false }));
    await expect(
      withRetry(fn, { attempts: 3, baseDelayMs: 1, signal: new AbortController().signal })
    ).rejects.toThrow("bad request");
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it("gives up after the attempt limit and throws the last error", async () => {
    const fn = vi.fn().mockRejectedValue(new HermesError("NETWORK", "still broken", { retryable: true }));
    await expect(
      withRetry(fn, { attempts: 2, baseDelayMs: 1, signal: new AbortController().signal })
    ).rejects.toThrow("still broken");
    expect(fn).toHaveBeenCalledTimes(2);
  });

  it("refuses to start when the signal is already aborted", async () => {
    const controller = new AbortController();
    controller.abort();
    const fn = vi.fn();
    await expect(withRetry(fn, { attempts: 3, baseDelayMs: 1, signal: controller.signal })).rejects.toThrow();
    expect(fn).not.toHaveBeenCalled();
  });
});
