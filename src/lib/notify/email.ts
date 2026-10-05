/**
 * Trimiterea emailurilor prin Resend (plan gratuit). Cheia: RESEND_API_KEY în Vercel.
 * Expeditorul implicit `onboarding@resend.dev` poate trimite doar către adresa contului Resend;
 * pentru altă adresă se verifică un domeniu propriu în Resend și se setează RESEND_FROM.
 */

const RESEND_API = process.env.RESEND_API_BASE || "https://api.resend.com";

export const emailConfigured = () => !!process.env.RESEND_API_KEY;

export async function sendEmail(
  to: string,
  subject: string,
  html: string,
  text: string,
  attachments: { filename: string; content: Uint8Array }[] = [],
) {
  const key = process.env.RESEND_API_KEY;
  if (!key) throw new Error("Emailul nu e configurat (lipsește RESEND_API_KEY).");
  const r = await fetch(`${RESEND_API}/emails`, {
    method: "POST",
    headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      from: process.env.RESEND_FROM || "Leuța <onboarding@resend.dev>",
      to: [to],
      subject,
      html,
      text,
      ...(attachments.length
        ? { attachments: attachments.map((a) => ({ filename: a.filename, content: Buffer.from(a.content).toString("base64") })) }
        : {}),
    }),
    signal: AbortSignal.timeout(10000),
  });
  if (!r.ok) {
    const j = (await r.json().catch(() => ({}))) as { message?: string };
    throw new Error(`Email: ${j.message ?? r.status}`);
  }
}

export const isEmail = (s: string) => /^[^\s@<>]+@[^\s@<>]+\.[^\s@<>]+$/.test(s) && s.length <= 200;
