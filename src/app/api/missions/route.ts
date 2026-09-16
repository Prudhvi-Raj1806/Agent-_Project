import { NextResponse, type NextRequest } from "next/server";
import { logger } from "@/server/logging/logger";
import { startMission } from "@/server/missions/orchestrator";
import { createMission, listAllMissions, PolicyError, ValidationError } from "@/server/missions/service";
import type { CreateMissionInput } from "@/server/missions/types";
import { getOwnerActor } from "@/server/security/policy";

export async function GET() {
  const missions = listAllMissions();
  return NextResponse.json({ missions });
}

export async function POST(request: NextRequest) {
  const startedAt = Date.now();
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Request body must be valid JSON." }, { status: 400 });
  }

  try {
    const mission = createMission(body as CreateMissionInput, getOwnerActor());
    startMission(mission.id);
    logger.info("api.missions.create", { missionId: mission.id, durationMs: Date.now() - startedAt });
    return NextResponse.json({ mission }, { status: 201 });
  } catch (err) {
    if (err instanceof ValidationError) return NextResponse.json({ error: err.message }, { status: 400 });
    if (err instanceof PolicyError) return NextResponse.json({ error: err.message }, { status: 403 });
    logger.error("api.missions.create", { error: String(err) });
    return NextResponse.json({ error: "Internal error creating mission." }, { status: 500 });
  }
}
