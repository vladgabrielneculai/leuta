# Instrucțiuni pentru Claude

## Medii și baza de date

- `main` → producție: leuta.ro (site) și app.leuta.ro (aplicație).
- `staging` → beta: beta.leuta.ro și beta-app.leuta.ro. Funcționalitățile noi se testează aici înainte de a ajunge pe `main`.
- **Beta și producția folosesc ACEEAȘI bază de date Supabase** (proiectul „Leuța”, `doppjyazntrybaozkzad`). Nu există o bază separată pentru teste.
- Contul de test este `tester.beta` (utilizator obișnuit, nu administrator).

## Regulă obligatorie: avertizare la modificarea bazei de date

Înainte de a implementa orice funcționalitate nouă, verifică dacă ea modifică structura bazei de date. Asta înseamnă:
o migrare nouă în `supabase/migrations/`, tabele, coloane, indexuri, politici RLS, roluri sau funcții noi ori modificate,
sau orice instrucțiune `CREATE` / `ALTER` / `DROP`.

Dacă da, **avertizează utilizatorul explicit și cere confirmarea ÎNAINTE** de a scrie migrarea și înainte de a o aplica. Avertismentul trebuie să spună:

1. ce se schimbă în structură (tabele/coloane/politici, pe scurt);
2. că schimbarea ajunge **direct în producție** chiar dacă e testată doar pe beta, pentru că baza de date e comună;
3. dacă schimbarea poate afecta datele sau funcționarea aplicației live (ex. coloane șterse/redenumite, `NOT NULL` fără valoare implicită, politici RLS mai stricte) și cum se poate reveni.

Preferă migrări compatibile cu versiunea din producție (doar adăugări: tabele noi, coloane opționale), ca aplicația de pe `main` să funcționeze în continuare cât timp funcționalitatea e testată pe `staging`.

Dacă funcționalitatea nu atinge structura bazei de date, spune asta pe scurt („Fără modificări la baza de date.”).

## Commit-uri

- Toate commit-urile se fac cu autorul **Vlad Gabriel Neculai `<81146225+vladgabrielneculai@users.noreply.github.com>`** (setat automat din `.claude/settings.json`; dacă lipsește, rulează `git config user.name` / `git config user.email` cu aceste valori înainte de commit).
- **Nu adăuga linia `Co-Authored-By:`** în mesajele de commit. Repository-ul e privat și Vercel (planul Hobby) blochează deploy-urile pentru commit-urile cu alt autor sau co-autor decât proprietarul contului.
- Lucrează doar pe `main`, `staging` și branch-ul curent; branch-urile vechi se șterg după merge.
