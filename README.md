# UCV Ticketing – Stadionul „Ion Oblemenco” 3D

Prototip de ticketing cu harta 3D a stadionului din Craiova, în stilul celor folosite de cluburile din LaLiga:

1. **Stadionul** din exterior: carcasa „ou” inspirată de Brâncuși, cu structura albă în X și acoperișul translucid. Treci cu mouse-ul peste o tribună ca să vezi prețul și locurile libere.
2. **Tribuna**: camera zboară la tribuna aleasă, sectoarele sunt numerotate, iar **locurile libere sunt verzi**.
3. **Sectorul**: zoom până la scaune. Alegi un loc (sau „Alege automat cele mai bune locuri”) și primești biletul cu rândul, locul, poarta și **„Vederea ta”**, randată din scaunul ales.
4. **Vederea din loc**: camera se pune la nivelul ochilor din scaun. Tragi cu mouse-ul ca să privești în jur.
5. **Lojele VIP**: 40 de loje pe două niveluri. Intri în lojă și alegi un fotoliu.

Coș cu maximum 4 bilete (regula clubului), rezervare temporară de 10 minute și un checkout demonstrativ.

## Împrejurimi reale, 1:1

- **Solul** este imaginea satelit reală (Esri World Imagery), încărcată în browser pe trei niveluri de detaliu: aproximativ 0,4 m/pixel lângă stadion, apoi tot mai puțin detaliat spre marginea orașului.
- **Clădirile și străzile** vin din OpenStreetMap (`public/data/craiova.json`, generat de `npm run osm`): 6.024 de clădiri pe o rază de 1 km, extrudate după contur și numărul de etaje (Sala Polivalentă, Malmo Office Tower, blocurile A0–A4 etc.). Acoperișurile sunt texturate cu imaginea satelit, iar numele străzilor apar în vederea de ansamblu.
- **Copacii** sunt detectați automat din imaginea satelit (coroanele verzi), deci stau unde sunt și în realitate.
- **Tribunele** sunt reconstituite după fotografiile din interior: inelul de jos are 16 rânduri peste tot, iar cel de sus are de la 38 de rânduri la mijlocul laturilor până la 16 în colțuri. Marginea de sus urcă și coboară în trepte, cu pereți albi în spate, vomitoare la jumătatea inelului, balustradă de sticlă pe culoar, grindă inelară cu stâlpi și cupolă din arce de oțel.
- **Fațada:** placajul alb e doar deasupra „valului”. Dedesubt se văd structura albă în X, lamelele de aluminiu și clădirea vitrată de pe mai multe niveluri.
- **Stadionul** e așezat și orientat după conturul real din OpenStreetMap: terenul e rotit cu 12,4° față de nord, iar carcasa are 207 × 230 m. Soarele are aceeași poziție ca în imaginea satelit, ca umbrele reale să se potrivească.

## Realism

- **Gazonul** are variații de culoare la mai multe scări, zone tocite în careuri și pe linia de tușă, microrelief pentru firele de iarbă și dungi de tuns care se schimbă după unghiul din care privești, ca la un gazon real.
- **În vederea din scaun și în loje**, pe locurile deja vândute apar spectatori: fani în alb-albastru, cei din sectorul oaspeților, VIP-uri și jurnaliști.
- **Imaginea satelit** folosește cel mai fin nivel pe care Esri îl are pentru Craiova (z18, ≈ 0,4 m/pixel). Nivelul z19 nu există pentru zonă.
- **Copacii** au frunziș texturat în locul formelor pline.
- **Clădirile** au fațade diferite pentru case, blocuri și clădiri de birouri.
- **Pe calculator** imaginea primește ocluzie ambientală, o strălucire discretă a luminilor și gradare de culoare.

## Locurile 1:1 cu stadionul real

Totalurile sunt exacte (30.983), dar împărțirea pe rânduri și pe locuri în fiecare sector este reconstituită din geometrie și fotografii. Pentru potrivire 1:1 e nevoie de planul oficial al locurilor (sector → rând → numerele locurilor), pe care îl are furnizorul de ticketing al clubului (myticket / Entertix). Odată primit, planul se poate importa direct în generatorul din `src/data/layout.js`.

## Rulare

```bash
npm install
npm run dev      # http://localhost:5173
npm run build    # build static în dist/
npm run verify   # verifică faptul că harta are exact 30.983 de locuri
npm run osm      # regenerează datele OpenStreetMap din jurul stadionului
```

Stack: Vite + three.js, fără framework. Se poate publica pe orice hosting static (Vercel detectează automat Vite).

## Capacitatea, exact la număr

`src/data/layout.js` generează fiecare loc (sector, rând, număr, poziție 3D), iar `npm run verify` verifică totalurile:

| Categorie | Locuri |
|---|---:|
| Public (sectoarele 1–18, oaspeți, Tribuna 0 și 1) | 28.033 |
| VIP A–F | 1.928 |
| Loje (40 × 11) | 440 |
| Presă | 350 |
| Persoane în scaun rulant + însoțitori | 116 + 116 |
| **Total** | **30.983** |

## Ce este real și ce este estimat

**Din surse publice:**
- Capacitatea de 30.983 și defalcarea pe categorii (bursa.ro, Wikipedia). Clubul și arhitectul indică 30.944. Diferența de 39 de locuri nu este explicată public, iar defalcarea completă există doar pentru 30.983.
- Cele 4 zone: Tribuna 1 (vest, VIP, presă, loje), Tribuna 2 (est), Peluza Nord, Peluza Sud (ucv1948.ro/stadion).
- Cele 18 sectoare și numele lor după legendele Craiovei Maxima (Fanatik, sept. 2026).
- Structura de prețuri și sectoare: Tribuna 2 cu sectoarele 7–13, Inel 1 / Inel 2, Tribuna 0, Tribuna 1 și VIP A–F. Prețurile sunt cele pentru meciurile din UEFA Conference League 2026/27 (abonamente.ucv1948.ro).
- Peluza Nord include sectoarele 4 și 5. Poarta 6 servește Peluza Nord și poarta 8 Tribuna 2.
- Terenul de 105 × 68 m, înălțimea de 50,14 m, bolul cu un singur inel de gradene acoperit integral, ecranele din colțurile NE și SV (stadiumdb.com, ucv1948.ro).

**Estimat** (nu există un plan public al locurilor):
- Numărul de locuri pe fiecare sector și numărul de rânduri. Geometria e proporționată după fotografii, apoi locurile sunt distribuite exact pe totalurile oficiale.
- Poziția exactă a sectoarelor 1 și 18 în colțurile de vest și a sectorului oaspeților în Peluza Sud.
- Celelalte porți, prețul locurilor din loje și numărul de fotolii din fiecare lojă (11, astfel încât 40 de loje să dea 440 de locuri).
- Disponibilitatea locurilor: este simulată, dar deterministă (`src/data/availability.js`). Într-o integrare reală vine din API-ul de ticketing.

Toate aceste valori sunt în `src/data/stadium-data.js` și se pot corecta pe măsură ce apar date oficiale.
