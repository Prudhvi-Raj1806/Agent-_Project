import { NextResponse } from "next/server";
import { listPublicProviders } from "@/server/omnirouter/service";

export async function GET() {
  return NextResponse.json({ providers: listPublicProviders() });
}
