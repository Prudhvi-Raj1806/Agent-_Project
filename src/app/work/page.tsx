import { AmbientPanel } from "@/components/home/ambient-panel";
import { QuickActionsPanel } from "@/components/home/quick-actions";
import { SystemPanel } from "@/components/home/system-panel";
import { TopActions } from "@/components/home/top-actions";
import { FocusMusicPanel } from "@/components/work/focus-music-panel";
import { FocusTimerPanel } from "@/components/work/focus-timer-panel";
import { OperationsPanel } from "@/components/work/operations-panel";
import { RecentFilesPanel } from "@/components/work/recent-files-panel";
import { TasksPanel } from "@/components/work/tasks-panel";
import { mockPanelActions } from "@/lib/data/mock-home";
import { mockWorkMoreActions, mockWorkTopActions } from "@/lib/data/mock-work";
import { getUiRecentFiles } from "@/server/files/view";
import { getUiSystemStatus } from "@/server/system/view";
import { getWorkViewData } from "@/server/work/view";

// Mission/provider state changes continuously (missions run, quotas shift) — this
// page must read it fresh per request, not bake one snapshot into the build's
// static shell (node:sqlite reads look "predictable" to Next's prerenderer).
export const dynamic = "force-dynamic";

export default async function WorkPage() {
  const { missions, providers, tasks } = await getWorkViewData();
  const [recentFiles, systemStatus] = await Promise.all([getUiRecentFiles(), getUiSystemStatus()]);

  return (
    <div className="mx-auto flex h-full max-w-7xl flex-col gap-4 px-8 py-4">
      <div className="flex shrink-0 items-start justify-between gap-6 pt-1 pb-1">
        <div>
          <p className="text-xs font-medium tracking-wide text-text-dim uppercase">Work Mode</p>
          <h1 className="mt-1 text-3xl font-semibold tracking-tight text-foreground">
            Let&rsquo;s build, Raj.
          </h1>
          <p className="mt-1.5 text-sm text-muted-foreground">Deep work. Real progress.</p>
        </div>
        <blockquote className="hidden max-w-52 shrink-0 text-right text-xs italic leading-relaxed text-muted-foreground lg:block">
          &ldquo;Discipline turns ideas into reality.&rdquo;
          <footer className="mt-1.5 text-[10px] font-medium tracking-wide text-text-dim uppercase not-italic">
            — JARVIS
          </footer>
        </blockquote>
      </div>

      <TopActions actions={mockWorkTopActions} moreActions={mockWorkMoreActions} />

      <div className="grid min-h-0 flex-1 grid-rows-[1.3fr_1fr] gap-4">
        <div className="grid min-h-0 grid-cols-1 gap-4 lg:grid-cols-[1fr_1.8fr_0.65fr]">
          <TasksPanel tasks={tasks} className="min-h-0" />
          <OperationsPanel missions={missions} providers={providers} className="min-h-0" />
          <div className="grid min-h-0 grid-rows-2 gap-4">
            <FocusTimerPanel className="min-h-0" />
            <FocusMusicPanel className="min-h-0" />
          </div>
        </div>
        <div className="grid min-h-0 grid-cols-1 gap-4 lg:grid-cols-[0.85fr_1fr_1.15fr_0.7fr]">
          <RecentFilesPanel files={recentFiles} className="min-h-0" />
          <QuickActionsPanel actions={mockPanelActions} className="min-h-0" />
          <SystemPanel status={systemStatus} className="min-h-0" />
          <AmbientPanel
            title="Good work today."
            subtitle="Consistency compounds."
            className="min-h-0"
          />
        </div>
      </div>
    </div>
  );
}
