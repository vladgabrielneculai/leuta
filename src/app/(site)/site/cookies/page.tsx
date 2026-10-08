import type { Metadata } from "next";
import LegalPage from "@/components/site/LegalPage";
import { CookieSettingsLink } from "@/components/site/CookieConsent";
import { SITE } from "@/lib/site/config";

export const metadata: Metadata = {
  title: "Politica de cookie-uri",
  description: "Ce cookie-uri și ce date stocate în browser folosesc site-ul și aplicația Leuța.",
  alternates: { canonical: "/cookies" },
};

export default function Cookies() {
  const ga = !!SITE.gaId;
  return (
    <LegalPage kicker="Legal" title="Politica de cookie-uri">
      <p>
        Cookie-urile sunt fișiere mici pe care un site le salvează în browserul tău. „Stocarea locală” (localStorage) funcționează asemănător. Mai jos găsești
        tot ce folosim, pe site și în aplicație.
      </p>

      <h2>Pe acest site</h2>
      {ga ? (
        <>
          <p>
            Site-ul folosește <strong>Google Analytics</strong> doar dacă accepți, din bannerul de cookie-uri. Fără acordul tău, scriptul Google nu se încarcă
            și nu se salvează niciun cookie de statistică.
          </p>
          <div className="-mx-1 mb-4 overflow-x-auto px-1">
            <table className="min-w-[560px]">
              <thead>
                <tr>
                  <th>Nume</th>
                  <th>Furnizor</th>
                  <th>Scop</th>
                  <th>Durată</th>
                </tr>
              </thead>
              <tbody>
                <tr>
                  <td>_ga</td>
                  <td>Google</td>
                  <td>Deosebește vizitatorii unici (statistică)</td>
                  <td>2 ani</td>
                </tr>
                <tr>
                  <td>_ga_*</td>
                  <td>Google</td>
                  <td>Păstrează starea vizitei curente (statistică)</td>
                  <td>2 ani</td>
                </tr>
                <tr>
                  <td>leuta-site-cookies (stocare locală)</td>
                  <td>Leuța</td>
                  <td>Ține minte dacă ai acceptat sau refuzat cookie-urile, ca să nu te întrebăm la fiecare vizită</td>
                  <td>6 luni</td>
                </tr>
              </tbody>
            </table>
          </div>
          <p>
            Îți poți schimba alegerea oricând: <CookieSettingsLink />. Dacă îți retragi acordul, ștergem cookie-urile _ga din browser.
          </p>
        </>
      ) : (
        <p>
          În prezent site-ul de prezentare <strong>nu folosește cookie-uri</strong> și nu încarcă scripturi de statistică sau de reclamă. Dacă vom adăuga
          statistici de vizitare (Google Analytics), ele vor porni doar după ce îți dai acordul, iar această pagină va fi actualizată.
        </p>
      )}

      <h2>În aplicația Leuța</h2>
      <p>Aplicația folosește doar cookie-uri și date locale strict necesare, pentru care nu este nevoie de acord (art. 4 alin. (5) din Legea nr. 506/2004):</p>
      <div className="-mx-1 mb-4 overflow-x-auto px-1">
        <table className="min-w-[560px]">
          <thead>
            <tr>
              <th>Nume</th>
              <th>Tip</th>
              <th>Scop</th>
              <th>Durată</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <td>bp_session</td>
              <td>Cookie</td>
              <td>Te menține autentificat</td>
              <td>1 zi sau 30 de zile, dacă alegi „ține-mă minte”</td>
            </tr>
            <tr>
              <td>bp_wa</td>
              <td>Cookie</td>
              <td>Verificarea unică la autentificarea cu Face ID / amprentă</td>
              <td>Câteva minute; se șterge după folosire</td>
            </tr>
            <tr>
              <td>leuta-tema</td>
              <td>Stocare locală</td>
              <td>Ține minte tema aleasă (luminoasă sau întunecată)</td>
              <td>Până o ștergi din browser</td>
            </tr>
            <tr>
              <td>leuta-securitate-amanat</td>
              <td>Stocare locală</td>
              <td>Ține minte că ai amânat propunerea de a activa Face ID / amprentă sau 2FA</td>
              <td>14 zile</td>
            </tr>
            <tr>
              <td>leuta-verificare-coduri-amanata</td>
              <td>Stocare locală</td>
              <td>Ține minte că ai amânat verificarea periodică a codurilor de recuperare</td>
              <td>3 zile</td>
            </tr>
          </tbody>
        </table>
      </div>
      <p>Aplicația nu folosește cookie-uri de statistică, de publicitate sau de la terți.</p>

      <h2>Cum ștergi cookie-urile</h2>
      <p>
        Le poți șterge oricând din setările browserului. Dacă ștergi cookie-ul de sesiune al aplicației, vei fi deconectat.
      </p>
    </LegalPage>
  );
}
