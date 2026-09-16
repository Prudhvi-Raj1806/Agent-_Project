import { Router } from "lucide-react";
import { ProviderCard } from "@/components/work/provider-card";
import type { Provider } from "@/lib/data/types";

export function OmniRouterPanel({ providers }: { providers: Provider[] }) {
  return (
    <div className="flex min-h-0 flex-1 flex-col p-5">
      <div className="shrink-0">
        <div className="flex items-center gap-2">
          <span className="flex size-4 shrink-0 items-center justify-center rounded-full bg-accent-cyan text-background">
            <Router className="size-2.5" strokeWidth={2.5} />
          </span>
          <h3 className="text-sm font-medium text-foreground">OmniRouter</h3>
        </div>
        <p className="mt-0.5 text-xs text-muted-foreground">Provider quotas</p>
      </div>

      <div className="no-scrollbar mt-3 min-h-0 flex-1 space-y-3 overflow-y-auto">
        {providers.map((provider) => (
          <ProviderCard key={provider.id} provider={provider} />
        ))}
      </div>
    </div>
  );
}
