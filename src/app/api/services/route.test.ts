import { afterEach, describe, expect, it } from "vitest";
import { createServiceController } from "@/server/services/controller";
import { resetServiceControllerForTests, setServiceControllerForTests } from "@/server/services";
import { GET } from "./route";
import { POST } from "./[id]/[action]/route";

const stamped = { "x-access-via": "local" };
const ctx = (id: string, action: string) => ({ params: Promise.resolve({ id, action }) }) as never;

function install() {
  const calls: string[] = [];
  setServiceControllerForTests(
    createServiceController(
      [
        {
          id: "hermes",
          label: "Hermes",
          probe: async () => ({ running: calls.includes("start"), detail: null }),
          start: async () => void calls.push("start"),
          stop: async () => void calls.push("stop"),
        },
      ],
      { waitMs: 100, stopWaitMs: 100, pollMs: 5, canControl: true },
    ),
  );
  return calls;
}

describe("/api/services", () => {
  afterEach(() => resetServiceControllerForTests());

  it("GET without the access header is 403", async () => {
    install();
    expect((await GET(new Request("http://localhost/api/services"))).status).toBe(403);
  });

  it("GET with the header lists the services", async () => {
    install();
    const res = await GET(new Request("http://localhost/api/services", { headers: stamped }));
    expect(res.status).toBe(200);
    expect(Array.isArray(await res.json())).toBe(true);
  });

  it("POST without the access header is 403 and runs nothing", async () => {
    const calls = install();
    const res = await POST(new Request("http://localhost/x", { method: "POST" }), ctx("hermes", "start"));
    expect(res.status).toBe(403);
    expect(calls).toEqual([]);
  });

  it("POST with an unknown service is 400 and runs nothing", async () => {
    const calls = install();
    const res = await POST(new Request("http://localhost/x", { method: "POST", headers: stamped }), ctx("nope", "start"));
    expect(res.status).toBe(400);
    expect(calls).toEqual([]);
  });

  it("POST with an unknown action is 400 and runs nothing", async () => {
    const calls = install();
    const res = await POST(new Request("http://localhost/x", { method: "POST", headers: stamped }), ctx("hermes", "explode"));
    expect(res.status).toBe(400);
    expect(calls).toEqual([]);
  });

  it("POST start runs the service and returns its status", async () => {
    install();
    const res = await POST(new Request("http://localhost/x", { method: "POST", headers: stamped }), ctx("hermes", "start"));
    expect(res.status).toBe(200);
    expect((await res.json()).running).toBe(true);
  });
});
