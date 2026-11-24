# UCV Ticketing – Stadionul „Ion Oblemenco” 3D

Prototip de ticketing cu harta 3D a stadionului din Craiova, în stilul celor folosite de cluburile din LaLiga:

1. **Stadionul** din exterior: carcasa „ou” inspirată de Brâncuși, cu structura albă în X și acoperișul translucid. Treci cu mouse-ul peste o tribună ca să vezi prețul și locurile libere.
2. **Tribuna**: camera zboară la tribuna aleasă, sectoarele sunt numerotate, iar **locurile libere sunt verzi**.
3. **Sectorul**: zoom până la scaune. Alegi un loc (sau „Alege automat cele mai bune locuri”) și primești biletul cu rândul, locul, poarta și **„Vederea ta”**, randată din scaunul ales.
4. **Vederea din loc**: camera se pune la nivelul ochilor din scaun. Tragi cu mouse-ul ca să privești în jur.
5. **Lojele VIP**: 40 de loje pe două niveluri. Intri în lojă și alegi un fotoliu.

6. **Contul și biletele**: cont cu nume, email, telefon și parolă; rezervarea locurilor pe server pentru 10 minute, plata, biletele cu cod QR (în cont, în PDF și pe email), „Biletele mele”.
7. **Administrarea** (`/admin`) și **scanarea la poartă** (`/scan`).

## Intro, stema și trofeele
- **Intro-ul** depinde de competiția meciului. Fundalul e negru la Conference și Europa League, albastru cu stele la Champions League și roșu la Superliga și Cupa României. Logoul competiției stă în mijlocul unei porți cu două canaturi, care se deschide spre stadion.
  - Se poate sări cu „Sari peste” sau cu un clic. E oprit cu `?nointro` sau dacă sistemul cere animații reduse.
- **Tripla 2025–2026:** la competițiile interne, intro-ul arată stema Universității Craiova și cele trei trofee modelate 3D după fotografii: Cupa României (urna de argint oferită de Ion Țiriac), trofeul Superligii (LPF, 2023) și Supercupa României (cu mingea aurie).
  - **Detalii:**
    - metal cu urme fine de strunjire;
    - Superliga: muchiile vii ale panourilor răsucite, nervura toartelor, inscripția gravată pe bază și dedicația câștigătoarei;
    - Cupa României: brâu cizelat cu volute de acant, pene în relief pe aripi, ochi la vulturi, plăcuța de alamă și plăcuțele cu câștigătoarele pe soclul de lemn;
    - Supercupa: inscripția gravată și placa de pe soclu.
  - **Lumina:** trofeele sunt luminate ca într-un studio foto (softbox-uri), cu umbre moi pe masă.
- **Stema clubului** e redesenată curat, la rezoluție mare, după afișul oficial al clubului (`public/brand/`). Apare în antet, la încărcare, ca favicon, pe bilete (web și PDF), în email, pe panourile LED, pe tabelă și pe prelatele tunelurilor.
- **Tabelele** sunt ecrane video negre, agățate sus în colonada din colțurile NE și SV, ca în fotografii. Afișează logoul competiției, stemele, scorul și cronometrul.
- În spatele tribunelor: parapet și platformă, stâlpii ramificați ai acoperișului și vitrajul închis la culoare. Marginea de sus a inelului de sus e o curbă continuă, ca pe stadion.

## Interfața (Liquid Glass)
- Panourile, meniul de cont, autentificarea, coșul, biletul și indicațiile sunt din sticlă translucidă: blur și saturație pe fundalul 3D, margine luminoasă în degrade, luciu sus și umbre moi.
- Butoanele sunt capsule, iar acțiunea principală e o capsulă albastră „lichidă”. Controalele segmentate au un buton alb care se mișcă, cu animații elastice.
- Fontul este SF Pro pe dispozitivele Apple și Inter / Inter Tight în rest. Biletele păstrează fontul de pe PDF (Barlow Condensed).
- Dacă sistemul cere mai puțină transparență, plăcile devin opace.

## Copacii, unul câte unul
- Pe imaginea satelit se găsesc coroanele, apoi transformata distanță dă centrul și raza reală a fiecărei coroane. Coroanele lipite se despart prin suprimarea non-maximelor.
- **Acoperire:** nivelul 18 până la ~470 m și nivelul 17 până la 1 km, în total ~33.000 de copaci.
- **Tipuri de copaci:**
  - foioase (din volume rotunjite cu frunziș decupat);
  - conifere (conuri suprapuse, recunoscute după verdele închis);
  - câțiva plopi.
