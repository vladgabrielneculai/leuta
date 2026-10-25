import { NextRequest, NextResponse } from "next/server";
import { getCurrentSession } from "@/lib/auth";
import { appUrl, errorResponse, jsonError } from "@/lib/http";
import { NOTIFY_KINDS, type Channel, type NotifyKind } from "@/lib/notify/kinds";
import { testMessage } from "@/lib/notify/notifications";

export const dynamic = "force-dynamic";
export const maxDuration = 30;

/** Trimite acum un mesaj de test (tip + canal), ca să vezi cum arată. */
export async function POST(req: NextRequest) {
  try {
    const session = await getCurrentSession();
    if (!session) return jsonError("Neautentificat.", 401);
    const body = (await req.json()) as { kind?: string; channel?: string };
    const kind = NOTIFY_KINDS.includes(body.kind as NotifyKind) ? (body.kind as NotifyKind) : "daily";
    const channel: Channel = body.channel === "email" ? "email" : "telegram";
    const sent = await testMessage(session.id, kind, channel, appUrl(req));
    if (!sent.length) return jsonError("Canalul nu e configurat pe server.");
    return NextResponse.json({ ok: true, sent });
  } catch (err) {
    return errorResponse(err, "Mesajul de test nu a putut fi trimis.");
  }
}
