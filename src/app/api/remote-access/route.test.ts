import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { resetDbForTests } from "@/server/db/client";
import { createRemoteAccess } from "@/server/access/remote-access";
import { resetRemoteAccessForTests, setRemoteAccessForTests } from "@/server/access";
import { GET, PUT } from "./route";
import { POST } from "./serve/route";

const stamped = { "x-access-via": "local" };
const url = "http://localhost:3000/api/remote-access";

function install() {
  const calls: string[][] = [];
  setRemoteAccessForTests(
    createRemoteAccess({
      runTailscale: async (args) => {
        calls.push(args);
        return { ok: true, output: args[0] === "status" ? JSON.stringify({ BackendState: "Running", Self: { DNSName: "pc.t.ts.net.", UserID: 1 }, User: { "1": { LoginName: "me@x.com" } } }) : "https://pc.t.ts.net/" };
      },
      checkLanExposure: async () => ({ exposed: false, address: null }),
    }),
  );
  return calls;
}

const put = (body: unknown, headers: Record<string, string> = stamped) =>
  PUT(new Request(url, { method: "PUT", headers: { "Content-Type": "application/json", ...headers }, body: JSON.stringify(body) }));
const post = (body: unknown, headers: Record<string, string> = stamped) =>
  POST(new Request(`${url}/serve`, { method: "POST", headers: { "Content-Type": "application/json", ...headers }, body: JSON.stringify(body) }));

describe("/api/remote-access", () => {
  beforeEach(() => resetDbForTests(":memory:"));
  afterEach(() => resetRemoteAccessForTests());

  it("GET without the access header is 403", async () => {
    install();
    expect((await GET(new Request(url))).status).toBe(403);
  });

  it("GET returns the state", async () => {
    install();
    const res = await GET(new Request(url, { headers: stamped }));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.enabled).toBe(false);
    expect(body.tailscale.loginName).toBe("me@x.com");
    expect(Array.isArray(body.recent)).toBe(true);
  });

  it("PUT without the header is 403", async () => {
    install();
    expect((await put({ enabled: true }, {})).status).toBe(403);
  });

  it("PUT stores a valid change and returns the new state", async () => {
    install();
    const res = await put({ enabled: true, allowedLogins: ["me@x.com"] });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.enabled).toBe(true);
    expect(body.allowedLogins).toEqual(["me@x.com"]);
  });

  it("PUT with an invalid value is 400", async () => {
    install();
    expect((await put({ enabled: "yes" })).status).toBe(400);
  });

  it("POST serve with an unknown action is 400 and runs nothing", async () => {
    const calls = install();
    expect((await post({ action: "format-disk" })).status).toBe(400);
    expect(calls).toEqual([]);
  });

  it("POST serve without the header is 403", async () => {
    install();
    expect((await post({ action: "enable" }, {})).status).toBe(403);
  });

  it("POST serve enable returns the URL", async () => {
    install();
    const res = await post({ action: "enable" });
    expect(res.status).toBe(200);
    expect((await res.json()).url).toBe("https://pc.t.ts.net/");
  });
});
