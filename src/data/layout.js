// Generator determinist pentru toate locurile stadionului.
// Nu depinde de three.js, rulează și în Node (scripts/verify-capacity.mjs).
//
// Sistem de coordonate (metri): originea în centrul terenului,
// x = est, z = sud, y = sus. Terenul are 105 × 68 m pe axa nord–sud.

import { CAPACITY, LEGENDS, PRICES, STANDS } from './stadium-data.js'

export const G = {
  pitchL: 105,
  pitchW: 68,
  // marginea interioară a tribunelor (dreptunghi cu colțuri rotunjite)
  // după conturul real al gazonului din OpenStreetMap (77 × 113 m)
  hx: 39.5,
  hz: 57.5,
  r: 10,
  depth: 0.8, // adâncimea unui rând
  ring1: { rows: 16, y0: 2.5, rise: 0.4 },
  walkway: 2.6, // culoarul dintre inele
  // inelul 2: numărul de rânduri variază după elipsa din spatele tribunelor
  // (multe rânduri la mijlocul laturilor, puține în colțuri, ca la stadionul real)
  ring2: { rows: 42, wall: 1.1, rise: 0.52 },
  bowlBack: { ax: 86.7, az: 100.7 },
  seatW: 0.5,
  vipSeatW: 0.52,
  aisle: 1.2,
  seatInset: 0.42,
  // blocul de loje + presă din Tribuna 1 (z între -40 și 40)
  blockHalf: 40,
  boxW: 4,
  boxH: 3.6,
}

export const D1 = (i) => i * G.depth
export const Y1 = (i) => G.ring1.y0 + i * G.ring1.rise
export const WALK_D = G.ring1.rows * G.depth
export const WALK_Y = Y1(G.ring1.rows)
export const D2 = (j) => WALK_D + G.walkway + j * G.depth
export const Y2 = (j) => WALK_Y + G.ring2.wall + j * G.ring2.rise

const AX = G.hx - G.r
const AZ = G.hz - G.r
export const PIECES = { N: 0, NE: 1, E: 2, SE: 3, S: 4, SW: 5, W: 6, NW: 7 }
const CORNERS = {
  1: [AX, -AZ, -Math.PI / 2],
  3: [AX, AZ, 0],
  5: [-AX, AZ, Math.PI / 2],
  7: [-AX, -AZ, Math.PI],
}

export function pieceLen(p, d) {
  if (p === 0 || p === 4) return 2 * AX
  if (p === 2 || p === 6) return 2 * AZ
  return (G.r + d) * (Math.PI / 2)
}

// Punct pe conturul aflat la distanța d în spatele marginii interioare.
// (nx, nz) = normala orizontală spre exterior.
export function pathPoint(p, t, d) {
  switch (p) {
    case 0: return { x: -AX + 2 * AX * t, z: -(G.hz + d), nx: 0, nz: -1 }
    case 2: return { x: G.hx + d, z: -AZ + 2 * AZ * t, nx: 1, nz: 0 }
    case 4: return { x: AX - 2 * AX * t, z: G.hz + d, nx: 0, nz: 1 }
    case 6: return { x: -(G.hx + d), z: AZ - 2 * AZ * t, nx: -1, nz: 0 }
    default: {
      const [cx, cz, a0] = CORNERS[p]
      const a = a0 + t * (Math.PI / 2)
      const nx = Math.cos(a)
      const nz = Math.sin(a)
      return { x: cx + (G.r + d) * nx, z: cz + (G.r + d) * nz, nx, nz }
    }
  }
}

// câte rânduri are inelul 2 în dreptul punctului (piesă, t): până la elipsa din spate
export function ring2RowsAt(p, t) {
  const { ax, az } = G.bowlBack
  let n = 0
  while (n < G.ring2.rows) {
    const q = pathPoint(p, t, D2(n + 1))
    if ((q.x / ax) ** 2 + (q.z / az) ** 2 > 1) break
    n++
  }
  return Math.max(6, n)
}
export const MAX_R2 = Math.max(ring2RowsAt(2, 0.5), ring2RowsAt(0, 0.5))

