import Reveal from "./Reveal";
import { Guilloche } from "@/components/Guilloche";
import { TileIcon, type IconName } from "./demo";
import { SITE } from "@/lib/site/config";

const FEATURES: { title: string; text: string; color: string; icon: IconName }[] = [
  { icon: "afford", title: "Îmi permit?", text: "Plata integrală sau credit? Vezi cum se schimbă bugetul lunar și fondul de urgență pentru mașina, telefonul sau vacanța dorită.", color: "var(--c-leu)" },
  { icon: "budget", title: "Metode de buget", text: "50/30/20, buget de la zero sau al tău: vezi, în lei, cât e ținta pentru nevoi, dorințe și economii.", color: "var(--c-mov)" },
  { icon: "doc", title: "Bilanțul lunii", text: "La final de lună descarci un PDF: ce a intrat, ce a ieșit, ce a rămas. Bun de păstrat sau de trimis.", color: "var(--c-rosu)" },
  { icon: "bell", title: "Notificări", text: "Pe Telegram sau pe email: reminder de seară, scadențe, alerte de buget, rezumatul săptămânii. Le alegi tu.", color: "var(--c-galben)" },
  { icon: "euro", title: "Curs și inflație", text: "Sumele în euro se convertesc cu cursul BNR, iar inflația INS îți arată cât valorează economiile în timp.", color: "var(--c-albastru)" },
  { icon: "import", title: "Grafic de rambursare", text: "Încarci graficul de la bancă, din PDF sau Excel, iar Leuța completează ratele, dobânda și soldul.", color: "var(--c-leu)" },
];

export function Features() {
  return (
    <section id="functii" className="border-t border-line">
      <div className="mx-auto max-w-6xl px-4 py-16 sm:px-6 md:py-24">
        <Reveal className="grid items-end gap-6 md:grid-cols-2 md:gap-12">
          <h2 className="max-w-[18ch] text-[32px] font-semibold leading-[1.04] sm:text-[48px]">Mai mult decât un tabel cu cheltuieli.</h2>
          <p className="max-w-136 text-ink-soft">Instrumentele pe care le folosești o dată pe lună, nu în fiecare zi. Sunt acolo când ai nevoie de ele.</p>
        </Reveal>
        <div className="mt-10 grid border-l border-t border-line sm:grid-cols-2 lg:grid-cols-3">
          {FEATURES.map((f, i) => (
            <Reveal key={f.title} delay={(i % 3) * 80} className="border-b border-r border-line p-6">
              <TileIcon icon={f.icon} color={f.color} />
              <h3 className="mt-4 text-[17px] font-semibold tracking-[-0.02em]">{f.title}</h3>
              <p className="mt-1.5 text-[14px] text-ink-soft">{f.text}</p>
            </Reveal>
          ))}
        </div>
      </div>
    </section>
  );
}

const SECURITY: [string, string][] = [
  ["Fără acces la bancă", "Leuța nu se conectează la conturile tale bancare. Tu decizi ce sume introduci."],
  ["Fără reclame și trackere", "Aplicația nu afișează reclame și nu încarcă scripturi de urmărire. Datele tale nu se vând."],
  ["Face ID, amprentă sau 2FA", "Intri dintr-o atingere sau cu parola + un cod din telefon. Parolele sunt stocate doar ca hash (PBKDF2)."],
  ["Date găzduite în UE", "Baza de date și serverele aplicației sunt în Frankfurt, Germania. Conexiunea e mereu criptată (HTTPS)."],
  ["Controlul sesiunilor", "Vezi de pe ce dispozitive ești conectat și închizi orice sesiune dintr-un buton."],
  ["Acces recuperabil", "Ți-ai uitat parola sau ai pierdut telefonul? Primești un link de resetare și intri din nou, cu datele neatinse."],
];

