export type ServiceId = "hermes" | "voicestudio" | "omniroute" | "ollama";
export type ServiceAction = "start" | "stop" | "restart";

export interface ServiceStatus {
  id: ServiceId;
  label: string;
  running: boolean;
  detail: string | null;
  canControl: boolean;
}

export interface ServiceDef {
  id: ServiceId;
  label: string;
  probe(): Promise<{ running: boolean; detail: string | null }>;
  start(): Promise<void>;
  stop(): Promise<void>;
}

export class ServiceInputError extends Error {}

export interface ControllerOptions {
  waitMs?: number;
  stopWaitMs?: number;
  pollMs?: number;
  canControl?: boolean;
}

const ACTIONS: readonly string[] = ["start", "stop", "restart"];

/**
 * Starts, stops and reports on a fixed list of services. Ids and actions are
 * checked against that list before anything runs, and a start or stop only
 * reports success once the service's own probe agrees.
 */
export function createServiceController(defs: ServiceDef[], options: ControllerOptions = {}) {
  const waitMs = options.waitMs ?? 60_000;
  const stopWaitMs = options.stopWaitMs ?? 15_000;
  const pollMs = options.pollMs ?? 1_000;
  const canControl = options.canControl ?? process.platform === "win32";

  async function statusOf(def: ServiceDef): Promise<ServiceStatus> {
    let probe: { running: boolean; detail: string | null };
    try {
      probe = await def.probe();
    } catch {
      probe = { running: false, detail: null };
    }
    return { id: def.id, label: def.label, running: probe.running, detail: probe.detail, canControl };
  }

  async function waitUntil(def: ServiceDef, running: boolean, timeoutMs: number): Promise<ServiceStatus> {
    const deadline = Date.now() + timeoutMs;
    let status = await statusOf(def);
    while (status.running !== running && Date.now() < deadline) {
      await new Promise((r) => setTimeout(r, pollMs));
      status = await statusOf(def);
    }
    return status;
  }

  async function start(def: ServiceDef): Promise<ServiceStatus> {
    const current = await statusOf(def);
    if (current.running) return current;
    await def.start();
    return waitUntil(def, true, waitMs);
  }

  async function stop(def: ServiceDef): Promise<ServiceStatus> {
    await def.stop();
    return waitUntil(def, false, stopWaitMs);
  }

  return {
    statuses: () => Promise.all(defs.map(statusOf)),

    async run(id: string, action: string): Promise<ServiceStatus> {
      const def = defs.find((d) => d.id === id);
      if (!def) throw new ServiceInputError(`Unknown service "${id}".`);
      if (!ACTIONS.includes(action)) throw new ServiceInputError(`Unknown action "${action}".`);
      if (!canControl) throw new Error("Starting and stopping services is only supported on Windows.");

      if (action === "start") return start(def);
      if (action === "stop") return stop(def);
      await stop(def);
      return start(def);
    },
  };
}

export type ServiceController = ReturnType<typeof createServiceController>;
