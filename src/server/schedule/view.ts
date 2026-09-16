import { listUpcomingScheduleItems } from "./service";
import type { ScheduleItem as UiScheduleItem } from "@/lib/data/types";

function isToday(date: Date): boolean {
  const now = new Date();
  return (
    date.getFullYear() === now.getFullYear() &&
    date.getMonth() === now.getMonth() &&
    date.getDate() === now.getDate()
  );
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
