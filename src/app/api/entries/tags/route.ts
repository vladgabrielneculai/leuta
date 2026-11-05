import { NextRequest, NextResponse } from "next/server";
import { getDb } from "@/lib/db";
import { cleanTagNames } from "@/lib/entrySearch";
import { errorResponse, jsonError } from "@/lib/http";

export const dynamic = "force-dynamic";


/** Etichetele unei intrări: `?entry_id=12`. */
export async function GET(req: NextRequest) {
  const id = req.nextUrl.searchParams.get("entry_id");
  if (!id || !/^\d+$/.test(id)) return jsonError("Lipsește intrarea.");
  try {
    const rows = await (await getDb())
      .prepare("SELECT t.id, t.name, t.color FROM entry_tags et JOIN tags t ON t.id = et.tag_id WHERE et.entry_id = ? ORDER BY lower(t.name)")
      .all(Number(id));
    return NextResponse.json(rows);
  } catch (e) {
    return errorResponse(e, "Etichetele nu au putut fi încărcate");
  }
}

/**
 * Înlocuiește etichetele unor intrări: { entry_ids: [12, 13], tags: ["vacanță", "cadou"] } (mai multe id-uri la
 * plata împărțită). Etichetele noi se creează, cele existente se refolosesc după nume. RLS-ul tabelului
 * entry_tags verifică faptul că intrările și etichetele sunt ale tale.
 */
export async function PUT(req: NextRequest) {
  try {
    const body = await req.json();
    const ids: number[] = (Array.isArray(body.entry_ids) ? body.entry_ids : [body.entry_id]).map(Number);
    if (!ids.length || ids.length > 10 || ids.some((i) => !Number.isInteger(i) || i <= 0)) throw new Error("Lipsește intrarea.");
    const names = cleanTagNames(body.tags);
    const db = await getDb();
    await db.transaction(async (tx) => {
      const tagIds: number[] = [];
      for (const name of names) {
        await tx.prepare("INSERT INTO tags (name) VALUES (?) ON CONFLICT (user_id, lower(trim(name))) DO NOTHING").run(name);
        const tag = await tx.prepare("SELECT id FROM tags WHERE lower(trim(name)) = lower(trim(?))").get<{ id: number }>(name);
        if (tag) tagIds.push(tag.id);
      }
      for (const entryId of ids) {
        const entry = await tx.prepare("SELECT id FROM entries WHERE id = ?").get(entryId);
        if (!entry) throw new Error("Intrarea nu există.");
        await tx.prepare("DELETE FROM entry_tags WHERE entry_id = ?").run(entryId);
        for (const tagId of tagIds) await tx.prepare("INSERT INTO entry_tags (entry_id, tag_id) VALUES (?, ?) ON CONFLICT DO NOTHING").run(entryId, tagId);
      }
    });
    return NextResponse.json({ ok: true, tags: names });
  } catch (e) {
    return errorResponse(e, "Etichetele nu au putut fi salvate", 400);
  }
}
