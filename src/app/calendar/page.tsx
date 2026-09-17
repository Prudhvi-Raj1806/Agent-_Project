import { CalendarClock } from "lucide-react";
import { AddEventForm } from "@/components/calendar/add-event-form";
import { DeleteEventButton } from "@/components/calendar/delete-event-button";
import { EmptyState } from "@/components/primitives/empty-state";
import { getUiCalendarItems, type CalendarScheduleItem } from "@/server/schedule/view";

// The schedule table changes constantly (adds/deletes) — read fresh per request.
export const dynamic = "force-dynamic";

function groupByDateLabel(items: CalendarScheduleItem[]): { label: string; items: CalendarScheduleItem[] }[] {
  const groups: { label: string; items: CalendarScheduleItem[] }[] = [];
  for (const item of items) {
    const group = groups.find((g) => g.label === item.dateLabel);
    if (group) group.items.push(item);
    else groups.push({ label: item.dateLabel, items: [item] });
  }
  return groups;
}

export default async function CalendarPage() {
  const items = await getUiCalendarItems();
  const groups = groupByDateLabel(items);

  return (
    <div className="mx-auto flex h-full max-w-7xl flex-col gap-4 px-8 py-4">
      <div className="flex shrink-0 items-start justify-between gap-6 pt-1 pb-1">
        <div>
          <p className="text-xs font-medium tracking-wide text-text-dim uppercase">Calendar</p>
          <h1 className="mt-1 text-3xl font-semibold tracking-tight text-foreground">Your schedule, Raj.</h1>
          <p className="mt-1.5 text-sm text-muted-foreground">Everything ahead, in one list.</p>
        </div>
        <AddEventForm />
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto rounded-lg border border-border bg-surface-1 p-6">
        {groups.length === 0 ? (
          <EmptyState icon={CalendarClock} title="Nothing scheduled" description="Add your first event to get started." />
        ) : (
          groups.map((group) => (
            <div key={group.label} className="mb-6 last:mb-0">
              <p className="text-xs font-medium tracking-wide text-text-dim uppercase">{group.label}</p>
              <ul className="mt-2 divide-y divide-border">
                {group.items.map((item) => (
                  <li key={item.id} className="group flex items-center gap-3 py-2.5">
                    <span className="w-16 shrink-0 font-mono text-xs text-muted-foreground tabular-nums">{item.time}</span>
                    <span className="flex-1 truncate text-sm text-foreground">{item.title}</span>
                    <DeleteEventButton id={item.id} title={item.title} />
                  </li>
                ))}
              </ul>
            </div>
          ))
        )}
      </div>
    </div>
  );
}
