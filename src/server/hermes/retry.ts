import { HermesError } from "./errors";

export interface RetryOptions {
  attempts: number;
  baseDelayMs: number;
  signal: AbortSignal;
}

function sleep(ms: number, signal: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    if (signal.aborted) {
      reject(new DOMException("Aborted", "AbortError"));
      return;
    }
    const timer = setTimeout(resolve, ms);
    signal.addEventListener(
      "abort",
      () => {
        clearTimeout(timer);
        reject(new DOMException("Aborted", "AbortError"));
      },
      { once: true }
    );
  });
}

/**
 * Retries only `HermesError`s explicitly marked `retryable` — a 4xx
 * validation rejection or an auth failure will not be retried, since doing
 * so would just repeat the same rejection. Exponential backoff between
 * attempts; never retries past an aborted signal.
 */
export async function withRetry<T>(fn: (attempt: number) => Promise<T>, options: RetryOptions): Promise<T> {
  let lastError: unknown;
  for (let attempt = 1; attempt <= options.attempts; attempt++) {
    if (options.signal.aborted) throw new DOMException("Aborted", "AbortError");
    try {
      return await fn(attempt);
    } catch (err) {
      lastError = err;
      const retryable = err instanceof HermesError && err.retryable;
      if (!retryable || attempt === options.attempts) throw err;
      await sleep(options.baseDelayMs * 2 ** (attempt - 1), options.signal);
    }
  }
  throw lastError;
}
