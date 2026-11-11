import { describe, expect, it } from "vitest";
import { createOllamaClient, sameModel } from "./ollama";
import { ModelTimeoutError, ModelUnavailableError } from "./types";

interface Call {
  url: string;
  body: Record<string, unknown> | null;
}

function fakeFetch(handler: (call: Call, signal: AbortSignal | null) => Promise<Response> | Response) {
  const calls: Call[] = [];
  const impl = (async (input: RequestInfo | URL, init?: RequestInit) => {
    const call = { url: String(input), body: init?.body ? JSON.parse(String(init.body)) : null };
    calls.push(call);
    return handler(call, init?.signal ?? null);
  }) as typeof fetch;
  return { impl, calls };
}

const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status });
const ask = { model: "phi4-mini", messages: [{ role: "user" as const, content: "hi" }], maxTokens: 30, timeoutMs: 5000 };

describe("Ollama client: chat", () => {
  it("posts a non-streaming chat that keeps the model loaded, and returns the reply text", async () => {
    const { impl, calls } = fakeFetch(() => json({ message: { content: " hello " } }));
    const client = createOllamaClient("http://ollama.test", impl);

    const reply = await client.chat({ ...ask, format: { type: "object" } });

    expect(reply).toBe(" hello ");
    expect(calls[0].url).toBe("http://ollama.test/api/chat");
    expect(calls[0].body).toEqual({
      model: "phi4-mini",
      messages: [{ role: "user", content: "hi" }],
      stream: false,
      keep_alive: "30m",
      think: false,
      format: { type: "object" },
      options: { temperature: 0, num_predict: 30 },
    });
  });

  it("retries once without `think` when the model does not support it", async () => {
    const { impl, calls } = fakeFetch((call) =>
      call.body && "think" in call.body
        ? json({ error: '"phi4-mini" does not support thinking' }, 400)
        : json({ message: { content: "ok" } }),
    );

    expect(await createOllamaClient("http://ollama.test", impl).chat(ask)).toBe("ok");
    expect(calls).toHaveLength(2);
    expect(calls[1].body).not.toHaveProperty("think");
  });

  it("reports a server that can't be reached as unavailable", async () => {
    const { impl } = fakeFetch(() => {
      throw new TypeError("fetch failed");
    });
    await expect(createOllamaClient("http://ollama.test", impl).chat(ask)).rejects.toBeInstanceOf(ModelUnavailableError);
  });

  it("reports a model that isn't installed as unavailable, naming it", async () => {
    const { impl } = fakeFetch(() => json({ error: "model 'phi4-mini' not found" }, 404));
    await expect(createOllamaClient("http://ollama.test", impl).chat(ask)).rejects.toThrow(/phi4-mini/);
    await expect(createOllamaClient("http://ollama.test", impl).chat(ask)).rejects.toBeInstanceOf(ModelUnavailableError);
  });

  it("gives up with a timeout error after timeoutMs", async () => {
    const { impl } = fakeFetch(
      (_call, signal) =>
        new Promise<Response>((_resolve, reject) => {
          signal?.addEventListener("abort", () => reject(new DOMException("aborted", "AbortError")));
        }),
    );
    await expect(createOllamaClient("http://ollama.test", impl).chat({ ...ask, timeoutMs: 20 })).rejects.toBeInstanceOf(
      ModelTimeoutError,
    );
  });
});

describe("Ollama client: status", () => {
  it("says nothing is running when the server can't be reached", async () => {
    const { impl } = fakeFetch(() => {
      throw new TypeError("fetch failed");
    });
    expect(await createOllamaClient("http://ollama.test", impl).status()).toEqual({ running: false, installed: [], loaded: [] });
  });

  it("lists installed and loaded models", async () => {
    const { impl } = fakeFetch((call) =>
      call.url.endsWith("/api/tags")
        ? json({ models: [{ name: "phi4-mini:latest" }, { name: "gemma4:latest" }] })
        : json({ models: [{ name: "phi4-mini:latest" }] }),
    );
    expect(await createOllamaClient("http://ollama.test", impl).status()).toEqual({
      running: true,
      installed: ["phi4-mini:latest", "gemma4:latest"],
      loaded: ["phi4-mini:latest"],
    });
  });
});

describe("sameModel", () => {
  it("treats a bare name and its :latest tag as the same model", () => {
    expect(sameModel("phi4-mini", "phi4-mini:latest")).toBe(true);
    expect(sameModel("phi4-mini:latest", "phi4-mini")).toBe(true);
    expect(sameModel("gemma4:12b", "gemma4:12b")).toBe(true);
  });

  it("does not confuse different models or tags", () => {
    expect(sameModel("phi4-mini", "phi4")).toBe(false);
    expect(sameModel("gemma4:12b", "gemma4")).toBe(false);
  });
});
