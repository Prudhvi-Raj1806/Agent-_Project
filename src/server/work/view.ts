import { listActiveMissions } from "@/server/missions/service";
import type { Mission as ServerMission } from "@/server/missions/types";
import { listPublicProviders } from "@/server/omnirouter/service";
import type { PublicProvider } from "@/server/omnirouter/types";
import { getUiTasks } from "@/server/tasks/view";
import { formatMinutesAsHoursMinutes } from "@/lib/format";
import {
  AGENT_STATUS_MAP,
  MISSION_STATUS_MAP,
  describeNextStep,
  shortenObjective,
} from "@/lib/work/mission-mapping";
import type { Mission as UiMission, Provider as UiProvider, Task as UiTask } from "@/lib/data/types";

/**
 * Adapts backend domain shapes to the existing (locked) UI contract in
 * `@/lib/data/types`. The UI's status/agent enums are coarser than the
 * backend's — the mapping tables live in `@/lib/work/mission-mapping`
 * (client-safe) so the client-side live-update hook can apply the same
 * collapsing rules to SSE events without importing server-only code. No
 * fields are fabricated: where the backend hasn't wired a real signal yet
 * (per-model usage, quota reset timing), the adapter returns an honest
 * empty/placeholder value instead of a fake number.
 */

function toUiMission(mission: ServerMission): UiMission {
  return {
    id: mission.id,
    name: shortenObjective(mission.objective),
    status: MISSION_STATUS_MAP[mission.status],
    progressPercent: mission.progress,
    objective: mission.objective,
    agents: mission.agents.map((agent) => ({
      name: agent.role,
      status: AGENT_STATUS_MAP[agent.status],
    })),
    nextStep: describeNextStep(mission.status, mission.currentObjective),
  };
}

function formatResetIn(resetAt: string | null): string {
  if (!resetAt) return "—"; // no live quota tracking wired up yet (Phase 1)
  const minutes = Math.max(0, Math.round((new Date(resetAt).getTime() - Date.now()) / 60_000));
  return formatMinutesAsHoursMinutes(minutes);
}

function toUiProvider(provider: PublicProvider): UiProvider {
  return {
    id: provider.id,
    name: provider.name,
    status: provider.status,
    aggregateQuotaPercent: provider.aggregateQuotaPercent,
    resetIn: formatResetIn(provider.accounts[0]?.resetAt ?? null),
    accounts: provider.accounts.map((account) => ({
      id: account.id,
      label: account.label,
      quotaPercent: account.quotaPercent,
      resetIn: formatResetIn(account.resetAt),
      status: account.status,
    })),
    // Per-model usage isn't tracked yet (no live provider API calls in Phase 1) — an
    // empty list is the honest result, not a fabricated usage percentage per model.
    metrics: [],
  };
}

export interface WorkViewData {
  missions: UiMission[];
  providers: UiProvider[];
  tasks: UiTask[];
}

export async function getWorkViewData(): Promise<WorkViewData> {
  return {
    missions: listActiveMissions().map(toUiMission),
    providers: listPublicProviders().map(toUiProvider),
    tasks: await getUiTasks(),
  };
}
