import { after, NextRequest, NextResponse } from "next/server";
import { latestRate, refreshRates } from "@/lib/fx";
import { getSetting } from "@/lib/db";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  // force=1 = utilizatorul a apăsat „↻”: așteptăm rezultatul ca să-l vadă imediat.
  if (req.nextUrl.searchParams.get("force") === "1") {
    const r = await refreshRates([], true);
    return NextResponse.json({ ...(await latestRate()), error: r.error ?? null });
  }
  // Altfel răspundem din baza de date și reîmprospătăm în fundal.
  after(() => refreshRates([]).catch(() => undefined));
  const [rate, err] = await Promise.all([latestRate(), getSetting("fx_last_error")]);
  return NextResponse.json({ ...rate, error: err || null });
}
