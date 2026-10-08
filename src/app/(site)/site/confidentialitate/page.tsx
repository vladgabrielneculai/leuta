import type { Metadata } from "next";
import Link from "next/link";
import LegalPage, { Contact } from "@/components/site/LegalPage";
import { SITE } from "@/lib/site/config";

export const metadata: Metadata = {
  title: "Politica de confidențialitate",
  description: "Ce date personale prelucrează Leuța, de ce, cât timp le păstrează și ce drepturi ai.",
  alternates: { canonical: "/confidentialitate" },
};

export default function Privacy() {
  return (
    <LegalPage kicker="Legal · GDPR" title="Politica de confidențialitate">
      <p>
        Această politică explică ce date personale prelucrăm când folosești site-ul de prezentare Leuța ({SITE.url.replace("https://", "")}) și aplicația
        Leuța ({SITE.appUrl.replace("https://", "")}), de ce le prelucrăm, cât timp le păstrăm și ce drepturi ai, conform Regulamentului (UE) 2016/679
        (GDPR) și Legii nr. 190/2018.
      </p>

      <h2>1. Cine răspunde de datele tale</h2>
      <p>
        Operatorul datelor este <Contact />. Pentru orice întrebare sau cerere legată de datele tale ne poți scrie la adresa de email de mai sus.
      </p>

      <h2>2. Ce date prelucrăm, de ce și cât timp</h2>
      <div className="-mx-1 mb-4 overflow-x-auto px-1">
      <table className="min-w-[640px]">
        <thead>
          <tr>
            <th>Date</th>
            <th>Scop</th>
            <th>Temei legal (art. 6 GDPR)</th>
            <th>Cât timp</th>
          </tr>
        </thead>
        <tbody>
          <tr>
            <td>
              <strong>Lista de așteptare:</strong> adresa de email, data înscrierii, versiunea acordului dat
            </td>
            <td>Să îți trimitem invitația de creare a contului</td>
            <td>Consimțământul tău, alin. (1) lit. a)</td>
            <td>Până îți creezi contul, îți retragi acordul sau, cel mult, 12 luni de la înscriere</td>
          </tr>
          <tr>
            <td>
              <strong>Contul:</strong> nume de utilizator, parolă (stocată doar ca hash PBKDF2), cheile publice pentru Face ID / amprentă (biometria
              rămâne pe dispozitivul tău), cheia pentru codurile 2FA, dacă activezi autentificarea în doi pași, linkurile de resetare a parolei (stocate ca hash)
            </td>
            <td>Crearea contului și autentificarea</td>
            <td>Executarea contractului (Termenii), alin. (1) lit. b)</td>
            <td>Cât timp contul este activ</td>
          </tr>
          <tr>
            <td>
              <strong>Datele financiare introduse de tine:</strong> venituri, cheltuieli, credite și grafice de rambursare, economii, obiective, achiziții
              planificate
            </td>
            <td>Calculele, rapoartele și bonul lunar din aplicație</td>
            <td>Executarea contractului, alin. (1) lit. b)</td>
            <td>Cât timp contul este activ; le poți șterge oricând</td>
          </tr>
          <tr>
            <td>
              <strong>Profilul, dacă alegi să-l completezi:</strong> nume, data nașterii, localitate și județ, email, telefon, ocupație, venit net, ziua
              salariului, obiective financiare, toleranța la risc și experiența de investiții
            </td>
            <td>Personalizarea recomandărilor și a calculelor</td>
            <td>Executarea contractului, alin. (1) lit. b)</td>
            <td>Cât timp contul este activ; câmpurile sunt opționale și le poți goli oricând</td>
          </tr>
          <tr>
            <td>
              <strong>Securitatea contului:</strong> sesiunile active (adresă IP, browser și dispozitiv, localitate aproximativă), istoricul autentificărilor,
              încercările de autentificare eșuate
            </td>
            <td>Protejarea contului împotriva accesului neautorizat; îți arătăm sesiunile ca să le poți închide</td>
            <td>Interesul legitim de a ține conturile în siguranță, alin. (1) lit. f)</td>
            <td>Sesiunile: până expiră (1 sau 30 de zile); istoricul: 180 de zile; încercările eșuate: 24 de ore</td>
          </tr>
          <tr>
            <td>
              <strong>Notificări, dacă le activezi:</strong> adresa de email sau identificatorul conversației Telegram, istoricul notificărilor trimise
            </td>
            <td>Trimiterea mementourilor și rapoartelor alese de tine</td>
            <td>Executarea contractului, alin. (1) lit. b)</td>
            <td>Până dezactivezi notificările; istoricul: 400 de zile</td>
          </tr>
          <tr>
            <td>
              <strong>Date tehnice la vizitarea site-ului:</strong> adresa IP, tipul de browser, pagina accesată, în jurnalele serverului
            </td>
            <td>Funcționarea și securitatea site-ului</td>
            <td>Interes legitim, alin. (1) lit. f)</td>
            <td>Perioada scurtă de păstrare a jurnalelor furnizorului de găzduire</td>
          </tr>
          <tr>
            <td>
              <strong>Statistici de vizitare (Google Analytics), doar dacă le accepți:</strong> identificatori din cookie-uri, paginile vizitate, sursa
              vizitei, țara și orașul aproximativ, tipul de dispozitiv
            </td>
            <td>Să înțelegem câți oameni vizitează site-ul și de unde vin</td>
            <td>Consimțământul tău, alin. (1) lit. a)</td>
            <td>14 luni; îți poți retrage acordul oricând din „Setări cookie-uri”</td>
          </tr>
        </tbody>
      </table>
      </div>
      <p>
        Nu cerem și nu avem acces la conturile tale bancare. Nu folosim datele tale pentru reclame, nu le vindem și nu le transmitem altor firme în scop de
        marketing.
      </p>

      <h2>3. Recomandările din aplicație</h2>
      <p>
        Leuța face calcule automate pe baza datelor introduse de tine (de exemplu, rata de economisire sau cât acoperă fondul de urgență) și îți arată
        recomandări. Acestea sunt informative, nu produc efecte juridice și nu te afectează în mod similar, deci nu sunt decizii automate în sensul art. 22
        GDPR. Leuța nu oferă consultanță financiară.
      </p>

      <h2>4. Cine mai are acces la date</h2>
      <p>Folosim furnizori care prelucrează date doar la instrucțiunile noastre (persoane împuternicite), pe baza unor contracte conforme art. 28 GDPR:</p>
      <ul>
        <li>
          <strong>Vercel Inc.</strong>: găzduirea site-ului și a aplicației; serverele aplicației rulează în Frankfurt, Germania.
        </li>
        <li>
          <strong>Supabase Inc.</strong>: baza de date a aplicației, găzduită în Frankfurt, Germania.
        </li>
        <li>
          <strong>Resend (Plus Five Five, Inc.)</strong>: trimiterea emailurilor (invitații, notificări).
        </li>
        <li>
          <strong>Google Ireland Limited</strong>: Google Analytics, doar pe site și doar dacă accepți cookie-urile de statistică.
        </li>
      </ul>
      <p>
        Dacă alegi notificările pe <strong>Telegram</strong>, mesajele sunt livrate prin serviciul Telegram, care prelucrează datele conform propriei
        politici de confidențialitate. Cursul BNR și inflația INS sunt date publice descărcate de aplicație; nu transmitem date despre tine acestor
        instituții.
      </p>
      <p>
        Unii furnizori sunt companii din SUA. Când datele ajung în afara Spațiului Economic European, transferul se face pe baza deciziei de adecvare pentru
        Cadrul UE–SUA privind protecția datelor (Data Privacy Framework), pentru companiile certificate, sau a clauzelor contractuale standard aprobate de
        Comisia Europeană.
      </p>
      <p>Putem divulga date autorităților doar când legea ne obligă.</p>

      <h2>5. Drepturile tale</h2>
      <ul>
        <li>
          <strong>Acces:</strong> să afli ce date avem despre tine și să primești o copie.
        </li>
        <li>
          <strong>Rectificare:</strong> să corectezi datele greșite (majoritatea le poți modifica direct în aplicație).
        </li>
        <li>
          <strong>Ștergere:</strong> să ceri ștergerea datelor; contul și datele financiare se pot șterge definitiv.
        </li>
        <li>
          <strong>Restricționare</strong> și <strong>opoziție</strong> la prelucrările bazate pe interes legitim.
        </li>
        <li>
          <strong>Portabilitate:</strong> să primești datele tale într-un format structurat (JSON).
        </li>
        <li>
          <strong>Retragerea consimțământului</strong> oricând, fără a afecta prelucrarea făcută înainte (lista de așteptare, cookie-urile de statistică).
        </li>
      </ul>
      <p>
        Pentru a-ți exercita drepturile, scrie-ne la adresa din secțiunea 1. Îți răspundem în cel mult o lună; termenul se poate prelungi cu încă două luni
        pentru cereri complexe, caz în care te anunțăm. Putem cere informații suplimentare ca să confirmăm că cererea vine de la tine.
      </p>
      <p>
        Ai dreptul să depui plângere la <strong>Autoritatea Națională de Supraveghere a Prelucrării Datelor cu Caracter Personal (ANSPDCP)</strong>, B-dul
        G-ral. Gheorghe Magheru nr. 28-30, sector 1, București,{" "}
        <a href="https://www.dataprotection.ro" rel="noopener noreferrer" target="_blank">
          www.dataprotection.ro
        </a>
        .
      </p>

      <h2>6. Vârsta minimă</h2>
      <p>
        Leuța se adresează persoanelor de cel puțin {SITE.minAge} ani. Nu colectăm cu bună știință date despre persoane mai tinere; dacă afli că s-a
        întâmplat, scrie-ne și le ștergem.
      </p>

      <h2>7. Cum protejăm datele</h2>
      <ul>
        <li>Toate conexiunile sunt criptate (HTTPS, cu HSTS).</li>
        <li>Parolele sunt stocate doar ca hash; contul se poate proteja cu autentificare în doi pași (2FA), iar pe dispozitivele tale intri cu Face ID / amprentă. Amprenta și fața nu ajung niciodată la noi.</li>
        <li>Încercările repetate de autentificare sunt blocate temporar, iar sesiunile pot fi închise de la distanță.</li>
        <li>Datele fiecărui utilizator sunt separate în baza de date, iar accesul administrativ este restricționat.</li>
      </ul>

      <h2>8. Cookie-uri</h2>
      <p>
        Detaliile despre cookie-uri și stocarea locală sunt în <Link href="/cookies">Politica de cookie-uri</Link>.
      </p>

      <h2>9. Modificări</h2>
      <p>
        Putem actualiza această politică. Data ultimei actualizări apare la începutul paginii. Despre modificările importante te anunțăm în aplicație sau pe
        email înainte să se aplice.
      </p>
    </LegalPage>
  );
}
