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

Fiecare sector are exact numărul de locuri din planul oficial al stadionului (30.803 în total). Împărțirea pe rânduri și numerotarea locurilor din rând sunt reconstituite din fotografii. Pentru potrivire 1:1 cu biletele e nevoie de lista oficială rând cu rând (sector → rând → numerele locurilor), pe care o are furnizorul de ticketing al clubului (myticket / Entertix). Odată primită, lista se poate importa în generatorul din `src/data/layout.js`.

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
npm run verify   # verifică locurile pe fiecare sector (30.803 în total)
npm run osm      # regenerează datele OpenStreetMap din jurul stadionului
npm run tune     # recalculează granițele sectoarelor după o schimbare de geometrie
```

Stack: Vite + three.js, fără framework. Se poate publica pe orice hosting static (Vercel detectează automat Vite).

## Capacitatea, exact la număr

Sursa este planul oficial al stadionului „Ion Oblemenco”, cu locurile pe fiecare sector și un **total de 30.803**. `src/data/layout.js` generează fiecare loc (sector, rând, număr, poziție 3D), iar `npm run verify` verifică:
- că fiecare sector are exact numărul de locuri din plan;
- că totalul este exact;
- că niciun loc nu se suprapune cu altul.

| Zonă | Sectoare (locuri) | Total |
|---|---|---:|
| Tribuna 1 | 18 (929, oaspeți), 19 (1.268, jumătatea dinspre colț pentru oaspeți), G (343), I (355), 1 (1.221), 2 (956) | 5.072 |
| VIP | A (190), B (399), C (383), D (383), E (399), F (190) | 1.944 |
| Loje | 101–120 și 201–222 | 440 |
| Presă | H | 336 |
| Peluza 1 (Sud) | 14 (1.340), 15 (1.734), 16 (1.771), 17 (1.325) | 6.170 |
| Peluza 2 (Nord) | 3 (1.338), 4 (1.626), 5 (1.762), 6 (1.327) | 6.053 |
| Tribuna 2 | 7 (964), 8 (1.367), 9 (1.962), 10 (2.112), 11 (1.921), 12 (1.437), 13 (963) | 10.726 |
| Persoane în scaun rulant | 2 zone în fața Tribunei 2 (sectoarele 8–9 și 11–12) | 62 |
| **Total** | | **30.803** |

### Cum se potrivește fiecare sector

`npm run tune` (`scripts/tune-seats.mjs`) calculează lățimea locului (0,511 m public, 0,544 m VIP) și granițele dintre sectoare, astfel încât geometria să dea fiecărui sector puțin peste numărul oficial. Rezultatul e salvat în `src/data/sector-bounds.js`.

Surplusul (sub 40 de locuri pe sector) se scoate astfel: în câteva rânduri din spate rămâne un loc mai puțin, iar celelalte locuri se distanțează egal. Marginile blocurilor rămân drepte. Rulează `npm run tune` după orice schimbare a geometriei.

## Ce este real și ce este estimat

**Din surse publice:**
- Capacitatea de 30.803 și locurile pe fiecare sector, din planul oficial al stadionului. Alte surse dau 30.983 (bursa.ro, Wikipedia) sau 30.944 (clubul, arhitectul).
- Cele 4 zone: Tribuna 1 (vest, VIP, presă, loje), Tribuna 2 (est), Peluza Nord, Peluza Sud (ucv1948.ro/stadion).
- Cele 19 sectoare numerotate și numele lor după legendele Craiovei Maxima, în ordinea numerelor de pe tricou (anunțul clubului, Fanatik, iunie 2025).
- Structura de prețuri și sectoare: Tribuna 2 cu sectoarele 7–13, Inel 1 / Inel 2, Tribuna 0, Tribuna 1 și VIP A–F. Prețurile sunt cele pentru meciurile din UEFA Conference League 2026/27 (abonamente.ucv1948.ro).
- **Așezarea sectoarelor după harta oficială „Bilete Superliga 2026–2027” a clubului:**
  - Peluza Nord: sectoarele 3–6, de la vest la est.
  - Tribuna 2: 7 (colț NE), apoi 8–12 pe Inel 1 și Inel 2, de la nord la sud, și 13 (colț SE).
  - Peluza Sud: sectoarele 14–17.
  - Colțurile: 2 (nord-vest) și 18 (sud-vest).
  - Sectorul oaspeților: tot sectorul 18 plus jumătatea sectorului 19 dinspre colț (1.314 locuri), despărțită de restul lui 19 printr-o scară. Nu se vinde online, iar accesul oaspeților e marcat lângă sectorul 18.
  - Tribuna 1 (după fotografia tribunei principale): sectoarele 19 și 1 la capete; în centru, de jos în sus:
    - VIP A–F, la nivelul terenului;
    - un nivel lounge vitrat de la podea la tavan, fără locuri în față;
    - lojele 101–120 (119 și 120 sunt duble) și 201–222, fiecare cu balcon și scaune în fața geamului; nivelurile se retrag ușor în trepte;
    - sus, G, presa H și I, cu fațada vitrată în spate.
  - Colțurile interioare sunt aproape drepte, ca pe plan, deci laturile au lungimea reală (Tribuna 1 are ~109 m). Sectoarele de peluză și de tribună stau pe porțiunile drepte, iar colțurile aparțin sectoarelor de colț 2, 7, 13 și 18.
  - În fiecare colț e o deschidere diagonală prin inelul de jos, care se termină într-un tunel sub culoar, ca pe plan. În inelul de jos, sectoarele de peluză (3, 6, 14, 17) ajung până la deschidere. Intrarea fiecărui colț e de partea tribunei.
  - Capetele blocului central al Tribunei 1 nu mai au un perete înalt: capătul urmează nivelurile blocului și coboară până la scaunele sectoarelor 1 și 19.
  - Accesul pentru ambulanță / vehicule din fiecare colț e o deschidere dreaptă de ~5 m, paralelă cu diagonala colțului: pereți albi netezi pe panta tribunei, balustradă metalică, pavaj la nivelul terenului și tunel sub culoar (după planul stadionului și fotografii).
  - Tabelele din colțurile NE și SV sunt ecrane LED negre, plate și verticale, montate sus în colț, pe grinda inelară dintre stâlpii de sub acoperiș, cu pasarelă de service și tiranți.
  - Antetul afișează data versiunii, ca să se vadă dacă pagina e la zi.
  - Bolul e unul singur: „inelul 1” și „inelul 2” sunt partea de jos și cea de sus, legate de culoarul cu vomitoare și de scări.
  - În inelul de jos, sectoarele de la capetele peluzelor (3, 6, 14, 17) coboară până la scara de la intrarea colțului; intrarea sectorului 7 e mai spre Tribuna 2.
  - Zonele pentru persoane în scaun rulant (2 × 31) sunt pe o platformă în fața Tribunei 2.
- **Accesele** de pe planul stadionului sunt construite pe podium: 21 de puncte, cu numărul lor de turnichete (2 sau 4), plus accesul oaspeților, accesele pentru persoane cu handicap și accesul VIP / Loje.
- **Intrările în tribune:** fiecare sector are un singur vomitor, cu numărul sectorului deasupra, ca în fotografia Peluzei Nord (intrările 3, 4, 5, 6).
- **Scările:** în inelul de jos fiecare sector are o singură scară, care urcă direct la vomitorul sectorului. Între două scări, rândul e continuu chiar dacă trece granița dintre sectoare, iar fiecare loc aparține sectorului în dreptul căruia se află. Scările sunt late și deschise la culoare, cu o treaptă intermediară pe fiecare rând. `npm run verify` verifică și că niciun loc nu se suprapune cu altul.
- **Porți:** poarta 6 servește Peluza Nord și poarta 8 Tribuna 2.
- Terenul de 105 × 68 m, înălțimea de 50,14 m, bolul cu un singur inel de gradene acoperit integral, ecranele din colțurile NE și SV (stadiumdb.com, ucv1948.ro).

**Estimat** (nu există un plan public al locurilor):
- Numărul de rânduri și câte locuri are fiecare rând. Totalul pe sector e cel oficial, dar așezarea pe rânduri e reconstituită din fotografii.
- Cât din sectorul 19 e al oaspeților: am considerat jumătatea dinspre colț. Planul stadionului marca inițial sectorul 2 ca sector al oaspeților; acum oaspeții stau în 18 și o parte din 19, ca pe harta de prețuri Superliga 2026–2027.
- Celelalte porți, prețul locurilor din loje și numărul de locuri din fiecare lojă: 10, respectiv 20 în lojile duble, astfel încât cele 42 de loje să dea 440 de locuri.
- Disponibilitatea locurilor: este simulată, dar deterministă (`src/data/availability.js`). Într-o integrare reală vine din API-ul de ticketing.

Toate aceste valori sunt în `src/data/stadium-data.js` și se pot corecta pe măsură ce apar date oficiale.