- **Niveluri de detaliu:** trei, după distanță; departe, coroana e o imagine pe trei plane încrucișate.

## Bazele sportive din jur (`src/scene/sports.js`)
- **Stadionul de Atletism „Nicolae Mărășescu”:**
  - pista de tartan cu 8 culoare și liniile lor (din conturul OSM, netezit);
  - terenul de fotbal cu marcajele de 105×68 și porți cu plasă;
  - tribuna cu gradene și scaune albastre, după conturul clădirii, cu copertina albă din mijloc;
  - patru stâlpi de nocturnă.
- **Pista de antrenament** are numărul de culoare calculat din lățime.
- **Terenurile din OSM:**
  - fotbal: gazon sau sintetic, cu marcaje, porți și gard de plasă;
  - tenis: zgură, cu liniile terenului, fileu și gard;
  - baschet: marcaje, panouri și coșuri.

## Interiorul stadionului
- Porțile au plasă de sfoară întinsă pe suporții din spate.
- Băncile de rezerve au acoperiș curb pe arce de oțel, perete în spate și două rânduri de scaune tapițate.

## Incinta stadionului 1:1
Modelată după planurile și fotografiile arhitecților (DICO & ȚIGĂNAȘ) și după OpenStreetMap (`scripts/build-precinct.mjs` → `src/data/precinct.js`, `src/scene/precinct.js`).
- **Podiumul** e un planșeu la +4,6 m, pe stâlpi, cu promenada de asfalt. Marginea urmează conturul clădirii din OSM.
- **Parterul de sub podium:**
  - spre Tribuna 2 și Peluza Nord are porți cu grilaj de oțel;
  - sub peluze sunt parcările, cu mașini, liniile locurilor și corpuri de iluminat în tavan;
  - în colțurile de sud, podiumul iese în consolă pe stâlpi în V, iar aleile auto intră sub el.
- **Tribuna 1:** spre ea coboară taluzuri de gazon. Scara principală are 14 m lățime, cu podest și mâini curente.
- **Scările din OSM** sunt la est și la nord. Mai sunt scări la accese și lifturi vitrate pentru persoanele cu dizabilități.
- **Porțile cu turnichete** sunt sub streașina fațadei, la cele 21 de accese din planul oficial: turnichete tripod, cititoare de bilete și bare de dirijare. Numele porților sunt cele de pe bilete (Poarta 6, Poarta 8, Peluza Sud, Tribuna 1, VIP / Loje, Acces oaspeți).
- **Esplanada Stadion** coboară spre Bd. Ilie Balaci:
  - pe mijloc, cinci linii ondulate de câte cinci trepte; pe laturi, rampe;
  - dale de granit de 60×40 cm;
  - gazon ridicat cu ziduri-bancă de beton, copaci și stâlpi de iluminat.
- **Curțile de lumină:** trei, coborâte până la parter (două cu gazon, una cu mașini), cu balustrade de sticlă.
- **Statuia lui Ion Oblemenco:** bronz, pe soclu de granit cu placă, pe esplanadă, la poziția din OSM.
- **Imaginea satelit:** umbra stadionului „pictată” în ea e luminată, ca terenul de la nord să nu pară pătat.

## Împrejurimile pe 1 km
- Clădirile din OpenStreetMap au fațade pe tipuri: blocuri cu panouri prefabricate, balcoane închise sau deschise și casa scării; case cu ferestre cu rame, obloane și soclu; birouri vitrate; hale. Parterul e separat de etaje. Geamurile reflectă cerul, iar relieful vine din hărți de normale.
- Casele au acoperiș în patru sau două ape, cu streașină și țiglă. Blocurile au acoperiș plat cu atic și camere tehnice. Culoarea fiecărui acoperiș e luată din imaginea satelit.
- Imaginea satelit se încarcă în patru niveluri de detaliu (până la nivelul 17 pe 1 km). De aproape se adaugă granulația solului.
- Copacii sunt detectați din imaginea satelit. Coroanele sunt rotunjite, cu frunziș decupat și verdele real, iar de-a lungul străzilor apar și plopi.

