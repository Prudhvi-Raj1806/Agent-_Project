import { BottomNav } from "@/components/shell/bottom-nav";
import { Sidebar } from "@/components/shell/sidebar";
import { TopBar } from "@/components/shell/top-bar";
import { SpotifyPlayerProvider } from "@/lib/spotify/player-context";
import { ClapDetectorProvider } from "@/lib/clap/clap-detector-context";
import { AppSettingsProvider } from "@/lib/settings/app-settings-context";
import type { SettingsShape } from "@/server/settings/schema";

export function AppShell({ children, settings }: { children: React.ReactNode; settings: SettingsShape }) {
  return (
    <AppSettingsProvider initial={settings}>
      <SpotifyPlayerProvider>
        <ClapDetectorProvider>
          <div className="flex h-dvh min-h-0 w-full flex-col bg-background text-foreground md:flex-row">
            <Sidebar />
            <div className="flex min-h-0 min-w-0 flex-1 flex-col">
              <TopBar />
              <main className="min-h-0 flex-1 overflow-hidden">{children}</main>
            </div>
            <BottomNav />
          </div>
        </ClapDetectorProvider>
      </SpotifyPlayerProvider>
    </AppSettingsProvider>
  );
}
