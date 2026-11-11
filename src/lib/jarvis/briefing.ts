import type { ScheduleItem, SystemStatus, WeatherStatus } from "@/lib/data/types";

export interface BriefingInput {
  now: Date;
  /** What the assistant calls its owner. */
  ownerName: string;
  system: SystemStatus;
  schedule: ScheduleItem[];
  weather: WeatherStatus | null;
}

function greetingFor(date: Date): string {
  const hour = date.getHours();
  return hour < 12 ? "Good morning" : hour < 18 ? "Good afternoon" : "Good evening";
}

/**
 * The line Jarvis speaks for "Brief me". Built only from numbers the app
 * actually has — a signal that is unavailable (null) is left out, never
 * spoken as zero.
 */
export function buildBriefing({ now, ownerName, system, schedule, weather }: BriefingInput): string {
  const parts: string[] = [`${greetingFor(now)}, ${ownerName}. Systems online.`];

  const percentOf = (kind: string) => system.metrics.find((m) => m.kind === kind)?.percent ?? null;
  const cpu = percentOf("cpu");
  const ram = percentOf("ram");
  const load: string[] = [];
  if (cpu !== null) load.push(`CPU at ${cpu} percent`);
  if (ram !== null) load.push(`memory at ${ram} percent`);
  if (load.length > 0) parts.push(`${load.join(", ")}.`);

  if (weather) {
    parts.push(`It is ${weather.temperatureC} degrees and ${weather.label.toLowerCase()} outside.`);
  }

  const next = schedule[0];
  parts.push(next ? `Next on your schedule: ${next.title} at ${next.time}.` : "Nothing is scheduled.");

  return parts.join(" ");
}
