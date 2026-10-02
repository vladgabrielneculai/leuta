# Banii mei

Aplicație nativă de desktop pentru Windows (`.exe`) dedicată gestiunii bugetului personal: venituri, costuri fixe, cheltuieli variabile, economii, investiții și credite (cu scadențar de la bancă, recalculare automată și plăți anticipate).

- **100% Windows Native**: Rulează în propria fereastră nativă de Windows, cu animație elegantă de deschidere (Splash Screen), meniu în System Tray și iconiță dedicată (fără a deschide browserul extern Microsoft Edge).
- **Rată Oficială a Inflației România în Timp Real**: Preluare automată de pe internet a ratei curente a inflației din România (INS / Eurostat IAPC) și integrare directă în proiecțiile financiare și în panoul de control.
- **Date 100% locale**: Baza de date SQLite se află în `data/buget.db` pe propriul calculator.

---

## 🚀 Pornire rapidă pe Windows

### Opțiunea 1: Direct ca aplicație Windows Native (.exe)
Fără ferestre negre de terminal și fără tab-uri de browser. Dublu-clic pe:
```
BaniiMei.exe
```
> **Scurtătură pe Desktop:** Rulează scriptul `creeaza-scurtatura-desktop.ps1` (sau comanda `npm run shortcut`) pentru a crea o scurtătură direct pe Desktop cu iconița aplicației.

La prima deschidere, aplicația te va întâmpina cu ecranul de **configurare inițială**:
1. Alege-ți numele de utilizator și parola.
2. Bifează opțiunea **„Încarcă date demonstrative”** pentru a avea preîncărcate exemple realiste (credit ipotecar cu scadențar și plăți anticipate, venituri, cheltuieli, investiții) înainte de a introduce datele tale.
3. Clic pe „Creează contul și pornește aplicația”.

---

### Opțiunea 2: Din linia de comandă (Node.js)

Ai nevoie de **Node.js 20 sau mai nou**.

```bash
# Instalare dependențe
npm install

# Pornire în mod dezvoltare
npm run dev

# Sau construire și pornire producție
npm run build
npm run start
```

Deschide [http://localhost:3100](http://localhost:3100) în browser.

---

## 🔑 Autentificare și Securitate Locală

- **Configurare la prima lansare (`/setup`)**: Dacă nu există utilizator configurat, aplicația cere setarea unui utilizator și a unei parole.
- **Ecran de Login (`/login`)**: Protejează accesul la datele tale financiare prin sesiune securizată (cookie HTTP-only).
- **Deconectare (Logout)**: Buton rapid de ieșire direct în bara laterală.
- **Schimbare credențiale**: Din pagina de **Setări → Securitate & Cont Local** poți schimba oricând utilizatorul și parola.

---

## 💳 Credite, Scadențar & Recalculare Plată Anticipată

- **Oricâte credite**: rate egale (anuități) sau descrescătoare, dobândă fixă, variabilă (marjă + IRCC) sau mixtă.
- **Scadențar oficial (Schema de rambursare a băncii)**:
  - Poți lipi direct tabelul din scadențarul primit de la bancă (copiat din Excel/PDF).
  - Sau poți genera automat schema completă din parametrii contractului.
- **Simulator & Recalculator avansat**:
  - Alege luna și suma plății anticipate.
  - **Scurtarea perioadei (păstrare rată)**: recalculează exact câte luni/ani se elimină din credit și dobânda totală economisită.
  - **Scăderea ratei (păstrare perioadă)**: recalculează noua valoare redusă a ratei lunare.
  - **Aplicare cu 1 clic**: Salvează plata direct în credit și o reflectă automat în bugetul lunar.
  - **Export CSV**: Descarcă scadențarul complet într-un fișier compatibil Excel.

---

## 🗄️ Baza de Date Locală (SQLite)

- Fișierul bazei de date se află în `data/buget.db`.
- **Deschidere în Windows Explorer**: În **Setări → Gestiune Bază de Date Locală**, apeși pe butonul *„Deschide în Windows Explorer”* pentru a merge direct la fișier.
- **Inspector vizual de tabele**: Poți vizualiza și gestiona direct din Setări înregistrările din tabelele `loans`, `entries`, `goals`, `investments`, `loan_schedules` etc.
- **Modificare externă**: Poți deschide și edita `data/buget.db` oricând cu [DB Browser for SQLite](https://sqlitebrowser.org/) sau DBeaver.
- **Date demo & Reset**: Butoane pentru reîncărcare rapidă a datelor de test sau ștergere completă pentru un nou început.

---

## 🇷🇴 Indicatori Oficiali în Timp Real (BNR & INSSE / Eurostat)

- **Curs Valutar BNR**: Cursul oficial EUR/RON este actualizat automat de la Banca Națională a României.
- **Rata Inflației din România**: Calculată pe baza indicelui armonizat al prețurilor de consum (IAPC / IPC), preluată oficial prin Eurostat Statistics API de la Institutul Național de Statistică (INSSE).
- **Proiecții Reale**: Economiile și randamentele investițiilor sunt exprimate automat în „bani de azi” ținând cont de rata reală curentă a inflației din România.
- **Panou dedicat în Setări**: Afișează valoarea curentă, luna de referință, sursa datelor și opțiuni de sincronizare sau personalizare.

---

## 🛠️ Recompilare executabil Windows

Dacă dorești să recompilezi executabilul după modificări în cod:
```bash
npm run build:exe
```
Scriptul construiește bundle-ul Next.js și compilează `BaniiMei.exe` folosind compilatorul C# nativ Windows (`csc.exe`) și biblioteca nativă `Microsoft.Web.WebView2`. Executabilul rezultat rulează ca aplicație nativă fără nicio dependență de Microsoft Edge.
