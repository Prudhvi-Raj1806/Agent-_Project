import { beforeEach, describe, expect, it } from "vitest";
import { resetDbForTests } from "@/server/db/client";
import { GET, PUT } from "./route";

const url = "http://localhost/api/app-settings";
const stamp = (via = "local") => ({ "x-access-via": via });
const get = (headers: Record<string, string> = stamp()) => GET(new Request(url, { headers }));
const put = (body: unknown, via: string | null = "local") =>
  PUT(
    new Request(url, {
      method: "PUT",
      headers: { "Content-Type": "application/json", ...(via ? stamp(via) : {}) },
      body: typeof body === "string" ? body : JSON.stringify(body),
    }),
  );

describe("/api/app-settings", () => {
  beforeEach(() => {
    resetDbForTests(":memory:");
  });

  it("GET returns the defaults", async () => {
    const res = await get();
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({
      "remote.enabled": false,
      "remote.allowedLogins": [],
      "remote.tailnetHost": "",
      "voice.provider": "auto",
      "voice.voicestudioVoice": "alloy",
      "voice.autoSendDictation": false,
      "voice.replyDevice": "this-device",
    });
  });

  it("PUT applies a valid partial and returns the full object", async () => {
    const res = await put({ "remote.enabled": true });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body["remote.enabled"]).toBe(true);
    expect(body["remote.allowedLogins"]).toEqual([]);
  });

  it("PUT with an invalid value returns 400 and changes nothing", async () => {
    const res = await put({ "remote.enabled": true, "remote.allowedLogins": "nope" });
    expect(res.status).toBe(400);
    expect((await res.json()).error).toBeTruthy();
    expect((await (await get()).json())["remote.enabled"]).toBe(false);
  });

  it("PUT with an unknown key returns 400", async () => {
    expect((await put({ surprise: 1 })).status).toBe(400);
  });

  it("PUT with a non-JSON body returns 400", async () => {
    expect((await put("not json")).status).toBe(400);
  });

  it("PUT with a non-object body returns 400", async () => {
    expect((await put("[1,2]")).status).toBe(400);
  });
});

describe("/api/app-settings access", () => {
  beforeEach(() => {
    resetDbForTests(":memory:");
  });

  it("GET without the access header is 403", async () => {
    expect((await get({})).status).toBe(403);
  });

  it("PUT without the access header is 403 and stores nothing", async () => {
    expect((await put({ "remote.enabled": true }, null)).status).toBe(403);
    expect((await (await get()).json())["remote.enabled"]).toBe(false);
  });

  it("a phone can read settings but cannot change remote-access keys", async () => {
    expect((await get(stamp("tailscale"))).status).toBe(200);
    expect((await put({ "remote.enabled": true }, "tailscale")).status).toBe(403);
    expect((await put({ "remote.allowedLogins": ["x@y.com"] }, "tailscale")).status).toBe(403);
    expect((await put({ "remote.tailnetHost": "a.b.ts.net" }, "tailscale")).status).toBe(403);
    expect((await (await get()).json())["remote.enabled"]).toBe(false);
  });

  it("the owner at the PC can change remote-access keys", async () => {
    expect((await put({ "remote.enabled": true }, "local")).status).toBe(200);
  });
});
