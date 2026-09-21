import http from "node:http";
import type { AddressInfo } from "node:net";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { resetDbForTests } from "@/server/db/client";
import { listEventsForMission, subscribe } from "@/server/events/service";
import { getOwnerActor } from "@/server/security/policy";
import { startMission } from "./orchestrator";
import { createMission, getMission } from "./service";

/**
 * Exercises `Mission.budget.maxToolCalls` and `Mission.budget.maxRepeatedToolCalls`
 * — the orchestrator's second and third budget dimensions, alongside the
 * `maxSteps` check covered in orchestrator.test.ts. These need a live HTTP
 * fixture (same technique as tool-approval.test.ts) rather than the mock
 * Hermes adapter, because the mock adapter never makes a tool call at all.
 */

function createSequentialToolFixture(calls: Array<{ toolName: string; input: unknown }>) {
  const decisionWaiters = new Map<string, (decision: string) => void>();

  const server = http.createServer((req, res) => {
    const url = new URL(req.url ?? "/", "http://localhost");

    if (req.method === "GET" && url.pathname === "/health") {
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ version: "fixture" }));
      return;
    }

    if (req.method === "POST" && url.pathname === "/missions") {
      let body = "";
      req.on("data", (chunk) => (body += chunk));
      req.on("end", () => {
        const parsed = JSON.parse(body) as { correlationId: string };
        res.writeHead(200, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ correlationId: parsed.correlationId, runId: `run-${parsed.correlationId}` }));
      });
      return;
    }

    if (req.method === "POST" && /\/tool-decisions\//.test(url.pathname)) {
      let body = "";
      req.on("data", (chunk) => (body += chunk));
      req.on("end", () => {
        const toolCallId = url.pathname.split("/").pop()!;
        const parsed = JSON.parse(body) as { decision: string };
        decisionWaiters.get(toolCallId)?.(parsed.decision);
        decisionWaiters.delete(toolCallId);
        res.writeHead(200);
        res.end();
      });
      return;
    }

    if (req.method === "GET" && /\/stream$/.test(url.pathname)) {
      res.writeHead(200, { "Content-Type": "text/event-stream", Connection: "keep-alive" });
      const send = (frame: unknown) => res.write(`data: ${JSON.stringify(frame)}\n\n`);

      void (async () => {
        for (let i = 0; i < calls.length; i++) {
          const toolCallId = `call-${i + 1}`;
          send({ type: "tool.requested", toolCallId, toolName: calls[i].toolName, input: calls[i].input });
          // Never resolves if JARVIS aborts before POSTing a decision (e.g. a
          // budget violation) — that's expected, not a bug in the fixture;
          // the client-side pipeline still reaches a terminal state.
          const decision = await new Promise<string>((resolve) => decisionWaiters.set(toolCallId, resolve));
          if (decision !== "allow") {
            send({ type: "error", message: "denied by policy", retryable: false });
            res.end();
            return;
          }
        }
        send({ type: "result", success: true, summary: "done", output: `Completed ${calls.length} tool calls` });
        res.end();
      })();
      return;
    }

    if (req.method === "POST" && /\/cancel$/.test(url.pathname)) {
      res.writeHead(200);
      res.end();
      return;
    }

    res.writeHead(404);
    res.end();
  });

  return server;
}

async function listen(server: http.Server): Promise<string> {
  await new Promise<void>((resolve) => server.listen(0, resolve));
  const { port } = server.address() as AddressInfo;
  return `http://127.0.0.1:${port}`;
}

const TERMINAL_TYPES = new Set(["mission.completed", "mission.failed", "mission.cancelled"]);

function waitForTerminal(missionId: string, timeoutMs = 3000): Promise<void> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error("Timed out waiting for mission to finish")), timeoutMs);
    const unsubscribe = subscribe((event) => {
      if (event.missionId !== missionId || !TERMINAL_TYPES.has(event.type)) return;
      clearTimeout(timer);
      unsubscribe();
      resolve();
    });
  });
}

describe("tool-call budget enforcement (maxToolCalls, maxRepeatedToolCalls)", () => {
  let server: http.Server | undefined;

  beforeEach(() => {
    resetDbForTests(":memory:");
    vi.stubEnv("ANTHROPIC_API_KEY", "test-key");
  });

  afterEach(async () => {
    vi.unstubAllEnvs();
    if (server) await new Promise((resolve) => server!.close(resolve));
    server = undefined;
  });

  it("fails the mission (not silently) once total tool calls exceed maxToolCalls, even though every individual call would be ALLOWed", async () => {
    server = createSequentialToolFixture([
      { toolName: "read_file", input: { path: "a.md" } },
      { toolName: "read_file", input: { path: "b.md" } },
      { toolName: "read_file", input: { path: "c.md" } },
    ]);
    vi.stubEnv("HERMES_API_URL", await listen(server));

    const mission = createMission(
      { objective: "Read three files", budget: { maxToolCalls: 2 } },
      getOwnerActor()
    );

    const done = waitForTerminal(mission.id);
    startMission(mission.id);
    await done;

    const finished = getMission(mission.id)!;
    expect(finished.status).toBe("FAILED");

    const events = listEventsForMission(mission.id);
    const types = events.map((e) => e.type);
    expect(types.filter((t) => t === "tool.requested")).toHaveLength(3);
    expect(types.filter((t) => t === "tool.approved")).toHaveLength(2); // first two, before the budget triggers
    expect(types).toContain("mission.budget_exceeded");

    const violation = events.find((e) => e.type === "mission.budget_exceeded")!;
    expect(violation.metadata).toMatchObject({ dimension: "maxToolCalls", limit: 2, actual: 3 });
  });

  it("fails the mission (not silently) when the same tool call repeats past maxRepeatedToolCalls — a stuck-loop guard", async () => {
    const sameCall = { toolName: "read_file", input: { path: "notes.md" } };
    server = createSequentialToolFixture([sameCall, sameCall, sameCall]);
    vi.stubEnv("HERMES_API_URL", await listen(server));

    const mission = createMission(
      { objective: "Read notes.md", budget: { maxRepeatedToolCalls: 2 } },
      getOwnerActor()
    );

    const done = waitForTerminal(mission.id);
    startMission(mission.id);
    await done;

    const finished = getMission(mission.id)!;
    expect(finished.status).toBe("FAILED");

    const events = listEventsForMission(mission.id);
    const violation = events.find((e) => e.type === "mission.budget_exceeded")!;
    expect(violation.metadata).toMatchObject({ dimension: "maxRepeatedToolCalls", limit: 2, actual: 3 });
  });

  it("does not false-positive on repetition when identical calls are not consecutive", async () => {
    const readA = { toolName: "read_file", input: { path: "a.md" } };
    const readB = { toolName: "read_file", input: { path: "b.md" } };
    // A, B, A: never two consecutive identical calls, so a limit of 1 must not trip.
    server = createSequentialToolFixture([readA, readB, readA]);
    vi.stubEnv("HERMES_API_URL", await listen(server));

    const mission = createMission(
      { objective: "Read a.md, then b.md, then a.md again", budget: { maxRepeatedToolCalls: 1 } },
      getOwnerActor()
    );

    const done = waitForTerminal(mission.id);
    startMission(mission.id);
    await done;

    const finished = getMission(mission.id)!;
    expect(finished.status).toBe("COMPLETED");

    const types = listEventsForMission(mission.id).map((e) => e.type);
    expect(types).not.toContain("mission.budget_exceeded");
    expect(types.filter((t) => t === "tool.approved")).toHaveLength(3);
  });
});
