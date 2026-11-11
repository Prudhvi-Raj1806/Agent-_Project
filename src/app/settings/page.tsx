import { Bot, Cpu, Ear, Moon, Plug, Server, Smartphone, User } from "lucide-react";
import { StatusIndicator } from "@/components/primitives/status-indicator";
import { ClapWakePanel } from "@/components/settings/clap-wake-panel";
import { HermesPanel } from "@/components/settings/hermes-panel";
import { RemoteAccessPanel } from "@/components/settings/remote-access-panel";
import { ServicesPanel } from "@/components/settings/services-panel";
import { SpotifyConnectionRow } from "@/components/settings/spotify-connection-row";
import { VoicePanel } from "@/components/settings/voice-panel";
import { VoicePasscodePanel } from "@/components/settings/voice-passcode-panel";
import { isSpotifyConnected } from "@/server/spotify/auth";
import { isSpotifyConfigured } from "@/server/spotify/config";
import { listPublicProviders } from "@/server/omnirouter/service";
import { getVoicePasscodeSource } from "@/server/voice/passcode";
import type { ProviderStatus, StatusTone } from "@/lib/data/types";
import { getBrand, getOwnerName } from "@/server/settings/brand";

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
  const voiceSource = getVoicePasscodeSource();

  return (
    <div className="mx-auto flex h-full max-w-3xl flex-col gap-4 overflow-y-auto px-4 py-4 sm:px-8">
      <div className="shrink-0 pt-1 pb-1">
        <p className="text-xs font-medium tracking-wide text-text-dim uppercase">Settings</p>
        <h1 className="mt-1 text-3xl font-semibold tracking-tight text-foreground">Configure {getBrand()}.</h1>
        <p className="mt-1.5 text-sm text-muted-foreground">Profile, appearance, voice, and integrations.</p>
      </div>

      <div className="flex flex-col gap-4 pb-6">
        <SettingsSection icon={<User className="size-4 text-muted-foreground" />} title="Profile">
          <div className="flex items-center gap-3">
            <div className="flex size-10 items-center justify-center rounded-full bg-accent-cyan/15 text-sm font-semibold text-accent-cyan">
              {getOwnerName().charAt(0).toUpperCase()}
            </div>
            <div>
              <p className="text-sm font-medium text-foreground">{getOwnerName()}</p>
              <p className="text-xs text-muted-foreground">Local owner account · single-user</p>
            </div>
          </div>
        </SettingsSection>

        <SettingsSection icon={<Moon className="size-4 text-muted-foreground" />} title="Appearance">
          <p className="text-sm text-muted-foreground">
            Dark — {getBrand()}&rsquo;s signature look. Additional themes aren&rsquo;t built yet.
          </p>
        </SettingsSection>

        <SettingsSection
          icon={<Cpu className="size-4 text-muted-foreground" />}
          title="Voice"
          subtitle="Gates risky Quick Actions like Control Computer."
        >
          <VoicePanel />
          <div className="mt-6 border-t border-border pt-5">
            <VoicePasscodePanel source={voiceSource} />
          </div>
        </SettingsSection>

        <SettingsSection
          icon={<Ear className="size-4 text-muted-foreground" />}
          title="Wake"
          subtitle="An always-listening clap trigger, inspired by another Jarvis project."
        >
          <ClapWakePanel />
        </SettingsSection>

        <SettingsSection
          icon={<Server className="size-4 text-muted-foreground" />}
          title="Services"
          subtitle="Start, stop and restart what the assistant depends on."
        >
          <ServicesPanel />
        </SettingsSection>

        <SettingsSection
          icon={<Smartphone className="size-4 text-muted-foreground" />}
          title="Phone and remote access"
          subtitle="Open this dashboard from your phone over Tailscale. Nothing outside your tailnet can reach it."
        >
          <RemoteAccessPanel />
        </SettingsSection>

        <SettingsSection
          icon={<Bot className="size-4 text-muted-foreground" />}
          title="Hermes"
          subtitle="The agent that carries out missions: its status and the model it runs on."
        >
          <HermesPanel />
        </SettingsSection>

        <SettingsSection icon={<Plug className="size-4 text-muted-foreground" />} title="Integrations">
          <div className="flex flex-col divide-y divide-border">
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
