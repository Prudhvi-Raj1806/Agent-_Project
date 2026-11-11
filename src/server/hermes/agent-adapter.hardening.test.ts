import http from "node:http";
import type { AddressInfo } from "node:net";
import { afterEach, describe, expect, it } from "vitest";
import type { RoutingDecision } from "@/server/omnirouter/types";
import { HermesAgentAdapter } from "./agent-adapter";
import { HermesError } from "./errors";
import type { HermesExecuteCallbacks, HermesExecuteInput } from "./types";

/**
 * Wire-level behaviour of the real adapter against a scripted fixture speaking
 * Hermes Agent's `api_server` format. The full mission pipeline is covered in
 * missions/tool-approval.test.ts; this file covers the failure modes that only
 * show up at the HTTP boundary (retry, idempotency, terminal events, capabilities).
 */

type SubmitHandler = (attempt: number, req: http.IncomingMessage, res: http.ServerResponse) => void;

interface FixtureOptions {
  onSubmit?: SubmitHandler;
  events?: Array<Record<string, unknown>>;
  capabilities?: { status: number; body?: unknown };
}

function createFixture(options: FixtureOptions = {}) {
  const submitHeaders: Array<http.IncomingHttpHeaders> = [];
  const onSubmit: SubmitHandler =
    options.onSubmit ??
    ((_attempt, _req, res) => {
      res.writeHead(202, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ run_id: "run-1", status: "started" }));
    });

  const server = http.createServer((req, res) => {
    const url = new URL(req.url ?? "/", "http://localhost");

    if (req.method === "GET" && url.pathname === "/health") {
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ status: "ok" }));
      return;
    }
    if (req.method === "GET" && url.pathname === "/v1/capabilities") {
      const caps = options.capabilities ?? { status: 404 };
      res.writeHead(caps.status, { "Content-Type": "application/json" });
      res.end(JSON.stringify(caps.body ?? {}));
      return;
    }
    if (req.method === "POST" && url.pathname === "/v1/runs") {
      submitHeaders.push(req.headers);
      req.resume();
      req.on("end", () => onSubmit(submitHeaders.length, req, res));
      return;
    }
    if (req.method === "GET" && /\/events$/.test(url.pathname)) {
      res.writeHead(200, { "Content-Type": "text/event-stream" });
      for (const frame of options.events ?? [{ event: "run.completed", output: "done" }]) {
        res.write(`data: ${JSON.stringify(frame)}\n\n`);
      }
      res.end();
      return;
    }
    res.writeHead(404);
    res.end();
  });

  return { server, submitHeaders };
}

const FAST_RETRY = { maxAttempts: 3, baseDelayMs: 1, maxDelayMs: 5 };

const input: HermesExecuteInput = {
  missionId: "mission-1",
  objective: "Do the thing",
  routing: {} as RoutingDecision,
};

function callbacks(): HermesExecuteCallbacks {
  return { signal: new AbortController().signal, onProgress: () => {} };
}

