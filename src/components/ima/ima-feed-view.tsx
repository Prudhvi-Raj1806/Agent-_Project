"use client";

import { useMemo, useState } from "react";
import { ExternalLink, FlaskConical, Globe, Newspaper, Sparkles, Terminal } from "lucide-react";
import type { LucideIcon } from "lucide-react";
import type { NewsItem } from "@/lib/data/types";
import { formatRelativeTime } from "@/lib/format";
import { cn } from "@/lib/utils";

const sourceStyle: Record<string, { icon: LucideIcon; className: string }> = {
  TechCrunch: { icon: Newspaper, className: "bg-status-success/15 text-status-success" },
  "The Verge": { icon: Globe, className: "bg-accent-violet/15 text-accent-violet" },
  "Hacker News": { icon: Terminal, className: "bg-status-warning/15 text-status-warning" },
  ArXiv: { icon: FlaskConical, className: "bg-accent-cyan/15 text-accent-cyan" },
};

function ArticleCard({ item }: { item: NewsItem }) {
  const style = sourceStyle[item.source] ?? { icon: Sparkles, className: "bg-surface-2 text-muted-foreground" };
  const Icon = style.icon;
  const className =
    "group flex flex-col gap-2 rounded-lg border border-border bg-surface-1 p-4 transition-colors hover:border-border-strong hover:bg-surface-2";

  const content = (
    <>
      <div className="flex items-center justify-between gap-2">
        <div className="flex min-w-0 items-center gap-2">
          <div className={cn("flex size-6 shrink-0 items-center justify-center rounded-md", style.className)}>
            <Icon className="size-3.5" strokeWidth={1.75} />
          </div>
          <span className="truncate text-xs font-medium text-muted-foreground">{item.source}</span>
          <span className="shrink-0 text-xs text-text-dim">· {item.category}</span>
        </div>
        <span className="shrink-0 font-mono text-[11px] text-text-dim tabular-nums">
          {formatRelativeTime(item.publishedAt)}
        </span>
      </div>
      <h3 className="text-sm font-medium text-foreground group-hover:text-accent-cyan">{item.title}</h3>
      {item.summary && <p className="line-clamp-3 text-xs text-muted-foreground">{item.summary}</p>}
      {item.url && (
        <span className="mt-auto flex items-center gap-1 text-[11px] font-medium text-accent-cyan opacity-0 transition-opacity group-hover:opacity-100">
          Read article <ExternalLink className="size-3" />
        </span>
      )}
    </>
  );

  if (item.url) {
    return (
      <a href={item.url} target="_blank" rel="noopener noreferrer" className={className}>
        {content}
      </a>
    );
  }
  return <div className={className}>{content}</div>;
}

export function ImaFeedView({ items }: { items: NewsItem[] }) {
  const [filter, setFilter] = useState("All");
  const sources = useMemo(() => ["All", ...Array.from(new Set(items.map((item) => item.source)))], [items]);
  const filtered = filter === "All" ? items : items.filter((item) => item.source === filter);

  return (
    <div className="flex h-full flex-col gap-4">
      <div className="flex shrink-0 flex-wrap gap-2">
        {sources.map((source) => (
          <button
            key={source}
            type="button"
            onClick={() => setFilter(source)}
            className={cn(
              "rounded-full border px-3 py-1 text-xs font-medium transition-colors",
              filter === source
                ? "border-accent-cyan/50 bg-accent-cyan/10 text-accent-cyan"
                : "border-border text-muted-foreground hover:border-border-strong hover:text-foreground"
            )}
          >
            {source}
          </button>
        ))}
      </div>

      <div className="no-scrollbar min-h-0 flex-1 overflow-y-auto">
        {filtered.length === 0 ? (
          <p className="text-sm text-muted-foreground">No articles from this source right now.</p>
        ) : (
          <div className="grid grid-cols-1 gap-3 lg:grid-cols-2">
            {filtered.map((item) => (
              <ArticleCard key={item.id} item={item} />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
