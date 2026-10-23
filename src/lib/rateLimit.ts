/**
 * Limită de cereri per IP (fereastră fixă), ținută în memoria instanței serverului.
 *
 * E o primă barieră ieftină împotriva rafalelor (un script care bate la login sau la API de sute de ori
 * pe secundă): pe Vercel, o instanță caldă primește majoritatea cererilor aceluiași client. Nu e o limită
 * globală exactă (fiecare instanță are contorul ei), deci protecțiile din baza de date rămân: blocarea
 * după parole greșite (auth.ts) și limita listei de așteptare (api/waitlist).
 */

type Bucket = { count: number; resetAt: number };

const buckets = new Map<string, Bucket>();
// Memoria rămâne mică și sub un atac din multe IP-uri: peste prag, contoarele expirate se șterg.
const MAX_KEYS = 10_000;

export function rateLimit(key: string, limit: number, windowMs: number, now = Date.now()): { ok: boolean; retryAfterSec: number } {
  let b = buckets.get(key);
  if (!b || b.resetAt <= now) {
    if (buckets.size >= MAX_KEYS) {
      for (const [k, v] of buckets) if (v.resetAt <= now) buckets.delete(k);
      if (buckets.size >= MAX_KEYS) buckets.clear();
    }
    b = { count: 0, resetAt: now + windowMs };
    buckets.set(key, b);
  }
  b.count++;
  return { ok: b.count <= limit, retryAfterSec: Math.max(1, Math.ceil((b.resetAt - now) / 1000)) };
}
