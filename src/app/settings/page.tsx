import { Bot, Cpu, Ear, Moon, Plug, User } from "lucide-react";
import { StatusIndicator } from "@/components/primitives/status-indicator";
import { ClapWakePanel } from "@/components/settings/clap-wake-panel";
import { SpotifyConnectionRow } from "@/components/settings/spotify-connection-row";
import { VoicePasscodePanel } from "@/components/settings/voice-passcode-panel";
import { isSpotifyConnected } from "@/server/spotify/auth";
import { isSpotifyConfigured } from "@/server/spotify/config";
import { getHermesConnectionInfo } from "@/server/hermes/factory";
import { listPublicProviders } from "@/server/omnirouter/service";
import { getVoicePasscodeSource } from "@/server/voice/passcode";
import type { ProviderStatus, StatusTone } from "@/lib/data/types";

// Integration/connection state changes at runtime — read fresh per request.
export const dynamic = "force-dynamic";

const statusToneMap: Record<ProviderStatus, StatusTone> = {
  online: "success",
  degraded: "warning",
  rate_limited: "warning",
  offline: "error",
};

const statusLabelMap: Record<ProviderStatus, string> = {
  online: "Online",
  degraded: "Degraded",
  rate_limited: "Rate limited",
  offline: "Offline",
};

const hermesLabelMap = {
  agent: { label: "Real Hermes Agent", tone: "success" as StatusTone },
  http: { label: "Custom Hermes endpoint", tone: "success" as StatusTone },
  mock: { label: "Mock (simulated)", tone: "idle" as StatusTone },
};

function SettingsSection({
  icon,
  title,
  subtitle,
  children,
}: {
  icon: React.ReactNode;
  title: string;
  subtitle?: string;
  children: React.ReactNode;
}) {
  return (
    <section className="rounded-lg border border-border bg-surface-1 p-5 shadow-[inset_0_1px_0_0_rgba(255,255,255,0.05),inset_1px_0_0_0_rgba(255,255,255,0.02)]">
      <div className="flex items-center gap-2">
        {icon}
        <h2 className="text-sm font-medium text-foreground">{title}</h2>
      </div>
      {subtitle && <p className="mt-0.5 text-xs text-muted-foreground">{subtitle}</p>}
      <div className="mt-4">{children}</div>
    </section>
  );
}

export default function SettingsPage() {
  const providers = listPublicProviders();
  const spotifyConfigured = isSpotifyConfigured();
  const spotifyConnected = isSpotifyConnected();
  const hermes = getHermesConnectionInfo();
  const voiceSource = getVoicePasscodeSource();

  return (
    <div className="mx-auto flex h-full max-w-3xl flex-col gap-4 overflow-y-auto px-8 py-4">
      <div className="shrink-0 pt-1 pb-1">
        <p className="text-xs font-medium tracking-wide text-text-dim uppercase">Settings</p>
        <h1 className="mt-1 text-3xl font-semibold tracking-tight text-foreground">Configure JARVIS, Raj.</h1>
        <p className="mt-1.5 text-sm text-muted-foreground">Profile, appearance, voice, and integrations.</p>
      </div>

      <div className="flex flex-col gap-4 pb-6">
        <SettingsSection icon={<User className="size-4 text-muted-foreground" />} title="Profile">
          <div className="flex items-center gap-3">
            <div className="flex size-10 items-center justify-center rounded-full bg-accent-cyan/15 text-sm font-semibold text-accent-cyan">
              R
            </div>
            <div>
              <p className="text-sm font-medium text-foreground">Raj</p>
              <p className="text-xs text-muted-foreground">Local owner account · single-user</p>
            </div>
          </div>
        </SettingsSection>

        <SettingsSection icon={<Moon className="size-4 text-muted-foreground" />} title="Appearance">
          <p className="text-sm text-muted-foreground">
            Dark — JARVIS&rsquo;s signature look. Additional themes aren&rsquo;t built yet.
          </p>
        </SettingsSection>

        <SettingsSection
          icon={<Cpu className="size-4 text-muted-foreground" />}
          title="Voice"
          subtitle="Gates risky Quick Actions like Control Computer."
        >
          <VoicePasscodePanel source={voiceSource} />
        </SettingsSection>

        <SettingsSection
          icon={<Ear className="size-4 text-muted-foreground" />}
          title="Wake"
          subtitle="An always-listening clap trigger, inspired by another Jarvis project."
        >
          <ClapWakePanel />
        </SettingsSection>

        <SettingsSection icon={<Plug className="size-4 text-muted-foreground" />} title="Integrations">
          <div className="flex flex-col divide-y divide-border">
            <div className="flex items-center gap-2 py-2.5">
              <Bot className="size-3.5 shrink-0 text-muted-foreground" />
              <StatusIndicator tone={hermesLabelMap[hermes.mode].tone} label={hermesLabelMap[hermes.mode].label} />
              <span className="text-sm text-foreground">Hermes Agent</span>
            </div>
            {providers.map((provider) => (
              <div key={provider.id} className="flex items-center gap-2 py-2.5">
                <StatusIndicator tone={statusToneMap[provider.status]} label={statusLabelMap[provider.status]} />
                <span className="text-sm text-foreground">{provider.name}</span>
              </div>
            ))}
            <SpotifyConnectionRow configured={spotifyConfigured} connected={spotifyConnected} />
          </div>
        </SettingsSection>
      </div>
    </div>
  );
}
