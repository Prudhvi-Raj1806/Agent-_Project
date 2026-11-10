import { NextResponse } from "next/server";
import { requireAccess } from "@/server/access/guard";
import { getServiceController } from "@/server/services";

/** Status of every service the dashboard can control. */
export async function GET(request: Request) {
  const denied = requireAccess(request);
  if (denied) return denied;
  return NextResponse.json(await getServiceController().statuses());
}
