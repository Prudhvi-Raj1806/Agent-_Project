import { NextResponse } from "next/server";
import { getNews } from "@/server/news/service";

export async function GET() {
  const items = await getNews();
  return NextResponse.json({ items });
}