describe("HermesAgentAdapter hardening (retry, idempotency, run.interrupted, capabilities)", () => {
  let server: http.Server | undefined;

  async function start(options: FixtureOptions) {
    const fixture = createFixture(options);
    server = fixture.server;
    await new Promise<void>((resolve) => server!.listen(0, resolve));
    const { port } = server.address() as AddressInfo;
    return {
      adapter: new HermesAgentAdapter(`http://127.0.0.1:${port}`, "fixture-key", { submitRetry: FAST_RETRY }),
      submitHeaders: fixture.submitHeaders,
    };
  }

  afterEach(async () => {
    if (server) await new Promise((resolve) => server!.close(resolve));
    server = undefined;
  });

  it("sends an Idempotency-Key on submit", async () => {
    const { adapter, submitHeaders } = await start({});
    const result = await adapter.execute(input, callbacks());

    expect(result).toMatchObject({ success: true, output: "done", source: "hermes" });
    expect(submitHeaders).toHaveLength(1);
    expect(submitHeaders[0]["idempotency-key"]).toMatch(/^[0-9a-f-]{36}$/);
  });

  it("retries a 503 with the SAME Idempotency-Key and then succeeds", async () => {
    const { adapter, submitHeaders } = await start({
      onSubmit: (attempt, _req, res) => {
        if (attempt < 3) {
          res.writeHead(503, { "Retry-After": "0" });
          res.end();
          return;
        }
        res.writeHead(202, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ run_id: "run-1", status: "started" }));
      },
    });

    const result = await adapter.execute(input, callbacks());

    expect(result.success).toBe(true);
    expect(submitHeaders).toHaveLength(3);
    const keys = new Set(submitHeaders.map((h) => h["idempotency-key"]));
    expect(keys.size).toBe(1);
  });

  it("gives up on a persistent 429 with a retryable HermesError after maxAttempts", async () => {
    const { adapter, submitHeaders } = await start({
      onSubmit: (_attempt, _req, res) => {
        res.writeHead(429, { "Retry-After": "0" });
        res.end();
      },
    });

    const err = await adapter.execute(input, callbacks()).catch((e: unknown) => e);

    expect(err).toBeInstanceOf(HermesError);
    expect(err).toMatchObject({ code: "RUNTIME", retryable: true });
    expect(submitHeaders).toHaveLength(FAST_RETRY.maxAttempts);
  });

  it("retries a dropped connection on submit, reusing the Idempotency-Key", async () => {
    const { adapter, submitHeaders } = await start({
      onSubmit: (attempt, req, res) => {
        if (attempt === 1) {
          req.socket.destroy(); // response lost — exactly the case the key exists for
          return;
        }
        res.writeHead(202, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ run_id: "run-1", status: "started" }));
      },
    });

    const result = await adapter.execute(input, callbacks());

    expect(result.success).toBe(true);
    expect(submitHeaders).toHaveLength(2);
    expect(submitHeaders[0]["idempotency-key"]).toBe(submitHeaders[1]["idempotency-key"]);
  });

  it("does not retry a 409 (foreign session / idempotency conflict)", async () => {
    const { adapter, submitHeaders } = await start({
      onSubmit: (_attempt, _req, res) => {
        res.writeHead(409, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ error: { code: "permission_denied" } }));
      },
    });

    const err = await adapter.execute(input, callbacks()).catch((e: unknown) => e);

    expect(err).toMatchObject({ code: "RUNTIME", retryable: false });
    expect(submitHeaders).toHaveLength(1);
  });

  it("does not retry a 401 and reports AUTH", async () => {
    const { adapter, submitHeaders } = await start({
      onSubmit: (_attempt, _req, res) => {
        res.writeHead(401);
        res.end();
      },
    });

    const err = await adapter.execute(input, callbacks()).catch((e: unknown) => e);

    expect(err).toMatchObject({ code: "AUTH", retryable: false });
    expect(submitHeaders).toHaveLength(1);
  });

  it("treats run.interrupted as a retryable runtime failure, not a hang or a success", async () => {
    const { adapter } = await start({ events: [{ event: "message.delta", delta: "working" }, { event: "run.interrupted" }] });

    const err = await adapter.execute(input, callbacks()).catch((e: unknown) => e);

    expect(err).toBeInstanceOf(HermesError);
    expect(err).toMatchObject({ code: "RUNTIME", retryable: true });
  });

  describe("checkHealth capabilities probe", () => {
    it("reports approvalSupported: true when features.run_approval is true", async () => {
      const { adapter } = await start({ capabilities: { status: 200, body: { features: { run_approval: true } } } });
      expect(await adapter.checkHealth()).toMatchObject({ healthy: true, approvalSupported: true });
    });

    it("reports approvalSupported: false only when the server says so explicitly", async () => {
      const { adapter } = await start({ capabilities: { status: 200, body: { features: { run_approval: false } } } });
      expect(await adapter.checkHealth()).toMatchObject({ healthy: true, approvalSupported: false });
    });

    it("leaves approvalSupported undefined when the flag is absent (the docs' feature list is partial)", async () => {
      const { adapter } = await start({ capabilities: { status: 200, body: { features: { run_submission: true } } } });
      const health = await adapter.checkHealth();
      expect(health.healthy).toBe(true);
      expect(health.approvalSupported).toBeUndefined();
    });

    it("stays healthy with approvalSupported undefined when /v1/capabilities is unavailable", async () => {
      const { adapter } = await start({ capabilities: { status: 404 } });
      const health = await adapter.checkHealth();
      expect(health.healthy).toBe(true);
      expect(health.approvalSupported).toBeUndefined();
    });
  });
});
