import type { LucideIcon } from "lucide-react";

interface EmptyStateProps {
  icon: LucideIcon;
  title: string;
  description?: string;
}

export function EmptyState({ icon: Icon, title, description }: EmptyStateProps) {
  return (
    <div className="flex h-full flex-col items-center justify-center gap-3 px-6 text-center">
      <div className="flex size-10 items-center justify-center rounded-lg bg-surface-1 text-muted-foreground">
        <Icon className="size-5" strokeWidth={1.5} />
      </div>
      <div>
        <p className="text-sm font-medium text-foreground">{title}</p>
        {description && (
          <p className="mt-1 max-w-xs text-sm text-muted-foreground">
            {description}
          </p>
        )}
      </div>
    </div>
  );
}
