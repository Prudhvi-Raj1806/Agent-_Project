import { beforeEach, describe, expect, it } from "vitest";
import { resetDbForTests } from "@/server/db/client";
import { GET, PUT } from "./route";

const url = "http://localhost/api/app-settings";
const get = () => GET(new Request(url));
const put = (body: unknown) =>
  PUT(
    new Request(url, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
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
