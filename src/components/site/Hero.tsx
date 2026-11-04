import { SITE } from "@/lib/site/config";
import { money } from "@/lib/site/format";
import { Guilloche } from "@/components/Guilloche";
import { DEMO, NoteBands, TileIcon, type IconName } from "./demo";

/** Prima secțiune: titlul, cele două butoane și, alături, ecranul Acasă din aplicație pe o rozetă de ghioș. */
export default function Hero() {
  return (
    <section className="relative overflow-hidden pt-16">
      <div className="mx-auto grid max-w-6xl items-center gap-6 px-4 pb-14 pt-8 sm:px-6 md:grid-cols-[1.15fr_0.85fr] md:gap-10 md:pb-20 md:pt-14">
        <div>
          <p className="kicker rise">Bugetul personal, pe telefon și pe calculator</p>
          <h1 className="rise mt-4 text-[44px] font-semibold leading-[0.98] tracking-[-0.055em] sm:text-[64px] lg:text-[76px]" style={{ animationDelay: "60ms" }}>
            Bugetul tău,
            <br />
            <span className="text-leu">ban cu ban.</span>
          </h1>
          <NoteBands className="rise mt-6" style={{ animationDelay: "120ms" }} />
          <p className="rise mt-6 max-w-136 text-[17px] leading-relaxed text-ink-soft sm:text-[18px]" style={{ animationDelay: "160ms" }}>
            Leuța îți arată unde merg banii în fiecare lună: venituri, cheltuieli, rate și economii. Fără foi de calcul și fără acces la contul tău bancar.
          </p>
          <div className="rise mt-8 flex flex-wrap items-center gap-2.5" style={{ animationDelay: "220ms" }}>
            <a href="#invitatie" className="btn-primary">
              Cere o invitație
            </a>
            <a href="#luna" className="btn-ghost">
              Vezi cum funcționează
            </a>
          </div>
          <p className="rise mt-5 text-[13px] text-ink-faint" style={{ animationDelay: "280ms" }}>
            Gratuit · Acces pe bază de invitație · Ai deja cont?{" "}
            <a href={`${SITE.appUrl}/login`} className="text-ink-soft underline underline-offset-2 hover:text-ink">
              Intră aici
            </a>
          </p>
        </div>

        <div className="relative grid min-h-[580px] place-items-center">
          <Guilloche fine rings={5} className="absolute left-1/2 top-1/2 h-[min(130vw,620px)] w-[min(130vw,620px)] max-w-none -translate-x-1/2 -translate-y-1/2 text-leu opacity-50" />
          <PhoneHome />
        </div>
      </div>
    </section>
  );
}

const FEED: { icon: IconName; name: string; sub: string; value: number; color: string }[] = [
  { icon: "cart", name: "Kaufland", sub: "Mâncare · azi", value: -312.4, color: "var(--c-rosu)" },
  { icon: "car", name: "Benzină", sub: "Transport · azi", value: -250, color: "var(--c-albastru)" },
  { icon: "coffee", name: "Cafenea", sub: "Ieșiri · ieri", value: -18.5, color: "var(--c-mov)" },
  { icon: "wallet", name: "Salariu", sub: "Venit · 1 noiembrie", value: DEMO.income, color: "var(--c-leu)" },
];

/** Ecranul Acasă din aplicație (stilul B+), desenat în HTML, cu cifrele din contul demonstrativ. */
function PhoneHome() {
  const left = DEMO.budget - DEMO.spent;
  const [int, dec] = money(left).split(",");
  return (
    <div
      className="relative flex aspect-276/560 w-[276px] flex-col overflow-hidden rounded-[42px] border border-line bg-paper shadow-[0_40px_80px_-30px_rgb(0_0_0/0.4),0_0_0_9px_#0b0c0b,0_0_0_10px_#262826]"
      role="img"
      aria-label={`Ecranul Acasă din aplicație: mai poți cheltui ${money(left)} lei luna aceasta.`}
    >
      <div className="flex h-9 items-center justify-between px-6 pt-1.5 text-[11px] font-semibold" aria-hidden>
        <span className="num w-8">9:41</span>
        <span className="h-[20px] w-[76px] rounded-full bg-[#0b0c0b]" />
        <span className="w-8" />
      </div>
      <div className="flex items-center justify-between px-[18px] pt-1.5">
        <div className="flex flex-col gap-[3px] text-[15px] font-semibold tracking-[-0.03em]">
          Leuța
          <NoteBands size="xs" />
        </div>
        <span className="rounded-full border border-line bg-sheet px-2.5 py-[3px] text-[11px] text-ink-soft">Noiembrie</span>
      </div>
      <div className="flex-1 px-[18px] pt-[18px]">
        <p className="text-[11px] text-ink-faint">Mai poți cheltui</p>
        <p className="num mt-0.5 text-[38px] font-semibold leading-none tracking-[-0.055em]">
          {int}
          <span className="opacity-35">,{dec}</span>
          <span className="ml-1 text-[16px] tracking-[-0.02em] text-leu">lei</span>
        </p>
        <p className="mt-1.5 text-[11px] text-ink-faint">
          ≈ {money(left / DEMO.daysLeft, 0)} lei pe zi, {DEMO.daysLeft} de zile rămase
        </p>
        <div className="mt-3.5 flex gap-[3px]">
          <i className="h-1 rounded-full bg-rosu" style={{ flex: DEMO.spent }} />
          <i className="h-1 rounded-full bg-line" style={{ flex: left }} />
        </div>
        <div className="num mt-3.5 grid grid-cols-3">
          {(
            [
              ["Venit", DEMO.income],
              ["Cheltuit", DEMO.spent],
              ["Economii", DEMO.saving],
            ] as const
          ).map(([l, v], i) => (
            <div key={l} className={i ? "border-l border-line pl-2.5" : ""}>
              <small className="block text-[10px] text-ink-faint">{l}</small>
              <strong className="text-[13px] font-semibold">{money(v, 0)}</strong>
            </div>
          ))}
        </div>
        <ul className="mt-[18px] overflow-hidden rounded-2xl border border-line bg-sheet">
          {FEED.map((e) => (
            <li key={e.name} className="flex items-center gap-2.5 border-b border-line px-[11px] py-[9px] text-[12.5px] last:border-b-0">
              <TileIcon icon={e.icon} color={e.color} size="sm" />
              <span className="min-w-0 flex-1 truncate">
                {e.name}
                <small className="block text-[10.5px] text-ink-faint">{e.sub}</small>
              </span>
              <span className={`num font-semibold ${e.value > 0 ? "text-leu" : ""}`}>
                {e.value > 0 ? "+" : "−"}
                {money(Math.abs(e.value), e.value > 0 ? 0 : 2)}
              </span>
            </li>
          ))}
        </ul>
      </div>
      <div className="grid grid-cols-5 items-center border-t border-line bg-sheet px-1.5 pb-3.5 pt-2 text-center text-[9.5px] text-ink-faint" aria-hidden>
        <span className="font-semibold text-ink">Acasă</span>
        <span>Luna</span>
        <span className="mx-auto grid h-[38px] w-[38px] place-items-center rounded-xl bg-leu text-[22px] leading-none text-on-accent">+</span>
        <span>Planuri</span>
        <span>Eu</span>
      </div>
    </div>
  );
}