## Pavajul pe 1 km
- **Trotuare:** pe ambele părți ale străzilor (sau pe partea indicată în OpenStreetMap), cu borduri de granit înălțate față de carosabil. Se opresc în intersecții.
- **Tipuri de pavaj**, modelate la scara reală, cu muchii teșite, rosturi și relief (normal map):
  - pavele gri de 20×10 cm în spic, pe trotuare;
  - pavele roșii pe aleile din parcuri;
  - pavele pătrate de 30×30 cm în piețele pietonale;
  - piatră cubică pe străzile pavate;
  - dale de granit de 60×40 cm pe esplanada stadionului.
- **Treceri de pietoni:** zebră, cu benzi de 50 cm, la toate trecerile din OpenStreetMap.
- Datele (suprafața străzii, trotuarele, piețele, trecerile) vin din `scripts/build-osm.mjs`.
- **Asfaltul** e generat la scara reală, cu agregat și relief.
- **Spațiile verzi** urbane au gazonul ridicat și bordură de granit.
- **Parcările:**
  - locurile sunt trasate de-a lungul culoarelor din OSM, cu borduri pe contur;
  - mașinile au profil real (hatchback sau sedan), roți, geamuri, faruri și stopuri.
- **Sala Polivalentă:** acoperiș plat cu atic, luminatoare și agregate, ca în imaginea satelit. Are placaj metalic, perete-cortină spre bulevard, copertină și numele sălii.

## Performanță
- **Copaci:** două niveluri de detaliu.
- **Umbre:** calculate o singură dată.
- **Ocluzia ambientală:** doar când camera stă pe loc.
- **Scaune:** simplificate în vederea de ansamblu.
- **Rezoluția:** se adaptează la intervalul ecranului (8,3 ms la 120 Hz).
- **Desenare la cerere:** cadrul se redesenează doar când se mișcă ceva.

## Vânzarea de bilete

### Pentru cumpărători
- Alegi locurile pe hartă și apeși „Continuă spre plată”. Dacă nu ai cont, ți se cere să intri sau să-ți faci unul: nume și prenume, email (aici primești biletele), telefon și parolă.
- Serverul rezervă locurile pentru tine 10 minute. Nimeni altcineva nu le poate lua în acest timp; dacă timpul expiră, locurile se eliberează.
- La plată completezi numele titularului fiecărui bilet (pentru meciurile UEFA biletele sunt nominale).
- Biletele apar imediat în „Biletele mele” (meniul contului), se pot descărca în PDF și, când emailul e configurat, vin pe email cu PDF-ul atașat.
- Biletul are grafica competiției (Superliga, Cupa României, Supercupa, Champions / Europa / Conference League): antet în culorile ei cu logoul, meciul, data, tribuna, sectorul, inelul, rândul, locul, accesul (poarta), prețul, titularul și codul QR.
- Contul are: modificarea numelui și telefonului, schimbarea parolei (închide sesiunile de pe alte dispozitive), resetarea parolei prin email.

### Pentru administrator (`/admin`)
- **Meciuri**: adaugi și editezi meciuri (gazde, oaspeți, competiție, etapă, data și ora), starea (ciornă / publicat / arhivat) și perioada de vânzare. Un meci „ciornă” nu apare pe site. Dacă sunt mai multe meciuri publicate, pe site se poate alege meciul din antet.
- **Vânzare și prețuri**: pentru fiecare sector alegi dacă e la vânzare și la ce preț (sau un preț pentru toată tribuna dintr-un clic); bifezi sectoarele oaspeților și dacă jumătatea sectorului 19 e a lor; alegi dacă sectoarele oaspeților se vând pe site; lojele (la vânzare, preț), locurile pentru scaun rulant, numărul maxim de bilete pe comandă și pe cont. Vezi locurile vândute, rezervate, blocate și încasările pe fiecare sector.
- **Locuri blocate**: blochezi sau deblochezi un sector întreg, un interval de rânduri sau de locuri (protocol, sponsori, siguranță).
- **Comenzi**: cauți după cod, email, nume, telefon sau numărul biletului; descarci PDF-ul, retrimiți emailul, anulezi o comandă (biletele nu mai sunt valabile, locurile revin la vânzare).
- **Utilizatori**: dai rolul „Scanare” (personalul de la porți) sau „Administrator”.
- **Jurnal**: ultimele acțiuni de administrare.
- Primul administrator: intri în cont pe site, deschizi „Contul meu” → „Am un cod de administrator” (sau `/admin`) și introduci codul din variabila `ADMIN_SETUP_CODE`. Apoi poți da drepturi altor conturi din „Utilizatori”.

