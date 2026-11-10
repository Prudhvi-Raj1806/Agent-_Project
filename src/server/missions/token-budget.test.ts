import http from "node:http";
import type { AddressInfo } from "node:net";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { resetDbForTests } from "@/server/db/client";
import { listEventsForMission, subscribe } from "@/server/events/service";
import { getOwnerActor } from "@/server/security/policy";
import { startMission } from "./orchestrator";
import { createMission, getMission } from "./service";

/**
 * Exercises `Mission.budget.maxTokens` — the one budget dimension checked
 * post-hoc against Hermes's real reported usage, not live mid-execution
 * (Hermes Agent's `run.completed` event carries usage only at completion —
 * see hermes/agent-adapter.ts's `parseAgentUsage`). Needs a live fixture,
 * like the other budget dimensions, since the mock adapter never reports
 * usage at all.
 */

function createUsageReportingFixture(usage: { inputTokens: number; outputTokens: number; totalTokens: number } | null) {
  const server = http.createServer((req, res) => {
    const url = new URL(req.url ?? "/", "http://localhost");

    if (req.method === "GET" && url.pathname === "/health") {
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ version: "fixture" }));
      return;
    }

    if (req.method === "POST" && url.pathname === "/v1/runs") {
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ run_id: "run-1" }));
      return;
    }

    if (req.method === "GET" && /\/v1\/runs\/[^/]+\/events$/.test(url.pathname)) {
      res.writeHead(200, { "Content-Type": "text/event-stream", Connection: "keep-alive" });
      const send = (frame: unknown) => res.write(`data: ${JSON.stringify(frame)}\n\n`);
      send({ event: "message.delta", delta: "working" });
      send({
        event: "run.completed",
        summary: "done",
        output: "Task complete.",
        ...(usage ? { usage: { input_tokens: usage.inputTokens, output_tokens: usage.outputTokens, total_tokens: usage.totalTokens } } : {}),
      });
      res.end();
      return;
    }

    if (req.method === "POST" && /\/v1\/runs\/[^/]+\/stop$/.test(url.pathname)) {
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

describe("token budget enforcement (maxTokens, post-hoc against real reported usage)", () => {
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

  it("fails the mission (not silently) once real usage exceeds maxTokens, even though the model succeeded and verification would pass", async () => {
    server = createUsageReportingFixture({ inputTokens: 200, outputTokens: 900, totalTokens: 1100 });
    vi.stubEnv("HERMES_AGENT_URL", await listen(server));
    vi.stubEnv("HERMES_AGENT_API_KEY", "test-key");

    const mission = createMission(
      { objective: "Task complete this", successCriteria: ["complete"], budget: { maxTokens: 1000 } },
      getOwnerActor()
    );

    const done = waitForTerminal(mission.id);
    startMission(mission.id);
    await done;

    const finished = getMission(mission.id)!;
    expect(finished.status).toBe("FAILED");
    // The real result is preserved on the mission even though it's marked FAILED.
    expect(finished.result?.output).toBe("Task complete.");
    expect(finished.result?.usage).toEqual({ inputTokens: 200, outputTokens: 900, totalTokens: 1100 });

    const events = listEventsForMission(mission.id);
    const violation = events.find((e) => e.type === "mission.budget_exceeded")!;
    expect(violation.metadata).toMatchObject({ dimension: "maxTokens", limit: 1000, actual: 1100 });
    // Verification never even runs — the budget check pre-empts it.
    expect(events.map((e) => e.type)).not.toContain("verification.started");
  });

  it("completes normally when usage stays within maxTokens", async () => {
    server = createUsageReportingFixture({ inputTokens: 100, outputTokens: 400, totalTokens: 500 });
    vi.stubEnv("HERMES_AGENT_URL", await listen(server));
    vi.stubEnv("HERMES_AGENT_API_KEY", "test-key");

    const mission = createMission(
      { objective: "Task complete this", successCriteria: ["complete"], budget: { maxTokens: 1000 } },
      getOwnerActor()
    );

    const done = waitForTerminal(mission.id);
    startMission(mission.id);
    await done;

    const finished = getMission(mission.id)!;
    expect(finished.status).toBe("COMPLETED");
    expect(listEventsForMission(mission.id).map((e) => e.type)).not.toContain("mission.budget_exceeded");
  });

  it("does not enforce maxTokens when the adapter reports no usage at all — honestly unknown, not assumed in-budget or over", async () => {
    server = createUsageReportingFixture(null);
    vi.stubEnv("HERMES_AGENT_URL", await listen(server));
    vi.stubEnv("HERMES_AGENT_API_KEY", "test-key");

    const mission = createMission(
      { objective: "Task complete this", successCriteria: ["complete"], budget: { maxTokens: 1 } },
      getOwnerActor()
    );

    const done = waitForTerminal(mission.id);
    startMission(mission.id);
    await done;

    // budget.maxTokens=1 would fail almost any real usage, but with no usage
    // reported at all there is nothing to check against, so the mission is
    // judged purely on its actual output/verification instead.
    const finished = getMission(mission.id)!;
    expect(finished.status).toBe("COMPLETED");
    expect(listEventsForMission(mission.id).map((e) => e.type)).not.toContain("mission.budget_exceeded");
  });
});
