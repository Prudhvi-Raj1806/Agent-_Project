import { FocusWorkspace } from "@/components/focus/focus-workspace";
import { mockEnvironmentControls, mockFocusStats } from "@/lib/data/mock-focus";
import { getUiTasks } from "@/server/tasks/view";

export const dynamic = "force-dynamic";

export default async function FocusPage() {
  const tasks = await getUiTasks();
  return (
    <div className="mx-auto flex h-full max-w-7xl flex-col gap-4 px-8 py-4">
      <div className="flex shrink-0 items-start justify-between gap-6 pt-1 pb-1">
        <div>
          <p className="text-xs font-medium tracking-wide text-text-dim uppercase">Focus Mode</p>
          <h1 className="mt-1 text-3xl font-semibold tracking-tight text-foreground">
            Time to focus, Raj.
          </h1>
          <p className="mt-1.5 text-sm text-muted-foreground">One task. Zero distractions.</p>
        </div>
        <blockquote className="hidden max-w-52 shrink-0 text-right text-xs italic leading-relaxed text-muted-foreground lg:block">
          &ldquo;Deep work is not found. It&rsquo;s protected.&rdquo;
          <footer className="mt-1.5 text-[10px] font-medium tracking-wide text-text-dim uppercase not-italic">
            — JARVIS
          </footer>
        </blockquote>
      </div>

      <FocusWorkspace
        tasks={tasks}
        stats={mockFocusStats}
        environmentControls={mockEnvironmentControls}
      />
    </div>
  );
}
