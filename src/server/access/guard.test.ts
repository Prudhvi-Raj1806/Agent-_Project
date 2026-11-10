import { describe, expect, it } from "vitest";
import { ACCESS_HEADER, requireAccess } from "./guard";

const req = (headers: Record<string, string> = {}) => new Request("http://localhost/api/x", { headers });

describe("requireAccess", () => {
  it("passes requests the proxy stamped as local or tailscale", () => {
    expect(requireAccess(req({ [ACCESS_HEADER]: "local" }))).toBeNull();
    expect(requireAccess(req({ [ACCESS_HEADER]: "tailscale" }))).toBeNull();
  });

  it("returns a 403 when the header is missing or has any other value", async () => {
    const cases: Record<string, string>[] = [{}, { [ACCESS_HEADER]: "yes" }, { [ACCESS_HEADER]: "" }];
    for (const headers of cases) {
      const res = requireAccess(req(headers));
      expect(res?.status).toBe(403);
    }
  });
});
