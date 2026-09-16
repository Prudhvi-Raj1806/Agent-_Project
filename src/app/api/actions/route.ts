import { NextResponse } from "next/server";
import { listActionSummaries } from "@/server/actions/registry";

export async function GET() {
  return NextResponse.json({ actions: listActionSummaries() });
}
