export type HermesErrorCode = "NETWORK" | "AUTH" | "TIMEOUT" | "VALIDATION" | "RUNTIME" | "PROTOCOL";

/** Every failure the Hermes client can raise is one of these — never a bare Error. */
export class HermesError extends Error {
  readonly code: HermesErrorCode;
  readonly retryable: boolean;

  constructor(code: HermesErrorCode, message: string, options: { retryable?: boolean; cause?: unknown } = {}) {
    super(message, options.cause !== undefined ? { cause: options.cause } : undefined);
    this.name = "HermesError";
    this.code = code;
    this.retryable = options.retryable ?? false;
  }
}
