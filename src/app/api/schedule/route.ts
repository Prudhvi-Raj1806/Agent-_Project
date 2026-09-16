import { NextResponse, type NextRequest } from "next/server";
import { createScheduleItem, listUpcomingScheduleItems } from "@/server/schedule/service";
import type { CreateScheduleItemInput } from "@/server/schedule/types";

export async function GET() {
  const items = listUpcomingScheduleItems();
  return NextResponse.json({ items });
}

export async function POST(request: NextRequest) {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Request body must be valid JSON." }, { status: 400 });
  }

  const input = body as CreateScheduleItemInput;
  if (!input || typeof input.title !== "string" || !input.title.trim()) {
    return NextResponse.json({ error: "`title` is required and must be a non-empty string." }, { status: 400 });
  }
  if (!input.startsAt || Number.isNaN(new Date(input.startsAt).getTime())) {
    return NextResponse.json({ error: "`startsAt` must be a valid ISO datetime." }, { status: 400 });
  }

  const item = createScheduleItem(input);
  return NextResponse.json({ item }, { status: 201 });
}
