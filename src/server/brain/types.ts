/**
 * The mini brain: a small local model that hears every request first. It
 * answers small talk, runs a fixed list of local skills, and hands anything
 * bigger to Hermes. See docs/superpowers/specs/2026-11-11-mini-brain-design.md.
 */

export interface ChatMessage {
  role: "system" | "user" | "assistant";
  content: string;
}

export interface ModelStatus {
  running: boolean;
  /** Model names as the server reports them, e.g. "phi4-mini:latest". */
  installed: string[];
  loaded: string[];
}

/** The only door to the local model, so everything above it is testable without one. */
export interface ModelClient {
  /** Returns the reply text. Throws ModelUnavailableError (not running, model missing) or ModelTimeoutError. */
  chat(input: {
    model: string;
    messages: ChatMessage[];
    /** A JSON schema the reply must match. */
    format?: object;
    maxTokens: number;
    timeoutMs: number;
  }): Promise<string>;
  status(): Promise<ModelStatus>;
}

/** The model server isn't running, or the chosen model isn't installed. */
export class ModelUnavailableError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ModelUnavailableError";
  }
}

/** The model was reachable but did not answer in time. */
export class ModelTimeoutError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ModelTimeoutError";
  }
}
