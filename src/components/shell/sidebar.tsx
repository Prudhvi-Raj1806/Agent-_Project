"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  Calendar,
  Cpu,
  Focus,
  House,
  Layers,
  Music2,
  Radio,
  Settings,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { PresenceRing } from "@/components/primitives/presence-ring";

const primaryNav = [
  { href: "/", label: "Home", icon: House },
  { href: "/work", label: "Work", icon: Layers },
  { href: "/focus", label: "Focus", icon: Focus },
];

const secondaryNav = [
  { href: "/ima", label: "IMA", icon: Radio },
  { href: "/music", label: "Music", icon: Music2 },
  { href: "/system", label: "System", icon: Cpu },
  { href: "/calendar", label: "Calendar", icon: Calendar },
];

export function Sidebar() {
  const pathname = usePathname();

  const navLinkClass = (isActive: boolean) =>
    cn(
      "flex items-center gap-2.5 rounded-md px-2.5 py-2 text-sm transition-colors",
      isActive
        ? "bg-surface-3 text-foreground"
        : "text-muted-foreground hover:bg-surface-2 hover:text-foreground"
    );

  return (
    <aside className="flex h-full w-44 shrink-0 flex-col border-r border-border bg-background">
      <div className="flex h-14 items-center gap-2.5 px-4">
        <PresenceRing size="sm" active />
        <span className="text-sm font-semibold tracking-wide text-foreground">
          JARVIS
        </span>
      </div>

      <nav className="flex flex-col gap-0.5 px-2.5 pt-2">
        {primaryNav.map((item) => (
          <Link key={item.href} href={item.href} className={navLinkClass(pathname === item.href)}>
            <item.icon className="size-4 shrink-0" strokeWidth={1.75} />
            {item.label}
          </Link>
        ))}
      </nav>

      <nav className="mt-4 flex flex-1 flex-col gap-0.5 border-t border-border px-2.5 pt-4">
        {secondaryNav.map((item) => (
          <Link key={item.href} href={item.href} className={navLinkClass(pathname === item.href)}>
            <item.icon className="size-4 shrink-0" strokeWidth={1.75} />
            {item.label}
          </Link>
        ))}
      </nav>

      <div className="flex flex-col gap-0.5 px-2.5 pb-2.5">
        <Link href="/settings" className={navLinkClass(pathname === "/settings")}>
          <Settings className="size-4 shrink-0" strokeWidth={1.75} />
          Settings
        </Link>
      </div>

      <div className="flex items-center gap-2.5 border-t border-border px-4 py-3">
        <div className="flex size-7 shrink-0 items-center justify-center rounded-full bg-surface-3 text-xs font-medium text-foreground">
          R
        </div>
        <div className="min-w-0 leading-tight">
          <p className="truncate text-sm text-foreground">Raj</p>
          <p className="flex items-center gap-1 text-[11px] text-status-success">
            <span className="size-1.5 rounded-full bg-status-success" />
            Online
          </p>
        </div>
      </div>
    </aside>
  );
}
