import { describe, expect, it } from "vitest";
import { SLOW_NOTICE_MS, askBrain, nextHistory, type Exchange } from "./brain-run";

describe("nextHistory", () => {
  it("appends the request and the reply", () => {
    expect(nextHistory([], "tell me a joke", "Why did the scarecrow win an award?")).toEqual([
      { role: "user", content: "tell me a joke" },
      { role: "assistant", content: "Why did the scarecrow win an award?" },
    ]);
  });

  it("keeps only the last three exchanges", () => {
    let history: Exchange[] = [];
    for (let i = 1; i <= 5; i += 1) history = nextHistory(history, `q${i}`, `a${i}`);
    expect(history.map((m) => m.content)).toEqual(["q3", "a3", "q4", "a4", "q5", "a5"]);
  });

  it("cuts a long message to 1,000 characters, the most the server accepts", () => {
    const history = nextHistory([], "q".repeat(1500), "a".repeat(1500));
    expect(history[0].content).toHaveLength(1000);
    expect(history[1].content).toHaveLength(1000);
  });
});

describe("askBrain", () => {
  const fake = (status: number, body: unknown) => {
    const calls: { url: string; body: unknown }[] = [];
    const impl = (async (input: RequestInfo | URL, init?: RequestInit) => {
      calls.push({ url: String(input), body: JSON.parse(String(init?.body)) });
      return new Response(JSON.stringify(body), { status });
    }) as typeof fetch;
    return { impl, calls };
  };

  it("posts the request and history, and returns the brain's answer", async () => {
    const answer = { kind: "reply", choice: "time.read", ok: true, text: "It's 2:18 PM." };
    const { impl, calls } = fake(200, answer);
    const history: Exchange[] = [{ role: "user", content: "hi" }];

    expect(await askBrain("what time is it", history, undefined, impl)).toEqual(answer);
    expect(calls).toEqual([{ url: "/api/brain", body: { text: "what time is it", history } }]);
  });

  it("throws the server's message when the request is refused", async () => {
    const { impl } = fake(400, { error: "A request can be at most 2,000 characters." });
    await expect(askBrain("x", [], undefined, impl)).rejects.toThrow("A request can be at most 2,000 characters.");
  });

  it("throws a plain message when the server sends nothing readable", async () => {
    const impl = (async () => new Response("<html>", { status: 502 })) as typeof fetch;
    await expect(askBrain("x", [], undefined, impl)).rejects.toThrow("The mini brain didn't answer.");
  });
});

describe("SLOW_NOTICE_MS", () => {
  it("is two and a half seconds", () => {
    expect(SLOW_NOTICE_MS).toBe(2500);
  });
});
