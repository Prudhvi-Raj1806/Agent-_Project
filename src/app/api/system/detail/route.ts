import { NextResponse } from "next/server";
import { getUiSystemDetail } from "@/server/system/view";

export const dynamic = "force-dynamic";

export async function GET() {
  const detail = await getUiSystemDetail();
  return NextResponse.json({ detail });
}
