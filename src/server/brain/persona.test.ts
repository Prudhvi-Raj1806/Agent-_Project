import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { starterPersona } from "@/lib/persona";
import { resetDbForTests } from "@/server/db/client";
import { setSettings } from "@/server/settings/store";
import { PERSONA_SOUL_LIMIT, resolvePersona } from "./persona";

describe("the mini brain's persona", () => {
  let dir: string;
  const soul = () => path.join(dir, "SOUL.md");
  const starter = { text: starterPersona("Veda", "Raj"), source: "starter" };

  beforeEach(async () => {
    resetDbForTests(":memory:");
    dir = await fs.mkdtemp(path.join(os.tmpdir(), "brain-persona-"));
    vi.stubEnv("HERMES_HOME", dir);
  });

  afterEach(async () => {
    vi.unstubAllEnvs();
    await fs.rm(dir, { recursive: true, force: true });
  });

  it("is Hermes's personality when that is short enough to stay fast", async () => {
    expect(PERSONA_SOUL_LIMIT).toBe(1500);
    const text = "x".repeat(1500);
    await fs.writeFile(soul(), text);
    expect(await resolvePersona()).toEqual({ text, source: "soul" });
  });

  it("is the short starter when Hermes's personality is one character too long", async () => {
    await fs.writeFile(soul(), "x".repeat(1501));
    expect(await resolvePersona()).toEqual(starter);
  });

  it("is the starter when there is no personality file, or it is blank", async () => {
    expect(await resolvePersona()).toEqual(starter);
    await fs.writeFile(soul(), "  \n ");
    expect(await resolvePersona()).toEqual(starter);
  });

  it("is the starter when Hermes isn't installed", async () => {
    vi.stubEnv("HERMES_HOME", path.join(dir, "nope"));
    expect(await resolvePersona()).toEqual(starter);
  });

  it("builds the starter from the current names", async () => {
    setSettings({ "persona.name": "Nova", "persona.ownerName": "Prudhvi" });
    expect(await resolvePersona()).toEqual({ text: starterPersona("Nova", "Prudhvi"), source: "starter" });
  });
});