### Scanarea la poartă (`/scan`)
- Pe telefonul personalului (rol „Scanare” sau „Administrator”): alegi meciul, pornești camera și scanezi codurile QR. Ecranul devine verde („Acces permis”), portocaliu („Deja folosit”, „Alt meci”) sau roșu („Bilet anulat”, „Bilet invalid”), cu sunet și vibrație.
- Modul „Intrare” marchează biletul ca folosit (a doua scanare e respinsă); „Doar verificare” nu îl marchează.

### Securitate
- Parolele sunt salvate doar ca hash scrypt; sesiunea e un token aleator într-un cookie `HttpOnly`, `Secure`, `SameSite=Lax` (în baza de date e salvat doar hash-ul tokenului).
- Cererile care modifică date sunt acceptate doar de pe același site (verificarea `Origin` și un antet propriu), deci alt site nu poate cumpăra sau modifica ceva în numele tău.
- Limitarea încercărilor la autentificare, înregistrare, resetarea parolei, rezervări și plăți.
- Prețul, disponibilitatea, limitele de bilete și drepturile de administrator sunt verificate pe server; browserul nu poate schimba prețul sau lua un loc ocupat. Două persoane nu pot cumpăra același loc (constrângere unică în baza de date, testată cu cereri simultane).
- Codul QR conține numărul biletului semnat cu HMAC-SHA256 (cheia `TICKET_SECRET` există doar pe server); un cod modificat sau inventat e respins, iar un bilet anulat sau deja folosit e respins la poartă.
- Toate interogările sunt parametrizate; datele introduse sunt validate și curățate; acțiunile de administrare sunt jurnalizate.
- Antete de securitate pe tot site-ul (HSTS, `X-Frame-Options`, `nosniff`, `Referrer-Policy`, `Permissions-Policy`).

### Configurarea pe Vercel (variabile de mediu)
| Variabilă | Ce face |
| --- | --- |
| `DATABASE_URL` | Baza de date Postgres. Cel mai simplu: Vercel → Storage → Create Database → **Neon** (regiunea Frankfurt), conectată la proiect; variabila se adaugă automat. |
| `TICKET_SECRET` | Cheia secretă pentru semnarea codurilor QR (minimum 32 de caractere). |
| `ADMIN_SETUP_CODE` | Codul cu care un cont devine primul administrator. |
| `SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASS`, `MAIL_FROM` | Trimiterea email-urilor (bilete, resetarea parolei) prin orice server SMTP (ex. Resend, Brevo, SendGrid, Google Workspace, Microsoft 365). |
| `PAYMENT_MODE` | `test` (implicit): comanda se confirmă fără încasare, iar biletele sunt marcate „bilet de test”. Plata reală cu cardul se conectează după alegerea procesatorului (ex. Netopia, Stripe). |
| `SITE_URL` | Opțional: adresa publică folosită în linkurile din email-uri. |

Fără `DATABASE_URL`, site-ul funcționează doar ca hartă: se pot explora locurile, dar vânzarea online e oprită (mesaj pe pagină).

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
- **Emblema competiției** e pictată pe gazon, câte una în fiecare jumătate, între cercul central și semicercul careului, și se citește din Tribuna 1, unde e camera TV principală. Vopseaua e albă, ușor transparentă, cu dungile de tuns peste ea.
  - Emblema, panourile LED, tabela și antetul urmează competiția meciului: `EVENT.competitionId` din `src/data/stadium-data.js` (superliga, cupa, supercupa, champions, europa, conference).
  - Pentru previzualizare se poate adăuga `?comp=superliga` (sau `cupa`, `europa` etc.) la adresă.
  - Logourile oficiale (primite de la club, cu fundalul scos) sunt în `src/assets/logos/`: `superliga.png`, `cupa.png`, `champions.png`, `europa.png`, `conference.png`. Sunt pictate la proporțiile lor, cel mult 16 m pe lungimea terenului și 11 m pe lățime.
  - Un logo nou se adaugă la fel, ca `src/assets/logos/<id>.png` (sau `.svg`, `.webp`, cu fundal transparent), și e folosit automat. Pentru o competiție fără fișier (acum Supercupa României) se pictează o emblemă generică, cu numele competiției și un semn simplu.
