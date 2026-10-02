import { NextRequest, NextResponse } from "next/server";
import { getDb } from "@/lib/db";

export const dynamic = "force-dynamic";

export async function GET() {
  return NextResponse.json(await (await getDb()).prepare("SELECT * FROM investment_values ORDER BY month").all());
}

export async function POST(req: NextRequest) {
  const { investment_id, month, value } = await req.json();
  await (await getDb())
    .prepare(
      "INSERT INTO investment_values (investment_id, month, value) VALUES (?, ?, ?) ON CONFLICT (investment_id, month) DO UPDATE SET value = EXCLUDED.value",
    )
    .run(investment_id, month, value);
  return NextResponse.json({ ok: true });
}

export async function DELETE(req: NextRequest) {
  const id = req.nextUrl.searchParams.get("investment_id");
  const month = req.nextUrl.searchParams.get("month");
  await (await getDb()).prepare("DELETE FROM investment_values WHERE investment_id = ? AND month = ?").run(id, month);
  return NextResponse.json({ ok: true });
}
