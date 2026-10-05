import { NextRequest, NextResponse } from "next/server";
import { requireRecentAuth } from "@/lib/auth";
import { errorResponse } from "@/lib/http";
import { clearAllFinancialData, seedDemoData } from "@/lib/seed";

export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const action = body.action;

    if (action === "seed") {
      const res = await seedDemoData();
      return NextResponse.json(res);
    } else if (action === "clear") {
      // Ștergerea tuturor datelor cere identitatea confirmată recent.
      const auth = await requireRecentAuth();
      if ("response" in auth) return auth.response;
      await clearAllFinancialData();
      return NextResponse.json({ success: true, message: "Toate datele financiare au fost șterse." });
    }

    return NextResponse.json({ error: "Acțiune necunoscută." }, { status: 400 });
  } catch (err) {
    return errorResponse(err, "Eroare la procesare.");
  }
}

