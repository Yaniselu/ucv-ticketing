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
- **Detalii verificate pe fotografiile stadionului nou:**
  - scaunele sunt toate albastre;
  - vomitoarele se deschid pe culoarul dintre inele și au numărul sectorului deasupra;
  - locurile din loje sunt pe terase, în fața geamurilor;
  - fațada are 9 lamele orizontale sub „val” și stâlpi care se ramifică în V;
  - cupola e o structură spațială albă deasă;
  - stadionul stă pe un podium pietonal (pasarela) cu pavaj gri, ziduri de beton și trepte de granit, poziționate după OpenStreetMap.
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

## Interiorul, după fotografiile reale

- **Cupola** e o structură spațială pe două straturi, din piramide pătrate cu grinzi albe, ca rețeaua deasă din fotografii.
- **Panourile translucide** lasă să treacă aproximativ jumătate din lumina soarelui. Pe gazon și pe scaune se vede pata de soare din dreptul deschiderii, iar restul e în umbra parțială a acoperișului, cu desenul grinzilor.
- **În spatele tribunelor** sunt stâlpi albi, o grindă la jumătatea înălțimii și vitraj.
- **Exterior:** bordura albă la marginea placajului, iar parterul are perete cortină din sticlă cu porți și turnicheți.

## Orașul fotorealist (Google Photorealistic 3D Tiles)

Pentru ca împrejurimile să arate exact ca în realitate, aplicația poate încărca modelul 3D al orașului de la Google, aceeași sursă ca Google Earth. Stadionul din modelul Google e decupat automat și în locul lui rămâne modelul nostru, cu toate locurile.

1. În Google Cloud Console activează **Map Tiles API** și creează o cheie API. Restricționeaz-o la domeniul site-ului (HTTP referrer) și la Map Tiles API.
2. În Vercel deschide proiectul **ucv-ticketing**, apoi Settings → Environment Variables, și adaugă `VITE_GOOGLE_MAPS_API_KEY` cu valoarea cheii.
3. Fă un redeploy. Fără cheie, aplicația folosește împrejurimile construite din OpenStreetMap: străzi cu asfalt, marcaje, borduri și trotuare, parcări cu mașini 3D, spații verzi, Sala Polivalentă cu acoperiș curb și clădirile extrudate.

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
| Public (sectoarele 3–17, colțurile, Tribuna 0 și 1) | 28.033 |
| VIP A–F | 1.928 |
| Loje (42: 101–120 și 201–222) | 440 |
| Presă | 350 |
| Persoane în scaun rulant + însoțitori | 116 + 116 |
| **Total** | **30.983** |

## Ce este real și ce este estimat

**Din surse publice:**
- Capacitatea de 30.983 și defalcarea pe categorii (bursa.ro, Wikipedia). Clubul și arhitectul indică 30.944. Diferența de 39 de locuri nu este explicată public, iar defalcarea completă există doar pentru 30.983.
- Cele 4 zone: Tribuna 1 (vest, VIP, presă, loje), Tribuna 2 (est), Peluza Nord, Peluza Sud (ucv1948.ro/stadion).
- Cele 18 sectoare și numele lor după legendele Craiovei Maxima (Fanatik, sept. 2026).
- Structura de prețuri și sectoare: Tribuna 2 cu sectoarele 7–13, Inel 1 / Inel 2, Tribuna 0, Tribuna 1 și VIP A–F. Prețurile sunt cele pentru meciurile din UEFA Conference League 2026/27 (abonamente.ucv1948.ro).
- **Așezarea sectoarelor după harta oficială „Bilete Superliga 2026–2027” a clubului:**
  - Peluza Nord: sectoarele 3–6, de la vest la est.
  - Tribuna 2: 7 (colț NE), apoi 8–12 pe Inel 1 și Inel 2, de la nord la sud, și 13 (colț SE).
  - Peluza Sud: patru sectoare.
  - Colțul nord-vest se vinde ca Tribuna 1, iar colțul sud-vest e gri pe hartă, adică nu se vinde public.
  - Tribuna 1: VIP A–F la nivelul terenului, loje 101–120 (119 și 120 sunt duble) și 201–222, masa presei sus la mijloc, Tribuna 0 de o parte și de alta a ei, iar la capete Tribuna 0 jos și Tribuna 1 sus.
- **Intrările în tribune:** fiecare sector are un singur vomitor, cu numărul sectorului deasupra, ca în fotografia Peluzei Nord (intrările 3, 4, 5, 6).
- **Porți:** poarta 6 servește Peluza Nord și poarta 8 Tribuna 2.
- Terenul de 105 × 68 m, înălțimea de 50,14 m, bolul cu un singur inel de gradene acoperit integral, ecranele din colțurile NE și SV (stadiumdb.com, ucv1948.ro).

**Estimat** (nu există un plan public al locurilor):
- Numărul de locuri pe fiecare sector și numărul de rânduri. Geometria e proporționată după fotografii, apoi locurile sunt distribuite exact pe totalurile oficiale.
- Numerele sectoarelor 1, 2 și 18 (harta nu le arată; presa menționează „Tribuna I sector 1”) și numerotarea 14–17 în Peluza Sud, dedusă din ordinea celorlalte. Colțul sud-vest e tratat ca zona fanilor oaspeți.
- Celelalte porți, prețul locurilor din loje și numărul de locuri din fiecare lojă: 10, respectiv 20 în lojile duble, astfel încât cele 42 de loje să dea 440 de locuri.
- Disponibilitatea locurilor: este simulată, dar deterministă (`src/data/availability.js`). Într-o integrare reală vine din API-ul de ticketing.

Toate aceste valori sunt în `src/data/stadium-data.js` și se pot corecta pe măsură ce apar date oficiale.
