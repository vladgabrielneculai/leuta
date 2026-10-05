"use client";

import { useEffect, useState } from "react";
import { KIND_INFO, NOTIFY_KINDS, type Channel, type NotifyKind, type NotifyPrefs } from "@/lib/notify/kinds";
import { api, Field, Panel, useConfirm } from "./ui";

type State = {
  prefs: NotifyPrefs;
  email: string;
  telegram: { configured: boolean; bot: string | null; linked: boolean; username: string | null; linkedAt: string | null };
  emailConfigured: boolean;
};

/**
 * Setări → Notificări: conectarea Telegram, adresa de email și, pentru fiecare tip de mesaj,
 * pe ce canal vine. Cu butoane de test pentru fiecare combinație.
 */
export default function NotificationSettings({ onToast }: { onToast: (msg: string) => void }) {
  const confirm = useConfirm();
  const [s, setS] = useState<State | null>(null);
  const [email, setEmail] = useState("");
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [linkUrl, setLinkUrl] = useState<string | null>(null);

  const load = () =>
    api<State>("/api/notifications").then((r) => {
      setS(r);
      setEmail(r.email);
    });

  useEffect(() => {
    load().catch((e) => setError(e.message));
  }, []);

  // Cât timp așteptăm confirmarea din Telegram, verificăm din câteva în câteva secunde.
  useEffect(() => {
    if (!linkUrl || s?.telegram.linked) return;
    const t = setInterval(() => load().catch(() => undefined), 4000);
    return () => clearInterval(t);
  }, [linkUrl, s?.telegram.linked]);

  const run = async (key: string, fn: () => Promise<void>) => {
    setError(null);
    setBusy(key);
    try {
      await fn();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Operația nu a reușit");
    } finally {
      setBusy(null);
    }
  };

  const toggle = (kind: NotifyKind, channel: Channel) =>
    run(`${kind}:${channel}`, async () => {
      if (!s) return;
      const prefs = { ...s.prefs, [kind]: { ...s.prefs[kind], [channel]: !s.prefs[kind][channel] } };
      setS({ ...s, prefs });
      await api("/api/notifications", "PUT", { prefs });
    });

  const saveEmail = () =>
    run("email", async () => {
      await api("/api/notifications", "PUT", { email });
      await load();
      onToast(email ? "Adresa de email a fost salvată" : "Emailurile au fost oprite");
    });

  const connectTelegram = () =>
    run("tg", async () => {
      const r = await api<{ url: string }>("/api/notifications/telegram", "POST");
      setLinkUrl(r.url);
      window.open(r.url, "_blank", "noopener");
    });

  const disconnectTelegram = async () => {
    if (!(await confirm({ title: "Deconectează Telegram", message: "Botul nu-ți va mai trimite mesaje și nu va mai accepta cheltuieli din chat. Continui?", confirmText: "Deconectează", danger: true }))) return;
    run("tg", async () => {
      await api("/api/notifications/telegram", "DELETE");
      setLinkUrl(null);
      await load();
      onToast("Telegram a fost deconectat");
    });
  };

  const test = (kind: NotifyKind, channel: Channel) =>
    run(`test:${kind}:${channel}`, async () => {
      await api("/api/notifications/test", "POST", { kind, channel });
      onToast(channel === "telegram" ? "Mesaj de test trimis pe Telegram" : `Email de test trimis la ${s?.email}`);
    });

  if (!s) {
    return (
      <Panel title="Notificări">
        <p className="text-[13px] text-ink-soft">{error ?? "Se încarcă…"}</p>
      </Panel>
    );
  }

  const tgReady = s.telegram.configured && s.telegram.linked;
  const emailReady = s.emailConfigured && !!s.email;
  const ready: Record<Channel, boolean> = { telegram: tgReady, email: emailReady };

  return (
    <Panel title="Notificări">
      {error && <div className="mb-3 rounded bg-rosu-tint p-2.5 text-[13px] font-medium text-rosu">{error}</div>}

      {/* Telegram */}
      <div className="mb-4 rounded-lg border border-line p-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <div className="text-[14px] font-semibold">✈️ Telegram</div>
            <div className="text-[12px] text-ink-soft">
              {!s.telegram.configured
                ? "Botul nu e configurat pe server (lipsește TELEGRAM_BOT_TOKEN în Vercel)."
                : s.telegram.linked
                  ? `Conectat${s.telegram.username ? ` ca @${s.telegram.username}` : ""} · bot @${s.telegram.bot ?? "…"}`
                  : "Reminder la 21:00, alerte și adăugare de cheltuieli din chat („45 mâncare”)."}
            </div>
          </div>
          {s.telegram.configured &&
            (s.telegram.linked ? (
              <button className="btn-ghost py-1 text-[13px]" onClick={disconnectTelegram} disabled={!!busy}>Deconectează</button>
            ) : (
              <button className="btn-primary py-1 text-[13px]" onClick={connectTelegram} disabled={!!busy}>
                {busy === "tg" ? "Se pregătește…" : "Conectează Telegram"}
              </button>
            ))}
        </div>
        {linkUrl && !s.telegram.linked && (
          <p className="mt-2 rounded-md bg-albastru-tint p-2.5 text-[12.5px]">
            S-a deschis Telegram: apasă <b>Start</b> în conversația cu botul. Dacă nu s-a deschis,{" "}
            <a className="font-semibold text-albastru underline" href={linkUrl} target="_blank" rel="noopener noreferrer">deschide linkul</a>{" "}
            (valabil 15 minute). Pagina se actualizează singură după conectare.
          </p>
        )}
      </div>

      {/* Email */}
      <div className="mb-4 rounded-lg border border-line p-3">
        <div className="mb-2 text-[14px] font-semibold">✉️ Email</div>
        {!s.emailConfigured && (
          <p className="mb-2 text-[12px] text-ink-soft">Emailul nu e configurat pe server (lipsește RESEND_API_KEY în Vercel).</p>
        )}
        <form
          className="flex flex-wrap items-end gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            saveEmail();
          }}
        >
          <div className="min-w-[200px] flex-1">
            <Field label="Adresa pentru rezumate și alerte">
              <input className="field" type="email" autoComplete="email" placeholder="nume@exemplu.ro" value={email} onChange={(e) => setEmail(e.target.value)} />
            </Field>
          </div>
          <button className="btn-primary" type="submit" disabled={!!busy || email === s.email}>Salvează</button>
        </form>
      </div>

      {/* Ce vine pe ce canal */}
      <div className="overflow-x-auto">
        <table className="w-full text-left text-[13px]">
          <thead className="text-[12px] text-ink-soft">
            <tr>
              <th className="py-1.5 pr-2 font-medium">Mesaj</th>
              <th className="px-2 py-1.5 text-center font-medium">Telegram</th>
              <th className="px-2 py-1.5 text-center font-medium">Email</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-line">
            {NOTIFY_KINDS.map((k) => (
              <tr key={k}>
                <td className="py-2 pr-2">
                  <div className="font-medium">{KIND_INFO[k].label}</div>
                  <div className="text-[12px] text-ink-soft">{KIND_INFO[k].description}</div>
                </td>
                {(["telegram", "email"] as const).map((c) => (
                  <td key={c} className="px-2 py-2 text-center align-middle">
                    <input
                      type="checkbox"
                      className="h-4 w-4 accent-leu"
                      checked={s.prefs[k][c]}
                      onChange={() => toggle(k, c)}
                      disabled={!!busy}
                      aria-label={`${KIND_INFO[k].label} pe ${c}`}
                    />
                    {s.prefs[k][c] && ready[c] && (
                      <button className="mt-1 block w-full text-[11px] text-albastru hover:underline" onClick={() => test(k, c)} disabled={!!busy}>
                        {busy === `test:${k}:${c}` ? "se trimite…" : "test"}
                      </button>
                    )}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="mt-3 text-[12px] text-ink-faint">
        Mesajele pleacă seara în jurul orei 21:00 (ora României). Rezumatul săptămânal vine duminica, bilanțul lunii pe 1 ale lunii.
      </p>
    </Panel>
  );
}
