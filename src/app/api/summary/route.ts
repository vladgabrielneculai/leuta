import { after, NextRequest, NextResponse } from "next/server";
import { buildSummary } from "@/lib/analytics";
import { isBetaDeployment } from "@/lib/beta";
import { refreshRates } from "@/lib/fx";
import { materializeQuietly } from "@/lib/scheduledServer";
import { currentMonth, isMonth, lastMonths } from "@/lib/util";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const month = req.nextUrl.searchParams.get("month") ?? currentMonth();
  if (!isMonth(month)) return NextResponse.json({ error: "Luna trebuie să fie în formatul AAAA-LL." }, { status: 400 });
  await materializeQuietly(); // programările scadente (beta) intră în buget înainte de calcul
  const summary = await buildSummary(month);

  // Cursul BNR se actualizează DUPĂ ce răspunsul a plecat (Vercel păstrează funcția vie pentru
  // `after`). Panoul se încarcă instant din ce e în baza de date, iar cursul nou apare la
  // următoarea încărcare. Înainte, pagina aștepta serverul BNR (inclusiv fișierul pe un an întreg).
  after(() => refreshRates(lastMonths(month, 12)).catch(() => undefined));

  return NextResponse.json({ ...summary, fxError: summary.settings.fx_last_error || null, beta: isBetaDeployment() });
}