// ─── Parametrul continuu u ∈ [0, 8): u = piesă + t, în jurul bolului ───
// Un sector poate trece de pe o porțiune dreaptă pe curba unui colț (ca pe harta oficială).
export const wrap8 = (u) => ((u % 8) + 8) % 8
export function uRanges(u0, u1) {
  const out = []
  let u = u0
  while (u < u1 - 1e-9) {
    const pa = Math.floor(u + 1e-9)
    const e = Math.min(u1, pa + 1)
    out.push([wrap8(pa), u - pa, e - pa, pa])
    u = e
  }
  return out
}
export function pointU(u, d) {
  const w = wrap8(u)
  const p = Math.min(7, Math.floor(w + 1e-9))
  return pathPoint(p, Math.min(1, Math.max(0, w - p)), d)
}
export const lenU = (u0, u1, d) => uRanges(u0, u1).reduce((a, [p, t0, t1]) => a + pieceLen(p, d) * (t1 - t0), 0)
export function uAtLen(u0, u1, d, s) {
  let acc = 0
  for (const [p, t0, t1, pa] of uRanges(u0, u1)) {
    const L = pieceLen(p, d) * (t1 - t0)
    if (s <= acc + L + 1e-9) return pa + t0 + ((s - acc) / L) * (t1 - t0)
    acc += L
  }
  return u1
}
// lungimea pe unitate de u în dreptul lui u (pentru deschideri de lățime fixă, ex. vomitoare)
export const lenPerU = (u, d) => pieceLen(Math.min(7, Math.floor(wrap8(u) + 1e-9)), d)
export const ring2RowsAtU = (u) => {
  const w = wrap8(u)
  const p = Math.min(7, Math.floor(w + 1e-9))
  return ring2RowsAt(p, Math.min(1, w - p))
}
export const BACK_D = D2(MAX_R2)
export const TOP_Y = Y2(MAX_R2 - 1)
export const RING_TOP = TOP_Y + 1.6 // peretele alb din spatele tribunelor / grinda inelară

const zToT = (z) => (AZ - z) / (2 * AZ) // tronsonul vest (W)
export const T_BLOCK_A = zToT(G.blockHalf)
export const T_BLOCK_B = zToT(-G.blockHalf)

// terasa de deasupra lojelor (masa presei + Tribuna 0 de sus): 7 rânduri în trepte
export const PRESS_ROWS = 7
export const PRESS_D = (k) => D2(0) + 0.8 + k * 1.0
export const PRESS_Y = (k) => WALK_Y + 2 * G.boxH + 0.3 + k * 0.45
export const PRESS_HALF = 12 // masa presei: z între −12 și 12 (după harta oficială)
export const PRESS_SIDE = [16, 31] // Tribuna 0 de sus: z între 16 și 31 de fiecare parte

function ringRows(ring) {
  const rows = []
  if (ring === 1) for (let i = 0; i < G.ring1.rows; i++) rows.push({ ring: 1, idx: i, front: D1(i), y: Y1(i) })
  else if (ring === 3) for (let k = 0; k < PRESS_ROWS; k++) rows.push({ ring: 3, idx: k, front: PRESS_D(k) - G.seatInset, y: PRESS_Y(k) })
  else for (let j = 0; j < G.ring2.rows; j++) rows.push({ ring: 2, idx: j, front: D2(j), y: Y2(j) })
  return rows
}

