import { NextResponse } from "next/server";
import { requireRecentAuth } from "@/lib/auth";
import { getDb, getSystemDb } from "@/lib/db";
import { errorResponse } from "@/lib/http";

export const dynamic = "force-dynamic";

/**
 * Toate datele contului, într-un singur fișier JSON (dreptul de acces și de portabilitate, art. 15 și 20 GDPR).
 * Spre deosebire de backup (Setări → Exportă JSON), care conține doar datele financiare și se poate restaura,
 * aici intră și contul, profilul, notificările și istoricul de securitate. Hash-urile (parolă, coduri de
 * recuperare, sesiuni), cheia 2FA și cheile Face ID / amprentă nu se exportă: nu sunt date despre tine, ci mecanisme de acces.
 */

const FINANCIAL = [
  "categories", "goals", "investments", "loans", "entries",
  "investment_values", "loan_prepayments", "loan_schedules", "planned_purchases",
] as const;

const strip = (rows: Record<string, unknown>[]) => rows.map(({ user_id: _owner, ...rest }) => rest);

export async function GET() {
  const auth = await requireRecentAuth();
  if ("response" in auth) return auth.response;
  const uid = auth.session.id;
  try {
    const db = await getDb(); // datele financiare: Postgres le filtrează pe utilizator (RLS)
    const sys = await getSystemDb();

    const financial: Record<string, unknown[]> = {};
    for (const t of FINANCIAL) financial[t] = strip(await db.prepare(`SELECT * FROM ${t}`).all<Record<string, unknown>>());

    const data = {
      account: await sys.prepare("SELECT username, created_at, is_admin, disabled_at FROM users WHERE id = ?").get(uid),
      profile: (await db.prepare("SELECT * FROM user_profiles").get<Record<string, unknown>>().then((r) => (r ? strip([r])[0] : null))) ?? null,
      settings: await db.prepare("SELECT key, value FROM user_settings").all(),
      financial,
      notifications: {
        telegram: await sys.prepare("SELECT username, linked_at FROM telegram_links WHERE user_id = ?").get(uid) ?? null,
        sent: await sys.prepare("SELECT kind, period_key, channels, sent_at FROM notification_log WHERE user_id = ? ORDER BY sent_at DESC").all(uid),
      },
      security: {
        two_factor_enabled_at: (await sys.prepare("SELECT totp_enabled_at FROM users WHERE id = ?").get<{ totp_enabled_at: string | null }>(uid))?.totp_enabled_at ?? null,
        biometric_devices: await sys
          .prepare("SELECT name, device_type, backed_up, created_at, last_used_at FROM webauthn_credentials WHERE user_id = ? ORDER BY created_at")
          .all(uid),
        recovery_codes_last_checked: (await sys.prepare("SELECT recovery_checked_at FROM users WHERE id = ?").get<{ recovery_checked_at: string | null }>(uid))?.recovery_checked_at ?? null,
        recovery_codes_unused: (await sys.prepare("SELECT COUNT(*)::int AS c FROM recovery_codes WHERE user_id = ? AND used_at IS NULL").get<{ c: number }>(uid))?.c ?? 0,
        sessions: await sys
          .prepare("SELECT created_at, expires_at, last_seen_at, ip, user_agent, location, method FROM sessions WHERE user_id = ? ORDER BY created_at DESC")
          .all(uid),
        login_history: await sys
          .prepare("SELECT created_at, success, method, reason, ip, user_agent, location FROM login_events WHERE user_id = ? ORDER BY created_at DESC")
          .all(uid),
      },
    };

    const stamp = new Date().toISOString().slice(0, 10);
    return new NextResponse(JSON.stringify({ format: "leuta-export", version: 1, exported: new Date().toISOString(), data }, null, 2), {
      headers: {
        "Content-Type": "application/json",
        "Content-Disposition": `attachment; filename="leuta-datele-mele-${stamp}.json"`,
      },
    });
  } catch (err) {
    return errorResponse(err, "Exportul nu a putut fi generat.");
  }
}
