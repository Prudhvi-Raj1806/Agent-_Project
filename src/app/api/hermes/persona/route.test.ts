import { existsSync } from "node:fs";
import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { GET, PUT } from "./route";

const url = "http://localhost/api/hermes/persona";
const stamp = (via: string | null) => (via ? { "x-access-via": via } : undefined);
const get = (via: string | null = "local") => GET(new Request(url, { headers: stamp(via) }));
const put = (body: unknown, via: string | null = "local") =>
  PUT(
    new Request(url, {
      method: "PUT",
      headers: { "Content-Type": "application/json", ...stamp(via) },
      body: typeof body === "string" ? body : JSON.stringify(body),
    }),
  );

describe("/api/hermes/persona", () => {
  let dir: string;
  let soul: string;

  beforeEach(async () => {
    dir = await fs.mkdtemp(path.join(os.tmpdir(), "persona-route-"));
    soul = path.join(dir, "SOUL.md");
    await fs.writeFile(soul, "old");
    vi.stubEnv("HERMES_HOME", dir);
  });

  afterEach(async () => {
    vi.unstubAllEnvs();
    await fs.rm(dir, { recursive: true, force: true });
  });

  it("refuses a request the proxy did not stamp, and touches nothing", async () => {
    expect((await get(null)).status).toBe(403);
    expect((await put({ text: "You are Nova." }, null)).status).toBe(403);
    expect(await fs.readFile(soul, "utf-8")).toBe("old");
    expect(await fs.readdir(dir)).toEqual(["SOUL.md"]);
  });

  it("GET returns the file and the limit", async () => {
    const res = await get();
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ installed: true, exists: true, text: "old", limit: 4000 });
  });

  it("GET reports a missing file and a missing Hermes without failing", async () => {
    await fs.rm(soul);
    expect(await (await get()).json()).toEqual({ installed: true, exists: false, text: "", limit: 4000 });

    vi.stubEnv("HERMES_HOME", path.join(dir, "nope"));
    expect(await (await get()).json()).toEqual({ installed: false, exists: false, text: "", limit: 4000 });
  });

  it("PUT saves the text and backs the old file up", async () => {
    const res = await put({ text: "You are Nova.\r\nBe dry." });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.ok).toBe(true);
    expect(body.text).toBe("You are Nova.\nBe dry.");
    expect(await fs.readFile(soul, "utf-8")).toBe("You are Nova.\nBe dry.");
    expect(await fs.readFile(body.backupPath, "utf-8")).toBe("old");
  });

  it.each([
    ["a body that is not JSON", "not json"],
    ["a JSON array", "[1,2]"],
    ["no text", {}],
    ["text that is not a string", { text: 5 }],
    ["empty text", { text: "" }],
    ["text over the limit", { text: "a".repeat(4001) }],
  ])("PUT with %s is 400 and leaves the file alone", async (_label, body) => {
    const res = await put(body);
    expect(res.status).toBe(400);
    expect((await res.json()).error).toBeTruthy();
    expect(await fs.readFile(soul, "utf-8")).toBe("old");
    expect(await fs.readdir(dir)).toEqual(["SOUL.md"]);
  });

  it("PUT is 409 when Hermes is not installed, and does not create its folder", async () => {
    const missing = path.join(dir, "nope");
    vi.stubEnv("HERMES_HOME", missing);

    const res = await put({ text: "You are Nova." });

    expect(res.status).toBe(409);
    expect((await res.json()).error).toBe("Hermes isn't installed on this PC.");
    expect(existsSync(missing)).toBe(false);
  });

  it("the owner's phone may edit the personality", async () => {
    expect((await put({ text: "You are Nova." }, "tailscale")).status).toBe(200);
    expect(await fs.readFile(soul, "utf-8")).toBe("You are Nova.");
  });
});
