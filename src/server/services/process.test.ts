import { describe, expect, it } from "vitest";
import { detachedLaunch, isKokoroServer, isVoiceStudioMain, killPids } from "./process";

describe("detachedLaunch", () => {
  // taskkill /T follows parent ids, so a service must be started by a launcher that exits, not by this server.
  it("starts the program through a PowerShell launcher that hides the window and exits", () => {
    const { file, args } = detachedLaunch("ollama", ["serve"]);
    expect(file).toBe("powershell.exe");
    expect(args.slice(0, 3)).toEqual(["-NoProfile", "-NonInteractive", "-Command"]);
    expect(args[3]).toBe("Start-Process -FilePath 'ollama' -ArgumentList 'serve' -WindowStyle Hidden");
  });

  it("quotes arguments that contain spaces so the program receives them whole", () => {
    const { args } = detachedLaunch("uv", ["run", "--project", "C:\\Agent - Project\\services\\kokoro", "python"]);
    expect(args[3]).toBe(
      `Start-Process -FilePath 'uv' -ArgumentList 'run --project "C:\\Agent - Project\\services\\kokoro" python' -WindowStyle Hidden`,
    );
  });

  it("doubles single quotes so a path cannot end the PowerShell string early", () => {
    const { args } = detachedLaunch("C:\\Users\\O'Neil\\bin\\hermes.exe", ["gateway", "run"]);
    expect(args[3]).toBe("Start-Process -FilePath 'C:\\Users\\O''Neil\\bin\\hermes.exe' -ArgumentList 'gateway run' -WindowStyle Hidden");
  });

  it("omits -ArgumentList when there are no arguments", () => {
    expect(detachedLaunch("notepad.exe", []).args[3]).toBe("Start-Process -FilePath 'notepad.exe' -WindowStyle Hidden");
  });
});

describe("isKokoroServer", () => {
  const dir = "C:\\Users\\Prudh\\Desktop\\Agent - Project\\services\\kokoro";

  it("matches the launcher and the venv python running this project's server script", () => {
    expect(isKokoroServer(`uv run --project "${dir}" python "${dir}\\server.py"`, dir)).toBe(true);
    expect(isKokoroServer(`"${dir}\\.venv\\Scripts\\python.exe" "${dir}\\server.py"`, dir)).toBe(true);
  });

  it("ignores slash style and letter case", () => {
    expect(isKokoroServer(`${dir.replace(/\\/g, "/").toUpperCase()}/SERVER.PY`, dir)).toBe(true);
  });

  it("never matches another python process, or another project's server.py", () => {
    expect(isKokoroServer('"C:\\Python312\\python.exe" -m http.server', dir)).toBe(false);
    expect(isKokoroServer('"C:\\other\\project\\.venv\\Scripts\\python.exe" "C:\\other\\project\\server.py"', dir)).toBe(false);
    expect(isKokoroServer(`"${dir}\\.venv\\Scripts\\python.exe" -m pip list`, dir)).toBe(false);
    expect(isKokoroServer("", dir)).toBe(false);
  });
});

describe("isVoiceStudioMain", () => {
  it("is true for the bare executable line (the Electron main process)", () => {
    expect(isVoiceStudioMain('"C:\\Program Files\\VoiceStudio\\VoiceStudio.exe"')).toBe(true);
  });

  it("is false for its renderer, gpu and utility helper processes", () => {
    expect(isVoiceStudioMain('"C:\\Program Files\\VoiceStudio\\VoiceStudio.exe" --type=renderer --lang=en-US')).toBe(false);
    expect(isVoiceStudioMain('"C:\\Program Files\\VoiceStudio\\VoiceStudio.exe" --type=gpu-process')).toBe(false);
  });

  it("is false for an empty command line", () => {
    expect(isVoiceStudioMain("")).toBe(false);
  });
});

describe("killPids", () => {
  it("does nothing for an empty list", async () => {
    await expect(killPids([])).resolves.toBeUndefined();
  });

  it("rejects pids that aren't positive integers", async () => {
    await expect(killPids([-1])).rejects.toThrow(/invalid pid/i);
    await expect(killPids([1.5])).rejects.toThrow(/invalid pid/i);
  });
});
