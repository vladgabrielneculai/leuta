# Banii mei

Aplicație personală de buget: venituri, costuri fixe, cheltuieli variabile, economii, investiții și credite (scadențar de la bancă, recalculare automată, plăți anticipate), cu curs BNR și inflație România preluate automat.

**Rulează online** — se deschide din orice browser, de pe calculator sau telefon. Nu mai e nevoie de `npm install` / `npm run dev`.

| Componentă | Unde |
|---|---|
| Aplicația (Next.js 16) | Vercel, regiunea `fra1` (Frankfurt) |
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

## 🔐 Securitate

Aplicația e acum publică pe internet, deci:
- fiecare pagină și fiecare `/api/...` trec prin `src/proxy.ts`, care verifică sesiunea pe server (fără sesiune → `/login` sau `401`);
- cookie de sesiune `HttpOnly`, `Secure`, `SameSite=Lax`; sesiunile expirate se șterg automat;
- după 8 parole greșite de pe același IP, login-ul se blochează 15 minute;
- parole de minim 8 caractere; `/setup` funcționează doar cât timp nu există niciun cont;
- în Supabase, toate tabelele au RLS activ și nicio permisiune pentru `anon`/`authenticated`: API-ul public Supabase nu vede nimic. Serverul se conectează cu rolul dedicat `bp_app`.

## ⚙️ Configurare (Vercel → Settings → Environment Variables)

| Variabilă | Valoare |
|---|---|
| `DATABASE_URL` | `postgres://bp_app.<project-ref>:<parola>@aws-1-eu-central-1.pooler.supabase.com:6543/postgres` |

Se folosește pooler-ul Supabase în mod *transaction* (port 6543). Dacă proiectul e pe celălalt cluster (`aws-0`), aplicația comută singură.

## 🗄️ Baza de date

- Schema: `supabase/migrations/0001_init.sql` (aceleași tabele ca vechiul SQLite).
- Backup / restaurare: *Setări → Exportă JSON* / *Restaurează*.
- Editare directă: Supabase Dashboard → Table Editor.

## 🧪 Teste

Teste end-to-end ale API-ului (autentificare, protecția rutelor, CRUD, copiere lună, categorii, backup):

```bash
BASE_URL=https://<adresa-aplicatiei> TEST_USER=<utilizator> TEST_PASS=<parola> npm test
```

Testele își creează propriile date (luna `1999-01`) și le șterg la final.

## 💻 Dezvoltare locală (opțional)

```bash
npm install
# .env.local cu DATABASE_URL (vezi .env.example)
npm run dev   # http://localhost:3100
```
