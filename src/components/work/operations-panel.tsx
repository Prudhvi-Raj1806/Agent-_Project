import { Panel } from "@/components/primitives/panel";
import { ActiveMissionsPanel } from "@/components/work/active-missions-panel";
import { OmniRouterPanel } from "@/components/work/omnirouter-panel";
import type { Mission, Provider } from "@/lib/data/types";

export function OperationsPanel({
  missions,
  providers,
  className,
}: {
  missions: Mission[];
  providers: Provider[];
  className?: string;
}) {
  return (
    <Panel className={className}>
      <div className="flex h-full min-h-0 divide-x divide-border">
        <ActiveMissionsPanel missions={missions} />
        <OmniRouterPanel providers={providers} />
      </div>
    </Panel>
  );
}
