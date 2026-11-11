import { ModelTimeoutError, ModelUnavailableError, type ChatMessage, type ModelClient, type ModelStatus } from "./types";

const DEFAULT_URL = "http://127.0.0.1:11434";
/** Long enough that the model stays loaded between requests in a normal sitting. */
const KEEP_ALIVE = "30m";
const STATUS_TIMEOUT_MS = 2_000;

interface ChatBody {
  model: string;
  messages: ChatMessage[];
  stream: false;
  keep_alive: string;
  think?: false;
  format?: object;
  options: { temperature: number; num_predict: number };
}

/** "phi4-mini" and "phi4-mini:latest" name the same model; any other tag must match exactly. */
export function sameModel(a: string, b: string): boolean {
  const full = (name: string) => (name.includes(":") ? name : `${name}:latest`);
  return full(a) === full(b);
}

function isAbort(err: unknown): boolean {
  return err instanceof Error && (err.name === "AbortError" || err.name === "TimeoutError");
}

/** A thin client for a local Ollama server. Nothing here ever leaves this PC. */
export function createOllamaClient(
  baseUrl: string = process.env.OLLAMA_URL ?? DEFAULT_URL,
  fetchImpl: typeof fetch = fetch,
): ModelClient {
  const root = baseUrl.replace(/\/+$/, "");

  async function post(body: ChatBody, timeoutMs: number): Promise<Response> {
    try {
      return await fetchImpl(`${root}/api/chat`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
        signal: AbortSignal.timeout(timeoutMs),
      });
    } catch (err) {
      if (isAbort(err)) throw new ModelTimeoutError(`${body.model} did not answer within ${timeoutMs} ms.`);
      throw new ModelUnavailableError("The local model server isn't running.");
    }
  }

  async function getJson(path: string): Promise<unknown | null> {
    try {
      const res = await fetchImpl(`${root}${path}`, { signal: AbortSignal.timeout(STATUS_TIMEOUT_MS) });
      return res.ok ? await res.json() : null;
    } catch {
      return null;
    }
  }

  const names = (value: unknown): string[] =>
    ((value as { models?: { name?: unknown }[] } | null)?.models ?? [])
      .map((m) => m.name)
      .filter((name): name is string => typeof name === "string");

  return {
    async chat({ model, messages, format, maxTokens, timeoutMs }) {
      const body: ChatBody = {
        model,
        messages,
        stream: false,
        keep_alive: KEEP_ALIVE,
        // Thinking models would spend seconds reasoning before a one-word answer.
        think: false,
        ...(format ? { format } : {}),
        options: { temperature: 0, num_predict: maxTokens },
      };

      let res = await post(body, timeoutMs);
      if (res.status === 400) {
        const detail = await res.text().catch(() => "");
        if (!/think/i.test(detail)) throw new ModelUnavailableError(`The local model refused the request: ${detail.slice(0, 200)}`);
        // This model has no thinking mode to switch off; ask again without the flag.
        const { think: _unused, ...withoutThink } = body;
        void _unused;
        res = await post(withoutThink, timeoutMs);
      }
      if (res.status === 404) throw new ModelUnavailableError(`The model "${model}" isn't installed in Ollama.`);
      if (!res.ok) throw new ModelUnavailableError(`The local model server answered ${res.status}.`);

      const data = (await res.json().catch(() => null)) as { message?: { content?: unknown } } | null;
      const content = data?.message?.content;
      return typeof content === "string" ? content : "";
    },

    async status(): Promise<ModelStatus> {
      const tags = await getJson("/api/tags");
      if (tags === null) return { running: false, installed: [], loaded: [] };
      return { running: true, installed: names(tags), loaded: names(await getJson("/api/ps")) };
    },
  };
}