export function Security() {
  return (
    <section id="siguranta" className="relative overflow-hidden border-y border-deep-line bg-deep text-deep-ink">
      <Guilloche fine rings={6} className="absolute -right-48 top-1/2 h-[560px] w-[560px] max-w-none -translate-y-1/2 text-deep-leu opacity-35" />
      <div className="relative mx-auto max-w-6xl px-4 py-16 sm:px-6 md:py-24">
        <Reveal className="grid items-end gap-6 md:grid-cols-2 md:gap-12">
          <h2 className="max-w-[18ch] text-[32px] font-semibold leading-[1.04] sm:text-[48px]">Banii tăi sunt treaba ta.</h2>
          <p className="max-w-136 text-deep-soft">
            Datele financiare sunt cele mai personale date. Leuța le păstrează puține, în Uniunea Europeană, și doar pentru tine.
          </p>
        </Reveal>
        <ul className="mt-10 grid border-t border-deep-line md:grid-cols-3">
          {SECURITY.map(([t, d], i) => (
            <Reveal as="li" key={t} delay={(i % 3) * 80} className="border-b border-deep-line py-5 md:pr-6">
              <p className="flex items-baseline gap-2.5 text-[15.5px] font-semibold">
                <span className="h-1.5 w-1.5 shrink-0 -translate-y-0.5 rounded-full bg-deep-leu" aria-hidden />
                {t}
              </p>
              <p className="mt-1.5 pl-4 text-[14px] text-deep-soft">{d}</p>
            </Reveal>
          ))}
        </ul>
        <span className="mt-7 inline-flex rounded-full border border-deep-leu px-3 py-1 font-mono text-[12px] text-deep-leu">Fără reclame · Date în UE</span>
      </div>
    </section>
  );
}

const FAQ: [string, React.ReactNode][] = [
  ["Cât costă?", "Leuța este gratuită în acest moment. Dacă vreodată vor apărea funcții plătite, vei fi anunțat din timp."],
  [
    "Cum primesc acces?",
    <>
      Accesul se face pe bază de invitație. Lasă-ți emailul în formularul de mai jos, iar când se eliberează un loc primești pe email un link de creare a
      contului. Trebuie să ai cel puțin {SITE.minAge} ani.
    </>,
  ],
  ["Trebuie să-mi conectez contul bancar?", "Nu. Leuța nu are acces la bancă. Introduci sumele tu, foarte repede, din butonul „+”, sau importi graficul de rambursare al creditului."],
  ["Merge pe telefon?", "Da. Se deschide din browser pe iPhone și Android și o poți adăuga pe ecranul principal, ca pe o aplicație. Același cont merge și pe calculator."],
  ["Unde sunt stocate datele mele?", "În Uniunea Europeană: baza de date și serverele aplicației sunt în Frankfurt, Germania. Detaliile sunt în Politica de confidențialitate."],
  ["Pot să-mi șterg contul?", "Da, oricând. Ștergerea contului elimină definitiv datele tale financiare. Poți cere și o copie a datelor înainte."],
  ["Leuța îmi dă sfaturi financiare?", "Leuța face calcule și îți arată tendințe pe baza datelor introduse de tine. Nu este consultanță financiară, fiscală sau de investiții."],
];

export function Faq() {
  return (
    <section id="intrebari" className="border-t border-line">
      <div className="mx-auto max-w-6xl px-4 py-16 sm:px-6 md:py-24">
        <Reveal className="grid items-end gap-6 md:grid-cols-2 md:gap-12">
          <h2 className="text-[32px] font-semibold leading-[1.04] sm:text-[48px]">Pe scurt.</h2>
          <p className="max-w-136 text-ink-soft">Ce vor să știe oamenii înainte să ceară o invitație.</p>
        </Reveal>
        <Reveal delay={80} className="mt-8 max-w-3xl border-t border-line">
          {FAQ.map(([q, a]) => (
            <details key={q} className="group border-b border-line">
              <summary className="flex cursor-pointer items-center justify-between gap-4 py-5 text-[16px] font-medium">
                {q}
                <span className="faq-plus text-[22px] font-normal leading-none text-ink-faint transition-transform duration-200" aria-hidden>
                  +
                </span>
              </summary>
              <p className="-mt-1 max-w-[60ch] pb-5 text-[15px] text-ink-soft">{a}</p>
            </details>
          ))}
        </Reveal>
      </div>
    </section>
  );
}
