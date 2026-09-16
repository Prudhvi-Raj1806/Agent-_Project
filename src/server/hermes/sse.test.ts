import { describe, expect, it } from "vitest";
import { parseSseStream } from "./sse";

function streamFromChunks(chunks: string[]): ReadableStream<Uint8Array> {
  const encoder = new TextEncoder();
  let i = 0;
  return new ReadableStream({
    pull(controller) {
      if (i >= chunks.length) {
        controller.close();
        return;
      }
      controller.enqueue(encoder.encode(chunks[i++]));
    },
  });
}

async function collect(stream: ReadableStream<Uint8Array>): Promise<unknown[]> {
  const frames: unknown[] = [];
  for await (const frame of parseSseStream(stream)) frames.push(frame);
  return frames;
}

describe("parseSseStream", () => {
  it("parses single-line data frames", async () => {
    const frames = await collect(streamFromChunks([`data: {"a":1}\n\n`, `data: {"a":2}\n\n`]));
    expect(frames).toEqual([{ a: 1 }, { a: 2 }]);
  });

  it("handles a frame split across multiple chunks", async () => {
    const frames = await collect(streamFromChunks([`data: {"a"`, `:1}\n\n`]));
    expect(frames).toEqual([{ a: 1 }]);
  });

  it("joins multi-line data fields with newlines", async () => {
    const frames = await collect(streamFromChunks([`data: {"a":1,\ndata: "b":2}\n\n`]));
    expect(frames).toEqual([{ a: 1, b: 2 }]);
  });

  it("skips malformed frames instead of throwing", async () => {
    const frames = await collect(streamFromChunks([`data: not json\n\n`, `data: {"ok":true}\n\n`]));
    expect(frames).toEqual([{ ok: true }]);
  });

  it("normalizes CRLF line endings", async () => {
    const frames = await collect(streamFromChunks([`data: {"a":1}\r\n\r\n`]));
    expect(frames).toEqual([{ a: 1 }]);
  });

  it("ignores comment/keep-alive lines that carry no data field", async () => {
    const frames = await collect(streamFromChunks([`: keep-alive\n\n`, `data: {"a":1}\n\n`]));
    expect(frames).toEqual([{ a: 1 }]);
  });
});
