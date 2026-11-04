"use client";

import { useRef, useState, type ReactNode } from "react";
import { eur, lei, type Kind } from "@/lib/util";
import { dayOf, entryDay, restoreEntry, useQuickAdd, type QuickEntry } from "./QuickAdd";
import { useCards } from "./Cards";
import { api, Toast, useApp } from "./ui";
import { Icon } from "./Shell";

/**
 * Pe telefon, intrările unei luni ca o singură listă, pe zile (cele mai noi sus), ca într-o aplicație de bancă.
 * Atingi un rând ca să-l modifici; glisezi spre stânga ca să apară „Șterge” (cu „Anulează” în mesajul de jos).
 */

type Category = { id: number; name: string; color: string };
type Named = { id: number; name: string };

// Iconița rândului, după numele categoriei (sau al descrierii); altfel, după tipul intrării.
const ENTRY_ICON = {
  cart: "M3 4h2l2.4 11h10.2L20 8H6.3M9 20h.01M17 20h.01",
  car: "M5 16h14M6 16l1.5-5h9L18 16M7 19v-3M17 19v-3M8 13h.01M16 13h.01",
  bolt: "M13 3L5 14h6l-1 7 8-11h-6z",
  coffee: "M5 9h11v5a5 5 0 0 1-5 5h-1a5 5 0 0 1-5-5zM16 10h2a2 2 0 0 1 0 4h-2M8 3v3M12 3v3",
  home: "M3 12l9-8 9 8M5 10v10h5v-6h4v6h5V10",
  health: "M12 20s-7-4.4-7-10a4 4 0 0 1 7-2.6A4 4 0 0 1 19 10c0 5.6-7 10-7 10z",
  bag: "M5 8h14l-1 12H6zM9 8V6a3 3 0 0 1 6 0v2",
  repeat: "M17 2l4 4-4 4M3 11V9a3 3 0 0 1 3-3h15M7 22l-4-4 4-4M21 13v2a3 3 0 0 1-3 3H3",
  wallet: "M3 7h18v10H3zM12 9.5a2.5 2.5 0 1 0 0 5 2.5 2.5 0 0 0 0-5z",
  piggy: "M5 11a7 6 0 0 1 13 0v4l2 1v2h-3l-1 2h-3v-2h-3v2H7l-1-3a5 5 0 0 1-1-4zM15 9h.01",
  doc: "M7 3h7l4 4v14H7zM14 3v4h4M10 12h5M10 16h5",
  tag: "M3 12V4h8l9 9-8 8zM7.5 7.5h.01",
};
const ICON_RULES: [RegExp, keyof typeof ENTRY_ICON][] = [
  [/alim|mânc|manc|supermarket|kaufland|lidl|mega|carrefour|profi|tichet/i, "cart"],
  [/transp|benzin|carbur|uber|taxi|bolt|auto|mașin|masin|parcare/i, "car"],
  [/utilit|curent|enel|gaz|apă|apa|întreț|intret|internet|telefon|digi|orange|vodafone/i, "bolt"],
  [/ieșir|iesir|restaurant|cafe|cafea|bar|livrare|glovo|tazz/i, "coffee"],
  [/chiri|locuin|casă|casa|ipotec/i, "home"],
  [/sănăt|sanat|farm|medic|sport|sală|sala/i, "health"],
  [/haine|îmbrăc|imbrac|cumpăr|cumpar|cadou|shopping/i, "bag"],
  [/abonam|netflix|spotify|hbo|youtube|icloud/i, "repeat"],
];
const KIND_ICON: Record<Kind, keyof typeof ENTRY_ICON> = { income: "wallet", saving: "piggy", fixed: "doc", variable: "tag" };
function iconFor(kind: Kind, ...names: (string | null | undefined)[]) {
  const text = names.filter(Boolean).join(" ");
  return ENTRY_ICON[ICON_RULES.find(([re]) => re.test(text))?.[1] ?? KIND_ICON[kind]];
}

const KIND_COLOR: Record<Kind, string> = {
  income: "var(--c-leu)",
  fixed: "var(--c-albastru)",
  variable: "var(--c-rosu)",
  saving: "var(--c-galben)",
};

