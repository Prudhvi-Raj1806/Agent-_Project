import { claimsAnAction, writeChatReply } from "./chat";
import { defaultBrainDeps } from "./defaults";
import type { ResolvedPersona } from "./persona";
import { routeRequest } from "./route-request";
import { CHOICE_CHAT, CHOICE_HERMES, CHOICE_UNCLEAR } from "./router";
import type { BrainSkill } from "./skills/types";
import { ModelTimeoutError, ModelUnavailableError, type ChatMessage, type ModelClient } from "./types";

/** What the page gets back for one request. */
export type BrainResponse =
  /** A skill or chat answered. `ok` is false when it could not do what was asked. */
  | { kind: "reply"; text: string; choice: string; ok: boolean }
  /** Handed to Hermes. `text` is what to say first ("" when the brain is off); `notice` is for the page to show. */
  | { kind: "handoff"; text: string; missionId: string; notice?: string }
  | { kind: "unclear"; text: string };

export type BrainEvent =
  | "brain.routed"
  | "brain.skill.completed"
  | "brain.skill.failed"
  | "brain.handoff"
  | "brain.unavailable";

/** Everything the brain touches, injected so the whole flow is testable without a model, Hermes or a database. */
export interface BrainDeps {
  settings(): { enabled: boolean; model: string };
  client: ModelClient;
  skills: BrainSkill[];
  persona(): Promise<ResolvedPersona>;
  /** Creates and starts a mission, or reports why it could not. */
  handoff(objective: string): Promise<{ missionId: string } | { hermesDown: true } | { refused: string }>;
  /** Tries to start the local model server; resolves true once it answers. */
  startModelServer(): Promise<boolean>;
  emit(type: BrainEvent, metadata: Record<string, unknown>): void;
  now(): number;
}

const HANDOFF_LINE = "That needs Hermes. Handing it over.";
const UNCLEAR_LINE = "I didn't catch what you want. Say it another way?";
const HERMES_DOWN_LINE = "Hermes isn't running. Start it from Settings, Services.";
const TOO_SLOW_LINE = "That took too long. Try again?";
const BRAIN_OFF_NOTICE = "The mini brain is off.";
const LOGGED_TEXT_LENGTH = 200;

/** "Hermes, …" at the start of a request skips the router and hands the rest over. */
const HERMES_PREFIX = /^\s*hermes\b\s*[,:]?\s*([\s\S]*)$/i;

let lastMs: number | null = null;
let starting: Promise<boolean> | null = null;

/** How long the most recent answer took, or null when the model has not answered since the server started. */
export function lastAnswerMs(): number | null {
  return lastMs;
}

export function resetBrainStateForTests(): void {
  lastMs = null;
  starting = null;
}

/** One start attempt at a time, however many requests are waiting on it. */
function startOnce(deps: BrainDeps): Promise<boolean> {
  starting ??= deps.startModelServer().finally(() => {
    starting = null;
  });
  return starting;
}

async function handOff(objective: string, text: string, deps: BrainDeps, notice?: string): Promise<BrainResponse> {
  const result = await deps.handoff(objective);
  if ("hermesDown" in result) return { kind: "reply", choice: CHOICE_HERMES, ok: false, text: HERMES_DOWN_LINE };
  if ("refused" in result) return { kind: "reply", choice: CHOICE_HERMES, ok: false, text: result.refused };
  deps.emit("brain.handoff", { missionId: result.missionId });
  return { kind: "handoff", text, missionId: result.missionId, ...(notice ? { notice } : {}) };
}

/** Routes one request and acts on the pick. Throws ModelUnavailableError when the model can't be reached. */
async function decide(text: string, history: ChatMessage[], model: string, deps: BrainDeps): Promise<BrainResponse> {
  const started = deps.now();
  const choice = await routeRequest(text, { client: deps.client, model, skills: deps.skills });
  deps.emit("brain.routed", {
    choice,
    ms: Math.round(deps.now() - started),
    text: text.slice(0, LOGGED_TEXT_LENGTH),
  });
  const done = <T extends BrainResponse>(response: T): T => {
    lastMs = Math.round(deps.now() - started);
    return response;
  };

  if (choice === CHOICE_UNCLEAR) return done({ kind: "unclear", text: UNCLEAR_LINE });
  if (choice === CHOICE_HERMES) return done(await handOff(text, HANDOFF_LINE, deps));

  if (choice === CHOICE_CHAT) {
    let reply: string;
    try {
      const persona = await deps.persona();
      reply = await writeChatReply({ client: deps.client, model, persona: persona.text, text, history });
    } catch (err) {
      if (err instanceof ModelTimeoutError) return done({ kind: "reply", choice, ok: false, text: TOO_SLOW_LINE });
      throw err;
    }
    // Chat has no tools, so "I've sent it" is never true. Hand the request over instead of saying it.
    if (claimsAnAction(reply)) return done(await handOff(text, HANDOFF_LINE, deps));
    if (reply === "") return done({ kind: "unclear", text: UNCLEAR_LINE });
    return done({ kind: "reply", choice, ok: true, text: reply });
  }

  const skill = deps.skills.find((s) => s.id === choice);
  // The router can only answer with a listed id, so this is unreachable; if it ever isn't, nothing runs.
  if (!skill) return done({ kind: "unclear", text: UNCLEAR_LINE });
  const result = await skill.run();
  deps.emit(result.ok ? "brain.skill.completed" : "brain.skill.failed", { choice });
  return done({ kind: "reply", choice, ok: result.ok, text: result.reply });
}

/**
 * The mini brain's only entry point. Hears a request first: answers small
 * talk, runs one of a fixed list of local skills, or hands the request to
 * Hermes through the ordinary mission path. When the brain is switched off
 * or its model can't be reached, every request is handed to Hermes, as it
 * was before the brain existed.
 */
export async function handleRequest(
  input: { text: string; history: ChatMessage[] },
  deps: BrainDeps = defaultBrainDeps(),
): Promise<BrainResponse> {
  const text = input.text.trim();
  const { enabled, model } = deps.settings();
  if (!enabled) return handOff(text, "", deps);

  const prefixed = HERMES_PREFIX.exec(text);
  if (prefixed) {
    const objective = prefixed[1].trim();
    return objective === "" ? { kind: "unclear", text: UNCLEAR_LINE } : handOff(objective, HANDOFF_LINE, deps);
  }

  try {
    return await decide(text, input.history, model, deps);
  } catch (err) {
    if (!(err instanceof ModelUnavailableError)) throw err;
  }

  if (await startOnce(deps)) {
    try {
      return await decide(text, input.history, model, deps);
    } catch (err) {
      // Still unreachable after a start: most likely the chosen model isn't installed.
      if (!(err instanceof ModelUnavailableError)) throw err;
    }
  }

  deps.emit("brain.unavailable", { model });
  return handOff(text, "", deps, BRAIN_OFF_NOTICE);
}
