import http from "node:http";
import type { AddressInfo } from "node:net";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { resetDbForTests } from "@/server/db/client";
import { subscribe } from "@/server/events/service";
import { getOwnerActor } from "@/server/security/policy";

/**
 * Proves the sprint's core architectural claim for Hermes-mediated tool
 * calls: `missions/orchestrator.ts`'s `handleToolRequest` reaches
 * `security/tool-policy.ts` ONLY through `tools/executor.ts`'s
 * `evaluateGovernedToolCall` — not directly.
 *
 * `@/server/tools/executor` is replaced with a mock the test fully
 * controls; `@/server/security/tool-policy`'s real `evaluateToolRequest` is
 * wrapped as a spy (still doing its real work, in case anything legitimately
 * calls it) but is never itself imported directly by anything under test
 * here except through the (mocked-away) executor. If `orchestrator.ts` ever
 * regresses to calling `evaluateToolRequest` directly again — the exact bug
 * this sprint closes — this spy registers a call and the test fails.
 */

const evaluateGovernedToolCallMock = vi.fn();
const recordToolCallResolutionMock = vi.fn();

vi.mock("@/server/tools/executor", () => ({
  evaluateGovernedToolCall: (...args: unknown[]) => evaluateGovernedToolCallMock(...args),
  recordToolCallResolution: (...args: unknown[]) => recordToolCallResolutionMock(...args),
}));

vi.mock("@/server/security/tool-policy", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/server/security/tool-policy")>();
  return { ...actual, evaluateToolRequest: vi.fn(actual.evaluateToolRequest) };
});

function createSingleToolFixture(toolName: string) {
  const decisionWaiters = new Map<string, () => void>();
  const receivedDecisions: Array<{ decision: string }> = [];

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
        receivedDecisions.push({ decision: parsed.decision });
        decisionWaiters.get(toolCallId)?.();
        decisionWaiters.delete(toolCallId);
        res.writeHead(200);
        res.end();
      });
      return;
    }

    if (req.method === "GET" && /\/stream$/.test(url.pathname)) {
      res.writeHead(200, { "Content-Type": "text/event-stream", Connection: "keep-alive" });
      const send = (frame: unknown) => res.write(`data: ${JSON.stringify(frame)}\n\n`);
      send({ type: "tool.requested", toolCallId: "call-1", toolName, input: { path: "notes.md" } });
      new Promise<void>((resolve) => decisionWaiters.set("call-1", resolve)).then(() => {
        const last = receivedDecisions.at(-1);
        if (last?.decision === "deny") {
          send({ type: "error", message: "denied by policy", retryable: false });
        } else {
          send({ type: "result", success: true, summary: "done", output: "Tool call completed" });
        }
        res.end();
      });
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

describe("Hermes tool requests route through ToolExecutor, not tool-policy directly", () => {
  let server: http.Server | undefined;

  beforeEach(() => {
    resetDbForTests(":memory:");
    vi.stubEnv("ANTHROPIC_API_KEY", "test-key");
    evaluateGovernedToolCallMock.mockReset();
    recordToolCallResolutionMock.mockReset();
  });

  afterEach(async () => {
    vi.unstubAllEnvs();
    if (server) await new Promise((resolve) => server!.close(resolve));
    server = undefined;
  });

  it("ALLOW: Hermes -> ToolExecutor -> Policy -> Tool -> Audit, and never Hermes -> tool-policy directly", async () => {
    const { evaluateToolRequest } = await import("@/server/security/tool-policy");
    const { startMission } = await import("./orchestrator");
    const { createMission, getMission } = await import("./service");

    evaluateGovernedToolCallMock.mockReturnValue({ verdict: "ALLOW", risk: "low", reason: "mocked allow" });

    server = createSingleToolFixture("read_file");
    vi.stubEnv("HERMES_API_URL", await listen(server));

    const mission = createMission({ objective: "Read a file" }, getOwnerActor());
    const done = waitForTerminal(mission.id);
    startMission(mission.id);
    await done;

    expect(getMission(mission.id)!.status).toBe("COMPLETED");

    // The governed boundary was reached, with the real request shape.
    expect(evaluateGovernedToolCallMock).toHaveBeenCalledWith(
      { toolName: "read_file", allowedTools: [], forbiddenActions: [] },
      { actorId: "system", resourceType: "tool_call", resourceId: "call-1" }
    );

    // The security boundary itself (tool-policy.ts) was never reached directly by orchestrator.ts.
    expect(evaluateToolRequest).not.toHaveBeenCalled();
  });

  it("DENY: a ToolExecutor DENY verdict fails the mission without ever calling tool-policy directly", async () => {
    const { evaluateToolRequest } = await import("@/server/security/tool-policy");
    const { startMission } = await import("./orchestrator");
    const { createMission, getMission } = await import("./service");

    evaluateGovernedToolCallMock.mockReturnValue({ verdict: "DENY", risk: "critical", reason: "mocked deny" });

    server = createSingleToolFixture("execute_command");
    vi.stubEnv("HERMES_API_URL", await listen(server));

    const mission = createMission({ objective: "Run a command" }, getOwnerActor());
    const done = waitForTerminal(mission.id);
    startMission(mission.id);
    await done;

    expect(getMission(mission.id)!.status).toBe("FAILED");
    expect(evaluateGovernedToolCallMock).toHaveBeenCalledTimes(1);
    expect(evaluateToolRequest).not.toHaveBeenCalled();
  });
});