/** „Azi”, „Ieri” sau „marți, 4 noiembrie”. */
function dayLabel(day: string) {
  const today = new Date();
  const yesterday = new Date(today.getFullYear(), today.getMonth(), today.getDate() - 1);
  if (day === dayOf(today)) return "Azi";
  if (day === dayOf(yesterday)) return "Ieri";
  const [y, m, d] = day.split("-").map(Number);
  return new Date(y, m - 1, d).toLocaleDateString("ro-RO", { weekday: "long", day: "numeric", month: "long" });
}

const SWIPE = 88; // lățimea butonului „Șterge” descoperit prin glisare

function SwipeRow({ children, onTap, onDelete, label }: { children: ReactNode; onTap: () => void; onDelete: () => void; label: string }) {
  const [dx, setDx] = useState(0);
  const [dragging, setDragging] = useState(false);
  const touch = useRef<{ x: number; y: number; dx0: number; horiz: boolean | null } | null>(null);
  return (
    <div className="relative overflow-hidden">
      <button
        type="button"
        className="absolute inset-y-0 right-0 flex items-center justify-center bg-rosu text-[14px] font-semibold text-sheet"
        style={{ width: SWIPE }}
        onClick={onDelete}
        tabIndex={dx ? 0 : -1}
        aria-hidden={!dx}
      >
        Șterge
      </button>
      <button
        type="button"
        className={`relative flex min-h-[56px] w-full touch-pan-y items-center gap-3 bg-sheet px-3.5 py-2 text-left active:bg-paper ${dragging ? "" : "transition-transform duration-200"}`}
        style={{ transform: `translateX(${dx}px)` }}
        aria-label={label}
        onClick={() => (dx ? setDx(0) : onTap())}
        onTouchStart={(e) => {
          touch.current = { x: e.touches[0].clientX, y: e.touches[0].clientY, dx0: dx, horiz: null };
        }}
        onTouchMove={(e) => {
          const t = touch.current;
          if (!t) return;
          const mx = e.touches[0].clientX - t.x;
          const my = e.touches[0].clientY - t.y;
          // Decidem o singură dată dacă e glisare orizontală sau derulare a paginii.
          if (t.horiz === null && (Math.abs(mx) > 8 || Math.abs(my) > 8)) t.horiz = Math.abs(mx) > Math.abs(my);
          if (!t.horiz) return;
          setDragging(true);
          setDx(Math.max(-SWIPE, Math.min(0, t.dx0 + mx)));
        }}
        onTouchEnd={() => {
          const t = touch.current;
          touch.current = null;
          setDragging(false);
          if (t?.horiz) setDx((v) => (v < -SWIPE / 2 ? -SWIPE : 0));
        }}
      >
        {children}
      </button>
    </div>
  );
}

