import crypto from "crypto";
import { NextRequest, NextResponse } from "next/server";
import { appUrl, jsonError } from "@/lib/http";
import { getSystemDb } from "@/lib/db";
import { runForUser } from "@/lib/notify/notifications";
import { localNow } from "@/lib/notify/time";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

function authorized(req: NextRequest) {
  const secret = process.env.CRON_SECRET;
  const header = req.headers.get("authorization") ?? "";
  if (!secret) return false;
  const a = Buffer.from(header);
  const b = Buffer.from(`Bearer ${secret}`);
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

/**
 * Rulat de Vercel Cron de două ori pe zi (18:00 și 19:00 UTC), ca să prindă 21:00 în România
 * atât vara (UTC+3), cât și iarna (UTC+2). Rularea care nu cade la ora 21 locală nu face nimic.
 */
export async function GET(req: NextRequest) {
  if (!authorized(req)) return jsonError("Neautorizat.", 401);
  const now = localNow();
  const force = req.nextUrl.searchParams.get("force") === "1";
  if (now.hour !== 21 && !force) return NextResponse.json({ skipped: true, localHour: now.hour });

  const users = await (await getSystemDb()).prepare("SELECT id FROM users WHERE disabled_at IS NULL ORDER BY id").all<{ id: number }>();
  const results: Record<number, unknown> = {};
  for (const u of users) {
    try {
      results[u.id] = await runForUser(u.id, appUrl(req));
    } catch (e) {
      console.error(`Notificări eșuate pentru utilizatorul ${u.id}:`, e);
      results[u.id] = { error: true };
    }
  }
  // Jurnalul de notificări se păstrează 400 de zile (deduplicare pe lună/an).
  await (await getSystemDb()).prepare("DELETE FROM notification_log WHERE sent_at < now() - interval '400 days'").run();
  // Lista de așteptare se păstrează cel mult 12 luni de la înscriere (Politica de confidențialitate a site-ului).
  await (await getSystemDb())
    .prepare("DELETE FROM waitlist WHERE created_at < now() - interval '12 months'")
    .run()
    .catch((e) => console.error("Curățarea listei de așteptare a eșuat:", e));
  return NextResponse.json({ ok: true, date: now.date, results });
}
