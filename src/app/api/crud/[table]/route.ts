import { NextRequest, NextResponse } from "next/server";
import { getDb } from "@/lib/db";
import { TABLES } from "@/lib/crud";

export const dynamic = "force-dynamic";

function cfg(table: string) {
  const c = TABLES[table];
  if (!c) throw new Error("Tabel necunoscut");
  return c;
}

function clean(body: Record<string, unknown>, columns: string[]) {
  const out: Record<string, unknown> = {};
  for (const col of columns) {
    if (!(col in body)) continue;
    let v = body[col];
    if (v === "" && (col.endsWith("_id") || col === "deadline")) v = null;
    if (typeof v === "boolean") v = v ? 1 : 0;
    // Postgres e strict la tipuri: un id/număr venit ca text gol devine null, nu ''.
    if (v === "" && (col.endsWith("_id") || col.endsWith("_date") || col === "deadline")) v = null;
    out[col] = v;
  }
  return out;
}

function fail(e: unknown) {
  return NextResponse.json({ error: e instanceof Error ? e.message : "Operația nu a reușit" }, { status: 400 });
}

export async function GET(req: NextRequest, context: { params: Promise<{ table: string }> }) {
  try {
    const { table } = await context.params;
    const c = cfg(table);
    const where: string[] = [];
    const vals: unknown[] = [];
    for (const f of c.filters) {
      const v = req.nextUrl.searchParams.get(f);
      if (v !== null) {
        where.push(`${f} = ?`);
        vals.push(v);
      }
    }
    const sql = `SELECT * FROM ${table} ${where.length ? "WHERE " + where.join(" AND ") : ""} ORDER BY ${c.order}`;
    return NextResponse.json(await (await getDb()).prepare(sql).all(...vals));
  } catch (e) {
    return fail(e);
  }
}

export async function POST(req: NextRequest, context: { params: Promise<{ table: string }> }) {
  try {
    const { table } = await context.params;
    const c = cfg(table);
    const data = clean(await req.json(), c.columns);

    // Verificare specifică pentru categorii: doar dacă nu există deja, se creează
    if (table === "categories") {
      const rawName = String(data.name || "").trim();
      if (!rawName) throw new Error("Numele categoriei este obligatoriu");
      data.name = rawName;

      const existing = await (await getDb())
        .prepare("SELECT * FROM categories WHERE LOWER(TRIM(name)) = LOWER(TRIM(?))")
        .get(rawName);

      if (existing) {
        // Categoria există deja! Nu se creează duplicat, se returnează cea existentă.
        return NextResponse.json(existing);
      }
    }

    const keys = Object.keys(data);
    const db = await getDb();
    const info = await db
      .prepare(`INSERT INTO ${table} (${keys.join(",")}) VALUES (${keys.map(() => "?").join(",")})`)
      .run(...keys.map((k) => data[k]));
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
    const keys = Object.keys(data);
    if (!body.id || !keys.length) throw new Error("Lipsesc datele de actualizat");

    // Verificare specifică la modificare categorii: previne redenumirea într-o categorie deja existentă
    if (table === "categories" && data.name) {
      const rawName = String(data.name).trim();
      if (!rawName) throw new Error("Numele categoriei nu poate fi gol");
      data.name = rawName;

      const dup = await (await getDb())
        .prepare("SELECT id FROM categories WHERE LOWER(TRIM(name)) = LOWER(TRIM(?)) AND id != ?")
        .get(rawName, body.id);

      if (dup) {
        throw new Error(`Există deja o categorie cu denumirea „${rawName}”`);
      }
    }

    const db = await getDb();
    await db
      .prepare(`UPDATE ${table} SET ${keys.map((k) => `${k} = ?`).join(", ")} WHERE id = ?`)
      .run(...keys.map((k) => data[k]), body.id);
    const row = await db.prepare(`SELECT * FROM ${table} WHERE id = ?`).get(body.id);
    // Rând inexistent sau al altui cont (Postgres nu îl arată): răspuns clar, nu eroare internă.
    if (!row) return NextResponse.json({ error: "Înregistrarea nu există." }, { status: 404 });
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
    if (!id) throw new Error("Lipsește id-ul");
    const res = await (await getDb()).prepare(`DELETE FROM ${table} WHERE id = ?`).run(Number(id));
    if (!res.changes) return NextResponse.json({ error: "Înregistrarea nu există." }, { status: 404 });
    return NextResponse.json({ ok: true });
  } catch (e) {
    return fail(e);
  }
}
