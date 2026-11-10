import { describe, expect, it } from "vitest";
import { createServiceController, ServiceInputError, type ServiceDef } from "./controller";

/** A fake service whose running state flips when start/stop are called, optionally after a delay or never. */
function fake(id: ServiceDef["id"], opts: { running?: boolean; startWorks?: boolean; stopWorks?: boolean } = {}) {
  const calls: string[] = [];
  let running = opts.running ?? false;
  const def: ServiceDef = {
    id,
    label: id,
    probe: async () => ({ running, detail: running ? "ok" : null }),
    start: async () => {
      calls.push("start");
      if (opts.startWorks !== false) running = true;
    },
    stop: async () => {
      calls.push("stop");
      if (opts.stopWorks !== false) running = false;
    },
  };
  return { def, calls };
}

const fast = { waitMs: 200, stopWaitMs: 200, pollMs: 5, canControl: true };

describe("service controller", () => {
  it("lists every service with its running state and detail", async () => {
    const a = fake("hermes", { running: true });
    const b = fake("ollama");
    const statuses = await createServiceController([a.def, b.def], fast).statuses();
    expect(statuses).toEqual([
      { id: "hermes", label: "hermes", running: true, detail: "ok", canControl: true },
      { id: "ollama", label: "ollama", running: false, detail: null, canControl: true },
    ]);
  });

  it("reports a service as stopped when its probe throws", async () => {
    const def: ServiceDef = { id: "hermes", label: "h", probe: async () => { throw new Error("boom"); }, start: async () => {}, stop: async () => {} };
    expect((await createServiceController([def], fast).statuses())[0].running).toBe(false);
  });

  it("start waits for the probe to pass and returns the running status", async () => {
    const s = fake("hermes");
    const status = await createServiceController([s.def], fast).run("hermes", "start");
    expect(status.running).toBe(true);
    expect(s.calls).toEqual(["start"]);
  });

  it("start does nothing when the service is already running", async () => {
    const s = fake("hermes", { running: true });
    await createServiceController([s.def], fast).run("hermes", "start");
    expect(s.calls).toEqual([]);
  });

  it("start reports running:false truthfully when the probe never passes in time", async () => {
    const s = fake("hermes", { startWorks: false });
    const status = await createServiceController([s.def], fast).run("hermes", "start");
    expect(status.running).toBe(false);
  });

  it("stop waits until the service is no longer running", async () => {
    const s = fake("hermes", { running: true });
    const status = await createServiceController([s.def], fast).run("hermes", "stop");
    expect(status.running).toBe(false);
    expect(s.calls).toEqual(["stop"]);
  });

  it("restart stops, then starts, in that order", async () => {
    const s = fake("hermes", { running: true });
    const status = await createServiceController([s.def], fast).run("hermes", "restart");
    expect(s.calls).toEqual(["stop", "start"]);
    expect(status.running).toBe(true);
  });

  it("rejects an unknown id without calling anything", async () => {
    const s = fake("hermes");
    await expect(createServiceController([s.def], fast).run("nope", "start")).rejects.toBeInstanceOf(ServiceInputError);
    expect(s.calls).toEqual([]);
  });

  it("rejects an unknown action without calling anything", async () => {
    const s = fake("hermes");
    await expect(createServiceController([s.def], fast).run("hermes", "explode")).rejects.toBeInstanceOf(ServiceInputError);
    expect(s.calls).toEqual([]);
  });

  it("refuses start and stop when control isn't available on this platform", async () => {
    const s = fake("hermes");
    const ctl = createServiceController([s.def], { ...fast, canControl: false });
    await expect(ctl.run("hermes", "start")).rejects.toThrow(/only supported on Windows/i);
    expect(s.calls).toEqual([]);
  });
});
