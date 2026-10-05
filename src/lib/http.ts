import { NextResponse } from "next/server";

/**
 * Mesajul care poate ajunge la client. Erorile aruncate de codul aplicației (validări, mesaje în română)
 * trec neschimbate; erorile bazei de date sau ale sistemului (au `code`, ex. pg „23505”, „ECONNRESET”)
 * pot dezvălui structura internă, deci se înlocuiesc cu un mesaj generic și se scriu doar în log.
 */
export function publicMessage(err: unknown, fallback: string): string {
  if (err instanceof Error && err.constructor === Error && !("code" in err)) return err.message;
  console.error(fallback, err);
  return fallback;
}

export function errorResponse(err: unknown, fallback: string, status = 500) {
  return NextResponse.json({ error: publicMessage(err, fallback) }, { status });
}

/** Limita pentru fișierele încărcate (grafice de rambursare, backup-uri). */
export const MAX_UPLOAD_BYTES = 10 * 1024 * 1024;
