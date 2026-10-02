import { NextRequest, NextResponse } from "next/server";
import { latestInflation, refreshInflation } from "@/lib/inflation";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const force = req.nextUrl.searchParams.get("force") === "1";
  const r = await refreshInflation(force);
  const info = await latestInflation();
  return NextResponse.json({
    ...info,
    error: r.error ?? null,
  });
}

