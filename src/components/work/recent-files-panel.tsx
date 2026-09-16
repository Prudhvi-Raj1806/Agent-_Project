import { ArrowRight, Code2, FileText, Hash } from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { Panel, PanelBody, PanelHeader } from "@/components/primitives/panel";
import type { RecentFile } from "@/lib/data/types";
import { cn } from "@/lib/utils";

const kindStyle: Record<RecentFile["kind"], { icon: LucideIcon; className: string }> = {
  code: { icon: Code2, className: "text-accent-cyan" },
  style: { icon: Hash, className: "text-accent-violet" },
  doc: { icon: FileText, className: "text-muted-foreground" },
};

export function RecentFilesPanel({ files, className }: { files: RecentFile[]; className?: string }) {
  return (
    <Panel className={className}>
      <PanelHeader
        title="Recent Files"
        action={
          <button
            type="button"
            className="flex items-center gap-1 text-xs font-medium text-muted-foreground transition-colors hover:text-foreground"
          >
            See all
            <ArrowRight className="size-3" />
          </button>
        }
      />
      <PanelBody className="no-scrollbar overflow-y-auto pt-2">
        <ul className="space-y-0.5">
          {files.map((file) => {
            const style = kindStyle[file.kind];
            const Icon = style.icon;
            return (
              <li
                key={file.id}
                className="flex items-center gap-2.5 rounded-md px-1.5 py-1.5 transition-colors hover:bg-surface-2"
              >
                <span className="flex size-8 shrink-0 items-center justify-center rounded-md bg-surface-2">
                  <Icon className={cn("size-3.5", style.className)} strokeWidth={1.75} />
                </span>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-xs font-medium text-foreground">{file.name}</p>
                  <p className="truncate text-[11px] text-muted-foreground">{file.path}</p>
                </div>
                <span className="shrink-0 text-[11px] text-text-dim">{file.updatedAgo}</span>
              </li>
            );
          })}
        </ul>
      </PanelBody>
    </Panel>
  );
}
