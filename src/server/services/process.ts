import { execFile, spawn } from "node:child_process";
import net from "node:net";
import { promisify } from "node:util";

const run = promisify(execFile);

/** One argument as the Windows command line wants it: whole, with inner quotes escaped. */
function windowsArg(arg: string): string {
  return arg === "" || /[\s"]/.test(arg) ? `"${arg.replace(/"/g, '\\"')}"` : arg;
}

const psQuote = (value: string) => `'${value.replace(/'/g, "''")}'`;

/**
 * The command that starts `file` from a short-lived PowerShell instead of from this server.
 * `taskkill /T` (how the launcher stops the app) follows parent ids, so a service started
 * directly by the server dies with it; one started by a launcher that has already exited
 * has no parent left to follow and keeps running.
 */
export function detachedLaunch(file: string, args: string[]): { file: string; args: string[] } {
  const argumentList = args.length > 0 ? ` -ArgumentList ${psQuote(args.map(windowsArg).join(" "))}` : "";
  return {
    file: "powershell.exe",
    args: ["-NoProfile", "-NonInteractive", "-Command", `Start-Process -FilePath ${psQuote(file)}${argumentList} -WindowStyle Hidden`],
  };
}

/** Starts a program that keeps running after this server stops. Resolves once it has been handed off. Fixed file and arguments only. */
export function launchDetached(file: string, args: string[]): Promise<void> {
  const windows = process.platform === "win32";
  const launch = windows ? detachedLaunch(file, args) : { file, args };
  return new Promise((resolve, reject) => {
    // The PowerShell launcher is deliberately not `detached`: started without a console it never starts the program. It exits on its own.
    const child = spawn(launch.file, launch.args, { detached: !windows, stdio: "ignore", windowsHide: true });
    child.once("error", reject);
    child.once("spawn", () => {
      child.unref();
      resolve();
    });
  });
}

/** Fire and forget: a program that did not start shows up as "not running" in the next status check. */
export function spawnDetached(file: string, args: string[]): void {
  launchDetached(file, args).catch(() => {});
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

/** Kokoro's launcher and its Python process: recognised by the server script in this project's own folder. */
export function isKokoroServer(commandLine: string, serverDir: string): boolean {
  const normalise = (value: string) => value.toLowerCase().replace(/\//g, "\\");
  const line = normalise(commandLine);
  return line.includes(normalise(serverDir)) && line.includes("server.py");
}

/** True when something accepts a TCP connection on host:port within the timeout. */
export function tcpOpen(host: string, port: number, timeoutMs = 800): Promise<boolean> {
  return new Promise((resolve) => {
    const socket = net.connect({ host, port });
    const done = (ok: boolean) => {
      socket.destroy();
      resolve(ok);
    };
    socket.setTimeout(timeoutMs, () => done(false));
    socket.once("connect", () => done(true));
    socket.once("error", () => done(false));
  });
}
