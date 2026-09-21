import http from "node:http";
import type { AddressInfo } from "node:net";
import { afterEach, describe, expect, it } from "vitest";
import type { RoutingDecision } from "@/server/omnirouter/types";
import { HermesAgentAdapter } from "./agent-adapter";
import type { HermesExecuteInput } from "./types";

/**
 * Exercises the real HermesAgentAdapter against a local fixture speaking
 * Hermes Agent's actual wire format — verified directly against its own
 * installed source at api_server.py / api_server_runs.py on this machine
 * (github.com/NousResearch/hermes-agent v0.21.0), not guessed from the
 * adapter's own code. This is the one Hermes adapter that had zero
 * automated coverage before this session, despite being the one now
 * verified live end-to-end (see JARVIS_CURRENT_STAGE.md) — this file closes
 * that gap with deterministic, fixture-based regression coverage instead of
 * relying on a live locally-running process.
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
  | "completed-with-usage"
  | "completed-no-usage"
  | "approval-gate"
  | "run-failed"
  | "run-cancelled"
  | "hang-forever";

function createFixtureServer(behavior: FixtureBehavior) {
  const approvalWaiters = new Map<string, () => void>();
  const receivedApprovals: Array<{ requestId?: string; choice: string }> = [];
  let stopCalled = false;
  let submittedModel: string | undefined;

  const server = http.createServer((req, res) => {
    const url = new URL(req.url ?? "/", "http://localhost");

    if (req.method === "GET" && url.pathname === "/health") {
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ status: "ok", platform: "hermes-agent", version: "0.21.0" }));
      return;
    }

    if (req.method === "POST" && url.pathname === "/v1/runs") {
      let body = "";
      req.on("data", (chunk) => (body += chunk));
      req.on("end", () => {
        const parsed = JSON.parse(body) as { input: string; model?: string };
        submittedModel = parsed.model;
        res.writeHead(200, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ run_id: "run-1" }));
      });
      return;
    }

    if (req.method === "GET" && /^\/v1\/runs\/[^/]+\/events$/.test(url.pathname)) {
      res.writeHead(200, { "Content-Type": "text/event-stream", Connection: "keep-alive" });
      const send = (frame: unknown) => res.write(`data: ${JSON.stringify(frame)}\n\n`);

      if (behavior === "hang-forever") {
        req.on("close", () => res.end());
        return;
      }
      if (behavior === "run-failed") {
        send({ event: "message.delta", run_id: "run-1", delta: "working..." });
        send({ event: "run.failed", run_id: "run-1", error: "the provider blew up" });
        res.end();
        return;
      }
      if (behavior === "run-cancelled") {
        send({ event: "message.delta", run_id: "run-1", delta: "working..." });
        send({ event: "run.cancelled", run_id: "run-1" });
        res.end();
        return;
      }
      if (behavior === "approval-gate") {
        send({ event: "message.delta", run_id: "run-1", delta: "starting" });
        send({ event: "approval.request", run_id: "run-1", request_id: "req-1", tool_name: "read_file", command: null });
        new Promise<void>((resolve) => approvalWaiters.set("req-1", resolve)).then(() => {
          const last = receivedApprovals.at(-1);
          if (last?.choice === "deny") {
            send({ event: "run.failed", run_id: "run-1", error: "denied by policy" });
          } else {
            send({ event: "run.completed", run_id: "run-1", output: "Read the file." });
          }
          res.end();
        });
        return;
      }
      // "completed-with-usage" / "completed-no-usage"
      send({ event: "message.delta", run_id: "run-1", delta: "Hello! " });
      send({ event: "message.delta", run_id: "run-1", delta: "I'm Hermes Agent." });
      send({
        event: "run.completed",
        run_id: "run-1",
        output: "Hello! I'm Hermes Agent.",
        ...(behavior === "completed-with-usage"
          ? { usage: { input_tokens: 120, output_tokens: 340, total_tokens: 460 } }
          : {}),
      });
      res.end();
      return;
    }

    if (req.method === "POST" && /^\/v1\/runs\/[^/]+\/approval$/.test(url.pathname)) {
      let body = "";
      req.on("data", (chunk) => (body += chunk));
      req.on("end", () => {
        const parsed = JSON.parse(body) as { choice: string; request_id?: string };
        receivedApprovals.push({ requestId: parsed.request_id, choice: parsed.choice });
        approvalWaiters.get(parsed.request_id ?? "")?.();
        approvalWaiters.delete(parsed.request_id ?? "");
        res.writeHead(200);
        res.end();
      });
      return;
    }

    if (req.method === "POST" && /^\/v1\/runs\/[^/]+\/stop$/.test(url.pathname)) {
      stopCalled = true;
      res.writeHead(200);
      res.end();
      return;
    }

    res.writeHead(404);
    res.end();
  });

  return {
    server,
    getReceivedApprovals: () => receivedApprovals,
    wasStopCalled: () => stopCalled,
    getSubmittedModel: () => submittedModel,
  };
}

async function listen(server: http.Server): Promise<string> {
  await new Promise<void>((resolve) => server.listen(0, resolve));
  const { port } = server.address() as AddressInfo;
  return `http://127.0.0.1:${port}`;
}

describe("HermesAgentAdapter (against a fixture speaking Hermes Agent's real api_server wire format)", () => {
  let server: http.Server | undefined;

  afterEach(async () => {
    if (server) await new Promise((resolve) => server!.close(resolve));
    server = undefined;
  });

  it("reports mode 'real' and a healthy status with the fixture's reported version", async () => {
    const fixture = createFixtureServer("completed-with-usage");
    server = fixture.server;
    const baseUrl = await listen(server);
    const adapter = new HermesAgentAdapter(baseUrl, "test-key");

    expect(adapter.mode).toBe("real");
    const health = await adapter.checkHealth();
    expect(health.healthy).toBe(true);
    expect(health.version).toBe("0.21.0");
  });

  it("reports unhealthy when nothing is listening", async () => {
    const adapter = new HermesAgentAdapter("http://127.0.0.1:1", "test-key");
    const health = await adapter.checkHealth();
    expect(health.healthy).toBe(false);
  });

  it("does not forward JARVIS's internal routing.modelId as the run's model — Hermes has no idea what OmniRouter's labels mean", async () => {
    const fixture = createFixtureServer("completed-with-usage");
    server = fixture.server;
    const baseUrl = await listen(server);
    const adapter = new HermesAgentAdapter(baseUrl, "test-key");

    await adapter.execute(baseInput(), { signal: new AbortController().signal, onProgress: () => {} });
    expect(fixture.getSubmittedModel()).toBeUndefined();
  });

  it("streams message.delta as progress (capped at 90%) and returns a real (non-mock) result with parsed usage", async () => {
    const fixture = createFixtureServer("completed-with-usage");
    server = fixture.server;
    const baseUrl = await listen(server);
    const adapter = new HermesAgentAdapter(baseUrl, "test-key");

    const progress: number[] = [];
    const result = await adapter.execute(baseInput(), {
      signal: new AbortController().signal,
      onProgress: (p) => progress.push(p),
    });

    expect(result.source).toBe("hermes");
    expect(result.success).toBe(true);
    expect(result.output).toBe("Hello! I'm Hermes Agent.");
    expect(progress).toEqual([5, 10]);
    expect(result.usage).toEqual({ inputTokens: 120, outputTokens: 340, totalTokens: 460 });
  });

  it("leaves usage undefined (never a fabricated zero) when the run.completed event doesn't report it", async () => {
    server = createFixtureServer("completed-no-usage").server;
    const baseUrl = await listen(server);
    const adapter = new HermesAgentAdapter(baseUrl, "test-key");

    const result = await adapter.execute(baseInput(), { signal: new AbortController().signal, onProgress: () => {} });
    expect(result.usage).toBeUndefined();
  });

  it("gates on approval.request: waits for onToolRequest's decision, then POSTs choice='once' before Hermes continues", async () => {
    const fixture = createFixtureServer("approval-gate");
    server = fixture.server;
    const baseUrl = await listen(server);
    const adapter = new HermesAgentAdapter(baseUrl, "test-key");

    const result = await adapter.execute(baseInput(), {
      signal: new AbortController().signal,
      onProgress: () => {},
      onToolRequest: async (request) => {
        expect(request.toolName).toBe("read_file");
        expect(request.toolCallId).toBe("req-1");
        return { decision: "allow", reason: "test approved it" };
      },
    });

    expect(result.output).toBe("Read the file.");
    expect(fixture.getReceivedApprovals()).toEqual([{ requestId: "req-1", choice: "once" }]);
  });

  it("denies by default (choice='deny') when no onToolRequest handler is configured", async () => {
    const fixture = createFixtureServer("approval-gate");
    server = fixture.server;
    const baseUrl = await listen(server);
    const adapter = new HermesAgentAdapter(baseUrl, "test-key");

    await expect(
      adapter.execute(baseInput(), { signal: new AbortController().signal, onProgress: () => {} })
    ).rejects.toThrow(/denied/i);
    expect(fixture.getReceivedApprovals()).toEqual([{ requestId: "req-1", choice: "deny" }]);
  });

  it("surfaces a run.failed event as a failure, never a fabricated success", async () => {
    server = createFixtureServer("run-failed").server;
    const baseUrl = await listen(server);
    const adapter = new HermesAgentAdapter(baseUrl, "test-key");

    await expect(
      adapter.execute(baseInput(), { signal: new AbortController().signal, onProgress: () => {} })
    ).rejects.toThrow(/blew up/);
  });

  it("treats run.cancelled as an abort, not a result", async () => {
    server = createFixtureServer("run-cancelled").server;
    const baseUrl = await listen(server);
    const adapter = new HermesAgentAdapter(baseUrl, "test-key");

    await expect(
      adapter.execute(baseInput(), { signal: new AbortController().signal, onProgress: () => {} })
    ).rejects.toThrow();
  });

  it("best-effort calls /stop when the signal is aborted mid-run", async () => {
    const fixture = createFixtureServer("hang-forever");
    server = fixture.server;
    const baseUrl = await listen(server);
    const adapter = new HermesAgentAdapter(baseUrl, "test-key");

    const controller = new AbortController();
    const promise = adapter.execute(baseInput(), { signal: controller.signal, onProgress: () => {} });
    setTimeout(() => controller.abort(), 100);

    await expect(promise).rejects.toThrow();
    await new Promise((r) => setTimeout(r, 50));
    expect(fixture.wasStopCalled()).toBe(true);
  });

  it("rejects with an AUTH error on 401/403 — check HERMES_AGENT_API_KEY", async () => {
    const authServer = http.createServer((req, res) => {
      res.writeHead(401);
      res.end();
    });
    server = authServer;
    const baseUrl = await listen(authServer);
    const adapter = new HermesAgentAdapter(baseUrl, "wrong-key");

    await expect(
      adapter.execute(baseInput(), { signal: new AbortController().signal, onProgress: () => {} })
    ).rejects.toThrow(/HERMES_AGENT_API_KEY/);
  });
});
