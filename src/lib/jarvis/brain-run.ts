import type { BrainResponse } from "@/server/brain";

export type { BrainResponse } from "@/server/brain";

/** One side of an earlier exchange, sent back so chat can follow a conversation. Kept in the page only. */
export interface Exchange {
  role: "user" | "assistant";
  content: string;
}

/** How long to wait before saying "One moment." (a cold start, or the model server being started). */
export const SLOW_NOTICE_MS = 2_500;

const MAX_MESSAGES = 6;
const MAX_MESSAGE_LENGTH = 1_000;

/** The history after one more exchange: the last three exchanges, each message within the server's limit. */
export function nextHistory(history: Exchange[], user: string, assistant: string): Exchange[] {
  const cut = (content: string) => content.slice(0, MAX_MESSAGE_LENGTH);
  return [
    ...history,
    { role: "user" as const, content: cut(user) },
    { role: "assistant" as const, content: cut(assistant) },
  ].slice(-MAX_MESSAGES);
}

/** Sends one request to the mini brain. Throws an Error with a message for the owner when it can't answer. */
export async function askBrain(
  text: string,
  history: Exchange[],
  signal?: AbortSignal,
  fetchImpl: typeof fetch = fetch,
): Promise<BrainResponse> {
  const res = await fetchImpl("/api/brain", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ text, history }),
    signal,
  });
  const body = (await res.json().catch(() => null)) as (BrainResponse & { error?: string }) | null;
  if (!res.ok || !body || !("kind" in body)) throw new Error(body?.error ?? "The mini brain didn't answer.");
  return body;
}
