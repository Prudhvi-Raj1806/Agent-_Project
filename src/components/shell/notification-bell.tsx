"use client";

import { useEffect, useState } from "react";
import { Bell, CheckCircle2, ShieldAlert, XCircle } from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { formatRelativeTime } from "@/lib/format";
import { cn } from "@/lib/utils";

interface Notification {
  id: string;
  message: string;
  timestamp: string;
  tone: "success" | "error" | "warning";
}

const LAST_SEEN_KEY = "jarvis:notifications:lastSeen";
const POLL_MS = 15_000;

const toneIcon: Record<Notification["tone"], typeof CheckCircle2> = {
  success: CheckCircle2,
  error: XCircle,
  warning: ShieldAlert,
};
const toneClass: Record<Notification["tone"], string> = {
  success: "text-status-success",
  error: "text-status-error",
  warning: "text-status-warning",
};

function getLastSeen(): number {
  try {
    return Number(localStorage.getItem(LAST_SEEN_KEY) ?? 0);
  } catch {
    return 0;
  }
}

export function NotificationBell() {
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [lastSeen, setLastSeen] = useState(0);
  const [open, setOpen] = useState(false);

  useEffect(() => {
    setTimeout(() => setLastSeen(getLastSeen()), 0);
    const load = () => {
      fetch("/api/notifications")
        .then((res) => res.json())
        .then((data) => setNotifications(data.notifications ?? []))
        .catch(() => {});
    };
    const initial = setTimeout(load, 0);
    const interval = setInterval(load, POLL_MS);
    return () => {
      clearTimeout(initial);
      clearInterval(interval);
    };
  }, []);

  const unreadCount = notifications.filter((n) => new Date(n.timestamp).getTime() > lastSeen).length;

  function handleOpenChange(next: boolean) {
    setOpen(next);
    if (next) {
      const now = Date.now();
      try {
        localStorage.setItem(LAST_SEEN_KEY, String(now));
      } catch {
        // localStorage unavailable — unread count just won't persist across reloads.
      }
      setLastSeen(now);
    }
  }

  return (
    <DropdownMenu open={open} onOpenChange={handleOpenChange}>
      <DropdownMenuTrigger asChild>
        <button
          type="button"
          aria-label={unreadCount > 0 ? `Notifications, ${unreadCount} unread` : "Notifications"}
          className="relative flex size-8 shrink-0 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-surface-2 hover:text-foreground"
        >
          <Bell className="size-4" strokeWidth={1.75} />
          {unreadCount > 0 && (
            <span className="absolute top-1.5 right-1.5 size-1.5 rounded-full bg-status-error" />
          )}
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent className="w-72" align="end">
        <div className="px-2 py-1.5 text-xs font-medium text-foreground">Notifications</div>
        {notifications.length === 0 ? (
          <p className="px-2 py-3 text-center text-xs text-muted-foreground">Nothing yet.</p>
        ) : (
          <ul className="no-scrollbar max-h-72 space-y-0.5 overflow-y-auto">
            {notifications.map((n) => {
              const Icon = toneIcon[n.tone];
              return (
                <li key={n.id} className="flex items-start gap-2 rounded-md px-2 py-1.5 hover:bg-surface-2">
                  <Icon className={cn("mt-0.5 size-3.5 shrink-0", toneClass[n.tone])} />
                  <div className="min-w-0 flex-1">
                    <p className="text-xs text-foreground">{n.message}</p>
                    <p className="text-[11px] text-text-dim">{formatRelativeTime(n.timestamp)}</p>
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
