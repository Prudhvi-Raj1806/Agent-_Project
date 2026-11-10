import { execFile, spawn } from "node:child_process";
import path from "node:path";
import { promisify } from "node:util";
import { hermesHome } from "./config";
import { getHermesAdapter } from "./factory";
import type { HermesHealth } from "./types";

const run = promisify(execFile);

/** True for the `hermes gateway run` process only — never another Hermes command or an unrelated program. */
export function isGatewayCommandLine(commandLine: string): boolean {
  return /(^|[\\/"\s])hermes(\.exe)?"?\s+gateway\s+run\b/i.test(commandLine);
}

function hermesBinary(): string {
  return process.env.HERMES_BIN || path.join(hermesHome(), "bin", "hermes.exe");
}

async function stopGateway(): Promise<number> {
  const { stdout } = await run(
    "powershell.exe",
    [
      "-NoProfile",
      "-NonInteractive",
      "-Command",
      "Get-CimInstance Win32_Process -Filter \"Name='hermes.exe'\" | ForEach-Object { \"$($_.ProcessId)`t$($_.CommandLine)\" }",
    ],
    { windowsHide: true, timeout: 15_000 },
  );
  const pids = stdout
    .split(/\r?\n/)
    .map((line) => line.split("\t"))
    .filter(([pid, cmd]) => /^\d+$/.test(pid ?? "") && isGatewayCommandLine(cmd ?? ""))
    .map(([pid]) => Number(pid));
  for (const pid of pids) {
    try {
      process.kill(pid);
    } catch {
      // Already gone.
    }
  }
  return pids.length;
}

async function waitForHealthy(timeoutMs: number): Promise<HermesHealth> {
  const adapter = getHermesAdapter();
  const deadline = Date.now() + timeoutMs;
  let last: HermesHealth = { healthy: false, latencyMs: 0 };
  while (Date.now() < deadline) {
    last = await adapter.checkHealth();
    if (last.healthy) return last;
    await new Promise((r) => setTimeout(r, 1_500));
  }
  return last;
}

/**
 * Stops any running Hermes gateway and starts a fresh one, detached so it
 * outlives this server, then waits for it to report healthy. Windows only —
 * that's where Hermes is installed here.
 */
export async function restartHermesGateway(): Promise<HermesHealth> {
  if (process.platform !== "win32") throw new Error("Restarting Hermes from the dashboard is only supported on Windows.");
  await stopGateway();
  await new Promise((r) => setTimeout(r, 1_500));
  const child = spawn(hermesBinary(), ["gateway", "run"], { detached: true, stdio: "ignore", windowsHide: true });
  child.on("error", () => {});
  child.unref();
  return waitForHealthy(60_000);
}
