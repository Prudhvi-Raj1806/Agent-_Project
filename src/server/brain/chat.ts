import type { ChatMessage, ModelClient } from "./types";

const MAX_TOKENS = 120;
const TIMEOUT_MS = 15_000;
const MAX_HISTORY = 6;
const MAX_MESSAGE_LENGTH = 1_000;

/**
 * Added after the persona on every chat. The second half exists because
 * routing is not perfect: when a do-something request does reach chat, the
 * small model must say it can't, never answer as though it had.
 */
export const CHAT_RULE = [
  "Reply in one or two sentences that sound natural spoken aloud. If you are not sure, say so instead of guessing.",
  "You can only talk. You cannot send, book, order, open or look up anything, and you cannot know recent news, live scores, prices, or the user's own messages, files or plans.",
  'Never say you did something or that you will do it. If asked for any of that, say you can\'t do it yourself and that starting the request with "Hermes," will hand it over.',
].join(" ");

const DOES = "send|call|phone|message|text|email|mail|book|reserve|order|buy|pay|post|inform|notify|remind|forward|reply|schedule|let";
const DID =
  "sent|called|phoned|messaged|texted|emailed|mailed|booked|reserved|ordered|bought|paid|posted|informed|notified|reminded|forwarded|replied|scheduled";
const WILL_OR_HAVE = new RegExp(
  `\\bI(?:'ve| have|'ll| will|'m going to| am going to)\\s+(?:just |already |now |go ahead and )?(?:${DOES}|${DID})\\b`,
  "i",
);
const SIMPLE_PAST = new RegExp(`\\bI\\s+(?:just |already )?(?:${DID})\\b`, "i");
const DOING =
  "sending|calling|phoning|messaging|texting|emailing|mailing|booking|reserving|ordering|buying|paying|posting|informing|notifying|reminding|forwarding|replying|scheduling";
/** "I'm sending it", "I am booking the table": an action in progress. */
const IN_PROGRESS = new RegExp(`\\bI(?:'m| am)\\s+(?:just |now )?(?:${DOING})\\b`, "i");
/** "Let me send that": an offer to act, which chat cannot make good. "Let me think" and "let me know" are not. */
const LET_ME = new RegExp(`\\blet me\\s+(?:${DOES})\\b`, "i");

/**
 * True when a chat reply says the assistant did, or will do, something in the
 * world ("I've sent…", "I'll call…", "I'm texting…", "Let me send…"). Chat has
 * no tools, so such a reply is false by construction. Measured on the real
 * model: asked to message someone, it replied "I've sent a birthday message to
 * your brother." The caller must hand the request to Hermes instead of
 * speaking the reply. Curly apostrophes are folded to straight ones first,
 * because other models write "I’ve" with the typographic one.
 */
export function claimsAnAction(reply: string): boolean {
  const text = reply.replace(/[‘’]/g, "'");
  return WILL_OR_HAVE.test(text) || SIMPLE_PAST.test(text) || IN_PROGRESS.test(text) || LET_ME.test(text);
}

/**
 * The earlier exchanges the page sent, reduced to what may reach the model:
 * the owner's and the assistant's own messages only. A "system" message from
 * the page is dropped, so the page can never add instructions. Throws an
 * Error with a message for the caller on a shape that isn't a history at all.
 */
export function cleanHistory(history: unknown): ChatMessage[] {
  if (history === undefined || history === null) return [];
  if (!Array.isArray(history)) throw new Error("`history` must be a list of messages.");
  if (history.length > MAX_HISTORY) throw new Error(`\`history\` can hold at most ${MAX_HISTORY} messages.`);

  const cleaned: ChatMessage[] = [];
  for (const entry of history) {
    if (!entry || typeof entry !== "object") throw new Error("Each history entry must be a message.");
    const { role, content } = entry as { role?: unknown; content?: unknown };
    if (typeof content !== "string") throw new Error("Each history message needs text.");
    if (content.length > MAX_MESSAGE_LENGTH) {
      throw new Error(`A history message can be at most ${MAX_MESSAGE_LENGTH.toLocaleString("en-US")} characters.`);
    }
    if ((role === "user" || role === "assistant") && content.trim() !== "") cleaned.push({ role, content });
  }
  return cleaned;
}

/** A short spoken reply in the assistant's persona. Model errors pass through to the caller. */
export async function writeChatReply(input: {
  client: ModelClient;
  model: string;
  persona: string;
  text: string;
  history: ChatMessage[];
}): Promise<string> {
  const reply = await input.client.chat({
    model: input.model,
    messages: [
      { role: "system", content: `${input.persona}\n\n${CHAT_RULE}` },
      ...input.history,
      { role: "user", content: input.text },
    ],
    maxTokens: MAX_TOKENS,
    timeoutMs: TIMEOUT_MS,
  });
  return reply.trim();
}
