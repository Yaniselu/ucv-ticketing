// Date reale despre Stadionul „Ion Oblemenco” (Craiova) folosite de harta 3D.
// Sursele sunt detaliate în README.md. Unde nu există o sursă publică
// (ex. numărul exact de locuri pe fiecare sector), valorile sunt estimate
// din geometrie și marcate ca atare.

// Competițiile în care poate juca Universitatea Craiova pe „Ion Oblemenco”. Pentru fiecare:
// numele, textul de pe panourile LED / tabelă și emblema pictată pe gazon (variantă generică,
// desenată de noi; fișierul oficial se pune în src/assets/logos/<id>.png și e folosit automat).
export const COMPETITIONS = {
  superliga: { name: 'Superliga', board: 'SUPERLIGA', lines: [['SUPERLIGA', 2.6], ['ROMÂNIA', 1.2]], mark: 'ball' },
  cupa: { name: 'Cupa României', board: 'CUPA ROMÂNIEI', lines: [['CUPA', 2.1], ['ROMÂNIEI', 2.1]], mark: 'cup' },
  supercupa: { name: 'Supercupa României', board: 'SUPERCUPA ROMÂNIEI', lines: [['SUPERCUPA', 2.1], ['ROMÂNIEI', 2.1]], mark: 'cup' },
  champions: { name: 'UEFA Champions League', board: 'UEFA CHAMPIONS LEAGUE', lines: [['UEFA', 1.0], ['CHAMPIONS', 1.7], ['LEAGUE', 1.7]], mark: 'ring' },
  europa: { name: 'UEFA Europa League', board: 'UEFA EUROPA LEAGUE', lines: [['UEFA', 1.0], ['EUROPA', 1.7], ['LEAGUE', 1.7]], mark: 'ring' },
  conference: { name: 'UEFA Conference League', board: 'UEFA CONFERENCE LEAGUE', lines: [['UEFA', 1.0], ['CONFERENCE', 1.7], ['LEAGUE', 1.7]], mark: 'ring' },
}

export const EVENT = {
  id: 'ucv-fck-2026-12-17',
  home: 'Universitatea Craiova',
  away: 'FC Copenhaga',
  competitionId: 'conference',
  competition: 'UEFA Conference League',
  phase: 'Faza principală · Meciul 3',
  dateLabel: 'Joi, 17 decembrie 2026',
  time: '22:00',
  venue: 'Stadionul „Ion Oblemenco”',
  city: 'Craiova',
}

// competiția meciului (în browser se poate previzualiza alta cu ?comp=superliga, cupa, europa ...)
const compParam = typeof location !== 'undefined' ? new URLSearchParams(location.search).get('comp') : null
export const COMPETITION_ID = COMPETITIONS[compParam] ? compParam : EVENT.competitionId
export const COMPETITION = COMPETITIONS[COMPETITION_ID]
EVENT.competition = COMPETITION.name

// Planul oficial al stadionului „Ion Oblemenco” (locuri pe sector): total 30.803.
// Tribuna 1 = 5.072 (18, 19, G, I, 1, 2), VIP A–F = 1.944, loje = 440, presă (H) = 336,
// Peluza 1 (sud) = 6.170, Peluza 2 (nord) = 6.053, Tribuna 2 = 10.726,
// zone pentru persoane cu dizabilități = 2 × 31 (în fața Tribunei 2).
export const CAPACITY = {
  total: 30803,
  public: 28021,
  vip: 1944,
  boxes: 440,
  press: 336,
  wheelchair: 62,
  companion: 0,
}
export const SECTOR_SEATS = {
  1: 1221, 2: 956, 3: 1338, 4: 1626, 5: 1762, 6: 1327, 7: 964, 8: 1367, 9: 1962, 10: 2112,
  11: 1921, 12: 1437, 13: 963, 14: 1340, 15: 1734, 16: 1771, 17: 1325, 18: 929, 19: 1268,
  A: 190, B: 399, C: 383, D: 383, E: 399, F: 190, G: 343, I: 355,
}
export const WHEELCHAIR_PER_ZONE = 31

// Regula clubului: maximum 4 bilete / persoană / meci (ucv1948.ro).
export const MAX_TICKETS = 4
export const HOLD_SECONDS = 10 * 60

