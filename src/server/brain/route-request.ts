import { CHOICE_CHAT, CHOICE_HERMES, buildRouterPrompt, choiceIds, createRouter } from "./router";
import type { BrainSkill } from "./skills/types";
import { ModelTimeoutError, type ModelClient } from "./types";

const CHECK_MAX_TOKENS = 20;
const CHECK_TIMEOUT_MS = 5_000;

/**
 * The second look at anything the router called "chat".
 *
 * Measured on phrases the router was not tuned on, a small model picking from
 * a long list sent requests like "text my mom that I'll call later" to chat,
 * where it would have answered as if it had done it. A narrow two-way
 * question is much easier for it than the long list, so every chat pick is
 * confirmed here before the small model is allowed to answer.
 */
const CHECK_QUESTION = [
  "Now a narrower question about that same request. An assistant that can only talk received it. It has no tools: it cannot send anything, open anything, look anything up, or see the user's messages, files, calendar or location.",
  'Answer "talk" if a spoken reply from general knowledge is all that is wanted: small talk, thanks, jokes, opinions, explanations, spelling, arithmetic.',
  'Answer "act" if the request wants something done or found: sending or replying to a message or email, calling, booking, ordering, finding places or products, anything current or nearby, or anything about the user\'s own messages, files, apps or plans.',
  'Reply with JSON only: {"answer": "talk"} or {"answer": "act"}.',
].join("\n");

const CHECK_FORMAT = {
  type: "object",
  properties: { answer: { type: "string", enum: ["talk", "act"] } },
  required: ["answer"],
};

const LEAD_IN =
  /^(?:\s*(?:please|hey|ok|okay|so|now|can you|could you|would you|will you|i need you to|i want you to|go ahead and)[\s,]+)*/i;
const DOING_VERB =
  /^(?:text|message|e-?mail|mail|send|forward|reply|respond|call|phone|ring|book|reserve|order|buy|purchase|pay|post|tweet|publish|search|google|look up|find|research|summari[sz]e|download|upload|install|delete|rename|move|copy|remind)\b/i;
/** "tell my wife…", "let my team know…": a message for another person. "tell me…" and "let's…" are not. */
const TO_SOMEONE_ELSE = /^(?:tell|ask|let|inform|notify|invite|wish)\s+(?!me\b|us\b)\S/i;

/**
 * A request that opens with a do-something verb ("text my mom…", "book a
 * table…") goes to Hermes without asking the model. Even with the second
 * check, the small model still read messaging requests as chat on phrases it
 * had not seen, and chat would then answer as if the thing had been done.
 * This rule only ever errs toward handing off: the verb must open the
 * request, so "what do you call a baby goat" is left to the model.
 */
export function startsByAskingForAction(text: string): boolean {
  const request = text.replace(LEAD_IN, "");
  return DOING_VERB.test(request) || TO_SOMEONE_ELSE.test(request);
}

/**
 * True only when the check positively says a spoken answer is enough. Anything
 * else means hand off.
 *
 * The check continues the router's own conversation (same system prompt, the
 * request, the router's answer, then the narrower question) instead of
 * starting a new one. The model then reuses the long prompt it has already
 * read, which on this PC is the difference between a second and several.
 */
async function talkIsEnough(client: ModelClient, model: string, skills: BrainSkill[], text: string): Promise<boolean> {
  let answer: string;
  try {
    answer = await client.chat({
      model,
      messages: [
        { role: "system", content: buildRouterPrompt(skills) },
        { role: "user", content: text },
        { role: "assistant", content: JSON.stringify({ choice: CHOICE_CHAT }) },
        { role: "user", content: CHECK_QUESTION },
      ],
      format: CHECK_FORMAT,
      maxTokens: CHECK_MAX_TOKENS,
      timeoutMs: CHECK_TIMEOUT_MS,
    });
  } catch (err) {
    if (err instanceof ModelTimeoutError) return false;
    throw err;
  }
  try {
    return (JSON.parse(answer) as { answer?: unknown } | null)?.answer === "talk";
  } catch {
    return false;
  }
}

/**
 * Decides what to do with a request: a skill id, "chat", "hermes" or
 * "unclear". One model call for most requests; a chat pick costs a second,
 * short one. Throws ModelUnavailableError when the model can't be reached and
 * ModelTimeoutError when the router itself is too slow to answer.
 */
export async function routeRequest(
  text: string,
  deps: { client: ModelClient; model: string; skills: BrainSkill[] },
): Promise<string> {
  const { client, model, skills } = deps;
  if (startsByAskingForAction(text)) return CHOICE_HERMES;
  const { decision } = await createRouter(client, model, skills).classify({
    state: text,
    question: "choice",
    schema: choiceIds(skills),
  });
  if (decision !== CHOICE_CHAT) return decision;
  return (await talkIsEnough(client, model, skills, text)) ? CHOICE_CHAT : CHOICE_HERMES;
}
