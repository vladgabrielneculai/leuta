import crypto from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import { getSystemDb } from "@/lib/db";
import { isEmail } from "@/lib/notify/email";

export const dynamic = "force-dynamic";

/**
 * Înscrierea pe lista de așteptare, apelată doar de serverul site-ului de prezentare (leuta-landing-page).
 * Cererea trebuie să aibă cheia comună WAITLIST_KEY în headerul `x-waitlist-key`; fără cheie configurată,
 * lista e închisă. IP-ul vizitatorului vine de la site în `x-waitlist-client-ip` (de încredere doar
 * după verificarea cheii) și limitează încercările: 5 pe oră per IP.
 */

const MAX_PER_HOUR = 5;

function keyMatches(given: string | null) {
  const key = process.env.WAITLIST_KEY;
  if (!key || !given) return false;
  const a = crypto.createHash("sha256").update(given).digest();
  const b = crypto.createHash("sha256").update(key).digest();
  return crypto.timingSafeEqual(a, b);
}

export async function POST(req: NextRequest) {
  if (!process.env.WAITLIST_KEY) return NextResponse.json({ error: "Lista de așteptare nu este încă deschisă." }, { status: 503 });
  if (!keyMatches(req.headers.get("x-waitlist-key"))) return NextResponse.json({ error: "Neautorizat." }, { status: 401 });

  const body = await req.json().catch(() => ({}));
  const email = String(body.email ?? "").trim().toLowerCase();
  const consentVersion = String(body.consent_version ?? "").trim().slice(0, 40);
  const source = String(body.source ?? "landing").trim().slice(0, 40) || "landing";
  if (!isEmail(email)) return NextResponse.json({ error: "Adresa de email nu pare corectă." }, { status: 400 });
  if (!consentVersion) return NextResponse.json({ error: "Lipsește acordul." }, { status: 400 });

  const ip = (req.headers.get("x-waitlist-client-ip") ?? "").slice(0, 64) || "necunoscut";
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
      .prepare("INSERT INTO waitlist (email, consent_version, source) VALUES (?, ?, ?) ON CONFLICT (email) DO NOTHING")
      .run(email, consentVersion, source);
    return NextResponse.json({ ok: true, already: res.changes === 0 });
  } catch (err) {
    console.error("Înscriere pe lista de așteptare eșuată:", err);
    return NextResponse.json({ error: "Înscrierea nu a reușit. Încearcă din nou." }, { status: 500 });
  }
}
