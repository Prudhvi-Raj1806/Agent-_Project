import { listAllScheduleItems, listUpcomingScheduleItems } from "./service";
import { formatDayDate } from "@/lib/format";
import type { ScheduleItem as UiScheduleItem } from "@/lib/data/types";

function isSameDay(a: Date, b: Date): boolean {
  return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
}

function isToday(date: Date): boolean {
  return isSameDay(date, new Date());
}

export async function getUiSchedule(): Promise<UiScheduleItem[]> {
  const items = listUpcomingScheduleItems();
  return items.map((item) => {
    const date = new Date(item.startsAt);
    return {
      id: item.id,
      title: item.title,
      time: date.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" }),
      day: isToday(date) ? "today" : "tomorrow",
    };
  });
}

export interface CalendarScheduleItem {
  id: string;
  title: string;
  startsAt: string;
  time: string;
  dateLabel: string;
}

function dateLabelFor(date: Date): string {
  if (isToday(date)) return "Today";
  const tomorrow = new Date();
  tomorrow.setDate(tomorrow.getDate() + 1);
  if (isSameDay(date, tomorrow)) return "Tomorrow";
  return formatDayDate(date);
}

/** Backs the dedicated Calendar page — every upcoming event, not just today/tomorrow.
 * Past events are excluded rather than accumulating forever in the agenda. */
export async function getUiCalendarItems(): Promise<CalendarScheduleItem[]> {
  const startOfToday = new Date();
  startOfToday.setHours(0, 0, 0, 0);
  const items = listAllScheduleItems().filter(
    (item) => new Date(item.startsAt).getTime() >= startOfToday.getTime()
  );
  return items.map((item) => {
    const date = new Date(item.startsAt);
    return {
      id: item.id,
      title: item.title,
      startsAt: item.startsAt,
      time: date.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" }),
      dateLabel: dateLabelFor(date),
    };
  });
}
