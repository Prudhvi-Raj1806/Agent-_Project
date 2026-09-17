import { MusicView } from "@/components/music/music-view";

export default function MusicPage() {
  return (
    <div className="mx-auto flex h-full max-w-7xl flex-col gap-4 px-8 py-4">
      <div className="flex shrink-0 items-start justify-between gap-6 pt-1 pb-1">
        <div>
          <p className="text-xs font-medium tracking-wide text-text-dim uppercase">Music</p>
          <h1 className="mt-1 text-3xl font-semibold tracking-tight text-foreground">Now Playing, Raj.</h1>
          <p className="mt-1.5 text-sm text-muted-foreground">Full playback, right where you left it.</p>
        </div>
        <blockquote className="hidden max-w-52 shrink-0 text-right text-xs italic leading-relaxed text-muted-foreground lg:block">
          &ldquo;The right track clears the static.&rdquo;
          <footer className="mt-1.5 text-[10px] font-medium tracking-wide text-text-dim uppercase not-italic">
            — JARVIS
          </footer>
        </blockquote>
      </div>

      <div className="min-h-0 flex-1">
        <MusicView />
      </div>
    </div>
  );
}
