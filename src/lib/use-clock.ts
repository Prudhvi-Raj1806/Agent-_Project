import { useSyncExternalStore } from "react";

// Module-level cache: getSnapshot must return a stable value between ticks,
// not a fresh Date.now() on every call, or React re-renders in a loop.
let cachedMs = Date.now();

function subscribe(callback: () => void) {
  const id = setInterval(() => {
    cachedMs = Date.now();
    callback();
  }, 30_000);
  return () => clearInterval(id);
}

function getSnapshot() {
  return cachedMs;
}

function getServerSnapshot() {
  return null;
}

/** Client-only clock, ticking every 30s. Returns null during SSR/first paint to avoid hydration mismatches. */
export function useClock(): Date | null {
  const ms = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
  return ms === null ? null : new Date(ms);
}
