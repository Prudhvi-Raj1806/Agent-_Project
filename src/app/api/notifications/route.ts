import { NextResponse } from "next/server";
import { listNotifications } from "@/server/notifications/service";

export async function GET() {
  return NextResponse.json({ notifications: listNotifications() });
}
