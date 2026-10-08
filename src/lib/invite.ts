/**
 * Codul de invitație din ce lipește omul: linkul întreg (…/inregistrare?cod=XYZ) sau doar codul. null dacă nu
 * arată a cod (aceeași formă ca la server, în auth.ts → findValidInvitation).
 */
export function parseInviteCode(input: string): string | null {
  const text = input.trim();
  let code = text;
  const m = /[?&]cod=([^&#\s]+)/.exec(text);
  if (m) {
    try {
      code = decodeURIComponent(m[1]);
    } catch {
      code = m[1];
    }
  }
  return /^[A-Za-z0-9_-]{20,64}$/.test(code) ? code : null;
}