// ─── Definirea sectoarelor ───────────────────────────────────────────
// După harta oficială „Bilete Superliga 2026–2027” a clubului:
// Tribuna 1 (vest) sus pe hartă, Tribuna 2 (est) jos, Peluza Sud stânga, Peluza Nord dreapta.
function defineSectors() {
  const S = []
  const add = (o) => {
    if (o.u0 == null) {
      o.u0 = o.piece + o.t0
      o.u1 = o.piece + o.t1
    }
    S.push({ innerAisles: 0, seatW: G.seatW, vomitories: true, ...o })
  }
  // peluzele se împart în 4 sectoare de lungime egală (măsurată la mijlocul gradenelor)
  const DREF = D2(8)
  const splitEqual = (u0, u1, n) => {
    const L = lenU(u0, u1, DREF)
    return Array.from({ length: n + 1 }, (_, k) => (k === 0 ? u0 : k === n ? u1 : uAtLen(u0, u1, DREF, (L * k) / n)))
  }

  // Fiecare colț e împărțit în două: jumătatea de lângă peluză aparține sectorului de capăt
  // al peluzei, cealaltă jumătate e pana de colț (ca pe harta oficială).
  // Peluza Nord: sectoarele 3–6, de la vest (lângă Tribuna 1) spre est (lângă Tribuna 2)
  const pn = splitEqual(7.5, 9.5, 4)
  for (let i = 0; i < 4; i++) {
    add({ id: String(3 + i), num: 3 + i, stand: 'PN', u0: pn[i], u1: pn[i + 1], piece: Math.floor(wrap8(pn[i])), rings: [1, 2], innerAisles: 1, price: PRICES.PN, demand: 'PN' })
  }
  // Tribuna 2: 7 (colț NE), 8–12 pe două inele (de la nord la sud), 13 (colț SE)
  add({ id: '7', num: 7, stand: 'T2', piece: 1, t0: 0.5, t1: 1, rings: [1, 2], innerAisles: 1, price: PRICES.T2_7_13, demand: 'T2_corner' })
  const t2Prices = {
    8: [PRICES.T2_8_12_R1, PRICES.T2_8_12_R2],
    9: [PRICES.T2_9_11_R1, PRICES.T2_9_11_R2],
    10: [PRICES.T2_10_R1, PRICES.T2_10_R2],
    11: [PRICES.T2_9_11_R1, PRICES.T2_9_11_R2],
    12: [PRICES.T2_8_12_R1, PRICES.T2_8_12_R2],
  }
  for (let i = 0; i < 5; i++) {
    const n = 8 + i
    const demand = n === 10 ? 'T2_center' : 'T2_side'
    for (const ring of [1, 2]) {
      add({
        id: `${n}-${ring}`, num: n, ringLabel: ring, stand: 'T2', piece: 2, t0: i / 5, t1: (i + 1) / 5,
        rings: [ring], innerAisles: 1, price: t2Prices[n][ring - 1], demand,
      })
    }
  }
  add({ id: '13', num: 13, stand: 'T2', piece: 3, t0: 0, t1: 0.5, rings: [1, 2], innerAisles: 1, price: PRICES.T2_7_13, demand: 'T2_corner' })
  // Peluza Sud: 4 sectoare (14–17), de la est (lângă sectorul 13) spre vest
  const ps = splitEqual(3.5, 5.5, 4)
  for (let i = 0; i < 4; i++) {
    add({ id: String(14 + i), num: 14 + i, stand: 'PS', u0: ps[i], u1: ps[i + 1], piece: Math.floor(wrap8(ps[i])), rings: [1, 2], innerAisles: 1, price: PRICES.PS, demand: 'PS' })
  }
  // Colțul SV: gri pe harta oficială (nu se vinde public) – zona fanilor oaspeți
  add({ id: 'OAS', stand: 'PS', title: 'Colț SV · Oaspeți', piece: 5, t0: 0.5, t1: 1, rings: [1, 2], innerAisles: 1, price: PRICES.PS, demand: 'PS', away: true })
  // Tribuna 1 (vest). La capete: Tribuna 0 pe inelul 1, Tribuna 1 pe inelul 2
  add({ id: 'T0S', stand: 'T1', title: 'Tribuna 0 · Sud', piece: 6, t0: 0, t1: T_BLOCK_A, rings: [1], price: PRICES.T0, demand: 'T0' })
  add({ id: 'T1S', stand: 'T1', title: 'Tribuna 1 · Sud', piece: 6, t0: 0, t1: T_BLOCK_A, rings: [2], price: PRICES.T1, demand: 'T1' })
  // VIP A–F pe inelul 1, în fața lojelor (A la sud → F la nord)
  const w = (T_BLOCK_B - T_BLOCK_A) / 6
  const vipPrice = { A: PRICES.VIP_AF, B: PRICES.VIP_BE, C: PRICES.VIP_CD, D: PRICES.VIP_CD, E: PRICES.VIP_BE, F: PRICES.VIP_AF }
  'ABCDEF'.split('').forEach((L, k) => {
    add({
      id: `VIP-${L}`, letter: L, stand: 'VIP', title: `VIP · Sector ${L}`, piece: 6,
      t0: T_BLOCK_A + k * w, t1: T_BLOCK_A + (k + 1) * w, rings: [1], seatW: G.vipSeatW,
      price: vipPrice[L], demand: 'VIP', kind: 'vip', vomitories: false,
    })
  })
  // Tribuna 0 de sus: pe terasa de deasupra lojelor, de o parte și de alta a mesei presei
  add({ id: 'T0US', stand: 'T1', title: 'Tribuna 0 · Sus Sud', piece: 6, t0: zToT(PRESS_SIDE[1]), t1: zToT(PRESS_SIDE[0]), rings: [3], price: PRICES.T0, demand: 'T0', vomitories: false })
  add({ id: 'T0UN', stand: 'T1', title: 'Tribuna 0 · Sus Nord', piece: 6, t0: zToT(-PRESS_SIDE[0]), t1: zToT(-PRESS_SIDE[1]), rings: [3], price: PRICES.T0, demand: 'T0', vomitories: false })
  add({ id: 'T0N', stand: 'T1', title: 'Tribuna 0 · Nord', piece: 6, t0: T_BLOCK_B, t1: 1, rings: [1], price: PRICES.T0, demand: 'T0' })
  add({ id: 'T1N', stand: 'T1', title: 'Tribuna 1 · Nord', piece: 6, t0: T_BLOCK_B, t1: 1, rings: [2], price: PRICES.T1, demand: 'T1' })
  // Colțul NV: vândut ca Tribuna 1
  add({ id: 'T1C', stand: 'T1', title: 'Tribuna 1 · Colț NV', piece: 7, t0: 0, t1: 0.5, rings: [1, 2], innerAisles: 1, price: PRICES.T1, demand: 'T1' })

  for (const s of S) {
    if (s.num != null) {
      s.legend = LEGENDS[s.num]
      s.title = s.ringLabel ? `Sector ${s.num} · Inel ${s.ringLabel}` : `Sector ${s.num}`
    }
    s.gate = s.away ? 'P12' : STANDS[s.stand].gate
    s.kind = s.kind || 'seat'
    s.ring1Vom = s.rings.includes(1) && s.kind !== 'vip'
  }
  return S
}

