import http from "node:http";
import type { AddressInfo } from "node:net";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { resetDbForTests } from "@/server/db/client";
import { listEventsForMission, subscribe } from "@/server/events/service";
import { getOwnerActor } from "@/server/security/policy";
import { cancelMission, resolveToolApproval, startMission } from "./orchestrator";
import { createMission, getMission } from "./service";

/**
 * These tests drive the FULL mission pipeline — orchestrator, the real
 * `HermesAgentAdapter`, the tool-policy gate, and the pause/resume plumbing
 * together — against a tiny local fixture speaking Hermes Agent's actual
 * `api_server` wire (see hermes/agent-adapter.ts). Unit coverage for the
 * policy table itself lives in `security/tool-policy.test.ts`; this file
 * proves those pieces are actually wired to each other correctly.
 */

function createGatedFixture(toolName: string) {
  const decisionWaiters = new Map<string, (choice: string) => void>();
  const receivedDecisions: Array<{ choice: string }> = [];

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

    if (req.method === "POST" && /\/v1\/runs\/[^/]+\/approval$/.test(url.pathname)) {
      let body = "";
      req.on("data", (chunk) => (body += chunk));
      req.on("end", () => {
        const parsed = JSON.parse(body) as { choice: string; request_id?: string };
        receivedDecisions.push({ choice: parsed.choice });
        const requestId = parsed.request_id ?? "call-1";
        decisionWaiters.get(requestId)?.(parsed.choice);
        decisionWaiters.delete(requestId);
        res.writeHead(200);
        res.end();
      });
      return;
    }

    if (req.method === "GET" && /\/v1\/runs\/[^/]+\/events$/.test(url.pathname)) {
      res.writeHead(200, { "Content-Type": "text/event-stream", Connection: "keep-alive" });
      const send = (frame: unknown) => res.write(`data: ${JSON.stringify(frame)}\n\n`);
      send({ event: "message.delta", delta: "starting" });
      send({ event: "approval.request", request_id: "call-1", execution_generation: 1, tool_name: toolName, command: { path: "notes.md" } });
      new Promise<string>((resolve) => decisionWaiters.set("call-1", resolve)).then((choice) => {
        if (choice === "deny") {
          send({ event: "run.failed", error: "denied by policy" });
        } else {
          send({ event: "run.completed", summary: "wrote it", output: "Wrote notes.md successfully" });
        }
        res.end();
      });
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

function waitForEvent(missionId: string, type: string, timeoutMs = 3000): Promise<void> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(`Timed out waiting for ${type}`)), timeoutMs);
    const unsubscribe = subscribe((event) => {
      if (event.missionId === missionId && event.type === type) {
        clearTimeout(timer);
        unsubscribe();
        resolve();
      }
    });
  });
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

describe("execution-time tool security (full pipeline via a gated fixture Hermes Agent)", () => {
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

  it("pauses on WAITING_USER with a visible pendingToolApproval, then resumes and completes once approved", async () => {
    server = createGatedFixture("write_file");
    vi.stubEnv("HERMES_AGENT_URL", await listen(server));
    vi.stubEnv("HERMES_AGENT_API_KEY", "test-key");

    const mission = createMission({ objective: "Write some notes to disk" }, getOwnerActor());
    const waitingForApproval = waitForEvent(mission.id, "security.approval_required");
    startMission(mission.id);
    await waitingForApproval;

    const waiting = getMission(mission.id)!;
    expect(waiting.status).toBe("WAITING_USER");
    expect(waiting.pendingToolApproval).toMatchObject({ toolCallId: "call-1", toolName: "write_file", risk: "medium" });

    const done = waitForTerminal(mission.id);
    resolveToolApproval(mission.id, "call-1", true, "looks fine");
    await done;

    const finished = getMission(mission.id)!;
    expect(finished.status).toBe("COMPLETED");
    expect(finished.pendingToolApproval).toBeNull();
    expect(finished.result?.output).toContain("Wrote notes.md");

    const types = listEventsForMission(mission.id).map((e) => e.type);
    expect(types).toEqual(
      expect.arrayContaining(["tool.requested", "security.approval_required", "tool.approved", "mission.completed"])
    );
  });

  it("denying the request fails the mission — never fabricates success after a DENY", async () => {
    server = createGatedFixture("write_file");
    vi.stubEnv("HERMES_AGENT_URL", await listen(server));
    vi.stubEnv("HERMES_AGENT_API_KEY", "test-key");

    const mission = createMission({ objective: "Write some notes to disk" }, getOwnerActor());
    const waitingForApproval = waitForEvent(mission.id, "security.approval_required");
    startMission(mission.id);
    await waitingForApproval;

    const done = waitForTerminal(mission.id);
    resolveToolApproval(mission.id, "call-1", false, "not today");
    await done;

    const finished = getMission(mission.id)!;
    expect(finished.status).toBe("FAILED");
    expect(listEventsForMission(mission.id).map((e) => e.type)).toContain("tool.denied");
  });

  it("auto-allows a low-risk tool without ever pausing the mission", async () => {
    server = createGatedFixture("read_file");
    vi.stubEnv("HERMES_AGENT_URL", await listen(server));
    vi.stubEnv("HERMES_AGENT_API_KEY", "test-key");

    const mission = createMission({ objective: "Read some notes from disk" }, getOwnerActor());
    const done = waitForTerminal(mission.id);
    startMission(mission.id);
    await done;

    const finished = getMission(mission.id)!;
    expect(finished.status).toBe("COMPLETED");
    expect(finished.pendingToolApproval).toBeNull();

    const types = listEventsForMission(mission.id).map((e) => e.type);
    expect(types).toContain("tool.approved");
    expect(types).not.toContain("security.approval_required"); // never asked — low risk
  });

  it("cancelling a mission while it awaits approval resolves the wait instead of hanging forever", async () => {
    server = createGatedFixture("write_file");
    vi.stubEnv("HERMES_AGENT_URL", await listen(server));
    vi.stubEnv("HERMES_AGENT_API_KEY", "test-key");

    const mission = createMission({ objective: "Write some notes to disk" }, getOwnerActor());
    const waitingForApproval = waitForEvent(mission.id, "security.approval_required");
    startMission(mission.id);
    await waitingForApproval;

    const done = waitForTerminal(mission.id);
    cancelMission(mission.id);
    await done;

    const finished = getMission(mission.id)!;
    expect(finished.status).toBe("CANCELLED");
    expect(finished.pendingToolApproval).toBeNull();
    expect(() => resolveToolApproval(mission.id, "call-1", true)).toThrow();
  });
});
