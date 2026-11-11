import http from "node:http";
import type { AddressInfo } from "node:net";
import { afterEach, describe, expect, it } from "vitest";
import type { RoutingDecision } from "@/server/omnirouter/types";
import { HermesAgentAdapter } from "./agent-adapter";
import type { HermesExecuteCallbacks, HermesExecuteInput, HermesToolEvent } from "./types";

/**
 * Behaviour that only exists because two lines of work were merged: the retry,
 * idempotency and capability probe on one side, usage, tool events, approval
 * handling and resume text on the other. Each test pins an interaction, so a
 * future edit to either half cannot quietly break the other.
 */

interface Fixture {
  submitBodies: Array<Record<string, unknown>>;
  submitKeys: Array<string | undefined>;
  approvals: Array<Record<string, unknown>>;
}

function listenFixture(options: { failFirstSubmit?: boolean; events: Array<Record<string, unknown>> }) {
  const seen: Fixture = { submitBodies: [], submitKeys: [], approvals: [] };
  const server = http.createServer((req, res) => {
    const url = new URL(req.url ?? "/", "http://localhost");
    const readBody = (then: (body: Record<string, unknown>) => void) => {
      let raw = "";
      req.on("data", (chunk) => (raw += chunk));
      req.on("end", () => then(raw ? (JSON.parse(raw) as Record<string, unknown>) : {}));
    };

    if (req.method === "POST" && url.pathname === "/v1/runs") {
      readBody((body) => {
        seen.submitBodies.push(body);
        seen.submitKeys.push(req.headers["idempotency-key"] as string | undefined);
        if (options.failFirstSubmit && seen.submitBodies.length === 1) {
          res.writeHead(503, { "Retry-After": "0" });
          res.end();
          return;
        }
        res.writeHead(202, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ run_id: "run-1", status: "started" }));
      });
      return;
    }
    if (req.method === "GET" && /\/events$/.test(url.pathname)) {
      res.writeHead(200, { "Content-Type": "text/event-stream" });
      for (const frame of options.events) res.write(`data: ${JSON.stringify(frame)}\n\n`);
      res.end();
      return;
    }
    if (req.method === "POST" && /\/approval$/.test(url.pathname)) {
      readBody((body) => {
        seen.approvals.push(body);
        res.writeHead(200);
        res.end();
      });
      return;
    }
    res.writeHead(404);
    res.end();
  });
  return { server, seen };
}

const FAST_RETRY = { maxAttempts: 3, baseDelayMs: 1, maxDelayMs: 5 };
const baseInput: HermesExecuteInput = { missionId: "mission-1", objective: "Do the thing", routing: {} as RoutingDecision };
const COMPLETED = [{ event: "run.completed", output: "done" }];

