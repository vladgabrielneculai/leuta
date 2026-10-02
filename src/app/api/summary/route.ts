import { NextRequest, NextResponse } from "next/server";
import { buildSummary } from "@/lib/analytics";
import { refreshRates } from "@/lib/fx";
import { currentMonth, lastMonths } from "@/lib/util";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const month = req.nextUrl.searchParams.get("month") ?? currentMonth();
  const fx = await refreshRates(lastMonths(month, 12));
  const summary = await buildSummary(month);
  return NextResponse.json({ ...summary, fxError: fx.error ?? null });
}
