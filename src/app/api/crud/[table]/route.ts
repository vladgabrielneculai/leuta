import { NextRequest, NextResponse } from "next/server";
import { errorResponse, jsonError } from "@/lib/http";
import { getDb } from "@/lib/db";
import { insertRow, TABLES, updateRow, VALIDATE } from "@/lib/crud";
import { materializeQuietly } from "@/lib/scheduledServer";

export const dynamic = "force-dynamic";

// Numele tabelului ajunge în SQL, deci trebuie să fie exact o cheie proprie din TABLES (nu „constructor”, „toString”…).
function cfg(table: string) {
  if (!Object.hasOwn(TABLES, table)) throw new Error("Tabel necunoscut");
  return TABLES[table];
}

const MAX_TEXT = 5000;

function clean(body: Record<string, unknown>, columns: string[]) {
  const out: Record<string, unknown> = {};
  for (const col of columns) {
    if (!(col in body)) continue;
    let v = body[col];
    // Coloanele sunt text, numere sau date: obiectele/listele și textele uriașe nu au ce căuta aici.
    if (v !== null && typeof v === "object") throw new Error("Valoare invalidă");
    if (typeof v === "string" && v.length > MAX_TEXT) throw new Error("Textul este prea lung");
    if (typeof v === "boolean") v = v ? 1 : 0;
    // Postgres e strict la tipuri: un id/număr venit ca text gol devine null, nu ''.
    if (v === "" && (col.endsWith("_id") || col.endsWith("_date") || col === "deadline")) v = null;
    out[col] = v;
  }
  return out;
}

function fail(e: unknown) {
  return errorResponse(e, "Operația nu a reușit", 400);
}

export async function GET(req: NextRequest, context: { params: Promise<{ table: string }> }) {
  try {
    const { table } = await context.params;
    const c = cfg(table);
    if (table === "entries") await materializeQuietly(); // programările scadente (beta)
    const filters = c.filters.filter((f) => req.nextUrl.searchParams.has(f));
    const where = filters.length ? `WHERE ${filters.map((f) => `${f} = ?`).join(" AND ")}` : "";
    const vals = filters.map((f) => req.nextUrl.searchParams.get(f));
    return NextResponse.json(await (await getDb()).prepare(`SELECT * FROM ${table} ${where} ORDER BY ${c.order}`).all(...vals));
  } catch (e) {
    return fail(e);
  }
}

export async function POST(req: NextRequest, context: { params: Promise<{ table: string }> }) {
  try {
    const { table } = await context.params;
    const c = cfg(table);
    const data = clean(await req.json(), c.columns);
    VALIDATE[table]?.(data, true);

    const db = await getDb();
    // Categoriile nu se dublează: dacă există deja una cu același nume, se întoarce cea existentă.
    if (table === "categories") {
      data.name = String(data.name || "").trim();
      if (!data.name) throw new Error("Numele categoriei este obligatoriu");
      const existing = await db.prepare("SELECT * FROM categories WHERE LOWER(TRIM(name)) = LOWER(TRIM(?))").get(data.name);
      if (existing) return NextResponse.json(existing);
    }

    const info = await insertRow(db, table, data);
    return NextResponse.json(await db.prepare(`SELECT * FROM ${table} WHERE id = ?`).get(info.lastInsertRowid));
  } catch (e) {
    return fail(e);
  }
}

export async function PUT(req: NextRequest, context: { params: Promise<{ table: string }> }) {
  try {
    const { table } = await context.params;
    const c = cfg(table);
    const body = await req.json();
    const data = clean(body, c.columns);
    if (!body.id || !Object.keys(data).length) throw new Error("Lipsesc datele de actualizat");
    const db = await getDb();
    const validate = VALIDATE[table];
    if (validate) {
      const current = await db.prepare(`SELECT * FROM ${table} WHERE id = ?`).get<Record<string, unknown>>(body.id);
      if (!current) return jsonError("Înregistrarea nu există.", 404);
      validate(data, false, current);
    }

    // O categorie nu poate fi redenumită cu numele alteia existente.
    if (table === "categories" && data.name) {
      data.name = String(data.name).trim();
      if (!data.name) throw new Error("Numele categoriei nu poate fi gol");
      const dup = await db.prepare("SELECT id FROM categories WHERE LOWER(TRIM(name)) = LOWER(TRIM(?)) AND id != ?").get(data.name, body.id);
      if (dup) throw new Error(`Există deja o categorie cu denumirea „${data.name}”`);
    }

    await updateRow(db, table, body.id, data);
    const row = await db.prepare(`SELECT * FROM ${table} WHERE id = ?`).get(body.id);
    // Rând inexistent sau al altui cont (Postgres nu îl arată): răspuns clar, nu eroare internă.
    if (!row) return jsonError("Înregistrarea nu există.", 404);
    return NextResponse.json(row);
  } catch (e) {
    return fail(e);
  }
}

export async function DELETE(req: NextRequest, context: { params: Promise<{ table: string }> }) {
  try {
    const { table } = await context.params;
    cfg(table);
    const id = req.nextUrl.searchParams.get("id");
    if (!id || !/^\d+$/.test(id)) throw new Error("Lipsește id-ul");
    const res = await (await getDb()).prepare(`DELETE FROM ${table} WHERE id = ?`).run(Number(id));
    if (!res.changes) return jsonError("Înregistrarea nu există.", 404);
    return NextResponse.json({ ok: true });
  } catch (e) {
    return fail(e);
  }
}