// ─── Generarea rândurilor ────────────────────────────────────────────
function rowSlots(sector, row) {
  const d = row.front + G.seatInset
  const nb = sector.innerAisles + 1
  const slots = []
  if (row.ring === 1 && sector.ring1Vom) {
    const L = lenU(sector.u0, sector.u1, d)
    const sv = lenU(sector.u0, vomU(sector), d)
    const segs = [[0, sv - G.aisle / 2], [sv + G.aisle / 2, L]]
    segs.forEach(([a, b], k) => {
      const n = Math.max(0, Math.floor((b - a) / sector.seatW + 1e-6))
      const margin = (b - a - n * sector.seatW) / 2
      for (let i = 0; i < n; i++) {
        const s = a + margin + (i + 0.5) * sector.seatW
        slots.push({ block: k, s, u: uAtLen(sector.u0, sector.u1, d, s), blockCenter: (a + b) / 2, blockLen: b - a })
      }
    })
    return { d, slots }
  }
  for (let b = 0; b < nb; b++) {
    const bu0 = sector.u0 + ((sector.u1 - sector.u0) * b) / nb
    const bu1 = sector.u0 + ((sector.u1 - sector.u0) * (b + 1)) / nb
    const Lb = lenU(bu0, bu1, d)
    const n = Math.max(0, Math.floor((Lb - G.aisle) / sector.seatW + 1e-6))
    const margin = (Lb - n * sector.seatW) / 2
    for (let k = 0; k < n; k++) {
      const s = margin + (k + 0.5) * sector.seatW
      slots.push({ block: b, s, u: uAtLen(bu0, bu1, d, s), blockCenter: Lb / 2, blockLen: Lb })
    }
  }
  return { d, slots }
}

