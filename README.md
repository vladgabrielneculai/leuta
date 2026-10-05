# Banii mei

Aplicație personală de buget: venituri, costuri fixe, cheltuieli variabile, economii, investiții și credite (scadențar de la bancă, recalculare automată, plăți anticipate), cu curs BNR și inflație România preluate automat.

**Rulează online** — se deschide din orice browser, de pe calculator sau telefon. Nu mai e nevoie de `npm install` / `npm run dev`.

| Componentă | Unde |
|---|---|
| Aplicația (Next.js 16) | https://buget-personal-beta.vercel.app — Vercel, regiunea `fra1` (Frankfurt) |
| Baza de date (Postgres) | Supabase, proiectul `buget-personal` (`eu-central-1`) |
| Codul | GitHub `vladgabrielneculai/buget-personal` — orice push pe `main` se publică automat |

---

## 📱 Pe telefon

Deschide adresa aplicației în browser, apoi:
- **iPhone (Safari):** Share → *Add to Home Screen*
- **Android (Chrome):** meniul ⋮ → *Install app* / *Add to Home screen*

Se deschide ca o aplicație separată, cu bara de navigare jos (Panou · Luna · Credite · Economii · Mai mult) și luna analizată mereu vizibilă sus.

## 🖥️ Pe Windows

`BaniiMei.exe` deschide versiunea online în propria fereastră (tray, splash, fără tab de browser). Nu mai pornește niciun server local și nu mai cere Node.js. Adresa se citește din `BaniiMei.url.txt`, lângă exe.

---

## 🏦 Credite din graficul băncii

- **Credite → „Adaugă din grafic PDF”**: încarci graficul de rambursare descărcat din George (BCR). Se citesc suma, soldul actual, data acordării, dobânzile pe perioade, nr. contractului și toate ratele (principal, dobândă, asigurare, sold).
- Pe un credit existent: **„Actualizează graficul / situația la zi”** → PDF nou (după o plată anticipată sau o schimbare de dobândă) sau datele copiate manual din aplicația băncii (sold, următoarea rată, principal, dobândă, taxe lunare, maturitate, restanțe, rata dobânzii), din care graficul se reconstruiește până la maturitate.
- Cu graficul activ, ratele din buget, soldul și dobânda se iau exact din grafic; plățile anticipate și scenariile de IRCC recalculează restul ca banca.
- Asigurarea PAD și cea facultativă (anuale) apar ca sumă întreagă în luna scadenței, în fiecare an; suma restantă se adaugă la plățile lunii în care a fost raportată.

## 🔐 Securitate

- **Passkey obligatoriu** (amprentă / Face ID / Windows Hello): după primul passkey adăugat în *Setări → Passkey-uri & dispozitive*, parola singură nu mai deschide contul. Pentru urgențe: parola + unul din cele 10 **coduri de recuperare** (o singură folosire fiecare).
- **Reconfirmare**: ștergerea datelor, exportul/restaurarea backup-ului, schimbarea parolei și a passkey-urilor cer confirmarea identității dacă ultima confirmare e mai veche de 10 minute.
- Fiecare pagină și fiecare `/api/...` trec prin `src/proxy.ts`, care verifică sesiunea pe server (fără sesiune → `/login` sau `401`) și respinge cererile care modifică date venite de pe alte site-uri (CSRF).
- Cookie de sesiune `HttpOnly`, `Secure`, `SameSite=Lax`; în baza de date se păstrează doar **hash-ul** token-ului. Schimbarea parolei închide celelalte sesiuni; poți închide oricând un dispozitiv din Setări.
- Blocare după parole greșite: 8 pe IP sau 10 pe cont → 15 minute (login-ul cu passkey nu e afectat).
- Parole: minim 12 caractere, PBKDF2-SHA512 cu 210.000 de iterații (hash-urile vechi se refac automat la login).
- Header-e de securitate pe toate paginile: CSP, HSTS, anti-iframe, `nosniff`, `Referrer-Policy`, `Permissions-Policy`.
- Istoricul autentificărilor (reușite și eșuate, cu dispozitiv și locație aproximativă) e în Setări.
- În Supabase, toate tabelele au RLS activ și nicio permisiune pentru `anon`/`authenticated`. Serverul se conectează cu rolul dedicat `bp_app`.
- Passkey-urile sunt legate de domeniul aplicației; pe linkurile de previzualizare Vercel (protejate cu login Vercel) se intră cu parola + cod de recuperare.

## ⚙️ Configurare (Vercel → Settings → Environment Variables)

| Variabilă | Valoare |
|---|---|
| `DATABASE_URL` | `postgres://bp_app.<project-ref>:<parola>@aws-1-eu-central-1.pooler.supabase.com:6543/postgres` |

Se folosește pooler-ul Supabase în mod *transaction* (port 6543). Dacă proiectul e pe celălalt cluster (`aws-0`), aplicația comută singură.

## 🗄️ Baza de date

- Schema: `supabase/migrations/0001_init.sql` (aceleași tabele ca vechiul SQLite), `0002_multi_user.sql`, `0003_loan_bank_schedule.sql` (graficul băncii ca sursă, situația la zi, asigurări anuale), `0004_security_hardening.sql` (passkey-uri, coduri de recuperare, sesiuni hash-uite, istoric).
- Backup / restaurare: *Setări → Exportă JSON* / *Restaurează*.
- Editare directă: Supabase Dashboard → Table Editor.

## 🧪 Teste

Teste end-to-end ale API-ului (autentificare, protecția rutelor, CRUD, copiere lună, categorii, backup):

```bash
BASE_URL=https://buget-personal-beta.vercel.app TEST_USER=<utilizator> TEST_PASS=<parola> npm test
```

Testele își creează propriile date (luna `1999-01`) și le șterg la final.

## 💻 Dezvoltare locală (opțional)

```bash
npm install
# .env.local cu DATABASE_URL (vezi .env.example)
npm run dev   # http://localhost:3100
```
