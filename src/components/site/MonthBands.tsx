import { money } from "@/lib/site/format";
import Reveal from "./Reveal";
import { DEMO } from "./demo";

const PARTS = [
  { label: "Costuri fixe", value: DEMO.fixed, color: "var(--c-albastru)", text: "Chirie, abonamente, utilități." },
  { label: "Rate credite", value: DEMO.loans, color: "var(--c-mov)", text: "Cu dobânda și soldul rămas." },
  { label: "Cheltuieli", value: DEMO.budget, color: "var(--c-rosu)", text: "Mâncare, transport, ieșiri." },
  { label: "Economii", value: DEMO.saving, color: "var(--c-galben)", text: "Puse deoparte la început." },
];
const FREE = DEMO.income - PARTS.reduce((s, p) => s + p.value, 0);

const STEPS = [
  { tag: "1 · Adaugi", title: "Trei atingeri", text: "Apeși „+”, scrii suma, alegi categoria. Cele folosite des sunt primele." },
  { tag: "2 · Vezi", title: "Luna, pe zile", text: "Toate intrările într-o listă, ca la bancă. Glisezi ca să ștergi, atingi ca să modifici." },
  { tag: "3 · Plănuiești", title: "Credite și economii", text: "Rate, plăți anticipate, fondul de urgență și „Îmi permit?” înainte de o achiziție mare." },
];

/** „Luna ta, în cinci benzi”: împărțirea venitului pe capitolele lunii, apoi cei trei pași de folosire. */
export default function MonthBands() {
  return (
    <section id="luna" className="border-t border-line">
      <div className="mx-auto max-w-6xl px-4 py-16 sm:px-6 md:py-24">
        <Reveal className="grid items-end gap-6 md:grid-cols-2 md:gap-12">
          <h2 className="max-w-[18ch] text-[32px] font-semibold leading-[1.04] sm:text-[48px]">Luna ta, în cinci benzi.</h2>
          <p className="max-w-136 text-ink-soft">
            Salariul intră pe 1, iar Leuța îl împarte pe capitolele lunii. Fiecare bandă are culoarea unei bancnote, ca să vezi dintr-o privire unde se duce
            fiecare leu.
          </p>
        </Reveal>

        <Reveal delay={80} className="panel mt-10 p-5 sm:p-7">
          <div className="flex flex-wrap items-baseline justify-between gap-2">
            <div>
              <p className="kicker">Venit în noiembrie</p>
              <p className="num text-[32px] font-semibold tracking-[-0.05em] sm:text-[44px]">{money(DEMO.income, 0)} lei</p>
            </div>
            <p className="kicker num">Rămân {money(FREE)} lei nealocați</p>
          </div>
          <div className="mt-4 flex h-3.5 gap-1" aria-hidden>
            {PARTS.map((p, i) => (
              <i key={p.label} className="band-grow rounded-[5px]" style={{ flex: p.value, background: p.color, transitionDelay: `${i * 80}ms` }} />
            ))}
            <i className="rounded-[5px] bg-line" style={{ flex: FREE }} />
          </div>
          <dl className="num mt-6 grid grid-cols-2 gap-y-5 lg:grid-cols-5">
            {[...PARTS, { label: "Pe zi", value: (DEMO.budget - DEMO.spent) / DEMO.daysLeft, color: "var(--c-leu)", text: "Cât mai poți cheltui azi." }].map((p, i) => (
              <div key={p.label} className={`min-w-0 pr-3 ${i % 2 ? "border-l border-line pl-3.5" : ""} lg:border-l lg:pl-3.5 lg:first:border-l-0 lg:first:pl-0`}>
                <dt className="flex items-center gap-1.5 text-[12.5px] text-ink-soft">
                  <i className="h-2 w-2 shrink-0 rounded-[2px]" style={{ background: p.color }} />
                  {p.label}
                </dt>
                <dd className="mt-1 text-[17px] font-semibold tracking-[-0.02em]">{money(p.value, p.label === "Pe zi" ? 0 : Number.isInteger(p.value) ? 0 : 2)} lei</dd>
                <dd className="mt-1 whitespace-normal text-[13px] leading-snug text-ink-faint">{p.text}</dd>
              </div>
            ))}
          </dl>
        </Reveal>

        <div className="mt-12 grid border-t border-ink md:grid-cols-3">
          {STEPS.map((s, i) => (
            <Reveal key={s.tag} delay={i * 90} className={`border-b border-line py-5 md:border-b-0 md:pb-0 md:pr-6 ${i ? "md:border-l md:pl-6" : ""}`}>
              <p className="font-mono text-[12px] text-leu">{s.tag}</p>
              <h3 className="mt-2.5 text-[20px] font-semibold tracking-[-0.03em]">{s.title}</h3>
              <p className="mt-2 text-[14.5px] text-ink-soft">{s.text}</p>
            </Reveal>
          ))}
        </div>
      </div>
    </section>
  );
}
