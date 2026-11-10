import { describe, expect, it, vi } from "vitest";
import { resumeMissionToSettled, runMissionToSettled, submitToolApproval, type MissionRunDeps } from "./mission-run";
import type { Mission, MissionStatus } from "@/server/missions/types";

const stub = (status: MissionStatus): Mission => ({ id: "m1", status }) as Mission;

function deps(overrides: Partial<MissionRunDeps> = {}): MissionRunDeps {
  let clock = 0;
  return {
    createMission: vi.fn(async () => stub("QUEUED")),
    getMission: vi.fn(async () => stub("COMPLETED")),
    sleep: vi.fn(async (ms: number) => {
      clock += ms;
    }),
    now: () => clock,
    intervalMs: 1000,
    timeoutMs: 5000,
    ...overrides,
  };
}

describe("runMissionToSettled", () => {
  it("creates the mission, polls until it settles, and returns the settled mission", async () => {
    const statuses: MissionStatus[] = ["QUEUED", "RUNNING", "RUNNING", "COMPLETED"];
    const d = deps({ getMission: vi.fn(async () => stub(statuses.shift() ?? "COMPLETED")) });
    const result = await runMissionToSettled("check my inbox", d);
    expect(d.createMission).toHaveBeenCalledWith("check my inbox");
    expect(result.status).toBe("COMPLETED");
    expect(d.getMission).toHaveBeenCalledTimes(4);
  });

  it("stops at a state that needs the user, rather than waiting it out", async () => {
    const d = deps({ getMission: vi.fn(async () => stub("WAITING_USER")) });
    expect((await runMissionToSettled("x", d)).status).toBe("WAITING_USER");
    expect(d.getMission).toHaveBeenCalledTimes(1);
  });

  it("returns the still-running mission on timeout instead of hanging forever", async () => {
    const d = deps({ getMission: vi.fn(async () => stub("RUNNING")), timeoutMs: 3000 });
    const result = await runMissionToSettled("slow", d);
    expect(result.status).toBe("RUNNING");
    expect((d.getMission as ReturnType<typeof vi.fn>).mock.calls.length).toBeLessThanOrEqual(5);
  });

  it("surfaces a creation failure with its message", async () => {
    const d = deps({
      createMission: vi.fn(async () => {
        throw new Error("Mission creation was denied by policy.");
      }),
    });
    await expect(runMissionToSettled("rm -rf /", d)).rejects.toThrow("denied by policy");
    expect(d.getMission).not.toHaveBeenCalled();
  });

  it("stops polling when aborted", async () => {
    const controller = new AbortController();
    const d = deps({
      getMission: vi.fn(async () => {
        controller.abort();
        return stub("RUNNING");
      }),
    });
    await expect(runMissionToSettled("x", d, controller.signal)).rejects.toThrow(/abort/i);
  });
});

describe("resumeMissionToSettled", () => {
  const waiting = (toolCallId: string): Mission =>
    ({ id: "m1", status: "WAITING_USER", pendingToolApproval: { toolCallId } }) as Mission;

  it("keeps polling past the approval that was just answered until the mission really settles", async () => {
    const seen: Mission[] = [waiting("t1"), waiting("t1"), stub("RUNNING"), stub("COMPLETED")];
    const d = deps({ getMission: vi.fn(async () => seen.shift() ?? stub("COMPLETED")) });
    const result = await resumeMissionToSettled("m1", d, undefined, { answeredToolCallId: "t1" });
    expect(result.status).toBe("COMPLETED");
    expect(d.createMission).not.toHaveBeenCalled();
  });

  it("stops at a different approval — a new tool call needs its own answer", async () => {
    const d = deps({ getMission: vi.fn(async () => waiting("t2")) });
    const result = await resumeMissionToSettled("m1", d, undefined, { answeredToolCallId: "t1" });
    expect(result.pendingToolApproval?.toolCallId).toBe("t2");
  });

  it("returns the still-running mission at the timeout", async () => {
    const d = deps({ getMission: vi.fn(async () => stub("RUNNING")), timeoutMs: 2000 });
    expect((await resumeMissionToSettled("m1", d)).status).toBe("RUNNING");
  });
});

describe("submitToolApproval", () => {
  it("posts the owner's decision to the tool-approvals route", async () => {
    const fetchImpl = vi.fn(async () => new Response(JSON.stringify({ ok: true }), { status: 200 }));
    await submitToolApproval("m 1", "call/1", true, fetchImpl as unknown as typeof fetch);
    expect(fetchImpl).toHaveBeenCalledWith(
      "/api/missions/m%201/tool-approvals/call%2F1",
      expect.objectContaining({ method: "POST", body: JSON.stringify({ approved: true }) }),
    );
  });

  it("throws the server's message when the approval is no longer pending", async () => {
    const fetchImpl = vi.fn(async () => new Response(JSON.stringify({ error: "No pending tool approval." }), { status: 404 }));
    await expect(submitToolApproval("m1", "t1", false, fetchImpl as unknown as typeof fetch)).rejects.toThrow(
      "No pending tool approval.",
    );
  });
});
