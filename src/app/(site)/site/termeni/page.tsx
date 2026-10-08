import type { Metadata } from "next";
import Link from "next/link";
import LegalPage, { Contact } from "@/components/site/LegalPage";
import { SITE } from "@/lib/site/config";

export const metadata: Metadata = {
  title: "Termeni și condiții",
  description: "Regulile de folosire a aplicației Leuța.",
  alternates: { canonical: "/termeni" },
};

export default function Terms() {
  return (
    <LegalPage kicker="Legal" title="Termeni și condiții">
      <p>
        Acești termeni se aplică folosirii aplicației Leuța ({SITE.appUrl.replace("https://", "")}) și a site-ului de prezentare. Creând un cont, confirmi
        că i-ai citit și ești de acord cu ei.
      </p>

      <h2>1. Cine oferă serviciul</h2>
      <p>
        Leuța este oferită de <Contact />.
      </p>

      <h2>2. Ce este Leuța</h2>
      <p>
        Leuța este o aplicație web de evidență a bugetului personal: venituri, cheltuieli, credite, economii și obiective. Datele sunt introduse de tine;
        aplicația nu se conectează la conturile tale bancare și nu efectuează plăți.
      </p>

      <h2>3. Nu este consultanță financiară</h2>
      <p>
        Calculele, graficele și recomandările din Leuța au caracter informativ și se bazează exclusiv pe datele introduse de tine și pe surse publice (cursul
        BNR, inflația INS). Ele nu reprezintă consultanță financiară, fiscală, juridică sau de investiții. Deciziile financiare îți aparțin; pentru situații
        importante (credite, investiții) consultă un specialist autorizat.
      </p>

      <h2>4. Accesul și contul</h2>
      <ul>
        <li>Accesul se face pe bază de invitație. Înscrierea pe lista de așteptare nu garantează primirea unei invitații într-un anumit termen.</li>
        <li>Trebuie să ai cel puțin {SITE.minAge} ani ca să îți creezi un cont.</li>
        <li>Contul este personal. Păstrează parola și codurile de recuperare în siguranță și nu le da altor persoane.</li>
        <li>Dacă bănuiești că altcineva are acces la cont, schimbă parola, închide sesiunile active din aplicație și anunță-ne.</li>
      </ul>

      <h2>5. Prețul</h2>
      <p>
        Leuța este în prezent gratuită. Dacă vor apărea funcții sau planuri plătite, te anunțăm din timp, iar acestea se vor aplica doar dacă le accepți
        separat.
      </p>

      <h2>6. Folosirea corectă</h2>
      <p>Te angajezi să nu:</p>
      <ul>
        <li>încerci să accesezi conturile sau datele altor utilizatori;</li>
        <li>testezi, ocolești sau suprasoliciți măsurile de securitate ori infrastructura aplicației;</li>
        <li>folosești aplicația în scopuri ilegale sau ca să stochezi conținut ilegal;</li>
        <li>creezi conturi în mod automat sau revinzi accesul la aplicație.</li>
      </ul>

      <h2>7. Datele tale</h2>
      <p>
        Datele introduse în aplicație îți aparțin. Ne dai doar dreptul de a le stoca și prelucra cât este necesar ca să îți oferim serviciul, conform{" "}
        <Link href="/confidentialitate">Politicii de confidențialitate</Link>. Poți cere oricând o copie a datelor sau ștergerea contului.
      </p>

      <h2>8. Disponibilitate</h2>
      <p>
        Facem tot ce ne stă în putere ca Leuța să funcționeze corect și fără întreruperi, dar serviciul este oferit „așa cum este”, fără garanția că va fi
        disponibil permanent sau lipsit de erori. Pot exista întreruperi pentru mentenanță sau din cauze independente de noi. Îți recomandăm să păstrezi și
        propriile evidențe pentru datele importante.
      </p>

      <h2>9. Răspundere</h2>
      <p>
        În limitele permise de lege, nu răspundem pentru pierderi indirecte sau pentru decizii financiare luate pe baza calculelor din aplicație. Nimic din
        acești termeni nu limitează răspunderea pentru prejudiciile cauzate cu intenție sau din culpă gravă și nici drepturile pe care le ai ca consumator
        conform legii.
      </p>

      <h2>10. Proprietate intelectuală</h2>
      <p>
        Numele Leuța, sigla, designul și codul aplicației aparțin operatorului. Nu le poți copia sau folosi în alte scopuri fără acord scris.
      </p>

      <h2>11. Încetarea</h2>
      <ul>
        <li>Poți renunța oricând, ștergându-ți contul sau scriindu-ne.</li>
        <li>Putem suspenda sau închide un cont care încalcă acești termeni; când e posibil, te anunțăm înainte și îți explicăm motivul.</li>
        <li>Dacă vom opri definitiv serviciul, te anunțăm cu cel puțin 30 de zile înainte, ca să îți poți descărca datele.</li>
      </ul>

      <h2>12. Modificarea termenilor</h2>
      <p>
        Putem actualiza acești termeni. Despre modificările importante te anunțăm în aplicație sau pe email cu cel puțin 15 zile înainte să se aplice. Dacă nu
        ești de acord, poți renunța la cont înainte de data aplicării.
      </p>

      <h2>13. Legea aplicabilă și litigii</h2>
      <p>
        Acești termeni sunt guvernați de legea română. Încercăm mai întâi să rezolvăm amiabil orice nemulțumire: scrie-ne la adresa de contact. Dacă nu
        ajungem la o soluție, litigiul se soluționează de instanțele competente din România. Ca și consumator, poți apela și la{" "}
        <a href="https://anpc.ro/ce-este-sal/" rel="noopener noreferrer" target="_blank">
          soluționarea alternativă a litigiilor (SAL)
        </a>{" "}
        a ANPC.
      </p>
    </LegalPage>
  );
}
