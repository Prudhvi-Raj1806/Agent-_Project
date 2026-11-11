"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Settings } from "lucide-react";
import { ASSISTANT_HREF, primaryNav, secondaryNav } from "@/components/shell/sidebar";
import { useBrand } from "@/lib/settings/use-brand";
import { cn } from "@/lib/utils";

const items = [...primaryNav, ...secondaryNav, { href: "/settings", label: "Settings", icon: Settings }];

/** The phone's navigation: every destination in one scrollable row, each tap target at least 56 px tall. Hidden from `md` up, where the sidebar takes over. */
export function BottomNav() {
  const pathname = usePathname();
  const brand = useBrand();
  return (
    <nav
      aria-label="Main"
      className="flex shrink-0 overflow-x-auto border-t border-border bg-background pb-[env(safe-area-inset-bottom)] md:hidden"
    >
      {items.map((item) => {
        const active = pathname === item.href;
        return (
          <Link
            key={item.href}
            href={item.href}
            aria-current={active ? "page" : undefined}
            className={cn(
              "flex min-h-14 min-w-[4.5rem] flex-1 flex-col items-center justify-center gap-1 px-2 text-[10px] font-medium transition-colors",
              active ? "text-accent-cyan" : "text-muted-foreground active:text-foreground",
            )}
          >
            <item.icon className="size-5 shrink-0" strokeWidth={1.75} />
            {item.href === ASSISTANT_HREF ? brand : item.label}
          </Link>
        );
      })}
    </nav>
  );
}