// limitele blocurilor din inelul 2 (folosite și pentru gradenele 3D)
export function sectorBlocks(sector) {
  const n = sector.innerAisles + 1
  const out = []
  for (let b = 0; b < n; b++) {
    const u0 = sector.u0 + ((sector.u1 - sector.u0) * b) / n
    const u1 = sector.u0 + ((sector.u1 - sector.u0) * (b + 1)) / n
    out.push({ b, u0, u1, rows: ring2RowsAtU((u0 + u1) / 2) })
  }
  return out
}
export const VOM_ROWS = [0, 5] // vomitoarele ies pe culoarul dintre inele (ca în fotografii)
// un singur vomitor pe sector (fotografia Peluzei Nord: intrările 3, 4, 5, 6), sub primul bloc
export const vomBlock = (sector) => Math.floor(sector.innerAisles / 2)
// poziția vomitorului sectorului (centrul blocului vomBlock)
export function vomU(sector) {
  const nb = sector.innerAisles + 1
  return sector.u0 + ((sector.u1 - sector.u0) * (vomBlock(sector) + 0.5)) / nb
}
// scările inelului de jos: ca în fotografii, câte una pe sector, care urcă spre vomitor;
// blocurile de jos trec peste granița dintre sectoare (doar VIP-ul are scări la margini)
export function ring1AisleUs(sector) {
  if (sector.ring1Vom) return [vomU(sector)]
  const nb = sector.innerAisles + 1
  return Array.from({ length: nb + 1 }, (_, b) => sector.u0 + ((sector.u1 - sector.u0) * b) / nb)
}

function buildNaturalRows(sector) {
  const rows = []
  let rowNum = 0
  const blocks = sectorBlocks(sector)
  for (const ring of sector.rings) {
    for (const row of ringRows(ring)) {
      if (ring === 2 && !blocks.some((bl) => row.idx < bl.rows)) continue
      rowNum++
      const { d, slots } = rowSlots(sector, row)
      const seats = []
      for (const sl of slots) {
        if (ring === 2 && row.idx >= blocks[sl.block].rows) continue
        // vomitoare: ieșiri din inelul 2, în mijlocul blocurilor înalte
        if (sector.vomitories && ring === 2 && sl.block === vomBlock(sector) && blocks[sl.block].rows >= 16 && row.idx >= VOM_ROWS[0] && row.idx < VOM_ROWS[1] && Math.abs(sl.s - sl.blockCenter) < 1.6) continue
        const p = pointU(sl.u, d)
        // tunelul jucătorilor, sub Tribuna VIP (între sectoarele C și D)
        if (sector.kind === 'vip' && row.idx < 7 && Math.abs(p.z) < 3.2) continue
        seats.push({ u: sl.u, block: sl.block, x: p.x, z: p.z, nx: p.nx, nz: p.nz, y: row.y })
      }
      rows.push({ num: rowNum, ring, ringRow: row.idx + 1, d, y: row.y, seats })
    }
  }
  return rows
}

function countRows(rows) {
  return rows.reduce((a, r) => a + r.seats.length, 0)
}

// împarte `total` proporțional cu `weights` (metoda resturilor celor mai mari)
function apportion(total, weights) {
  const W = weights.reduce((a, b) => a + b, 0)
  const raw = weights.map((w) => (w / W) * total)
  const out = raw.map(Math.floor)
  let rest = total - out.reduce((a, b) => a + b, 0)
  const order = raw.map((v, i) => [v - Math.floor(v), i]).sort((a, b) => b[0] - a[0])
  for (let k = 0; k < rest; k++) out[order[k % order.length][1]]++
  return out
}

