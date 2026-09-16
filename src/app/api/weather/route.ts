import { NextResponse } from "next/server";
import { getCurrentWeather } from "@/server/weather/service";

export async function GET() {
  const weather = await getCurrentWeather();
  return NextResponse.json({ weather });
}