- **În vederea din scaun și în loje**, pe locurile deja vândute apar spectatori: fani în alb-albastru, cei din sectorul oaspeților, VIP-uri și jurnaliști.
- **Imaginea satelit** folosește cel mai fin nivel pe care Esri îl are pentru Craiova (z18, ≈ 0,4 m/pixel). Nivelul z19 nu există pentru zonă.
- **Copacii** au frunziș texturat în locul formelor pline.
- **Clădirile** au fațade diferite pentru case, blocuri și clădiri de birouri.
- **Pe calculator** imaginea primește ocluzie ambientală, o strălucire discretă a luminilor și gradare de culoare.

## Locurile 1:1 cu stadionul real

Locurile vin din harta reală de pe entertix.ro (meciul Universitatea Craiova – Dinamo), din 8 capturi de ecran care acoperă tot stadionul. Fiecare loc de pe hartă e în stadionul 3D, în același bloc, pe același rând și la aceeași poziție în rând. Culoarele (scările) și vomitoarele sunt golurile din hartă.

Cum a fost importată harta (scripturile sunt în afara proiectului; rezultatul e `src/data/seatmap.js`):
1. Punctele de pe fiecare captură sunt detectate automat, iar capturile sunt lipite între ele după punctele comune. Ocolul complet se închide la ~0,1 px.
2. Fiecare bloc de locuri e reconstruit pe grila lui (pas de 6 px pe hartă), ca să nu lipsească și să nu se dubleze niciun loc: 30.202 locuri.
3. Blocurile sunt atribuite tribunelor și sectoarelor după poziție (Tribuna 1 sus, Peluza Nord în dreapta, Tribuna 2 jos, Peluza Sud în stânga), iar rândurile după adâncime: inelul de jos are 22 de rânduri pe tribune și 15 pe peluze, inelul de sus până la 33.
4. Pe laturi, blocurile sunt așezate exact ca pe hartă (rânduri, locuri, goluri). În colțuri, harta are blocuri rotite: acolo locurile fiecărui colț (numărul real) umplu arcul rămas liber între tranșeea pentru ambulanță și sectoarele vecine.

