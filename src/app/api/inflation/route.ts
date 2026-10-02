import { after, NextRequest, NextResponse } from "next/server";
import { latestInflation, refreshInflation } from "@/lib/inflation";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  // force=1 = utilizatorul a apăsat „↻”: așteptăm rezultatul ca să-l vadă imediat.
  if (req.nextUrl.searchParams.get("force") === "1") {
    const r = await refreshInflation(true);
    return NextResponse.json({ ...(await latestInflation()), error: r.error ?? null });
  }
  // Altfel răspundem din baza de date și reîmprospătăm în fundal (Eurostat, max. o dată la 12 ore).
  after(() => refreshInflation(false).catch(() => undefined));
  return NextResponse.json({ ...(await latestInflation()), error: null });
}
