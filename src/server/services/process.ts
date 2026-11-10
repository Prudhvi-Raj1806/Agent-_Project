import { execFile, spawn } from "node:child_process";
import { promisify } from "node:util";

const run = promisify(execFile);

/** Starts a program detached so it keeps running after this server stops. Fixed file and arguments only. */
export function spawnDetached(file: string, args: string[]): void {
  const child = spawn(file, args, { detached: true, stdio: "ignore", windowsHide: true });
  child.on("error", () => {});
  child.unref();
}

/** Running processes with this image name, with their command lines. Windows only. */
export async function findProcesses(imageName: string): Promise<{ pid: number; commandLine: string }[]> {
  if (!/^[\w. -]+$/.test(imageName)) throw new Error("Invalid image name.");
  const { stdout } = await run(
    "powershell.exe",
    [
      "-NoProfile",
      "-NonInteractive",
      "-Command",
      `Get-CimInstance Win32_Process -Filter "Name='${imageName}'" | ForEach-Object { "$($_.ProcessId)\`t$($_.CommandLine)" }`,
    ],
    { windowsHide: true, timeout: 15_000 },
  );
  return stdout
    .split(/\r?\n/)
    .map((line) => line.split("\t"))
    .filter(([pid]) => /^\d+$/.test(pid ?? ""))
    .map(([pid, commandLine]) => ({ pid: Number(pid), commandLine: commandLine ?? "" }));
}

/** Ends processes by pid (and their children when `tree`). Anything but a positive integer is refused. */
export async function killPids(pids: number[], tree = false): Promise<void> {
  for (const pid of pids) {
    if (!Number.isInteger(pid) || pid <= 0) throw new Error(`Invalid pid: ${pid}`);
  }
  for (const pid of pids) {
    try {
      await run("taskkill", ["/PID", String(pid), "/F", ...(tree ? ["/T"] : [])], { windowsHide: true, timeout: 15_000 });
    } catch {
      // Already gone, or access denied; the status check afterwards tells the truth.
    }
  }
}

/** The Electron main process has no `--type=` flag; its renderer, gpu and utility helpers all do. */
export function isVoiceStudioMain(commandLine: string): boolean {
  return commandLine.trim() !== "" && !/--type=/.test(commandLine);
}
