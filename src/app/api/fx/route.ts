import { NextRequest, NextResponse } from "next/server";
import { latestRate, refreshRates } from "@/lib/fx";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const force = req.nextUrl.searchParams.get("force") === "1";
  const r = await refreshRates([], force);
  return NextResponse.json({ ...(await latestRate()), error: r.error ?? null });
}
