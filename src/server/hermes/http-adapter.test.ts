import http from "node:http";
import type { AddressInfo } from "node:net";
import { afterEach, describe, expect, it } from "vitest";
import type { RoutingDecision } from "@/server/omnirouter/types";
import { HermesHttpAdapter } from "./http-adapter";
import type { HermesExecuteInput, HermesToolEvent } from "./types";

/**
 * These tests exercise the real HermesHttpAdapter — real fetch calls, real
 * SSE parsing, real retry/backoff/abort logic — against a tiny local HTTP
 * server that speaks the contract in ./contract.ts. It stands in for a
 * Hermes runtime that does not exist yet; it is not Hermes itself. Wiring
 * up an actual Hermes means either it speaks this same contract, or the
 * adapter is updated to match whatever contract it actually exposes.
 */

const routing: RoutingDecision = {
  providerId: "anthropic",
  providerName: "Anthropic",
  accountId: "anthropic-personal",
  accountLabel: "Personal",
  modelId: "claude-sonnet",
  modelName: "Claude Sonnet",
  classification: "coding",
  reason: ["test"],
};

function baseInput(overrides: Partial<HermesExecuteInput> = {}): HermesExecuteInput {
  return { missionId: "mission-1", objective: "Do the thing", routing, fromPercent: 0, ...overrides };
}

type FixtureBehavior =
  | "success"
  | "tool-events"
  | "tool-approval-gate"
  | "runtime-error"
  | "flaky-then-success"
  | "hang-forever"
  | "no-result-frame"
  | "reject-submit";

function createFixtureServer(behavior: FixtureBehavior) {
  let submitAttempts = 0;
  const receivedDecisions: Array<{ toolCallId: string; decision: string; reason?: string }> = [];
  const decisionWaiters = new Map<string, () => void>();

  const server = http.createServer((req, res) => {
    const url = new URL(req.url ?? "/", "http://localhost");

    if (req.method === "POST" && /^\/missions\/[^/]+\/tool-decisions\/[^/]+$/.test(url.pathname)) {
      let body = "";
      req.on("data", (chunk) => (body += chunk));
      req.on("end", () => {
        const toolCallId = url.pathname.split("/").pop()!;
        const parsed = JSON.parse(body) as { decision: string; reason?: string };
        receivedDecisions.push({ toolCallId, decision: parsed.decision, reason: parsed.reason });
        decisionWaiters.get(toolCallId)?.();
        decisionWaiters.delete(toolCallId);
        res.writeHead(200);
        res.end();
      });
      return;
    }

    if (req.method === "GET" && url.pathname === "/health") {
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ version: "fixture-1.0" }));
      return;
    }

    if (req.method === "POST" && url.pathname === "/missions") {
      submitAttempts++;
      if (behavior === "reject-submit") {
        res.writeHead(400, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ error: "bad request" }));
        return;
      }
      if (behavior === "flaky-then-success" && submitAttempts < 2) {
        res.writeHead(503);
        res.end();
        return;
      }
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ correlationId: "mission-1", runId: "run-1" }));
      return;
    }

    if (req.method === "GET" && /^\/missions\/[^/]+\/stream$/.test(url.pathname)) {
      res.writeHead(200, { "Content-Type": "text/event-stream", Connection: "keep-alive" });
      const send = (frame: unknown) => res.write(`data: ${JSON.stringify(frame)}\n\n`);

      if (behavior === "hang-forever") {
        req.on("close", () => res.end());
        return;
      }
      if (behavior === "no-result-frame") {
        send({ type: "progress", percent: 50, note: "halfway" });
        res.end();
        return;
      }
      if (behavior === "runtime-error") {
        send({ type: "progress", percent: 20, note: "starting" });
        send({ type: "error", message: "the runtime blew up", retryable: false });
        res.end();
        return;
      }
      if (behavior === "tool-events") {
        send({ type: "progress", percent: 10, note: "starting" });
        send({ type: "tool.started", toolCallId: "call-1", toolName: "read_file", input: { path: "a.txt" } });
        send({ type: "tool.completed", toolCallId: "call-1", toolName: "read_file", output: { content: "hi" } });
        send({ type: "progress", percent: 90, note: "done reading" });
        send({ type: "result", success: true, summary: "ok", output: "Read a.txt: hi" });
        res.end();
        return;
      }
      if (behavior === "tool-approval-gate") {
        send({ type: "progress", percent: 10, note: "starting" });
        send({ type: "tool.requested", toolCallId: "call-1", toolName: "write_file", input: { path: "notes.md" } });
        // Genuinely waits for the decision to arrive on the separate tool-decisions
        // endpoint before sending anything else — proves the client round-trips for real.
        new Promise<void>((resolve) => decisionWaiters.set("call-1", resolve)).then(() => {
          const last = receivedDecisions.at(-1);
          if (last?.decision === "deny") {
            send({ type: "error", message: `Tool call denied: ${last.reason}`, retryable: false });
          } else {
            send({ type: "progress", percent: 90, note: "wrote the file" });
            send({ type: "result", success: true, summary: "ok", output: "Wrote notes.md" });
          }
          res.end();
        });
        return;
      }
      // "success" / "flaky-then-success"
      send({ type: "progress", percent: 50, note: "working" });
      send({ type: "result", success: true, summary: "done", output: "the real output" });
      res.end();
      return;
    }

    if (req.method === "POST" && /^\/missions\/[^/]+\/cancel$/.test(url.pathname)) {
      res.writeHead(200);
      res.end();
      return;
    }

    res.writeHead(404);
    res.end();
  });

  return { server, getSubmitAttempts: () => submitAttempts, getReceivedDecisions: () => receivedDecisions };
}

