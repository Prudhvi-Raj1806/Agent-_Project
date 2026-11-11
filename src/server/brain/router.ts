import type { ClassifyInput, ClassifyResult, DecisionModelAdapter, DecisionModelHealth } from "@/server/laya/types";
import type { BrainSkill } from "./skills/types";
import type { ModelClient } from "./types";

export const CHOICE_CHAT = "chat";
export const CHOICE_HERMES = "hermes";
export const CHOICE_UNCLEAR = "unclear";

const MAX_TOKENS = 30;
const TIMEOUT_MS = 5_000;

type Listed = Pick<BrainSkill, "id" | "description" | "examples">;

const FIXED: Listed[] = [
  {
    id: CHOICE_CHAT,
    description: "small talk, or a question answerable from general knowledge",
    examples: ["tell me a joke", "what's the capital of Australia", "give me a tip to focus"],
  },
  {
    id: CHOICE_HERMES,
    description: "needs the internet, email, booking, research, files, or several steps",
    examples: ["email my landlord about the leaking tap", "research the best 14 inch laptops", "book a table for two tomorrow"],
  },
  {
    id: CHOICE_UNCLEAR,
    description: "the request makes no sense or is cut off",
    examples: ["uh the", "and then", "asdf"],
  },
];

/**
 * Small models drift toward "chat" (and then make an answer up) or toward
 * whichever skill shares a word with the request. These rules exist to stop
 * both; the routing check (`npm run brain:eval`) is what holds them to it.
 */
const RULES = [
  `If the request asks to send, email, message, call, book, order, buy, post, publish, search, look up, research, download, or to read, summarize, create, rename, move or change files or documents, the choice is "${CHOICE_HERMES}".`,
  `If answering needs current information from the internet (prices, news, scores, an inbox), the choice is "${CHOICE_HERMES}".`,
  "Pick a skill only when the request is plainly about that skill. Sharing one word with it is not enough.",
  `Greetings, thanks, jokes, opinions, explanations, spelling, arithmetic and general knowledge are "${CHOICE_CHAT}".`,
  `If the words do not form a request, the choice is "${CHOICE_UNCLEAR}".`,
];

/** Every id the router may answer with: the skills, then chat, hermes and unclear. */
export function choiceIds(skills: Pick<BrainSkill, "id">[]): string[] {
  return [...skills.map((s) => s.id), ...FIXED.map((f) => f.id)];
}

/** The system prompt: what each choice is for, with example phrases. The request itself is never placed here. */
export function buildRouterPrompt(skills: Listed[]): string {
  const line = (item: Listed) => `- ${item.id}: ${item.description}. Examples: ${item.examples.map((e) => `"${e}"`).join(", ")}`;
  return [
    "You sort one spoken request for a desktop assistant into exactly one choice.",
    'Reply with JSON only: {"choice": "<id>"}.',
    "",
    "Choices:",
    ...[...skills, ...FIXED].map(line),
    "",
    "Rules, in order:",
    ...RULES.map((rule, i) => `${i + 1}. ${rule}`),
  ].join("\n");
}

function readChoice(answer: string, allowed: readonly string[]): string | null {
  try {
    const choice = (JSON.parse(answer) as { choice?: unknown } | null)?.choice;
    return typeof choice === "string" && allowed.includes(choice) ? choice : null;
  } catch {
    return null;
  }
}

/**
 * The mini brain's router, as a DecisionModelAdapter: one call that picks an
 * id from a closed list. The model is told to answer only with a listed id,
 * and anything else that comes back (or a timeout) is "unclear" with zero
 * confidence, never a guess. A timeout or an unavailable model is not
 * swallowed: the caller decides whether to say it was slow, start the server,
 * or fall back to Hermes.
 */
export function createRouter(client: ModelClient, model: string, skills: BrainSkill[]): DecisionModelAdapter {
  const prompt = buildRouterPrompt(skills);

  return {
    mode: "ollama",

    async classify(input: ClassifyInput): Promise<ClassifyResult> {
      const format = {
        type: "object",
        properties: { choice: { type: "string", enum: input.schema } },
        required: ["choice"],
      };
      const answer = await client.chat({
        model,
        messages: [
          { role: "system", content: prompt },
          { role: "user", content: input.state },
        ],
        format,
        maxTokens: MAX_TOKENS,
        timeoutMs: TIMEOUT_MS,
      });
      const choice = readChoice(answer, input.schema);
      return choice ? { decision: choice, confidence: 1 } : { decision: CHOICE_UNCLEAR, confidence: 0 };
    },

    async health(): Promise<DecisionModelHealth> {
      return { status: (await client.status()).running ? "ok" : "degraded" };
    },
  };
}
