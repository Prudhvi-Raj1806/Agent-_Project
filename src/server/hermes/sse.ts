/**
 * Minimal Server-Sent Events frame reader: yields the JSON-parsed payload
 * of each `data:` field from a streaming response body. Multi-line `data:`
 * fields are joined with `\n` per the SSE spec. Malformed frames are
 * skipped rather than killing the whole stream — a single bad frame
 * shouldn't take down an otherwise-healthy mission.
 */
export async function* parseSseStream(body: ReadableStream<Uint8Array>): AsyncGenerator<unknown> {
  const reader = body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";

  try {
    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true }).replace(/\r\n/g, "\n");

      let boundary: number;
      while ((boundary = buffer.indexOf("\n\n")) !== -1) {
        const rawEvent = buffer.slice(0, boundary);
        buffer = buffer.slice(boundary + 2);

        const dataLines = rawEvent
          .split("\n")
          .filter((line) => line.startsWith("data:"))
          .map((line) => line.slice(5).trimStart());
        if (dataLines.length === 0) continue;

        const payload = dataLines.join("\n");
        if (!payload) continue;
        try {
          yield JSON.parse(payload);
        } catch {
          // Skip malformed frame.
        }
      }
    }
  } finally {
    reader.releaseLock();
  }
}
