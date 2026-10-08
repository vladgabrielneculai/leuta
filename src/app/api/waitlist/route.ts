import { NextRequest, NextResponse } from "next/server";
import { clientIp } from "@/lib/auth";
import { getSystemDb } from "@/lib/db";
import { isEmail } from "@/lib/notify/email";
import { SITE } from "@/lib/site/config";

export const dynamic = "force-dynamic";

/**
 * Înscrierea pe lista de așteptare, din formularul site-ului de prezentare (components/site/Waitlist.tsx).
 * Ruta e publică (proxy.ts), deci se apără singură: câmp-capcană pentru roboți, acord obligatoriu și cel mult
 * 5 încercări pe oră per IP (pe Vercel, x-forwarded-for e pus de platformă și nu poate fi falsificat).
 */

const MAX_PER_HOUR = 5;

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => null);
  if (!body || typeof body !== "object") return NextResponse.json({ error: "Cerere invalidă." }, { status: 400 });

  // Roboții completează câmpul ascuns: le răspundem ca și cum ar fi reușit, fără să salvăm nimic.
  if (typeof body.website === "string" && body.website.trim()) return NextResponse.json({ ok: true });

  const email = String(body.email ?? "").trim().toLowerCase();
  if (!isEmail(email)) return NextResponse.json({ error: "Adresa de email nu pare corectă." }, { status: 400 });
  if (body.consent !== true) return NextResponse.json({ error: "Bifează acordul ca să te putem înscrie." }, { status: 400 });

  const ip = clientIp(req.headers).slice(0, 64);
  try {
    const db = await getSystemDb();
    const recent = await db
      .prepare("SELECT COUNT(*)::int AS c FROM waitlist_attempts WHERE ip = ? AND attempted_at > now() - interval '1 hour'")
      .get<{ c: number }>(ip);
    if ((recent?.c ?? 0) >= MAX_PER_HOUR) {
      return NextResponse.json({ error: "Prea multe încercări. Încearcă din nou mai târziu." }, { status: 429 });
    }
    await db.prepare("INSERT INTO waitlist_attempts (ip) VALUES (?)").run(ip);
    if (Math.random() < 0.05) await db.prepare("DELETE FROM waitlist_attempts WHERE attempted_at < now() - interval '1 day'").run();

    const res = await db
      .prepare("INSERT INTO waitlist (email, consent_version, source) VALUES (?, ?, 'landing') ON CONFLICT (email) DO NOTHING")
      .run(email, SITE.consentVersion);
    return NextResponse.json({ ok: true, already: res.changes === 0 });
  } catch (err) {
    console.error("Înscriere pe lista de așteptare eșuată:", err);
    return NextResponse.json({ error: "Înscrierea nu a reușit. Încearcă din nou." }, { status: 500 });
  }
}
