import { NextRequest, NextResponse } from "next/server";
import { errorResponse } from "@/lib/http";
import { betaOnly } from "@/lib/importServer";
import { setIgnored } from "@/lib/scheduledServer";

export const dynamic = "force-dynamic";

/** Un abonament detectat greșit nu mai apare (sau reapare, cu `ignored: false`). */
export async function POST(req: NextRequest) {
  const blocked = betaOnly();
  if (blocked) return blocked;
  try {
    const body = await req.json();
    const key = String(body.key ?? "").trim();
    if (!/^[a-z& ]{3,80}$/.test(key)) return NextResponse.json({ error: "Abonament invalid." }, { status: 400 });
    await setIgnored(key, body.ignored !== false);
    return NextResponse.json({ ok: true });
  } catch (err) {
    return errorResponse(err, "Nu am putut salva alegerea.");
  }
}
