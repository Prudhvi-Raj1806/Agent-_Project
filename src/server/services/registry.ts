import { execFile } from "node:child_process";
import path from "node:path";
import { promisify } from "node:util";
import { getHermesAdapter } from "@/server/hermes/factory";
import { startHermesGateway, stopHermesGateway } from "@/server/hermes/gateway";
import type { ServiceDef } from "./controller";
import { kokoroBaseUrl } from "@/server/voice/tts";
import { findProcesses, isKokoroServer, isVoiceStudioMain, killPids, spawnDetached, tcpOpen } from "./process";

const run = promisify(execFile);

async function getJson(url: string, timeoutMs = 1_500): Promise<unknown | null> {
  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(timeoutMs) });
    return res.ok ? await res.json() : null;
  } catch {
    return null;
  }
}

const hermes: ServiceDef = {
  id: "hermes",
  label: "Hermes Agent",
  async probe() {
    const adapter = getHermesAdapter();
    if (adapter.mode !== "real") return { running: false, detail: "Not configured (simulated mode)" };
    const health = await adapter.checkHealth();
    return {
      running: health.healthy,
      detail: health.healthy ? [health.version && `v${health.version}`, `${health.latencyMs} ms`].filter(Boolean).join(" · ") : null,
    };
  },
  start: startHermesGateway,
  async stop() {
    await stopHermesGateway();
  },
};

/** The Kokoro server lives in this project, so its folder is fixed and never comes from a request. */
function kokoroDir(): string {
  return path.join(process.cwd(), "services", "kokoro");
}

const kokoro: ServiceDef = {
  id: "kokoro",
  label: "Kokoro voice",
  async probe() {
    if (!kokoroBaseUrl()) return { running: false, detail: "Switched off (KOKORO_URL=off)" };
    const health = (await getJson(`${kokoroBaseUrl()}/health`)) as { model?: string } | null;
    return health ? { running: true, detail: `${health.model ?? "Kokoro-82M"} · local` } : { running: false, detail: null };
  },
  async start() {
    const dir = kokoroDir();
    spawnDetached(process.env.UV_PATH?.trim() || "uv", ["run", "--project", dir, "python", path.join(dir, "server.py")]);
  },
  async stop() {
    const dir = kokoroDir();
    const mine = [];
    for (const image of ["python.exe", "uv.exe"]) {
      mine.push(...(await findProcesses(image)).filter((p) => isKokoroServer(p.commandLine, dir)));
    }
    await killPids(mine.map((p) => p.pid), true);
  },
};

function voiceStudioBase(): string | null {
  const configured = process.env.VOICESTUDIO_URL?.trim();
  if (configured?.toLowerCase() === "off") return null;
  return (configured || "http://localhost:3900").replace(/\/+$/, "");
}

const voicestudio: ServiceDef = {
  id: "voicestudio",
  label: "Voice Studio",
  async probe() {
    const base = voiceStudioBase();
    if (!base) return { running: false, detail: "Switched off (VOICESTUDIO_URL=off)" };
    const health = (await getJson(`${base}/health`)) as { version?: string; device?: string } | null;
    if (!health) return { running: false, detail: null };
    return { running: true, detail: [health.version && `v${health.version}`, health.device].filter(Boolean).join(" · ") || null };
  },
  async start() {
    const exe = process.env.VOICESTUDIO_EXE || "C:\\Program Files\\VoiceStudio\\VoiceStudio.exe";
    // Launched through Explorer so the app runs as the signed-in user's own process, outside any host app's sandbox.
    spawnDetached("explorer.exe", [exe]);
  },
  async stop() {
    const main = (await findProcesses("VoiceStudio.exe")).filter((p) => isVoiceStudioMain(p.commandLine));
    await killPids(main.map((p) => p.pid), true);
  },
};

function omnirouteCmd(): string {
  return path.join(process.env.APPDATA ?? "", "npm", "omniroute.cmd");
}

const omniroute: ServiceDef = {
  id: "omniroute",
  label: "OmniRoute",
  async probe() {
    return { running: await tcpOpen("127.0.0.1", 20128), detail: null };
  },
  async start() {
    spawnDetached("cmd.exe", ["/c", omnirouteCmd(), "serve"]);
  },
  async stop() {
    await run("cmd.exe", ["/c", omnirouteCmd(), "stop"], { windowsHide: true, timeout: 15_000 }).catch(() => undefined);
  },
};

const ollama: ServiceDef = {
  id: "ollama",
  label: "Ollama",
  async probe() {
    const tags = await getJson("http://127.0.0.1:11434/api/tags");
    if (!tags) return { running: false, detail: null };
    const ps = (await getJson("http://127.0.0.1:11434/api/ps")) as { models?: { name: string }[] } | null;
    const loaded = (ps?.models ?? []).map((m) => m.name);
    return { running: true, detail: loaded.length ? `Loaded: ${loaded.join(", ")}` : "No model loaded" };
  },
  async start() {
    spawnDetached("ollama", ["serve"]);
  },
  async stop() {
    for (const image of ["ollama.exe", "ollama app.exe"]) {
      await killPids((await findProcesses(image)).map((p) => p.pid), true);
    }
  },
};

export function getServiceDefs(): ServiceDef[] {
  return [hermes, kokoro, voicestudio, omniroute, ollama];
}
