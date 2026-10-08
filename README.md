# Leuța

*Bugetul tău, ban cu ban.* Aplicație personală de buget: venituri, costuri fixe, cheltuieli variabile, economii, investiții și credite (scadențar de la bancă, recalculare automată, plăți anticipate), cu curs BNR și inflație România preluate automat.

**Rulează online** — se deschide din orice browser, de pe calculator sau telefon. Nu mai e nevoie de `npm install` / `npm run dev`.

| Componentă | Unde |
|---|---|
| Site-ul de prezentare | https://leuta.ro — același proiect Vercel, paginile din `src/app/(site)` |
| Aplicația (Next.js 16) | https://app.leuta.ro — Vercel, regiunea `fra1` (Frankfurt); vechile adrese `leuta.vercel.app` și `buget-personal-beta.vercel.app` redirecționează aici |
| Baza de date (Postgres) | Supabase, proiectul „Leuța” (`eu-central-1`) |
| Codul | GitHub `vladgabrielneculai/buget-personal` — orice push pe `main` se publică automat |
| Bot Telegram | [@leuta_app_bot](https://t.me/leuta_app_bot) — se conectează din *Setări → Notificări* |

---

## 🎨 Aspect

- Temă de zi și de noapte („bancnotă pe catifea”): *Auto* urmează setarea telefonului/calculatorului, iar butonul ☀️/🌙 din bara aplicației (sau *Setări → Aspect*) o forțează. Alegerea se ține minte pe dispozitiv; schimbarea e animată.
- Paleta e inspirată din bancnotele românești (1 leu verde, 5 lei mov, 10 lei roșu, 50 lei galben, 100 lei albastru); culorile sunt variabile CSS în `src/app/(app)/globals.css` (site-ul de prezentare: `src/app/(site)/site.css`), folosite de clasele Tailwind și de grafice.
- Sigla: o monedă verde cu chenar guilloche și un „L” cu piciorul ascendent (`src/components/Logo.tsx`, `src/app/icon.svg`).

## 📱 Pe telefon

Deschide adresa aplicației în browser, apoi:
- **iPhone (Safari):** Share → *Add to Home Screen*
- **Android (Chrome):** meniul ⋮ → *Install app* / *Add to Home screen*

Se deschide ca o aplicație separată, cu bara de navigare jos (Panou · Luna · Credite · Economii · Mai mult) și luna analizată mereu vizibilă sus.

## 🖥️ Pe Windows

`Leuta.exe` (construit cu `npm run build:exe`) deschide versiunea online în propria fereastră (tray, splash, fără tab de browser). Nu mai pornește niciun server local și nu mai cere Node.js. Adresa se citește din `Leuta.url.txt`, lângă exe (sau din `BaniiMei.url.txt`, la instalările vechi); scurtătura „Leuța” de pe Desktop se face cu `npm run shortcut`.

---

## 🏦 Credite din graficul băncii

- **Credite → „Adaugă din grafic PDF”**: încarci graficul de rambursare descărcat din George (BCR). Se citesc suma, soldul actual, data acordării, dobânzile pe perioade, nr. contractului și toate ratele (principal, dobândă, asigurare, sold).
- Pe un credit existent: **„Actualizează graficul / situația la zi”** → PDF nou (după o plată anticipată sau o schimbare de dobândă) sau datele copiate manual din aplicația băncii (sold, următoarea rată, principal, dobândă, taxe lunare, maturitate, restanțe, rata dobânzii), din care graficul se reconstruiește până la maturitate.
- Cu graficul activ, ratele din buget, soldul și dobânda se iau exact din grafic; plățile anticipate și scenariile de IRCC recalculează restul ca banca.
- Asigurarea PAD și cea facultativă (anuale) apar ca sumă întreagă în luna scadenței, în fiecare an; suma restantă se adaugă la plățile lunii în care a fost raportată.

## 🔔 Notificări (Telegram + email)

- **Telegram**: reminder la 21:00 („Ai trecut cheltuielile de azi?”), scadențe de credit și alerte de buget. Îi poți scrie botului `45 mâncare`, `120,50 benzină`, `+5000 salariu` și cheltuiala intră în aplicație (categoria se alege automat și se poate schimba din butoane). Comenzi: `/azi`, `/luna`, `/sold`, `/anuleaza`.
  Notificările și rapoartele `/azi`, `/luna`, `/sold` sosesc ca **imagine în stilul bonului de casă** (PNG generat cu `next/og`, același font și aceleași culori ca aplicația), cu titlul în legendă; dacă imaginea nu poate fi generată sau trimisă, pleacă varianta text.
- **Email** (Resend): rezumatul săptămânal (duminică) și bilanțul lunii (pe 1), plus scadențele, tot în stilul bonului: hârtie cu margini zimțate, rânduri cu puncte, total, cod de bare (tabele + stiluri inline; sigla vine din `public/email/logo.png`).
- **Bonul lunii (PDF)**: veniturile și cheltuielile unei luni, în stilul unui bon de casă (hârtie îngustă, linii punctate, total mare, cod de bare). Se descarcă din *Luna curentă → 🧾 Bonul lunii (PDF)* pentru orice lună și vine automat atașat la bilanțul lunii (pe 1), pe Telegram și/sau email. Fontul IBM Plex Mono (licență OFL, în `src/lib/receipt/fonts`) asigură diacriticele.
- În *Setări → Notificări* alegi pentru fiecare tip de mesaj pe ce canal vine și poți trimite mesaje de test.
- Rulează din Vercel Cron (`vercel.json`): două rulări pe zi, 18:00 și 19:00 UTC, ca să prindă 21:00 în România și vara, și iarna.

## 👥 Mai mulți utilizatori

- Fiecare cont are datele lui: venituri, cheltuieli, credite, obiective, setări și profil. Separarea o face Postgres (row-level security), nu doar interfața.
- **Conturi noi doar pe bază de invitație.** Primul cont (cel creat la configurarea inițială) este **administrator**: în *Administrare* creează un link de invitație (o singură folosire, valabil 7 zile) și îl trimite persoanei. Aceasta își alege utilizatorul și parola la `/inregistrare?cod=…` (sau lipește linkul / codul în fila *Cont nou* de pe pagina de login).
- Administratorul vede lista conturilor (nume, data creării, ultima activitate, Face ID / 2FA), le poate dezactiva/reactiva sau șterge definitiv. **Nu vede** datele financiare sau profilul celorlalți.
- **Profilul meu**: date personale, ocupație și venit (tip, stabilitate, venit net, ziua salariului), obiective și profil de risc. Un cont nou trece printr-un **ghid de început** în 4 pași (profil, venit, credite, obiective), care poate fi amânat.
- Profilul influențează calculele: numărul de luni al fondului de urgență (venit variabil / pe cont propriu / familie / prudență → țintă mai mare; se poate fixa manual din Setări), bugetul „Recomandat pentru tine”, sfaturile lunii și „lei pe zi până la salariu”.

## 🔐 Securitate

- **Face ID / amprentă** (Face ID, Touch ID, amprenta Android, Windows Hello; tehnic WebAuthn cu autentificatorul dispozitivului): intri dintr-o atingere, fără parolă. Se activează per dispozitiv din *Setări → Securitate & dispozitive*.
- **Autentificare în doi pași (2FA)**: parola + codul de 6 cifre dintr-o aplicație (Google/Microsoft Authenticator, 1Password, Parole pe iPhone), TOTP RFC 6238; un cod nu merge de două ori. Bun pentru calculatoarele fără biometrie.
- Cu 2FA activ, parola singură nu mai deschide contul. Face ID / amprenta e drumul rapid pe dispozitivele tale; pe celelalte intri cu parola (+ codul 2FA). Nu există coduri de recuperare.
- **Parolă uitată / telefon pierdut**: în *Administrare → Conturi*, „Resetează accesul” creează un link (o singură folosire, 24 de ore) la `/resetare?cod=…`. Persoana își alege o parolă nouă; 2FA și Face ID / amprenta se dezactivează, toate sesiunile se închid, datele rămân.
- **Reconfirmare**: ștergerea datelor, exportul/restaurarea backup-ului, schimbarea parolei și a securității cer confirmarea identității dacă ultima confirmare e mai veche de 10 minute.
- Fiecare pagină și fiecare `/api/...` trec prin `src/proxy.ts`, care verifică sesiunea pe server (fără sesiune → `/login` sau `401`) și respinge cererile care modifică date venite de pe alte site-uri (CSRF).
- Cookie de sesiune `HttpOnly`, `Secure`, `SameSite=Lax`; în baza de date se păstrează doar **hash-ul** token-ului. Schimbarea parolei închide celelalte sesiuni; poți închide oricând un dispozitiv din Setări.
- Blocare după parole greșite: 8 pe IP sau 10 pe cont → 15 minute (login-ul cu Face ID / amprentă nu e afectat).
- Parole: minim 12 caractere, PBKDF2-SHA512 cu 210.000 de iterații (hash-urile vechi se refac automat la login).
- Header-e de securitate pe toate paginile: CSP, HSTS, anti-iframe, `nosniff`, `Referrer-Policy`, `Permissions-Policy`.
- Istoricul autentificărilor (reușite și eșuate, cu dispozitiv și locație aproximativă) e în Setări.
- În Supabase, toate tabelele au RLS activ și nicio permisiune pentru `anon`/`authenticated`. Serverul se conectează cu rolul dedicat `bp_app`.
- Face ID / amprenta e legată de domeniul aplicației (app.leuta.ro); pe linkurile de previzualizare Vercel (protejate cu login Vercel) se intră cu parola (+ cod 2FA).

## ⚙️ Configurare (Vercel → Settings → Environment Variables)

| Variabilă | Valoare |
|---|---|
| `DATABASE_URL` | `postgres://bp_app.<project-ref>:<parola>@aws-1-eu-central-1.pooler.supabase.com:6543/postgres` |
| `CRON_SECRET` | un șir lung aleator (Vercel îl trimite automat la rularea cron-ului) |
| `TELEGRAM_BOT_TOKEN` | token-ul de la @BotFather (opțional, pentru Telegram) |
| `RESEND_API_KEY` | cheia API Resend (opțional, pentru email) |
| `RESEND_FROM` | opțional, ex. `Leuța <buget@domeniul-tau.ro>`; implicit `onboarding@resend.dev`, care trimite doar către adresa contului Resend |
| `APP_URL` | adresa aplicației (`https://app.leuta.ro`), pentru linkurile din emailuri, webhook-ul Telegram și redirecționările de pe site |
| `SITE_HOSTS` | opțional, adresele site-ului de prezentare, separate prin virgulă (implicit `leuta.ro,www.leuta.ro`) |
| `NEXT_PUBLIC_SITE_URL` / `NEXT_PUBLIC_APP_URL` | opțional, adresele folosite în paginile site-ului (implicit `https://leuta.ro` și `https://app.leuta.ro`) |
| `NEXT_PUBLIC_GA_ID` | opțional, Google Analytics 4 doar pe site, pornit numai după acordul vizitatorului |

Se folosește pooler-ul Supabase în mod *transaction* (port 6543). Dacă proiectul e pe celălalt cluster (`aws-0`), aplicația comută singură.

## 🌐 Site-ul de prezentare (leuta.ro)

- Același proiect și același deploy ca aplicația. `src/proxy.ts` alege după adresă: pe `leuta.ro` arată paginile din `src/app/(site)/site` la adresele scurte (`/`, `/confidentialitate`, `/termeni`, `/cookies`) și trimite orice altă pagină la `app.leuta.ro`; pe adresa aplicației, paginile legale merg la fel, iar prima pagină a site-ului se vede la `/site` (util în previzualizările Vercel).
- Componentele sunt în `src/components/site`, datele site-ului (operator, adrese, versiunea acordului) în `src/lib/site/config.ts`. Cât timp operatorul nu e completat acolo, site-ul nu se indexează.
- Formularul „Cere invitație” scrie direct în lista de așteptare (`/api/waitlist`), pe care o vezi în *Administrare*.

## 🗄️ Baza de date

- Schema: `supabase/migrations/0001_init.sql` (aceleași tabele ca vechiul SQLite), `0002_multi_user.sql`, `0003_loan_bank_schedule.sql` (graficul băncii ca sursă, situația la zi, asigurări anuale), `0004_security_hardening.sql` (passkey-uri, coduri de recuperare, sesiuni hash-uite, istoric), `0005_notifications.sql` (Telegram, jurnalul notificărilor), `0006_accounts_profiles.sql` (administrator, invitații, profilul utilizatorului), `0007_waitlist.sql` (lista de așteptare de pe site-ul de prezentare), `0008_totp.sql` (autentificarea în doi pași), `0009_recovery_check.sql` (verificarea periodică a codurilor de recuperare), `0010_password_resets.sql` (linkuri de resetare; codurile de recuperare dispar).
- Backup / restaurare: *Setări → Exportă JSON* / *Restaurează*.
- Editare directă: Supabase Dashboard → Table Editor.

## 🧪 Teste

Teste end-to-end ale API-ului (autentificare, protecția rutelor, CRUD, copiere lună, categorii, backup):

```bash
BASE_URL=https://app.leuta.ro TEST_USER=<utilizator> TEST_PASS=<parola> npm test
```

Testele își creează propriile date (luna `1999-01`) și le șterg la final. Cu `TEST_USER2`/`TEST_PASS2` (un al doilea cont) se verifică și izolarea datelor între conturi; dacă `TEST_USER` e administrator, se testează și fluxul de invitație (contul de test creat e șters la final).

## 💻 Dezvoltare locală (opțional)

```bash
npm install
# .env.local cu DATABASE_URL (vezi .env.example)
npm run dev   # http://localhost:3100
```