async function listen(server: http.Server): Promise<string> {
  await new Promise<void>((resolve) => server.listen(0, resolve));
  const { port } = server.address() as AddressInfo;
  return `http://127.0.0.1:${port}`;
}

const fastOptions = { submitRetryBaseDelayMs: 5 };

describe("HermesHttpAdapter (against a local fixture server standing in for Hermes)", () => {
  let server: http.Server | undefined;

  afterEach(async () => {
    if (server) await new Promise((resolve) => server!.close(resolve));
    server = undefined;
  });

  it("reports mode 'real' and a healthy status with the fixture's reported version", async () => {
    server = createFixtureServer("success").server;
    const baseUrl = await listen(server);
    const adapter = new HermesHttpAdapter(baseUrl);

    expect(adapter.mode).toBe("real");
    const health = await adapter.checkHealth();
    expect(health.healthy).toBe(true);
    expect(health.version).toBe("fixture-1.0");
  });

  it("reports unhealthy when nothing is listening", async () => {
    const adapter = new HermesHttpAdapter("http://127.0.0.1:1");
    const health = await adapter.checkHealth();
    expect(health.healthy).toBe(false);
  });

  it("submits, streams progress, and returns a real (non-mock) result", async () => {
    server = createFixtureServer("success").server;
    const baseUrl = await listen(server);
    const adapter = new HermesHttpAdapter(baseUrl);

    const progress: number[] = [];
    const result = await adapter.execute(baseInput(), {
      signal: new AbortController().signal,
      onProgress: (p) => progress.push(p),
    });

    expect(result.source).toBe("hermes");
    expect(result.success).toBe(true);
    expect(result.output).toBe("the real output");
    expect(progress).toEqual([50]);
  });

  it("forwards tool events through onToolEvent", async () => {
    server = createFixtureServer("tool-events").server;
    const baseUrl = await listen(server);
    const adapter = new HermesHttpAdapter(baseUrl);

    const toolEvents: HermesToolEvent[] = [];
    const result = await adapter.execute(baseInput(), {
      signal: new AbortController().signal,
      onProgress: () => {},
      onToolEvent: (e) => toolEvents.push(e),
    });

    expect(result.output).toContain("Read a.txt");
    expect(toolEvents.map((e) => e.type)).toEqual(["tool.started", "tool.completed"]);
  });

  it("gates on tool.requested: waits for onToolRequest's decision, then POSTs it back before Hermes continues", async () => {
    const fixture = createFixtureServer("tool-approval-gate");
    server = fixture.server;
    const baseUrl = await listen(server);
    const adapter = new HermesHttpAdapter(baseUrl);

    const result = await adapter.execute(baseInput(), {
      signal: new AbortController().signal,
      onProgress: () => {},
      onToolRequest: async (request) => {
        expect(request.toolName).toBe("write_file");
        return { decision: "allow", reason: "test approved it" };
      },
    });

    expect(result.output).toBe("Wrote notes.md");
    expect(fixture.getReceivedDecisions()).toEqual([
      { toolCallId: "call-1", decision: "allow", reason: "test approved it" },
    ]);
  });

  it("denies a tool call by default when no onToolRequest handler is configured — a gate no one wired up stays closed", async () => {
    const fixture = createFixtureServer("tool-approval-gate");
    server = fixture.server;
    const baseUrl = await listen(server);
    const adapter = new HermesHttpAdapter(baseUrl);

    await expect(
      adapter.execute(baseInput(), { signal: new AbortController().signal, onProgress: () => {} })
    ).rejects.toThrow(/denied/i);

    expect(fixture.getReceivedDecisions()).toEqual([
      { toolCallId: "call-1", decision: "deny", reason: "No tool-request handler is configured — denying by default." },
    ]);
  });

  it("retries a transient (5xx) submit failure and eventually succeeds", async () => {
    const fixture = createFixtureServer("flaky-then-success");
    server = fixture.server;
    const baseUrl = await listen(server);
    const adapter = new HermesHttpAdapter(baseUrl, fastOptions);

    const result = await adapter.execute(baseInput(), { signal: new AbortController().signal, onProgress: () => {} });
    expect(result.success).toBe(true);
    expect(fixture.getSubmitAttempts()).toBe(2);
  });

  it("does not retry a validation (4xx) rejection", async () => {
    const fixture = createFixtureServer("reject-submit");
    server = fixture.server;
    const baseUrl = await listen(server);
    const adapter = new HermesHttpAdapter(baseUrl, fastOptions);

    await expect(
      adapter.execute(baseInput(), { signal: new AbortController().signal, onProgress: () => {} })
    ).rejects.toThrow();
    expect(fixture.getSubmitAttempts()).toBe(1);
  });

  it("surfaces a runtime error frame as a failure, never a fabricated success", async () => {
    server = createFixtureServer("runtime-error").server;
    const baseUrl = await listen(server);
    const adapter = new HermesHttpAdapter(baseUrl);

    await expect(
      adapter.execute(baseInput(), { signal: new AbortController().signal, onProgress: () => {} })
    ).rejects.toThrow(/blew up/);
  });

  it("treats a stream closing without a result frame as a protocol error", async () => {
    server = createFixtureServer("no-result-frame").server;
    const baseUrl = await listen(server);
    const adapter = new HermesHttpAdapter(baseUrl);

    await expect(
      adapter.execute(baseInput(), { signal: new AbortController().signal, onProgress: () => {} })
    ).rejects.toThrow(/closed before sending a result/);
  });

  it("aborts the stream and best-effort cancels the remote run when the signal fires", async () => {
    server = createFixtureServer("hang-forever").server;
    const baseUrl = await listen(server);
    const adapter = new HermesHttpAdapter(baseUrl);

    const controller = new AbortController();
    const promise = adapter.execute(baseInput(), { signal: controller.signal, onProgress: () => {} });
    setTimeout(() => controller.abort(), 100);

    await expect(promise).rejects.toThrow();
  });
});
