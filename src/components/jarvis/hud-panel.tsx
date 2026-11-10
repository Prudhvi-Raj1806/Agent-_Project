import { cn } from "@/lib/utils";

/**
 * HUD-style frame: translucent glass, hairline cyan border and four corner
 * brackets. Purely presentational — the content is whatever real data the
 * caller passes in.
 */
export function HudPanel({
  title,
  meta,
  className,
  children,
}: {
  title: string;
  meta?: string;
  className?: string;
  children: React.ReactNode;
}) {
  const bracket = "pointer-events-none absolute size-2.5 border-accent-cyan/70";
  return (
    <section
      className={cn(
        "relative border border-accent-cyan/15 bg-glass px-4 py-3 backdrop-blur-sm",
        className,
      )}
    >
      <span className={cn(bracket, "-left-px -top-px border-l border-t")} />
      <span className={cn(bracket, "-right-px -top-px border-r border-t")} />
      <span className={cn(bracket, "-bottom-px -left-px border-b border-l")} />
      <span className={cn(bracket, "-bottom-px -right-px border-b border-r")} />
      <header className="mb-2.5 flex items-baseline justify-between gap-3">
        <h3 className="font-mono text-[10px] font-medium uppercase tracking-[0.22em] text-accent-cyan">
          {title}
        </h3>
        {meta && <span className="font-mono text-[10px] text-text-dim">{meta}</span>}
      </header>
      {children}
    </section>
  );
}