// elimină locuri de la capetele rândurilor, uniform, începând din spate
function trimRows(rows, excess) {
  let side = 0
  while (excess > 0) {
    let removed = 0
    for (let r = rows.length - 1; r >= 0 && excess > 0; r--) {
      const seats = rows[r].seats
      if (seats.length <= 4) continue
      if (side % 2 === 0) seats.pop()
      else seats.shift()
      side++
      excess--
      removed++
    }
    if (!removed) throw new Error('Nu se pot elimina suficiente locuri')
  }
}

// ─── Lojele și tribuna presei (Tribuna 1, centru) ────────────────────
// Lojele, după harta oficială: nivelul 1 = 101–120 (119 și 120 sunt duble),
// nivelul 2 = 201–222, numerotate de la sud spre nord. 10 locuri într-o lojă simplă,
// 20 într-una dublă (2 rânduri) → 18×10 + 2×20 + 22×10 = 440.
function buildBoxes() {
  const boxes = []
  const cell = (2 * G.blockHalf) / 22
  const levels = [
    [1, [...Array.from({ length: 18 }, (_, i) => [101 + i, 1]), [119, 2], [120, 2]]],
    [2, Array.from({ length: 22 }, (_, i) => [201 + i, 1])],
  ]
  for (const [level, list] of levels) {
    let z1 = G.blockHalf
    for (const [num, wcells] of list) {
      const z0 = z1 - wcells * cell
      const zc = (z0 + z1) / 2
      const floorY = WALK_Y + (level - 1) * G.boxH
      const frontD = WALK_D + G.walkway
      const per = 5 * wcells
      const seats = []
      for (const [row, dx, dy] of [[1, 1.15, 0], [2, 2.45, 0.35]]) {
        for (let i = 0; i < per; i++) {
          seats.push({ row, num: (row - 1) * per + i + 1, x: -(G.hx + frontD + dx), y: floorY + dy, z: zc + ((per - 1) / 2 - i) * 0.62 })
        }
      }
      boxes.push({ id: `L${num}`, num, level, z0, z1, zc, floorY, frontD, seats })
      z1 = z0
    }
  }
  return boxes
}

// masa presei: 7 rânduri × 50 de locuri cu pupitre, în centrul terasei de sus
function buildPress() {
  const seats = []
  const perRow = CAPACITY.press / PRESS_ROWS
  const spacing = (2 * PRESS_HALF - 0.6) / perRow
  for (let k = 0; k < PRESS_ROWS; k++) {
    for (let i = 0; i < perRow; i++) {
      const z = ((perRow - 1) / 2 - i) * spacing
      seats.push({ row: k + 1, num: i + 1, x: -(G.hx + PRESS_D(k)), y: PRESS_Y(k), z })
    }
  }
  return seats
}

// locuri pentru persoane în scaun rulant + însoțitori, pe culoarul dintre inele
function buildAccessible(sectors) {
  const eligible = sectors.filter((s) => s.rings.includes(1) && s.kind !== 'vip')
  const d = WALK_D + 1.0
  const lengths = eligible.map((s) => lenU(s.u0, s.u1, d))
  const counts = apportion(CAPACITY.wheelchair, lengths)
  const pairs = []
  eligible.forEach((s, k) => {
    const n = counts[k]
    const L = lengths[k]
    for (let i = 0; i < n; i++) {
      // grupuri de câte două perechi, distribuite pe lungimea sectorului
      const pos = (L * (i + 0.5)) / n
      const u = uAtLen(s.u0, s.u1, d, pos)
      const p = pointU(u, d)
      pairs.push({ sector: s.id, x: p.x, z: p.z, nx: p.nx, nz: p.nz, y: WALK_Y, u })
    }
  })
  return pairs
}

