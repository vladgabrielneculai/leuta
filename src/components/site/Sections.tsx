import Reveal from "./Reveal";
import { SITE } from "@/lib/site/config";

const FEATURES: { title: string; text: string; color: string; tag: string }[] = [
  { tag: "Îmi permit?", title: "Testează o achiziție înainte să o faci", text: "Plata integrală sau credit? Vezi cum se schimbă bugetul lunar și fondul de urgență pentru mașina, telefonul sau vacanța dorită.", color: "var(--c-leu)" },
  { tag: "Metode de buget", title: "50/30/20, buget de la zero sau al tău", text: "Compari luna cu metode cunoscute și vezi, în lei, cât e ținta pentru nevoi, dorințe și economii.", color: "var(--c-mov)" },
  { tag: "Bonul lunii", title: "Un PDF ca un bon de casă", text: "La final de lună descarci bilanțul: ce a intrat, ce a ieșit, ce a rămas. Bun de păstrat sau de trimis.", color: "var(--c-rosu)" },
  { tag: "Notificări", title: "Pe Telegram sau pe email", text: "Reminder de seară, scadențe la credite și asigurări, alerte de buget, rezumat săptămânal și bilanțul lunii. Le alegi tu.", color: "var(--c-galben)" },
  { tag: "Curs și inflație", title: "BNR și INS, la zi", text: "Sumele în euro se convertesc cu cursul BNR, iar inflația oficială îți arată cât valorează economiile în timp.", color: "var(--c-albastru)" },
  { tag: "Grafic de rambursare", title: "Importi creditul din PDF sau Excel", text: "Încarci graficul de la bancă, iar Leuța completează ratele, dobânda și soldul. Fără tastat rând cu rând.", color: "var(--c-leu)" },
];

export function Features() {
  return (
    <section className="mx-auto max-w-6xl px-4 py-20 sm:px-6 md:py-28">
      <Reveal>
        <p className="kicker">Și încă ceva</p>
        <h2 className="mt-4 max-w-3xl text-[30px] font-bold leading-[1.1] sm:text-[46px]">Mai mult decât un tabel cu cheltuieli.</h2>
      </Reveal>
      <div className="mt-12 grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
        {FEATURES.map((f, i) => (
          <Reveal key={f.tag} delay={(i % 3) * 90} className="panel flex flex-col px-6 pb-6 pt-6">
            <p className="flex items-center gap-2 text-[12px] font-semibold uppercase tracking-[0.12em] text-ink-faint">
              <span className="h-2.5 w-2.5 rounded-[2px]" style={{ background: f.color }} />
              {f.tag}
            </p>
            <div className="rule-dashed my-4" />
            <h3 className="text-[18px] font-bold leading-snug">{f.title}</h3>
            <p className="mt-2 text-[14px] text-ink-soft">{f.text}</p>
          </Reveal>
        ))}
      </div>
    </section>
  );
}

const SECURITY: [string, string][] = [
  ["Fără acces la bancă", "Leuța nu se conectează la conturile tale bancare. Tu decizi ce sume introduci."],
  ["Fără reclame și trackere", "Aplicația nu afișează reclame și nu încarcă scripturi de urmărire. Datele tale nu se vând."],
  ["Autentificare cu passkey", "Intri cu amprenta sau Face ID. Parolele sunt stocate doar ca hash (PBKDF2), niciodată în clar."],
  ["Date găzduite în UE", "Baza de date și serverele aplicației sunt în Frankfurt, Germania. Conexiunea e mereu criptată (HTTPS)."],
  ["Controlul sesiunilor", "Vezi de pe ce dispozitive ești conectat și închizi orice sesiune dintr-un buton."],
  ["Coduri de recuperare", "Dacă pierzi telefonul, intri în cont cu codurile de rezervă generate de tine."],
];

export function Security() {
  return (
    <section id="siguranta" className="mx-auto max-w-6xl px-4 py-20 sm:px-6 md:py-28">
      <div className="grid gap-10 md:grid-cols-[0.9fr_1.1fr]">
        <Reveal>
          <p className="kicker">Siguranță</p>
          <h2 className="mt-4 text-[30px] font-bold leading-[1.1] sm:text-[46px]">Banii tăi sunt treaba ta.</h2>
          <p className="mt-5 max-w-md text-[15.5px] text-ink-soft sm:text-[17px]">
            Datele financiare sunt cele mai personale date. Leuța le păstrează puține, în Uniunea Europeană, și doar pentru tine.
          </p>
          <span className="stamp mt-8">Fără reclame · Date în UE</span>
        </Reveal>
        <Reveal delay={100} className="panel px-6 pb-4 pt-6 sm:px-8">
          <p className="receipt-title">Ce primești</p>
          <div className="rule-dashed mt-4" />
          <ul>
            {SECURITY.map(([t, d]) => (
              <li key={t} className="border-b border-dashed border-line py-4 last:border-0">
                <p className="flex items-baseline gap-2 font-semibold">
                  <span className="text-leu">✓</span>
                  {t}
                </p>
                <p className="mt-1 pl-5 text-[14px] text-ink-soft">{d}</p>
              </li>
            ))}
          </ul>
        </Reveal>
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
    <section id="intrebari" className="mx-auto max-w-3xl px-4 py-20 sm:px-6 md:py-28">
      <Reveal>
        <p className="kicker text-center">Întrebări frecvente</p>
        <h2 className="mt-4 text-center text-[30px] font-bold leading-[1.1] sm:text-[44px]">Pe scurt.</h2>
      </Reveal>
      <Reveal delay={80} className="panel mt-10 px-5 py-2 sm:px-8">
        {FAQ.map(([q, a]) => (
          <details key={q} className="group border-b border-dashed border-line-strong/70 last:border-0">
            <summary className="flex cursor-pointer items-center justify-between gap-4 py-5 text-[15.5px] font-semibold">
              {q}
              <span className="faq-plus text-[22px] font-normal leading-none text-ink-faint transition-transform duration-200" aria-hidden>
                +
              </span>
            </summary>
            <p className="-mt-1 pb-5 text-[14.5px] text-ink-soft">{a}</p>
          </details>
        ))}
      </Reveal>
    </section>
  );
}
