"use client";

import { useState } from "react";
import { ArrowRight, Plus, X, Zap } from "lucide-react";
import { Panel, PanelBody, PanelHeader } from "@/components/primitives/panel";
import type { ScheduleItem } from "@/lib/data/types";

export function TodayPanel({ items: initialItems, className }: { items: ScheduleItem[]; className?: string }) {
  const [items, setItems] = useState(initialItems);
  const [adding, setAdding] = useState(false);
  const [draft, setDraft] = useState("");

  const grouped = {
    today: items.filter((i) => i.day === "today"),
    tomorrow: items.filter((i) => i.day === "tomorrow"),
  };

  async function addEvent() {
    const title = draft.trim();
    if (!title) {
      setAdding(false);
      return;
    }
    setDraft("");
    setAdding(false);
    // Defaults to an hour from now today — a quick-add, not a full scheduler.
    const startsAt = new Date(Date.now() + 60 * 60_000).toISOString();
    try {
      const res = await fetch("/api/schedule", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title, startsAt }),
      });
      if (!res.ok) return;
      const data = await res.json();
      const date = new Date(data.item.startsAt);
      setItems((prev) => [
        ...prev,
        {
          id: data.item.id,
          title: data.item.title,
          time: date.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" }),
          day: "today",
        },
      ]);
    } catch {
      // Silent — the event simply won't appear; no local state to roll back.
    }
  }

  return (
    <Panel className={className}>
      <PanelHeader
        icon={
          <span className="flex size-4 shrink-0 items-center justify-center rounded-full bg-accent-violet text-background">
            <Zap className="size-2.5" strokeWidth={2.5} fill="currentColor" />
          </span>
        }
        title="Today"
        action={
          <button
            type="button"
            className="flex items-center gap-1 text-xs font-medium text-muted-foreground transition-colors hover:text-foreground"
          >
            View calendar
            <ArrowRight className="size-3" />
          </button>
        }
      />
      <PanelBody className="flex flex-col pt-2.5">
        <div className="no-scrollbar min-h-0 flex-1 overflow-y-auto">
          <ScheduleGroup label="Today" items={grouped.today} />
          {grouped.tomorrow.length > 0 && (
            <ScheduleGroup label="Tomorrow" items={grouped.tomorrow} className="mt-3.5" />
          )}
        </div>
        {adding ? (
          <div className="mt-2.5 flex shrink-0 items-center gap-1.5">
            <input
              autoFocus
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") addEvent();
                if (e.key === "Escape") {
                  setAdding(false);
                  setDraft("");
                }
              }}
              onBlur={addEvent}
              placeholder="New event title…"
              className="min-w-0 flex-1 rounded-md border border-border bg-surface-2 px-2 py-1.5 text-sm text-foreground placeholder:text-muted-foreground focus:border-accent-cyan/40 focus:outline-none"
            />
            <button
              type="button"
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => {
                setAdding(false);
                setDraft("");
              }}
              className="flex size-6 shrink-0 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-surface-2 hover:text-foreground"
            >
              <X className="size-3.5" />
            </button>
          </div>
        ) : (
          <button
            type="button"
            onClick={() => setAdding(true)}
            className="mt-2.5 flex w-full shrink-0 items-center justify-center gap-1.5 rounded-md border border-dashed border-border py-1.5 text-xs font-medium text-muted-foreground transition-colors hover:border-border-strong hover:text-foreground"
          >
            <Plus className="size-3.5" />
            Add event
          </button>
        )}
      </PanelBody>
    </Panel>
  );
}

function ScheduleGroup({
  label,
  items,
  className,
}: {
  label: string;
  items: ScheduleItem[];
  className?: string;
}) {
  if (items.length === 0) return null;
  return (
    <div className={className}>
      <p className="text-[11px] font-medium tracking-wide text-text-dim uppercase">{label}</p>
      <ul className="mt-1.5 space-y-2.5">
        {items.map((item) => (
          <li key={item.id} className="flex items-baseline gap-3">
            <span className="w-16 shrink-0 font-mono text-xs text-muted-foreground tabular-nums">
              {item.time}
            </span>
            <span className="text-sm text-foreground">{item.title}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}