// ─── Layout complet ──────────────────────────────────────────────────
export function buildLayout() {
  const sectors = defineSectors()
  for (const s of sectors) s.rows = buildNaturalRows(s)

  const isPublic = (s) => s.stand !== 'VIP'
  const pub = sectors.filter(isPublic)
  const vip = sectors.filter((s) => !isPublic(s))
  const check = (list, target, label) => {
    const nat = list.map((s) => countRows(s.rows))
    const sum = nat.reduce((a, b) => a + b, 0)
    if (sum < target) throw new Error(`${label}: geometria are ${sum} locuri, sub ținta ${target}`)
    const targets = apportion(target, nat)
    list.forEach((s, i) => {
      s.natural = nat[i]
      trimRows(s.rows, nat[i] - targets[i])
    })
  }
  check(pub, CAPACITY.public, 'Public')
  check(vip, CAPACITY.vip, 'VIP')

  const seats = []
  const push = (o) => {
    o.i = seats.length
    seats.push(o)
    return o
  }
  for (const s of sectors) {
    s.seatIdx = []
    for (const row of s.rows) {
      row.seats.forEach((p, k) => {
        const seat = push({
          sector: s.id, stand: s.stand, kind: s.kind, row: row.num, ring: row.ring, num: k + 1,
          x: p.x, y: row.y, z: p.z, rot: Math.atan2(-p.nx, -p.nz), nx: p.nx, nz: p.nz,
          price: s.price, block: p.block,
        })
        s.seatIdx.push(seat.i)
      })
    }
    s.capacity = s.seatIdx.length
    delete s.rows
  }

  const boxes = buildBoxes()
  for (const b of boxes) {
    b.seatIdx = b.seats.map((p) =>
      push({
        sector: b.id, stand: 'VIP', kind: 'box', row: p.row, num: p.num, x: p.x, y: p.y, z: p.z,
        rot: Math.PI / 2, nx: -1, nz: 0, price: PRICES.BOX, box: b.num, level: b.level,
      }).i,
    )
    delete b.seats
  }
  const pressIdx = buildPress().map((p) =>
    push({ sector: 'PRESA', stand: 'VIP', kind: 'press', row: p.row, num: p.num, x: p.x, y: p.y, z: p.z, rot: Math.PI / 2, nx: -1, nz: 0 }).i,
  )
  const accessible = buildAccessible(sectors)
  const accessibleIdx = []
  for (const a of accessible) {
    // spațiul pentru scaunul rulant și, lângă el, scaunul însoțitorului
    const tx = -a.nz
    const tz = a.nx
    accessibleIdx.push(
      push({ sector: a.sector, stand: sectorStand(sectors, a.sector), kind: 'wheelchair', x: a.x - tx * 0.4, y: a.y, z: a.z - tz * 0.4, rot: Math.atan2(-a.nx, -a.nz), nx: a.nx, nz: a.nz }).i,
      push({ sector: a.sector, stand: sectorStand(sectors, a.sector), kind: 'companion', x: a.x + tx * 0.45, y: a.y, z: a.z + tz * 0.45, rot: Math.atan2(-a.nx, -a.nz), nx: a.nx, nz: a.nz }).i,
    )
  }

  // centrul și normala fiecărui sector (pentru cameră și etichete)
  for (const s of sectors) {
    let x = 0, y = 0, z = 0, nx = 0, nz = 0
    for (const i of s.seatIdx) {
      const p = seats[i]
      x += p.x; y += p.y; z += p.z; nx += p.nx; nz += p.nz
    }
    const n = s.seatIdx.length || 1
    const nl = Math.hypot(nx, nz) || 1
    s.center = { x: x / n, y: y / n, z: z / n }
    s.normal = { x: nx / nl, z: nz / nl }
  }

  return { sectors, boxes, seats, pressIdx, accessibleIdx }
}

function sectorStand(sectors, id) {
  return sectors.find((s) => s.id === id).stand
}

export function summarize(layout) {
  const by = (k) => layout.seats.filter((s) => s.kind === k).length
  const total = layout.seats.length
  return {
    total,
    public: layout.sectors.filter((s) => s.stand !== 'VIP').reduce((a, s) => a + s.capacity, 0),
    vip: by('vip'),
    boxes: by('box'),
    press: by('press'),
    wheelchair: by('wheelchair'),
    companion: by('companion'),
  }
}
