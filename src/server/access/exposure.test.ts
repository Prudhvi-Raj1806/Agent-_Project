import { describe, expect, it } from "vitest";
import { checkLanExposure } from "./exposure";

describe("checkLanExposure", () => {
  it("reports exposed when the server answers on a network address", async () => {
    const result = await checkLanExposure(3000, async () => true, () => ["192.168.0.5"]);
    expect(result).toEqual({ exposed: true, address: "192.168.0.5" });
  });

  it("reports not exposed when nothing answers", async () => {
    const result = await checkLanExposure(3000, async () => false, () => ["192.168.0.5"]);
    expect(result).toEqual({ exposed: false, address: "192.168.0.5" });
  });

  it("reports not exposed when the probe throws", async () => {
    const result = await checkLanExposure(3000, async () => { throw new Error("refused"); }, () => ["10.0.0.2"]);
    expect(result.exposed).toBe(false);
  });

  it("reports not exposed with no address when the machine has no network address", async () => {
    expect(await checkLanExposure(3000, async () => true, () => [])).toEqual({ exposed: false, address: null });
  });
});
