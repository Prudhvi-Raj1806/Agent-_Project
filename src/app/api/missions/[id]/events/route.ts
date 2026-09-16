import { listEventsForMission, subscribe, type JarvisEvent } from "@/server/events/service";

export const dynamic = "force-dynamic";

const KEEPALIVE_MS = 15_000;

/** Server-Sent Events stream of this mission's events, replaying history first. */
export async function GET(request: Request, ctx: RouteContext<"/api/missions/[id]/events">) {
  const { id } = await ctx.params;
  const encoder = new TextEncoder();
  let unsubscribe: () => void = () => {};
  let keepAlive: ReturnType<typeof setInterval> | undefined;

  const stream = new ReadableStream({
    start(controller) {
      const send = (event: JarvisEvent) => {
        controller.enqueue(encoder.encode(`event: ${event.type}\ndata: ${JSON.stringify(event)}\n\n`));
      };

      for (const event of listEventsForMission(id)) send(event);

      unsubscribe = subscribe((event) => {
        if (event.missionId === id) send(event);
      });

      keepAlive = setInterval(() => controller.enqueue(encoder.encode(`: keep-alive\n\n`)), KEEPALIVE_MS);

      request.signal.addEventListener("abort", () => {
        clearInterval(keepAlive);
        unsubscribe();
        controller.close();
      });
    },
    cancel() {
      clearInterval(keepAlive);
      unsubscribe();
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
    },
  });
}
