import http from "node:http";
import type { AddressInfo } from "node:net";
import { afterEach, describe, expect, it } from "vitest";
import { LayaHttpAdapter } from "./http-adapter";

async function listen(server: http.Server): Promise<string> {
  await new Promise<void>((resolve) => server.listen(0, resolve));
  const { port } = server.address() as AddressInfo;
  return `http://127.0.0.1:${port}`;
}

describe("LayaHttpAdapter", () => {
  let server: http.Server | undefined;

  afterEach(async () => {
    if (server) await new Promise((resolve) => server!.close(resolve));
    server = undefined;
  });

  it("reports mode 'laya' and returns a real decision + confidence", async () => {
    server = http.createServer((req, res) => {
      if (req.method === "POST" && req.url === "/classify") {
        res.writeHead(200, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ decision: "high", confidence: 0.92 }));
        return;
      }
      res.writeHead(404);
      res.end();
    });

    const adapter = new LayaHttpAdapter(await listen(server));
    const result = await adapter.classify({ state: "Deploy a hotfix now", question: "urgency", schema: ["low", "medium", "high"] });
    expect(result).toEqual({ decision: "high", confidence: 0.92 });
    expect(adapter.mode).toBe("laya");
  });

  it("degrades to decision 'unknown', confidence 0 — never throws — when the server errors", async () => {
    server = http.createServer((_req, res) => {
      res.writeHead(500);
      res.end();
    });

    const adapter = new LayaHttpAdapter(await listen(server));
    const result = await adapter.classify({ state: "x", question: "urgency", schema: ["low", "medium", "high"] });
    expect(result).toEqual({ decision: "unknown", confidence: 0 });
  });

  it("degrades the same way when there is no server at all (connection refused)", async () => {
    const adapter = new LayaHttpAdapter("http://127.0.0.1:1"); // nothing listens on port 1
    const result = await adapter.classify({ state: "x", question: "urgency", schema: ["low", "medium", "high"] });
    expect(result).toEqual({ decision: "unknown", confidence: 0 });
  });

  it("health() reports ok when reachable, degraded when not", async () => {
    server = http.createServer((req, res) => {
      if (req.url === "/health") {
        res.writeHead(200, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ status: "ok" }));
        return;
      }
      res.writeHead(404);
      res.end();
    });

    const reachable = new LayaHttpAdapter(await listen(server));
    expect((await reachable.health()).status).toBe("ok");

    const unreachable = new LayaHttpAdapter("http://127.0.0.1:1");
    expect((await unreachable.health()).status).toBe("degraded");
  });
});