// Numele celor 19 sectoare, după legendele Craiovei Maxima, în ordinea numerelor de pe tricou
// (anunțul clubului, fanatik.ro, 21.06.2025).
export const LEGENDS = {
  1: 'Silviu Lung', 2: 'Nicolae Negrilă', 3: 'Nicolae Tilihoi', 4: 'Nicolae Ungureanu', 5: 'Aurel Beldeanu',
  6: 'Costică Ștefănescu', 7: 'Zoltan Crișan', 8: 'Ilie Balaci', 9: 'Rodion Cămătaru', 10: 'Costică Donose',
  11: 'Sorin Cârțu', 12: 'Gabriel Boldici', 13: 'Ion Geolgău', 14: 'Aurel Țicleanu', 15: 'Mircea Irimescu',
  16: 'Grigori Ciupitu', 17: 'Florin Cioroianu', 18: 'Adrian Popescu', 19: 'Constantin Oțet',
}

// Prețuri bilet individual, meciurile UEFA Conference League 2026/27
// (abonamente.ucv1948.ro). Lojele nu apar în lista publică: preț estimat.
export const PRICES = {
  PN: 55,
  PS: 75,
  T2_7_13: 80,
  T2_8_12_R2: 80,
  T2_8_12_R1: 90,
  T2_9_11_R2: 90,
  T2_9_11_R1: 95,
  T2_10_R2: 95,
  T2_10_R1: 100,
  T1: 120,
  T0: 150,
  VIP_AF: 200,
  VIP_BE: 225,
  VIP_CD: 250,
  BOX: 750,
}

// Accesul: porțile 6 (Peluza Nord) și 8 (Tribuna 2) sunt confirmate de club; pentru celelalte
// zone afișăm intrarea după planul stadionului (turnichetele din dreptul tribunei).
export const STANDS = {
  PN: { id: 'PN', name: 'Peluza Nord', short: 'Peluza Nord', alias: 'Peluza 2', gate: 'Poarta 6', side: 'N' },
  T2: { id: 'T2', name: 'Tribuna 2', short: 'Tribuna 2', gate: 'Poarta 8', side: 'E' },
  PS: { id: 'PS', name: 'Peluza Sud', short: 'Peluza Sud', alias: 'Peluza 1', gate: 'Peluza Sud', side: 'S' },
  T1: { id: 'T1', name: 'Tribuna 1', short: 'Tribuna 1', gate: 'Tribuna 1', side: 'W' },
  VIP: { id: 'VIP', name: 'Tribuna VIP & Loje', short: 'VIP', gate: 'VIP / Loje', side: 'W' },
}

// Cererea estimată pentru meci (probabilitatea ca un loc să fie deja vândut).
export const DEMAND = {
  PN: 0.84,
  PS: 0.62,
  T2_corner: 0.5,
  T2_side: 0.64,
  T2_center: 0.74,
  T0: 0.6,
  T1: 0.48,
  VIP: 0.5,
  BOX: 0.55,
}
// Sectoare epuizate (galeria ocupă integral sectoarele 4 și 5 din Peluza Nord).
export const SOLD_OUT = new Set(['4', '5'])

// Accesele de pe planul stadionului: [x, y] = vârful săgeții pe plan (Tribuna 1 sus, Peluza 2 în dreapta),
// n = numărul de turnichete, tip: spectatori / oaspeți / persoane cu handicap / VIP.
export const ACCESS_MAP = { cx: 531.5, cy: 413.5, rx: 297.5, ry: 263.5 }
export const ACCESS_POINTS = [
  [370, 155, 2, 'oaspeti'], [289, 212, 2, 'oaspeti'], [231, 292, 2], [205, 374, 4], [207, 484, 4], [290, 617, 4], [333, 652, 0, 'handicap'],
  [375, 672, 4], [456, 700, 4], [533, 709, 4], [612, 700, 4], [685, 675, 4], [727, 652, 0, 'handicap'], [772, 615, 2],
  [834, 534, 2], [857, 457, 2], [857, 375, 2], [834, 295, 2], [777, 212, 2], [694, 156, 2], [533, 122, 4, 'vip'],
]