export function EntryFeed({
  entries,
  cats,
  goals,
  invs,
  rate,
  onChanged,
  limit,
  empty,
}: {
  entries: QuickEntry[];
  cats: Category[];
  goals: Named[];
  invs: Named[];
  rate: number;
  onChanged?: () => void;
  /** Doar ultimele N intrări (pe Acasă). */
  limit?: number;
  empty?: ReactNode;
}) {
  const quickAdd = useQuickAdd();
  const { bump, cycle } = useApp();
  const [toast, setToast] = useState<{ text: string; undo?: () => void } | null>(null);
  const catMap = new Map(cats.map((c) => [c.id, c]));
  const { data: cards } = useCards();
  const cardName = (e: QuickEntry) => (e.card_id ? cards?.find((c) => c.id === e.card_id)?.name ?? null : null);

  const nameOf = (e: QuickEntry) =>
    e.kind === "saving"
      ? `${e.amount < 0 ? "Retragere din " : ""}${(e.goal_id ? goals.find((g) => g.id === e.goal_id)?.name : e.investment_id ? invs.find((i) => i.id === e.investment_id)?.name : null) ?? "Economii generale"}`
      : catMap.get(e.category_id ?? 0)?.name ?? "Fără categorie";

  // Cele mai noi sus: după zi, apoi după ordinea adăugării.
  const sorted = entries
    .map((e) => ({ e, day: entryDay(e, cycle) }))
    .sort((a, b) => (a.day === b.day ? b.e.id - a.e.id : a.day < b.day ? 1 : -1))
    .slice(0, limit ?? Infinity);
  const days: { day: string; items: QuickEntry[] }[] = [];
  for (const { e, day } of sorted) {
    const last = days[days.length - 1];
    if (last?.day === day) last.items.push(e);
    else days.push({ day, items: [e] });
  }

  const remove = async (e: QuickEntry) => {
    try {
      await api(`/api/crud/entries?id=${e.id}`, "DELETE");
      bump();
      onChanged?.();
      setToast({
        text: `Șters: ${e.description || nameOf(e)}`,
        undo: async () => {
          try {
            await restoreEntry(e, cycle);
            bump();
            onChanged?.();
          } catch (err) {
            setToast({ text: (err as Error).message });
          }
        },
      });
    } catch (err) {
      setToast({ text: (err as Error).message });
    }
  };

  if (sorted.length === 0) return <>{empty}</>;

  return (
    <div className="flex flex-col gap-3">
      {days.map(({ day, items }) => {
        const out = items.filter((e) => e.kind === "variable" || e.kind === "fixed").reduce((a, e) => a + (e.currency === "EUR" ? e.amount * rate : e.amount), 0);
        return (
          <section key={day}>
            <div className="mb-1 flex items-baseline justify-between px-1 text-[12px]">
              <h3 className="font-medium capitalize text-ink-soft">{dayLabel(day)}</h3>
              {out !== 0 && <span className="num text-ink-faint">−{lei(out)}</span>}
            </div>
            <ul className="overflow-hidden rounded-2xl border border-line">
              {items.map((e) => {
                const name = nameOf(e);
                const sum = e.currency === "EUR" ? eur(e.amount) : lei(e.amount);
                const color = e.kind === "saving" ? KIND_COLOR.saving : catMap.get(e.category_id ?? 0)?.color ?? KIND_COLOR[e.kind];
                return (
                  <li key={e.id} className="border-b border-line last:border-b-0">
                    <SwipeRow label={`${name}, ${sum}. Atinge ca să modifici.`} onTap={() => quickAdd({ entry: e })} onDelete={() => remove(e)}>
                      {/* Iconiță pe o dală în culoarea categoriei (culorile bancnotelor), foarte deschisă. */}
                      <span
                        className="flex h-9 w-9 shrink-0 items-center justify-center rounded-[10px]"
                        style={{ color, background: `color-mix(in srgb, ${color} 13%, var(--c-sheet))` }}
                        aria-hidden
                      >
                        <Icon d={iconFor(e.kind, name, e.description)} className="h-[18px] w-[18px]" strokeWidth={1.7} />
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-[14.5px] text-ink">{e.description || name}</span>
                        <span className="block truncate text-[12px] text-ink-faint">
                          {[e.description ? name : null, cardName(e) ? cardName(e) : null, e.recurring ? "↻ lunar" : null, e.amount < 0 && e.kind !== "saving" ? "↩ retur" : null].filter(Boolean).join(" · ") ||
                            { income: "Venit", fixed: "Cost fix", variable: "Cheltuială", saving: "Economii" }[e.kind]}
                        </span>
                      </span>
                      <span className={`num shrink-0 text-[14.5px] font-semibold ${e.kind === "income" || (e.amount < 0 && e.kind !== "saving") ? "text-leu" : e.amount < 0 ? "text-rosu" : "text-ink"}`}>
                        {e.kind === "income" ? "+" : ""}
                        {sum}
                      </span>
                    </SwipeRow>
                  </li>
                );
              })}
            </ul>
          </section>
        );
      })}
      <Toast
        message={toast?.text ?? null}
        onDone={() => setToast(null)}
        action={
          toast?.undo
            ? {
                label: "Anulează",
                onClick: () => {
                  const u = toast.undo!;
                  setToast(null);
                  u();
                },
              }
            : undefined
        }
      />
    </div>
  );
}
