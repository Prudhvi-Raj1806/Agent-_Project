import { NextResponse } from "next/server";
import { getUiRecentFiles } from "@/server/files/view";

export async function GET() {
  const files = await getUiRecentFiles();
  return NextResponse.json({ files });
}
