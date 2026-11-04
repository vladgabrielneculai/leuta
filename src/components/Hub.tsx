"use client";

import Link from "next/link";
import type { NavItem } from "./nav";
import { Icon } from "./Shell";

/**
 * Pe telefon, paginile-hub („Planuri”, „Eu”) sunt liste de rânduri mari: iconiță, nume și o frază despre secțiune.
 * Se citesc dintr-o privire și se ating ușor cu degetul mare.
 */
export function HubList({ title, items }: { title?: string; items: NavItem[] }) {
  return (
    <section className="mb-5">
      {title && <h2 className="mb-1.5 px-1 font-mono text-[10.5px] font-medium uppercase tracking-widest text-ink-faint">{title}</h2>}
      <ul className="overflow-hidden rounded-md border border-line bg-sheet">
        {items.map((n) => (
          <li key={n.href} className="border-b border-line last:border-b-0">
            <Link href={n.href} className="flex min-h-[60px] items-center gap-3 px-3.5 py-2.5 active:bg-paper">
              <span className="relative flex h-9 w-9 shrink-0 items-center justify-center rounded-md bg-paper text-ink">
                <Icon d={n.icon} className="h-5 w-5" />
                <span className="absolute -bottom-0.5 left-1/2 h-[3px] w-4 -translate-x-1/2 rounded-full" style={{ background: n.color }} aria-hidden />
              </span>
              <span className="min-w-0 flex-1">
                <span className="block text-[15px] font-medium text-ink">{n.label}</span>
                {n.hint && <span className="block truncate text-[12.5px] text-ink-soft">{n.hint}</span>}
              </span>
              <span className="shrink-0 text-[18px] text-ink-faint" aria-hidden>›</span>
            </Link>
          </li>
        ))}
      </ul>
    </section>
  );
}
