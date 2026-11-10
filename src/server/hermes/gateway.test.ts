import { describe, expect, it } from "vitest";
import { isGatewayCommandLine } from "./gateway";

describe("isGatewayCommandLine", () => {
  it("matches the Hermes gateway process, quoted or not", () => {
    expect(isGatewayCommandLine('"C:\\Users\\x\\AppData\\Local\\hermes\\bin\\hermes.exe"  gateway run')).toBe(true);
    expect(isGatewayCommandLine("C:\\hermes\\bin\\hermes.exe gateway run")).toBe(true);
  });

  it("does not match other Hermes commands or unrelated processes", () => {
    expect(isGatewayCommandLine("hermes.exe chat")).toBe(false);
    expect(isGatewayCommandLine("hermes.exe serve")).toBe(false);
    expect(isGatewayCommandLine("node server.js gateway run")).toBe(false);
    expect(isGatewayCommandLine("")).toBe(false);
  });
});