Pasul locurilor: 0,45 m pe tribune, 0,42 m pe peluze (rândurile lor sunt mai lungi decât latura), 0,44 m în colțuri. Lojele (440 de locuri) și cele 2 × 31 de locuri pentru scaune rulante nu apar pe hartă și rămân din planul stadionului.

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
npm run verify   # verifică locurile pe fiecare sector, după harta reală (30.702 în total)
npm run osm      # regenerează datele OpenStreetMap din jurul stadionului
npm run api      # API-ul local pe :3001 (cu DATABASE_URL sau, fără ea, PGlite în .data/)
npm run test:api # testele automate ale API-ului (conturi, securitate, concurență, plată, admin, scanare)
```

Local, `npm run dev` și `npm run preview` trimit cererile `/api` către `npm run api`.

Stack: Vite + three.js, fără framework, pe trei pagini (harta, `/admin`, `/scan`). API-ul e o singură funcție Node pe Vercel (`api/index.js` → `server/`), cu Postgres. Același generator de locuri (`src/data/layout.js`) rulează în browser și pe server, deci fiecare loc are aceeași cheie, același sector și același preț în ambele.

## Capacitatea, exact la număr

Sursa este harta reală a locurilor (Entertix): **30.202 locuri pe hartă**, din care 30.200 în stadionul 3D, plus 440 în loje și 62 pentru scaune rulante, deci **30.702 în total**. Planul oficial al stadionului dă 30.803; diferențele pe sector sunt în coloana „plan oficial” din `npm run verify`. `src/data/layout.js` generează fiecare loc (sector, rând, număr, poziție 3D) din `src/data/seatmap.js`, iar `npm run verify` verifică:
- că fiecare sector are exact numărul de locuri de pe hartă;
- că totalul este exact;
- că niciun loc nu se suprapune cu altul.

| Zonă | Sectoare (locuri) | Total |
|---|---|---:|
| Tribuna 1 | 18 (916, oaspeți), 19 (1.267, jumătatea dinspre colț pentru oaspeți), G (353), I (355), 1 (1.251), 2 (955) | 5.097 |
| VIP | A (190), B (399), C (366), D (366), E (399), F (190) | 1.910 |
| Loje | 101–120 și 201–222 | 440 |
| Presă | H (5 rânduri cu pupitre și locuri pe margini) | 315 |
| Peluza 1 (Sud) | 14 (1.324), 15 (1.735), 16 (1.797), 17 (1.338) | 6.194 |
| Peluza 2 (Nord) | 3 (1.336), 4 (1.625), 5 (1.762), 6 (1.271) | 5.994 |
| Tribuna 2 | 7 (964), 8 (1.365), 9 (1.962), 10 (2.114), 11 (1.922), 12 (1.440), 13 (923) | 10.690 |
| Persoane în scaun rulant | 2 zone în fața Tribunei 2 (sectoarele 8–9 și 11–12) | 62 |
| **Total** | | **30.702** |

Toate sectoarele au exact locurile de pe hartă, cu o excepție: sectorul 2 are 955 în loc de 957, pentru că 2 locuri nu încap pe arcul colțului. În colțuri, locurile care nu încap în inelul de jos trec în inelul de sus al aceluiași sector.

## Ce este real și ce este estimat

**Din surse publice:**
- Locurile, rândurile, culoarele și vomitoarele, din harta reală a locurilor (Entertix). Planul oficial al stadionului dă 30.803 locuri; alte surse dau 30.983 (bursa.ro, Wikipedia) sau 30.944 (clubul, arhitectul).
- Cele 4 zone: Tribuna 1 (vest, VIP, presă, loje), Tribuna 2 (est), Peluza Nord, Peluza Sud (ucv1948.ro/stadion).
- Cele 19 sectoare numerotate și numele lor după legendele Craiovei Maxima, în ordinea numerelor de pe tricou (anunțul clubului, Fanatik, iunie 2025).
- Structura de prețuri și sectoare: Tribuna 2 cu sectoarele 7–13, Inel 1 / Inel 2, Tribuna 0, Tribuna 1 și VIP A–F. Prețurile sunt cele pentru meciurile din UEFA Conference League 2026/27 (abonamente.ucv1948.ro).
- **Așezarea sectoarelor după harta oficială „Bilete Superliga 2026–2027” a clubului:**
  - Peluza Nord: sectoarele 3–6, de la vest la est.
  - Tribuna 2: 7 (colț NE), apoi 8–12 pe Inel 1 și Inel 2, de la nord la sud, și 13 (colț SE).
  - Peluza Sud: sectoarele 14–17.
  - Colțurile: 2 (nord-vest) și 18 (sud-vest).
  - Sectorul oaspeților: tot sectorul 18 plus jumătatea sectorului 19 dinspre colț (1.389 de locuri), despărțită de restul lui 19 printr-o scară. Nu se vinde online, iar accesul oaspeților e marcat lângă sectorul 18.
  - Tribuna 1 (după fotografia tribunei principale): sectoarele 19 și 1 la capete; în centru, de jos în sus:
    - VIP A–F, la nivelul terenului;
    - un nivel lounge vitrat de la podea la tavan, fără locuri în față;
    - lojele 101–120 (119 și 120 sunt duble) și 201–222, fiecare cu balcon și scaune în fața geamului; nivelurile se retrag ușor în trepte;
    - fiecare nivel e mai scurt decât cel de dedesubt (lounge-ul ±40 m, lojele 1 ±37 m, lojele 2 ±34 m), iar rândurile sectoarelor 19 și 1 din inelul de sus coboară în trepte pe lângă capete, ca în fotografie;
    - deasupra lojelor, după un parapet alb, G, presa H și I sunt pe aceeași pantă și la aceeași înălțime ca rândurile vecine ale sectoarelor 19 și 1 (de la rândul 22 al inelului de sus până sus). Presa are 5 rânduri cu pupitre, din două în două rânduri ale pantei, și locuri obișnuite pe margini (ca pe hartă).
  - Colțurile interioare sunt aproape drepte, ca pe plan, deci laturile au lungimea reală (Tribuna 1 are ~109 m). Sectoarele de peluză și de tribună stau pe porțiunile drepte, iar colțurile aparțin sectoarelor de colț 2, 7, 13 și 18.
  - În fiecare colț e o deschidere diagonală prin inelul de jos, care se termină într-un tunel sub culoar, ca pe plan. În inelul de jos, sectoarele de peluză (3, 6, 14, 17) ajung până la deschidere. Intrarea fiecărui colț e de partea tribunei.
  - Capetele blocului central al Tribunei 1 nu au un perete înalt: fiecare nivel se termină cu un perete alb care coboară până la scaunele sectoarelor 1 și 19.
  - Accesul pentru ambulanță / vehicule din fiecare colț e o tranșee dreaptă de 7 m, paralelă cu diagonala colțului, prin tot inelul de jos: pereți albi netezi pe panta tribunei, balustradă metalică, pavaj la nivelul terenului și un portal de 3,4 m sub culoar. Peste tranșee e un tunel acoperit alb (4,4 m la coamă), cu „UNIVERSITATEA CRAIOVA” pe capăt, pe laterale și pe acoperiș (după fotografii).
  - Tabelele din colțurile NE și SV sunt ecrane LED negre, plate și verticale, montate sus în colț, pe grinda inelară dintre stâlpii de sub acoperiș, cu pasarelă de service și tiranți.
  - Antetul afișează data versiunii, ca să se vadă dacă pagina e la zi.
  - Bolul e unul singur: „inelul 1” și „inelul 2” sunt partea de jos și cea de sus, legate de culoarul cu vomitoare și de scări.
  - În inelul de jos, sectoarele de la capetele peluzelor (3, 6, 14, 17) coboară până la scara de la intrarea colțului; intrarea sectorului 7 e mai spre Tribuna 2.
  - Zonele pentru persoane în scaun rulant (2 × 31) sunt pe o platformă în fața Tribunei 2.
- **Accesele** de pe planul stadionului sunt construite pe podium: 21 de puncte, cu numărul lor de turnichete (2 sau 4), plus accesul oaspeților, accesele pentru persoane cu handicap și accesul VIP / Loje.
- **Intrările în tribune:** vomitoarele sunt golurile de 3–4,5 m din primele rânduri ale inelului de sus, ca pe hartă (14, în sectoarele 1, 3, 4, 5, 8–12, 14–17 și 19). Fiecare e o groapă sub rândul din față, cu gura tunelului în peretele din spate și numărul sectorului.
- **Scările:** sunt culoarele din hartă (golurile de 0,45–2,6 m dintre locurile aceluiași rând), cât de late sunt pe hartă, deschise la culoare și cu o treaptă intermediară pe fiecare rând. Spatele inelului de sus se termină după ultimul rând cu locuri, deci e în trepte: blocurile mai scurte au în spate o platformă și pereți albi. `npm run verify` verifică și că niciun loc nu se suprapune cu altul.
- **Porți:** poarta 6 servește Peluza Nord și poarta 8 Tribuna 2.
- Terenul de 105 × 68 m, înălțimea de 50,14 m, bolul cu un singur inel de gradene acoperit integral, ecranele din colțurile NE și SV (stadiumdb.com, ucv1948.ro).

**Estimat:**
- Colțurile: harta are acolo blocuri rotite, iar stadionul 3D are colțuri aproape drepte. Numărul de locuri al fiecărui colț e cel de pe hartă, dar așezarea pe rânduri e calculată pe arcul liber.
- Numerotarea rândurilor și a locurilor: harta nu arată numerele, așa că rândurile sunt numerotate de la teren spre spate în fiecare sector, iar locurile de la un capăt la celălalt al rândului.
- Cât din sectorul 19 e al oaspeților: am considerat jumătatea dinspre colț. Planul stadionului marca inițial sectorul 2 ca sector al oaspeților; acum oaspeții stau în 18 și o parte din 19, ca pe harta de prețuri Superliga 2026–2027.
- Celelalte porți, prețul locurilor din loje și numărul de locuri din fiecare lojă: 10, respectiv 20 în lojile duble, astfel încât cele 42 de loje să dea 440 de locuri.
- Disponibilitatea locurilor: este simulată, dar deterministă (`src/data/availability.js`). Într-o integrare reală vine din API-ul de ticketing.

Toate aceste valori sunt în `src/data/stadium-data.js` și se pot corecta pe măsură ce apar date oficiale.
