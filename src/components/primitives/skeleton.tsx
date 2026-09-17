import { cn } from "@/lib/utils";

/** A pulsing placeholder block, sized by the caller via className. Matches JARVIS's own surface tokens rather than shadcn's default. */
export function Skeleton({ className }: { className?: string }) {
  return <div className={cn("animate-pulse rounded-md bg-surface-2", className)} />;
}
