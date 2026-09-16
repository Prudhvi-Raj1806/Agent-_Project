import { cn } from "@/lib/utils";

export function Panel({
  className,
  children,
  ...props
}: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="panel"
      className={cn(
        "flex h-full flex-col overflow-hidden rounded-lg border border-border bg-surface-1 shadow-[inset_0_1px_0_0_rgba(255,255,255,0.05),inset_1px_0_0_0_rgba(255,255,255,0.02),0_16px_32px_-20px_rgba(0,0,0,0.85)]",
        className
      )}
      {...props}
    >
      {children}
    </div>
  );
}

interface PanelHeaderProps extends React.ComponentProps<"div"> {
  title: string;
  icon?: React.ReactNode;
  titleAdornment?: React.ReactNode;
  subtitle?: string;
  action?: React.ReactNode;
}

export function PanelHeader({
  title,
  icon,
  titleAdornment,
  subtitle,
  action,
  className,
  ...props
}: PanelHeaderProps) {
  return (
    <div
      data-slot="panel-header"
      className={cn(
        "flex shrink-0 items-start justify-between gap-3 px-5 pt-5",
        className
      )}
      {...props}
    >
      <div className="min-w-0">
        <div className="flex min-w-0 items-center gap-2">
          {icon}
          <h3 className="truncate text-sm font-medium text-foreground">{title}</h3>
          {titleAdornment}
        </div>
        {subtitle && (
          <p className="mt-0.5 truncate text-xs text-muted-foreground">
            {subtitle}
          </p>
        )}
      </div>
      {action && <div className="shrink-0">{action}</div>}
    </div>
  );
}

export function PanelBody({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div data-slot="panel-body" className={cn("min-h-0 flex-1 p-5", className)} {...props} />
  );
}
