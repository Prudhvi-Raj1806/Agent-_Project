import { SystemMonitorView } from "@/components/system/system-monitor-view";
import { getUiSystemDetail } from "@/server/system/view";

// Real telemetry, read fresh per request rather than baked into the build.
export const dynamic = "force-dynamic";

export default async function SystemPage() {
  const detail = await getUiSystemDetail();

  return (
    <div className="mx-auto flex h-full max-w-7xl flex-col gap-4 px-8 py-4">
      <div className="flex shrink-0 items-start justify-between gap-6 pt-1 pb-1">
        <div>
          <p className="text-xs font-medium tracking-wide text-text-dim uppercase">System</p>
          <h1 className="mt-1 text-3xl font-semibold tracking-tight text-foreground">Machine status, Raj.</h1>
          <p className="mt-1.5 text-sm text-muted-foreground">Real telemetry from this machine, live.</p>
        </div>
        <blockquote className="hidden max-w-52 shrink-0 text-right text-xs italic leading-relaxed text-muted-foreground lg:block">
          &ldquo;I never report a number I can&rsquo;t measure.&rdquo;
          <footer className="mt-1.5 text-[10px] font-medium tracking-wide text-text-dim uppercase not-italic">
            — JARVIS
          </footer>
        </blockquote>
      </div>

      <div className="min-h-0 flex-1">
        <SystemMonitorView initialDetail={detail} />
      </div>
    </div>
  );
}
