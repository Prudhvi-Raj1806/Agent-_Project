import Link from "next/link";
import { ArrowRight, FlaskConical, Globe, Newspaper, Sparkles, Terminal } from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { Panel, PanelBody, PanelHeader } from "@/components/primitives/panel";
import { StatusIndicator } from "@/components/primitives/status-indicator";
import type { NewsItem } from "@/lib/data/types";
import { formatRelativeTime } from "@/lib/format";
import { cn } from "@/lib/utils";

const sourceStyle: Record<string, { icon: LucideIcon; className: string }> = {
  TechCrunch: { icon: Newspaper, className: "bg-status-success/15 text-status-success" },
  "The Verge": { icon: Globe, className: "bg-accent-violet/15 text-accent-violet" },
  "Hacker News": { icon: Terminal, className: "bg-status-warning/15 text-status-warning" },
  ArXiv: { icon: FlaskConical, className: "bg-accent-cyan/15 text-accent-cyan" },
};

export function ImaPanel({ items, className }: { items: NewsItem[]; className?: string }) {
  return (
    <Panel className={className}>
      <PanelHeader
        title="IMA"
        titleAdornment={<StatusIndicator tone="success" label="LIVE" pulse={false} />}
        subtitle="Live tech news, curated for you."
        action={
          <Link
            href="/ima"
            className="flex items-center gap-1 text-xs font-medium text-muted-foreground transition-colors hover:text-foreground"
          >
            See all
            <ArrowRight className="size-3" />
          </Link>
        }
      />
      <PanelBody className="no-scrollbar divide-y divide-border overflow-y-auto pt-2">
        {items.map((item) => {
          const style = sourceStyle[item.source] ?? {
            icon: Sparkles,
            className: "bg-surface-2 text-muted-foreground",
          };
          const Icon = style.icon;
          return (
            <article
              key={item.id}
              className="group flex items-center gap-3 px-2 py-2.5 -mx-2 transition-colors hover:bg-surface-2"
            >
              <div className="flex shrink-0 flex-col items-center gap-1">
                <div
                  className={cn(
                    "flex size-8 items-center justify-center rounded-md",
                    style.className
                  )}
                >
                  <Icon className="size-4" strokeWidth={1.75} />
                </div>
                <span className="font-mono text-[10px] text-text-dim tabular-nums">
                  {formatRelativeTime(item.publishedAt)}
                </span>
              </div>
              <div className="min-w-0 flex-1">
                <h4 className="truncate text-sm font-medium text-foreground group-hover:text-accent-cyan">
                  {item.title}
                </h4>
                <p className="mt-0.5 text-xs text-muted-foreground">{item.category}</p>
              </div>
            </article>
          );
        })}
      </PanelBody>
    </Panel>
  );
}
