import { NextResponse } from "next/server";
import { requireAccess } from "@/server/access/guard";
import { warmBrain } from "@/server/brain/status";

/** Loads the mini brain's model if the model server is running, so the first request is fast. */
export async function POST(request: Request) {
  const denied = requireAccess(request);
  if (denied) return denied;
  try {
    return NextResponse.json(await warmBrain());
  } catch {
    return NextResponse.json({ error: "Couldn't read the mini brain's status." }, { status: 500 });
  }
}
