import { ImaFeedView } from "@/components/ima/ima-feed-view";
import { getNews } from "@/server/news/service";

// RSS feeds change constantly — read fresh per request, not baked into the build.
export const dynamic = "force-dynamic";

export default async function ImaPage() {
  const items = await getNews();

  return (
    <div className="mx-auto flex h-full max-w-7xl flex-col gap-4 px-8 py-4">
      <div className="flex shrink-0 items-start justify-between gap-6 pt-1 pb-1">
        <div>
          <p className="text-xs font-medium tracking-wide text-text-dim uppercase">IMA</p>
          <h1 className="mt-1 text-3xl font-semibold tracking-tight text-foreground">The tech feed, Raj.</h1>
          <p className="mt-1.5 text-sm text-muted-foreground">Everything live, from every source.</p>
        </div>
        <blockquote className="hidden max-w-52 shrink-0 text-right text-xs italic leading-relaxed text-muted-foreground lg:block">
          &ldquo;Signal, not noise.&rdquo;
          <footer className="mt-1.5 text-[10px] font-medium tracking-wide text-text-dim uppercase not-italic">
            — JARVIS
          </footer>
        </blockquote>
      </div>

      <div className="min-h-0 flex-1">
        <ImaFeedView items={items} />
      </div>
    </div>
  );
}
