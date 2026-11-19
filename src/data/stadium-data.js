// Date reale despre Stadionul „Ion Oblemenco” (Craiova) folosite de harta 3D.
// Sursele sunt detaliate în README.md. Unde nu există o sursă publică
// (ex. numărul exact de locuri pe fiecare sector), valorile sunt estimate
// din geometrie și marcate ca atare.

export const EVENT = {
  id: 'ucv-fck-2026-12-17',
  home: 'Universitatea Craiova',
  away: 'FC Copenhaga',
  competition: 'UEFA Conference League',
  phase: 'Faza principală · Meciul 3',
  dateLabel: 'Joi, 17 decembrie 2026',
  time: '22:00',
  venue: 'Stadionul „Ion Oblemenco”',
  city: 'Craiova',
}

// Defalcarea capacității (bursa.ro, preluată și de Wikipedia: 30.983 locuri):
// 28.033 public, 2.368 VIP (din care 440 în loje), 350 presă,
// 232 persoane cu dizabilități + însoțitori.
export const CAPACITY = {
  total: 30983,
  public: 28033,
  vip: 1928, // 2.368 VIP − 440 în loje
  boxes: 440,
  press: 350,
  wheelchair: 116,
  companion: 116,
}

// Regula clubului: maximum 4 bilete / persoană / meci (ucv1948.ro).
export const MAX_TICKETS = 4
export const HOLD_SECONDS = 10 * 60

// Numele sectoarelor, după legendele Craiovei Maxima (fanatik.ro, 09.09.2026).
export const LEGENDS = {
  1: 'Silviu Lung',
  2: 'Nicolae Negrilă',
  3: 'Nicolae Tilihoi',
  4: 'Nae Ungureanu',
  5: 'Aurel Beldeanu',
  6: 'Costică Ștefănescu',
  7: 'Zoltan Crișan',
  8: 'Ilie Balaci',
  9: 'Rodion Cămătaru',
  10: 'Costică Donose',
  11: 'Sorin Cârțu',
  12: 'Gabriel Boldici',
  13: 'Ion Geolgău',
  14: 'Grigore Ciupitu',
  15: 'Aurel Țicleanu',
  16: 'Adrian Popescu',
  17: 'Florin Cioroianu',
  18: 'Constantin Oțet',
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

// Porțile 6 (Peluza Nord) și 8 (Tribuna 2) sunt confirmate de club;
// celelalte sunt orientative.
export const STANDS = {
  PN: { id: 'PN', name: 'Peluza Nord', short: 'Peluza Nord', gate: 'P6', side: 'N' },
  T2: { id: 'T2', name: 'Tribuna 2', short: 'Tribuna 2', gate: 'P8', side: 'E' },
  PS: { id: 'PS', name: 'Peluza Sud', short: 'Peluza Sud', gate: 'P10', side: 'S' },
  T1: { id: 'T1', name: 'Tribuna 1 & 0', short: 'Tribuna 1', gate: 'P3', side: 'W' },
  VIP: { id: 'VIP', name: 'Tribuna VIP & Loje', short: 'VIP', gate: 'VIP', side: 'W' },
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
