<div align="center">

<img src="src/app/icon.svg" alt="Sigla Leuța" width="88" height="88">

# Leuța

**Bugetul tău, ban cu ban.**

O aplicație web de buget personal pentru România: venituri, cheltuieli, credite și economii, într-un singur loc.

[**Deschide aplicația**](https://app.leuta.ro) · [Site de prezentare](https://leuta.ro) · [Bot Telegram](https://t.me/leuta_app_bot)

![Next.js 16](https://img.shields.io/badge/Next.js-16-000000?logo=nextdotjs&logoColor=white)
![React 18](https://img.shields.io/badge/React-18-61DAFB?logo=react&logoColor=black)
![TypeScript](https://img.shields.io/badge/TypeScript-5-3178C6?logo=typescript&logoColor=white)
![PostgreSQL](https://img.shields.io/badge/Supabase-Postgres-3FCF8E?logo=supabase&logoColor=white)
![Vercel](https://img.shields.io/badge/Vercel-fra1-000000?logo=vercel&logoColor=white)

<sub>A personal budgeting web app for Romania (UI in Romanian): income, expenses, bank loans, savings, BNR exchange rates and inflation.</sub>

</div>

<br>

![Panoul aplicației Leuța pe calculator](public/ecrane/d-light-home.webp)

<table>
  <tr>
    <td align="center"><img src="public/ecrane/qa-0.webp" alt="Panoul pe telefon" width="240"></td>
    <td align="center"><img src="public/ecrane/qa-3.webp" alt="Adăugarea rapidă a unei cheltuieli" width="240"></td>
    <td align="center"><img src="public/ecrane/qa-5.webp" alt="Bugetul recalculat după adăugare" width="240"></td>
  </tr>
  <tr>
    <td align="center"><sub>Toată luna pe un ecran</sub></td>
    <td align="center"><sub>O cheltuială în trei atingeri</sub></td>
    <td align="center"><sub>Bugetul se recalculează pe loc</sub></td>
  </tr>
</table>

## Cuprins

- [Ce face](#ce-face)
- [Cum se folosește](#cum-se-folosește)
- [Tehnologii](#tehnologii)
- [Pornire locală](#pornire-locală)
- [Configurare](#configurare)
- [Publicare](#publicare)
- [Teste](#teste)
- [Securitate](#securitate)
- [Structura proiectului](#structura-proiectului)
- [Licență](#licență)

## Ce face

**Buget lunar**
- Venituri, costuri fixe, cheltuieli variabile și economii, cu subtotaluri pe categorii. Intrările lunare se copiază în luna următoare dintr-un buton.
- Adăugare rapidă: butonul „+”, suma, categoria. Sumele se pot trece și în euro, la cursul BNR al zilei.
- Panou cu repartizarea venitului, ultimele 12 luni, avere netă și sfaturi pentru luna curentă (fond de urgență, rata de economisire, dobânzi).
- Metode de buget: 50/30/20, procente alese de tine, buget bazat pe zero și una „recomandată pentru tine” pe baza profilului.
- *Îmi permit?*: compară plata integrală cu un credit și arată cum se schimbă venitul lunar.

**Credite**
- Import din graficul de rambursare al băncii (PDF din George / BCR sau Excel): sold, dobânzi pe perioade, toate ratele, asigurări.
- Actualizare din PDF nou sau din datele copiate din aplicația băncii; graficul se reconstruiește până la maturitate.
- Simulări de plăți anticipate și scenarii IRCC, recalculate ca la bancă.

**Economii și investiții**
- Fondul de urgență măsurat în luni de cheltuieli, obiective cu termen și suma lunară necesară.
- Curs BNR și inflația din România (INS) preluate automat.

**Notificări**
- Telegram: reminder seara, scadențe, alerte de buget. Botului îi poți scrie `45 mâncare` sau `+5000 salariu` și intrarea apare în aplicație.
- Email (Resend): rezumat săptămânal și bilanțul lunii.
- Rapoartele arată ca un bon de casă (imagine pe Telegram, HTML pe email, PDF descărcabil pentru orice lună).

**Conturi**
- Mai mulți utilizatori, fiecare cu datele lui. Separarea e făcută în Postgres (row-level security), nu doar în interfață.
- Conturi noi doar pe bază de invitație. Primul cont creat e administratorul.
- Profil (venit, stabilitate, obiective, risc) care influențează recomandările. Contul nou trece printr-un ghid de început în 4 pași.

**Aspect**
- Temă de zi și de noapte, cu o paletă inspirată din bancnotele românești.
- Se instalează pe telefon ca aplicație (PWA) și are o variantă Windows (`Leuta.exe`).

## Cum se folosește

Aplicația rulează online la **[app.leuta.ro](https://app.leuta.ro)**. Conturile se fac pe bază de invitație: cere una pe [leuta.ro](https://leuta.ro), apoi deschide linkul primit sau lipește codul în fila *Cont nou* de pe pagina de login.

**Pe telefon**, deschide adresa în browser și adaug-o pe ecranul principal:
- iPhone (Safari): Share → *Add to Home Screen*
- Android (Chrome): meniul ⋮ → *Install app*

**Pe Windows**, `Leuta.exe` deschide versiunea online într-o fereastră separată (cu iconiță în tray). Se construiește cu `npm run build:exe`; adresa se citește din `Leuta.url.txt`, iar scurtătura de pe Desktop se face cu `npm run shortcut`.

## Tehnologii

| Zonă | Ce folosește |
|---|---|
| Aplicație | Next.js 16 (App Router), React 18, TypeScript, Tailwind CSS |
| Bază de date | PostgreSQL pe Supabase, cu row-level security și un rol dedicat (`bp_app`) |
| Găzduire | Vercel, regiunea `fra1` (Frankfurt), plus Vercel Cron pentru notificări |
| Autentificare | Parolă (PBKDF2), Face ID / amprentă (WebAuthn, `@simplewebauthn`), 2FA cu coduri TOTP |
| Grafice și documente | Recharts, `pdf-parse` (import), `pdf-lib` (bonul lunii), `read-excel-file`, `next/og` |
| Notificări | Telegram Bot API, Resend (email) |

Site-ul de prezentare (leuta.ro) și aplicația (app.leuta.ro) sunt același proiect Next.js. `src/proxy.ts` alege ce pagini servește după domeniu.

## Pornire locală

Instrucțiunile sunt pentru autor și pentru colaboratorii care au acordul lui (vezi [Licență](#licență)). Ai nevoie de **Node.js 20+** și **PostgreSQL** (local sau un proiect Supabase).

```bash
git clone https://github.com/vladgabrielneculai/leuta.git
cd leuta
npm install
```

**1. Baza de date.** Pe un Postgres local, creează rolurile și aplică migrările în ordine:

```bash
createdb leuta
psql -d leuta -c "create role anon nologin; create role authenticated nologin; create role bp_app login password 'parola-locala';"
for f in supabase/migrations/*.sql; do psql -d leuta -v ON_ERROR_STOP=1 -f "$f"; done
```

Rolurile `anon` și `authenticated` există deja în Supabase; local sunt cerute doar de migrări. Pe Supabase, rulează fișierele din `supabase/migrations` în SQL Editor, în aceeași ordine.

**2. Variabilele de mediu.** Copiază `.env.example` în `.env.local` și completează măcar conexiunea:

```bash
DATABASE_URL=postgres://bp_app:parola-locala@localhost:5432/leuta
```

**3. Pornește aplicația.**

```bash
npm run dev   # http://localhost:3100
```

La prima deschidere ajungi la `/setup`, unde creezi contul de administrator. Din *Setări → Bază de date* poți încărca date demonstrative (2 credite, venituri, cheltuieli) ca să vezi aplicația plină.

| Comandă | Ce face |
|---|---|
| `npm run dev` | server de dezvoltare pe portul 3100 |
| `npm run build` / `npm start` | build de producție și pornirea lui |
| `npm test` | testele end-to-end ale API-ului (vezi [Teste](#teste)) |

## Configurare

| Variabilă | Obligatorie | Rol |
|---|---|---|
| `DATABASE_URL` | da | conexiunea Postgres cu rolul `bp_app`. Pe Supabase, pooler-ul în mod *transaction*: `postgres://bp_app.<project-ref>:<parola>@aws-1-eu-central-1.pooler.supabase.com:6543/postgres` |
| `APP_URL` | în producție | adresa aplicației (ex. `https://app.leuta.ro`), folosită în emailuri, webhook-ul Telegram și linkurile de invitație/resetare |
| `CRON_SECRET` | pentru notificări | un șir lung aleator; Vercel îl trimite la rularea cron-ului |
| `TELEGRAM_BOT_TOKEN` | nu | token-ul de la @BotFather |
| `RESEND_API_KEY` | nu | cheia Resend, pentru email |
| `RESEND_FROM` | nu | expeditorul, ex. `Leuța <buget@domeniul-tau.ro>` (implicit `onboarding@resend.dev`) |
| `SITE_HOSTS` | nu | domeniile site-ului de prezentare (implicit `leuta.ro,www.leuta.ro`) |
| `NEXT_PUBLIC_SITE_URL` / `NEXT_PUBLIC_APP_URL` | nu | adresele folosite în paginile site-ului |
| `NEXT_PUBLIC_GA_ID` | nu | Google Analytics 4, doar pe site și doar după acordul vizitatorului |

Dacă proiectul Supabase e pe celălalt cluster de pooler (`aws-0`), aplicația comută singură.

## Publicare

Producția rulează pe Vercel, cu baza de date pe Supabase (`eu-central-1`):

1. Importă repository-ul în Vercel și setează variabilele de mai sus (*Settings → Environment Variables*).
2. Aplică migrările din `supabase/migrations` pe baza de date.
3. Orice push pe `main` se publică automat; pull request-urile primesc un link de previzualizare.

`vercel.json` programează notificările zilnice la 18:00 și 19:00 UTC, ca să prindă ora 21:00 în România și vara, și iarna. Pentru domenii: leuta.ro servește site-ul de prezentare, iar app.leuta.ro aplicația.

## Teste

Testele end-to-end lovesc API-ul unei instanțe care rulează (locală sau online) și verifică autentificarea, 2FA, resetarea accesului, protecția rutelor, CRUD, copierea lunii, categoriile și backup-ul:

```bash
BASE_URL=http://localhost:3100 TEST_USER=<utilizator> TEST_PASS=<parola> npm test
```

Testele își creează propriile date (luna `1999-01`) și le șterg la final. Cu `TEST_USER2` / `TEST_PASS2` (un al doilea cont) se verifică și izolarea datelor între conturi. Dacă `TEST_USER` e administrator, se testează și invitațiile.

## Securitate

- **Face ID / amprentă** (WebAuthn cu autentificatorul dispozitivului) și **autentificare în doi pași** cu orice aplicație TOTP (Google/Microsoft Authenticator, 1Password, Parole pe iPhone). Cu 2FA activ, parola singură nu mai deschide contul.
- **Parolă uitată sau telefon pierdut**: administratorul creează din *Administrare → Conturi* un link de resetare (o singură folosire, 24 de ore). Datele rămân; 2FA, Face ID și sesiunile se resetează.
- **Reconfirmarea identității** pentru acțiuni sensibile (export, ștergere, schimbarea parolei sau a securității), valabilă 10 minute.
- Fiecare pagină și fiecare `/api/...` trec prin `src/proxy.ts`: verificarea sesiunii pe server și protecție CSRF.
- Cookie de sesiune `HttpOnly`, `Secure`, `SameSite=Lax`; în baza de date se păstrează doar hash-ul token-ului.
- Parole de minim 12 caractere, PBKDF2-SHA512 cu 210.000 de iterații. Blocare temporară după încercări greșite (8 pe IP sau 10 pe cont, 15 minute).
- Header-e de securitate pe toate paginile: CSP, HSTS, anti-iframe, `nosniff`, `Referrer-Policy`, `Permissions-Policy`.
- RLS activ pe toate tabelele, fără permisiuni pentru `anon` / `authenticated`.
- Administratorul gestionează conturile, dar **nu vede** datele financiare sau profilul celorlalți.

Ai găsit o problemă de securitate? Te rog să nu deschizi un issue public: scrie-i direct autorului prin GitHub.

## Structura proiectului

```
src/
├── app/
│   ├── (app)/          paginile aplicației: panou, luna, credite, economii, setări, admin…
│   ├── (site)/         site-ul de prezentare și paginile legale (leuta.ro)
│   └── api/            rutele API: autentificare, CRUD, import grafic, cron, Telegram…
├── components/         componente React (formulare, securitate, bonul, site)
├── lib/                logica: calcul credite, buget, curs BNR, inflație, notificări, autentificare
└── proxy.ts            sesiune, CSRF și alegerea paginilor după domeniu
brand/                  sigla oficială: SVG, PNG, PDF și fișierele pentru înregistrarea mărcii
supabase/migrations/    schema bazei de date, în ordine
tests/                  testele end-to-end ale API-ului
public/                 iconițe, capturi de ecran, sigla din emailuri
```

Pentru modificări la baza de date, adaugă o migrare nouă numerotată în `supabase/migrations` (de ex. `0011_….sql`) în loc să le editezi pe cele existente.

## Licență

© 2026 Vlad Gabriel Neculai. **Toate drepturile rezervate.** Codul e public doar pentru consultare: copierea, modificarea, distribuirea sau rularea unei copii a aplicației nu sunt permise fără acordul scris al autorului. Detalii în [LICENSE](LICENSE).
