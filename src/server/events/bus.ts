import { EventEmitter } from "node:events";
import type { JarvisEvent } from "./types";

/**
 * In-process realtime fan-out. Deliberately simple (Step 6 asks for an
 * abstraction that can evolve later, not a distributed event bus yet) — one
 * Node EventEmitter, one channel. Good enough for a single-process `next
 * dev`/`next start` server backing SSE subscribers.
 */
const CHANNEL = "jarvis-event";

class EventBus extends EventEmitter {}

const bus = new EventBus();
bus.setMaxListeners(200);

export function publish(event: JarvisEvent): void {
  bus.emit(CHANNEL, event);
}

/** Returns an unsubscribe function. */
export function subscribe(listener: (event: JarvisEvent) => void): () => void {
  bus.on(CHANNEL, listener);
  return () => bus.off(CHANNEL, listener);
}
