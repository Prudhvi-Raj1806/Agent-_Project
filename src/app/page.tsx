import Image from "next/image";
import { AmbientPanel } from "@/components/home/ambient-panel";
import { ImaPanel } from "@/components/home/ima-panel";
import { NowPlayingPanel } from "@/components/home/now-playing-panel";
import { QuickActionsPanel } from "@/components/home/quick-actions";
import { SystemPanel } from "@/components/home/system-panel";
import { TodayPanel } from "@/components/home/today-panel";
import { TopActions } from "@/components/home/top-actions";
import { mockMoreTopActions, mockPanelActions, mockTopActions } from "@/lib/data/mock-home";
import { getNews } from "@/server/news/service";
import { getUiSchedule } from "@/server/schedule/view";
import { getUiSystemStatus } from "@/server/system/view";

function getGreeting(hour: number) {
  if (hour < 12) return "Good morning";
  if (hour < 18) return "Good afternoon";
  return "Good evening";
}

// News/schedule/system all read live state (RSS feeds, the schedule table,
// real telemetry) — this page must render fresh per request, not get baked
// into the build's static shell.
export const dynamic = "force-dynamic";

export default async function HomePage() {
  const greeting = getGreeting(new Date().getHours());
  const [news, schedule, systemStatus] = await Promise.all([
    getNews(),
    getUiSchedule(),
    getUiSystemStatus(),
  ]);

  return (
    <div className="mx-auto flex h-full max-w-7xl flex-col gap-4 px-8 py-4">
      <div className="relative -mx-8 h-36 shrink-0 overflow-hidden rounded-b-xl">
        <Image
          src="/Jarvis Hero.png"
          alt=""
          fill
          priority
          sizes="100vw"
          className="object-cover object-[center_55%] opacity-25"
        />
        <div className="absolute inset-0 bg-background/50" />
        <div className="absolute inset-0 bg-gradient-to-t from-background via-background/70 to-transparent" />
        <div className="absolute inset-0 bg-gradient-to-r from-background via-background/40 to-transparent" />
        <div className="relative flex h-full items-end justify-between gap-6 px-8 pb-5">
          <div>
            <p className="text-xs font-medium tracking-wide text-text-dim uppercase">
              {greeting}
            </p>
            <h1 className="mt-1 text-3xl font-semibold tracking-tight text-foreground">
              Raj.
            </h1>
            <p className="mt-1.5 text-sm text-muted-foreground">
              A little progress every day adds up.
            </p>
          </div>
          <blockquote className="hidden max-w-52 shrink-0 text-right text-xs italic leading-relaxed text-muted-foreground lg:block">
            &ldquo;Ideas turn into extraordinary things when you give them
            time.&rdquo;
            <footer className="mt-1.5 text-[10px] font-medium tracking-wide text-text-dim uppercase not-italic">
              — Tony Stark
            </footer>
          </blockquote>
        </div>
      </div>

      <TopActions actions={mockTopActions} moreActions={mockMoreTopActions} />

      <div className="grid min-h-0 flex-1 grid-cols-1 grid-rows-[1.3fr_1fr] gap-4 lg:grid-cols-[1.8fr_1.2fr_0.9fr]">
        <ImaPanel items={news} className="min-h-0 lg:col-start-1 lg:row-start-1" />
        <NowPlayingPanel className="min-h-0 lg:col-start-2 lg:row-start-1" />
        <TodayPanel items={schedule} className="min-h-0 lg:col-start-3 lg:row-start-1" />

        <SystemPanel status={systemStatus} className="min-h-0 lg:col-start-1 lg:row-start-2" />
        <QuickActionsPanel
          actions={mockPanelActions}
          className="min-h-0 lg:col-start-2 lg:row-start-2"
        />
        <AmbientPanel className="min-h-0 lg:col-start-3 lg:row-start-2" />
      </div>
    </div>
  );
}