describe("HermesAgentAdapter after the merge", () => {
  let server: http.Server | undefined;

  async function start(options: Parameters<typeof listenFixture>[0]) {
    const fixture = listenFixture(options);
    server = fixture.server;
    await new Promise<void>((resolve) => server!.listen(0, resolve));
    const { port } = server.address() as AddressInfo;
    return {
      adapter: new HermesAgentAdapter(`http://127.0.0.1:${port}`, "fixture-key", { submitRetry: FAST_RETRY }),
      seen: fixture.seen,
    };
  }

  const callbacks = (extra: Partial<HermesExecuteCallbacks> = {}): HermesExecuteCallbacks => ({
    signal: new AbortController().signal,
    onProgress: () => {},
    ...extra,
  });

  afterEach(async () => {
    if (server) await new Promise((resolve) => server!.close(resolve));
    server = undefined;
  });

  describe("the prompt on a resume", () => {
    it("sends a fresh run's objective unchanged", async () => {
      const { adapter, seen } = await start({ events: COMPLETED });
      await adapter.execute({ ...baseInput, fromPercent: 0 }, callbacks());
      expect(seen.submitBodies[0].input).toBe("Do the thing");
    });

    it("puts the orchestrator's prior context ahead of the objective", async () => {
      const { adapter, seen } = await start({ events: COMPLETED });
      await adapter.execute(
        { ...baseInput, fromPercent: 40, priorContext: "Paused at 40%. Last known state: drafted the outline." },
        callbacks(),
      );
      expect(seen.submitBodies[0].input).toBe("Paused at 40%. Last known state: drafted the outline.\n\n---\n\nDo the thing");
    });

    it("does not add a second resume note when the orchestrator already supplied the context", async () => {
      const { adapter, seen } = await start({ events: COMPLETED });
      await adapter.execute({ ...baseInput, fromPercent: 40, priorContext: "Paused at 40%." }, callbacks());
      expect(String(seen.submitBodies[0].input)).not.toContain("Resuming a previously-paused mission");
    });

    it("still folds in a generic resume note when a caller gives only fromPercent, so a resume never restarts from scratch", async () => {
      const { adapter, seen } = await start({ events: COMPLETED });
      await adapter.execute({ ...baseInput, fromPercent: 60 }, callbacks());
      expect(String(seen.submitBodies[0].input)).toContain("Resuming a previously-paused mission at 60% progress");
      expect(String(seen.submitBodies[0].input)).toContain("Do the thing");
    });

    it("sends the mission id as session_id, defensively", async () => {
      const { adapter, seen } = await start({ events: COMPLETED });
      await adapter.execute(baseInput, callbacks());
      expect(seen.submitBodies[0].session_id).toBe("mission-1");
    });
  });

  it("returns the run's real token usage after a submit that needed a retry, with the same idempotency key", async () => {
    const { adapter, seen } = await start({
      failFirstSubmit: true,
      events: [{ event: "run.completed", output: "done", usage: { input_tokens: 10, output_tokens: 5, total_tokens: 15 } }],
    });

    const result = await adapter.execute(baseInput, callbacks());

    expect(result.usage).toEqual({ inputTokens: 10, outputTokens: 5, totalTokens: 15 });
    expect(seen.submitBodies).toHaveLength(2);
    expect(seen.submitKeys[0]).toBeTruthy();
    expect(seen.submitKeys[1]).toBe(seen.submitKeys[0]);
  });

  it("still forwards tool events for every tool call on a run that went through the retry path", async () => {
    const { adapter } = await start({
      failFirstSubmit: true,
      events: [
        { event: "tool.started", tool: "read_file", timestamp: 1, preview: "notes.md" },
        { event: "tool.completed", tool: "read_file", duration: 0.5 },
        { event: "run.completed", output: "done" },
      ],
    });
    const observed: HermesToolEvent[] = [];

    await adapter.execute(baseInput, callbacks({ onToolEvent: (event) => observed.push(event) }));

    expect(observed.map((e) => e.type)).toEqual(["tool.started", "tool.completed"]);
    expect(observed[0].toolName).toBe("read_file");
    expect(observed[1].toolCallId).toBe(observed[0].toolCallId);
  });

  describe("approvals whose frame is incomplete", () => {
    const withoutId = { event: "approval.request", tool_name: "terminal", command: "rm -rf scratch" };

    it("still delivers a DENIAL to Hermes when the frame carries no request id or generation", async () => {
      const { adapter, seen } = await start({ events: [withoutId, ...COMPLETED] });

      await adapter.execute(
        baseInput,
        callbacks({ onToolRequest: async () => ({ decision: "deny", reason: "policy" }) }),
      );

      expect(seen.approvals).toEqual([{ choice: "deny" }]);
    });

    it("sends what the frame did carry, never an invented id", async () => {
      const { adapter, seen } = await start({
        events: [{ ...withoutId, request_id: "req-9", execution_generation: 3 }, ...COMPLETED],
      });

      await adapter.execute(baseInput, callbacks({ onToolRequest: async () => ({ decision: "allow" }) }));

      expect(seen.approvals).toEqual([{ choice: "once", request_id: "req-9", execution_generation: 3 }]);
    });

    it("denies by default, and says so to Hermes, when nothing handles tool requests", async () => {
      const { adapter, seen } = await start({
        events: [{ ...withoutId, request_id: "req-9", execution_generation: 3 }, ...COMPLETED],
      });

      await adapter.execute(baseInput, callbacks());

      expect(seen.approvals).toEqual([{ choice: "deny", request_id: "req-9", execution_generation: 3 }]);
    });
  });
});
