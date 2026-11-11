import { beforeEach, describe, expect, it, vi } from "vitest";

const warmBrain = vi.hoisted(() => vi.fn());
vi.mock("@/server/brain/status", () => ({ warmBrain }));

import { POST } from "./route";

const status = { enabled: true, model: "phi4-mini", ollamaRunning: true, modelLoaded: true };
const post = (via: string | null = "local") =>
  POST(new Request("http://localhost/api/brain/warm", { method: "POST", headers: via ? { "x-access-via": via } : {} }));

describe("POST /api/brain/warm", () => {
  beforeEach(() => {
    warmBrain.mockReset();
    warmBrain.mockResolvedValue(status);
  });

  it("refuses a request the proxy did not stamp, and warms nothing", async () => {
    expect((await post(null)).status).toBe(403);
    expect(warmBrain).not.toHaveBeenCalled();
  });

  it("warms the model and returns the status", async () => {
    const res = await post();
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual(status);
    expect(warmBrain).toHaveBeenCalledOnce();
  });

  it("answers 500 when the status can't be read", async () => {
    warmBrain.mockRejectedValue(new Error("boom"));
    expect((await post()).status).toBe(500);
  });
});
