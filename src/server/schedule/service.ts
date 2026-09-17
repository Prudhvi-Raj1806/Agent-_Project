import { newId, nowIso } from "@/server/db/util";
import { countScheduleItems, deleteScheduleItem, insertScheduleItem, listScheduleItems } from "./repository";
import type { CreateScheduleItemInput, ScheduleItem } from "./types";

export class ScheduleItemNotFoundError extends Error {
  constructor(id: string) {
    super(`Schedule item not found: ${id}`);
    this.name = "ScheduleItemNotFoundError";
  }
}

function atTime(daysFromNow: number, hour: number, minute: number): string {
  const d = new Date();
  d.setDate(d.getDate() + daysFromNow);
  d.setHours(hour, minute, 0, 0);
  return d.toISOString();
}

/** First-run seed, relative to whenever the app first starts — ordinary editable rows, not a fixture. */
function seedIfEmpty(): void {
  if (countScheduleItems() > 0) return;
  const seed: CreateScheduleItemInput[] = [
    { title: "Finish JARVIS UI designs", startsAt: atTime(0, 10, 0) },
    { title: "Gym", startsAt: atTime(0, 11, 30) },
    { title: "Team sync (Hackathon)", startsAt: atTime(0, 14, 0) },
    { title: "Read / Research", startsAt: atTime(0, 19, 0) },
    { title: "College", startsAt: atTime(1, 9, 0) },
  ];
  for (const item of seed) createScheduleItem(item);
}

export function createScheduleItem(input: CreateScheduleItemInput): ScheduleItem {
  const now = nowIso();
  const item: ScheduleItem = {
    id: newId("sched"),
    title: input.title.trim(),
    startsAt: input.startsAt,
    createdAt: now,
    updatedAt: now,
  };
  insertScheduleItem(item);
  return item;
}

/** Everything from the start of today through the end of tomorrow — matches the Today/Tomorrow UI grouping. */
export function listUpcomingScheduleItems(): ScheduleItem[] {
  seedIfEmpty();
  const startOfToday = new Date();
  startOfToday.setHours(0, 0, 0, 0);
  const endOfTomorrow = new Date(startOfToday);
  endOfTomorrow.setDate(endOfTomorrow.getDate() + 2);

  return listScheduleItems().filter((item) => {
    const t = new Date(item.startsAt).getTime();
    return t >= startOfToday.getTime() && t < endOfTomorrow.getTime();
  });
}

export function removeScheduleItem(id: string): void {
  deleteScheduleItem(id);
}

/** Everything, past and future — backs the dedicated Calendar page's full agenda. */
export function listAllScheduleItems(): ScheduleItem[] {
  seedIfEmpty();
  return listScheduleItems();
}
