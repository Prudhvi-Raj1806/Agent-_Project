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
          <div className="flex h-dvh min-h-0 w-full bg-background text-foreground">
            <Sidebar />
            <div className="flex min-w-0 flex-1 flex-col">
              <TopBar />
              <main className="min-h-0 flex-1 overflow-hidden">{children}</main>
            </div>
          </div>
        </ClapDetectorProvider>
      </SpotifyPlayerProvider>
    </AppSettingsProvider>
  );
}
