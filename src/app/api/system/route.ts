import { NextResponse } from "next/server";
import { getUiSystemStatus } from "@/server/system/view";

export const dynamic = "force-dynamic";

export async function GET() {
  const status = await getUiSystemStatus();
  return NextResponse.json({ status });
}
