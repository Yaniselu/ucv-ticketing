// Generatorul tuturor locurilor stadionului, după harta reală a locurilor (src/data/seatmap.js).
// Nu depinde de three.js, rulează și în Node (server, scripts/verify-capacity.mjs).
//
// Sistem de coordonate (metri): originea în centrul terenului, x = est, z = sud, y = sus.
// Terenul are 105 × 68 m pe axa nord–sud.
//
// Gradenele sunt rânduri pe conturul tribunelor (un dreptunghi cu colțuri rotunjite, decalat cu
// adâncimea rândului). Inelul de jos are 22 de rânduri pe tribune și 15 pe peluze (ca pe harta reală;
// peluzele au panta mai mare, iar culoarul dintre inele e la aceeași înălțime peste tot). Fiecare loc
// din harta reală are rândul lui și poziția de-a lungul rândului; colțurile sunt umplute pe arcul
// rămas liber cu numărul real de locuri al fiecărui colț.

import { LEGENDS, PRICES, STANDS, WHEELCHAIR_PER_ZONE } from './stadium-data.js'
import SEATMAP from './seatmap.js'

export const G = {
  pitchL: 105,
  pitchW: 68,
  // marginea interioară a tribunelor (dreptunghi cu colțuri rotunjite), după conturul real al
  // gazonului din OpenStreetMap
  hx: 39.5,
  hz: 57.5,
  r: SEATMAP.r,
  depth: 0.8, // adâncimea unui rând din inelul de jos
  // inelul de jos: 22 de rânduri pe tribune, 15 pe peluze (harta reală)
  ring1: { rows: SEATMAP.r1T, rowsP: SEATMAP.r1P, y0: 2.5, rise: 0.4 },
  walkway: 2.6, // culoarul dintre inele
  ring2: { rows: 42, wall: 1.1, rise: 0.52, depth: SEATMAP.dep2 },
  // elipsa din spatele tribunelor: structura (stâlpii, vitrajul, grinda inelară) stă pe ea; gradenele
  // se termină în spatele ultimului rând cu locuri din harta reală (backRowsAt), în interiorul ei
  bowlBack: { ax: 87.5, az: 103.3 },
  seatInset: 0.42,
  aisle: 1.2,
  // blocul de loje + presă din Tribuna 1 (z între -40 și 40)
  blockHalf: 40,
  boxW: 4,
  boxH: SEATMAP.boxH,
}

export const D1 = (i) => i * G.depth
export const Y1 = (i) => G.ring1.y0 + i * G.ring1.rise
export const WALK_D = G.ring1.rows * G.depth
export const WALK_Y = Y1(G.ring1.rows)
// peluzele: 15 rânduri, cu panta mai mare, până la același culoar
export const RISE_P = (WALK_Y - G.ring1.y0) / G.ring1.rowsP
export const Y1P = (i) => G.ring1.y0 + i * RISE_P
export const WALK_DP = G.ring1.rowsP * G.depth
export const D2 = (j) => WALK_D + G.walkway + j * G.ring2.depth
export const Y2 = (j) => WALK_Y + G.ring2.wall + j * G.ring2.rise

const AX = G.hx - G.r
const AZ = G.hz - G.r
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

// ─── Parametrul continuu u ∈ [0, 8): u = piesă + t, în jurul bolului ───
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
// poziția pe contur (metri de la u = 0, la adâncimea d) → u, pe tot inelul
const totalLen = (d) => lenU(0, 8, d)
export function uAtArc(s, d) {
  const T = totalLen(d)
  return uAtLen(0, 8, d, ((s % T) + T) % T)
}
// lungimea pe unitate de u în dreptul lui u (pentru deschideri de lățime fixă, ex. vomitoare)
export const lenPerU = (u, d) => pieceLen(Math.min(7, Math.floor(wrap8(u) + 1e-9)), d)

// ─── Deschiderile din colțuri (accesul pentru ambulanță) ───
// O tranșee dreaptă, de lățime constantă, prin tot inelul de jos; la capăt intră într-un tunel sub
// culoar, iar peste ea e un tunel acoperit alb cu „UNIVERSITATEA CRAIOVA”. Pe harta reală, peluzele
// au rânduri mai lungi decât latura, așa că tranșeea e mai aproape de tribună decât de peluză.
export const NOTCH_W = 7.0
export const NOTCH_TUN_H = 4.4 // înălțimea tunelului acoperit, la coamă (pereții drepți au 3,4 m)
export const NOTCH_T = SEATMAP.notchT // poziția tranșeei pe arcul colțului (0 = începutul piesei)
const CORNER_PIECES = [1, 3, 5, 7]
export function cornerAxis(p) {
  const [cx, cz, a0] = CORNERS[p]
  const a = a0 + NOTCH_T[p] * (Math.PI / 2)
  return { cx, cz, vx: Math.cos(a), vz: Math.sin(a) }
}
const notchPerp = (p, x, z) => {
  const { cx, cz, vx, vz } = cornerAxis(p)
  const rx = x - cx
  const rz = z - cz
  return { along: rx * vx + rz * vz, perp: rx * vz - rz * vx }
}
// marginile tranșeei (în u) la distanța d de marginea gradenelor: [înainte de ea, după ea]
const edgeCache = new Map()
export function notchEdges(p, d) {
  const key = `${p}:${d.toFixed(4)}`
  if (edgeCache.has(key)) return edgeCache.get(key)
  const c = p + NOTCH_T[p]
  const solve = (lo, hi, sign) => {
    for (let k = 0; k < 40; k++) {
      const m = (lo + hi) / 2
      const q = pointU(m, d)
      const inside = Math.abs(notchPerp(p, q.x, q.z).perp) < NOTCH_W / 2
      if (sign < 0 ? inside : !inside) hi = m
      else lo = m
    }
    return (lo + hi) / 2
  }
  const out = [solve(c - 1, c, -1), solve(c, c + 1, 1)]
  edgeCache.set(key, out)
  return out
}
// partea inelului de jos în dreptul lui u: tribună (22 de rânduri) sau peluză (15)
const P_AT_START = { 1: true, 3: false, 5: true, 7: false }
export function ring1Kind(u) {
  const w = wrap8(u)
  const p = Math.min(7, Math.floor(w + 1e-9))
  if (p === 2 || p === 6) return 'T'
  if (p === 0 || p === 4) return 'P'
  const before = w - p < NOTCH_T[p]
  return before === P_AT_START[p] ? 'P' : 'T'
}
export const ring1Y = (i, kind) => (kind === 'P' ? Y1P(i) : Y1(i))

// ─── Marginea din spate a inelului de sus ───
// Câte rânduri are inelul de sus în dreptul lui u: ultimul rând cu locuri din harta reală (culoarele
// dintre blocuri iau înălțimea vecinilor). Spatele gradenelor e deci în trepte, ca în fotografii:
// blocurile mai scurte au în spate o platformă și pereți albi.
const NB = 2400
const BACK_ROWS = (() => {
  const raw = new Int16Array(NB).fill(-1)
  const bucket = (u) => Math.floor((wrap8(u) / 8) * NB) % NB
  for (const b of SEATMAP.blocks) {
    if (b.ring !== 2) continue
    const w = b.w || SEATMAP.seatW
    for (const row of b.rows) {
      const r = row[0]
      const d = D2(r) + G.seatInset
      for (let k = 1; k < row.length; k += 2) {
        const a = bucket(uAtArc(row[k] - w / 2, d))
        let e = bucket(uAtArc(row[k] + (row[k + 1] - 0.5) * w, d))
        if (e < a) e += NB
        for (let i = a; i <= e; i++) raw[i % NB] = Math.max(raw[i % NB], r + 1)
      }
    }
  }
  // culoarele și golurile mici dintre blocuri: maximul vecinilor pe ±6 diviziuni (≈ 1,5–2 m)
  const win = new Int16Array(NB).fill(-1)
  for (let i = 0; i < NB; i++) {
    for (let k = -6; k <= 6; k++) win[i] = Math.max(win[i], raw[(i + k + NB) % NB])
  }
  // golurile mari (fără locuri): interpolare între blocurile vecine
  const out = new Int16Array(NB)
  for (let i = 0; i < NB; i++) {
    if (win[i] >= 0) {
      out[i] = win[i]
      continue
    }
    let a = 1
    while (win[(i - a + NB) % NB] < 0) a++
    let c = 1
    while (win[(i + c) % NB] < 0) c++
    const va = win[(i - a + NB) % NB]
    const vc = win[(i + c) % NB]
    out[i] = Math.round(va + ((vc - va) * a) / (a + c))
  }
  return out
})()
export const backRowsAt = (u) => BACK_ROWS[Math.floor((wrap8(u) / 8) * NB) % NB]
export const BACK_DIV = 8 / NB // lățimea unei diviziuni în u
export const MAX_R2 = Math.max(...BACK_ROWS)
export const BACK_D = D2(MAX_R2)
export const TOP_Y = Y2(MAX_R2 - 1)
export const RING_TOP = TOP_Y + 1.6 // peretele alb din spatele tribunelor / grinda inelară

const zToT = (z) => (AZ - z) / (2 * AZ) // tronsonul vest (W)

// Tribuna 1: VIP A–F jos (inelul de jos), deasupra lor un nivel lounge vitrat, apoi lojele 101–120
// și 201–222 cu balcoane. Deasupra lojelor, G, presa (H) și I continuă panta inelului de sus.
export const LOUNGE_H = SEATMAP.loungeH
export const BOX_SETBACK = [0, 1.4]
export const boxFloorY = (level) => WALK_Y + LOUNGE_H + (level - 1) * G.boxH
export const boxFrontD = (level) => D2(0) + BOX_SETBACK[level - 1]
export const UPPER_Y0 = WALK_Y + LOUNGE_H + 2 * G.boxH // acoperișul lojelor de la nivelul 2
export const T1_HALF = [G.blockHalf, G.blockHalf - 3, G.blockHalf - 6]
const firstRowAbove = (y) => {
  let j = 0
  while (Y2(j) < y + 0.25) j++
  return j
}
export const T1_ROWS = [firstRowAbove(boxFloorY(1)), firstRowAbove(boxFloorY(2)), firstRowAbove(UPPER_Y0)]
export const J0 = T1_ROWS[2] // primul rând al sectoarelor G, H, I
export const t1EdgeZ = (j) => (j < T1_ROWS[0] ? T1_HALF[0] : j < T1_ROWS[1] ? T1_HALF[1] : j < T1_ROWS[2] ? T1_HALF[2] : 0)
export function t1Blocked(u, j, d, pad = 0) {
  const w = wrap8(u)
  if (w < 6 || w >= 7) return false
  const e = t1EdgeZ(j)
  return e > 0 && Math.abs(pointU(u, d).z) < e + pad
}
// presa (H): 5 rânduri cu pupitre, din două în două rânduri ale pantei (harta reală)
export const PRESS_ROWS = 5
export const PRESS_J = (k) => J0 + 1 + 2 * k
export const PRESS_Y = (k) => Y2(PRESS_J(k))
export const zToTW = (z) => 6 + (AZ - z) / (2 * AZ)
export const t1CutT = (j) => {
  const e = t1EdgeZ(j)
  return e > 0 ? [zToT(e), zToT(-e)] : null
}

// ─── Sectoarele ──────────────────────────────────────────────────────
// Tribuna 1 la vest, Tribuna 2 la est, Peluza Nord (3–6), Peluza Sud (14–17), colțurile 2 (NV),
// 7 (NE), 13 (SE), 18 (SV, oaspeți), capetele Tribunei 1: 19 (sud) și 1 (nord).
const T2P = {
  8: [PRICES.T2_8_12_R1, PRICES.T2_8_12_R2], 9: [PRICES.T2_9_11_R1, PRICES.T2_9_11_R2], 10: [PRICES.T2_10_R1, PRICES.T2_10_R2],
  11: [PRICES.T2_9_11_R1, PRICES.T2_9_11_R2], 12: [PRICES.T2_8_12_R1, PRICES.T2_8_12_R2],
}
function sectorCfg(key) {
  const n = +key
  if (n >= 3 && n <= 6) return { stand: 'PN', price: PRICES.PN, demand: 'PN' }
  if (n >= 14 && n <= 17) return { stand: 'PS', price: PRICES.PS, demand: 'PS' }
  if (n === 7 || n === 13) return { stand: 'T2', price: PRICES.T2_7_13, demand: 'T2_corner' }
  if (n >= 8 && n <= 12) return { stand: 'T2', split: T2P[n], demand: n === 10 ? 'T2_center' : 'T2_side' }
  // sectorul oaspeților: 18 și jumătatea sectorului 19 dinspre colț
  if (n === 19) return { stand: 'T1', split: [PRICES.T0, PRICES.T1], demand: 'T1', awaySplit: true }
  if (n === 1) return { stand: 'T1', split: [PRICES.T0, PRICES.T1], demand: 'T1' }
  if (n === 18) return { stand: 'T1', price: PRICES.T1, demand: 'T1', away: true }
  return { stand: 'T1', price: PRICES.T1, demand: 'T1' } // sectorul 2 (colț NV)
}
const VIP_PRICE = { A: PRICES.VIP_AF, B: PRICES.VIP_BE, C: PRICES.VIP_CD, D: PRICES.VIP_CD, E: PRICES.VIP_BE, F: PRICES.VIP_AF }

function makeSector(id) {
  let s
  if (id.startsWith('VIP-')) {
    const L = id.slice(4)
    s = { id, letter: L, group: L, stand: 'VIP', title: `VIP · Sector ${L}`, rings: [1], price: VIP_PRICE[L], demand: 'VIP', kind: 'vip' }
  } else if (id === 'G' || id === 'I') {
    s = { id, letter: id, group: id, stand: 'T1', title: `Sector ${id}`, rings: [2], minRow: J0, price: PRICES.T0, demand: 'T0' }
  } else {
    const [key, ring] = id.split('-')
    const c = sectorCfg(key)
    s = { id, num: +key, group: key, stand: c.stand, demand: c.demand, away: !!c.away, awaySplit: c.awaySplit }
    if (ring) {
      s.ringLabel = +ring
      s.rings = [+ring]
      s.price = c.split[+ring - 1]
      s.title = `Sector ${key} · Inel ${ring}`
    } else {
      s.rings = [1, 2]
      s.price = c.price
      s.title = `Sector ${key}`
    }
    s.legend = LEGENDS[s.num]
  }
  s.kind = s.kind || 'seat'
  s.baseTitle = s.title
  s.baseGate = STANDS[s.stand].gate
  if (s.away) s.title = `Sector ${s.num} · Oaspeți`
  s.gate = s.away ? 'Acces oaspeți' : s.baseGate
  s.basePrice = s.price
  s.vomitories = s.kind !== 'vip'
  return s
}

// ordinea sectoarelor (pentru numerotare, liste și interfață)
const ORDER = [
  '1-1', '1-2', '2', '3', '4', '5', '6', '7', '8-1', '8-2', '9-1', '9-2', '10-1', '10-2', '11-1', '11-2', '12-1', '12-2',
  '13', '14', '15', '16', '17', '18', '19-1', '19-2', 'VIP-A', 'VIP-B', 'VIP-C', 'VIP-D', 'VIP-E', 'VIP-F', 'G', 'I',
]

// adâncimea și înălțimea unui rând
const rowDepth = (ring, r) => (ring === 1 ? D1(r) : D2(r)) + G.seatInset
const rowY = (ring, r, rake) => (ring === 1 ? ring1Y(r, rake) : Y2(r))

// ─── Lojele (Tribuna 1, centru) ──────────────────────────────────────
// Nivelul 1 = 101–120 (119 și 120 sunt duble), nivelul 2 = 201–222, numerotate de la sud spre nord.
// 10 locuri într-o lojă simplă, 20 într-una dublă (2 rânduri) → 18×10 + 2×20 + 22×10 = 440.
function buildBoxes() {
  const boxes = []
  const levels = [
    [1, [...Array.from({ length: 18 }, (_, i) => [101 + i, 1]), [119, 2], [120, 2]]],
    [2, Array.from({ length: 22 }, (_, i) => [201 + i, 1])],
  ]
  for (const [level, list] of levels) {
    const half = T1_HALF[level]
    const cell = (2 * half) / 22
    const pitch = Math.min(0.62, (cell - 0.75) / 4)
    let z1 = half
    for (const [num, wcells] of list) {
      const z0 = z1 - wcells * cell
      const zc = (z0 + z1) / 2
      const floorY = boxFloorY(level)
      const frontD = boxFrontD(level)
      const per = 5 * wcells
      const seats = []
      for (const [row, dx, dy] of [[1, 1.15, 0], [2, 2.45, 0.35]]) {
        for (let i = 0; i < per; i++) {
          seats.push({ row, num: (row - 1) * per + i + 1, x: -(G.hx + frontD + dx), y: floorY + dy, z: zc + ((per - 1) / 2 - i) * pitch })
        }
      }
      boxes.push({ id: `L${num}`, num, level, z0, z1, zc, floorY, frontD, seats })
      z1 = z0
    }
  }
  return boxes
}

// ─── Layout complet ──────────────────────────────────────────────────
export function buildLayout() {
  const sectors = ORDER.map(makeSector)
  const byId = new Map(sectors.map((s) => [s.id, s]))
  const seats = []
  const push = (o) => {
    o.i = seats.length
    seats.push(o)
    return o
  }
  // locurile din harta reală, grupate pe sector → rând (inel, rând) → loc
  const rowsBySector = new Map(sectors.map((s) => [s.id, new Map()]))
  const pressRaw = []
  const runs = new Map() // (inel, rând) → șirurile de locuri [început, sfârșit] în metri pe contur
  SEATMAP.blocks.forEach((b, bi) => {
    const w = b.w || SEATMAP.seatW
    const raw = []
    for (const row of b.rows) {
      const r = row[0]
      const d = rowDepth(b.ring, r)
      const rk = `${b.ring}:${r}`
      if (!runs.has(rk)) runs.set(rk, [])
      for (let k = 1; k < row.length; k += 2) {
        const s0 = row[k]
        const n = row[k + 1]
        runs.get(rk).push([s0 - w / 2, s0 + (n - 0.5) * w])
        for (let m = 0; m < n; m++) {
          const u = uAtArc(s0 + m * w, d)
          const rake = b.ring === 1 ? b.rake || ring1Kind(u) : null
          raw.push({ ring: b.ring, r, u, d, w, y: rowY(b.ring, r, rake), block: bi })
        }
      }
    }
    if (b.kind === 'press' || b.s === 'PRESA') {
      pressRaw.push(...raw)
      return
    }
    const map = rowsBySector.get(b.s)
    for (const p of raw) {
      const key = `${p.ring}:${p.r}`
      if (!map.has(key)) map.set(key, [])
      map.get(key).push(p)
    }
  })

  // numerotarea: rândurile de la teren spre spate (inelul de jos, apoi cel de sus), locurile în
  // sensul lui u, pornind de la începutul sectorului
  for (const s of sectors) {
    const map = rowsBySector.get(s.id)
    const all = [...map.values()].flat()
    // începutul sectorului: u minim, ținând cont de trecerea prin 0 (sectoarele din colțul NE)
    const us = all.map((p) => p.u).sort((a, b) => a - b)
    let start = us[0] || 0
    let gapMax = 0
    for (let k = 0; k < us.length; k++) {
      const g = k + 1 < us.length ? us[k + 1] - us[k] : us[0] + 8 - us[k]
      if (g > gapMax) {
        gapMax = g
        start = k + 1 < us.length ? us[k + 1] : us[0]
      }
    }
    const rel = (u) => wrap8(u - start)
    s.u0 = start
    s.u1 = start + Math.max(...all.map((p) => rel(p.u)), 0)
    const keys = [...map.keys()].sort((a, b) => {
      const [ra, ia] = a.split(':').map(Number)
      const [rb, ib] = b.split(':').map(Number)
      return ra - rb || ia - ib
    })
    // sectorul 19: jumătatea dinspre colț (u mai mic) e a oaspeților când e activată
    const splitU = s.awaySplit ? start + (s.u1 - start) / 2 : null
    s.seatIdx = []
    s.rowCount = keys.length
    s.r2max = 0
    s.minRow = s.minRow ?? Infinity
    keys.forEach((key, kr) => {
      const list = map.get(key).sort((a, b) => rel(a.u) - rel(b.u))
      list.forEach((p, k) => {
        const q = pointU(p.u, p.d)
        const half = splitU != null && rel(p.u) < rel(splitU)
        const seat = push({
          sector: s.id, stand: s.stand, kind: s.kind, row: kr + 1, ring: p.ring, ringRow: p.r + 1, num: k + 1,
          away: s.away || half, awayHalf: half,
          x: q.x, y: p.y, z: q.z, rot: Math.atan2(-q.nx, -q.nz), nx: q.nx, nz: q.nz, u: p.u, w: p.w,
          price: s.price, block: p.block,
        })
        s.seatIdx.push(seat.i)
      })
      const [ring, r] = key.split(':').map(Number)
      if (ring === 2) {
        s.r2max = Math.max(s.r2max, r + 1)
        s.minRow = Math.min(s.minRow, r)
      }
    })
    if (!Number.isFinite(s.minRow)) s.minRow = 0
    s.capacity = s.seatIdx.length
    // porțiunile sectorului pe fiecare inel (pentru zonele de selecție): intervalul în u și rândurile
    s.parts = []
    for (const ring of [1, 2]) {
      const ps = s.seatIdx.map((i) => seats[i]).filter((p) => p.ring === ring)
      if (!ps.length) continue
      const rs = ps.map((p) => p.ringRow - 1)
      const ys = ps.map((p) => p.y)
      s.parts.push({
        ring, u0: start + Math.min(...ps.map((p) => rel(p.u))), u1: start + Math.max(...ps.map((p) => rel(p.u))),
        r0: Math.min(...rs), r1: Math.max(...rs), y0: Math.min(...ys), y1: Math.max(...ys),
      })
    }
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
  // presa (sectorul H): rândurile numerotate de jos în sus, locurile de la sud spre nord
  const pressRows = [...new Set(pressRaw.map((p) => p.r))].sort((a, b) => a - b)
  const pressIdx = []
  pressRows.forEach((r, kr) => {
    pressRaw.filter((p) => p.r === r).sort((a, b) => a.u - b.u).forEach((p, k) => {
      const q = pointU(p.u, p.d)
      pressIdx.push(push({ sector: 'PRESA', stand: 'VIP', kind: 'press', row: kr + 1, ring: 2, ringRow: r + 1, num: k + 1, u: p.u, w: p.w, x: q.x, y: p.y + 0.02, z: q.z, rot: Math.PI / 2, nx: -1, nz: 0 }).i)
    })
  })
  const deskRows = new Set(Array.from({ length: PRESS_ROWS }, (_, k) => PRESS_J(k)))
  const deskZ = pressRaw.filter((p) => deskRows.has(p.r)).map((p) => pointU(p.u, p.d).z)
  const pressSpan = deskZ.length ? [Math.min(...deskZ) - 0.3, Math.max(...deskZ) + 0.3] : [-10, 10]

  // locurile pentru persoane în scaun rulant: 2 × 31 pe platforma din fața Tribunei 2
  // (în fața sectoarelor 11–12 și 8–9, unde blocurile încep abia de la al patrulea rând)
  const zones = []
  for (const ids of [['12-1', '11-1'], ['9-1', '8-1']]) {
    const us = ids.flatMap((id) => byId.get(id).seatIdx.map((i) => seats[i]).filter((p) => p.ringRow === 4).map((p) => p.u))
    if (!us.length) continue
    const a = Math.min(...us)
    const b = Math.max(...us)
    const m = (b - a) * 0.08
    zones.push([a + m, b - m])
  }
  const accessibleIdx = []
  zones.forEach((z, zi) => {
    const d = D1(1)
    const L = lenU(z[0], z[1], d)
    for (let i = 0; i < WHEELCHAIR_PER_ZONE; i++) {
      const u = uAtLen(z[0], z[1], d, (L * (i + 0.5)) / WHEELCHAIR_PER_ZONE)
      const q = pointU(u, d)
      const s = zi === 0 ? byId.get('11-1') : byId.get('9-1')
      accessibleIdx.push(push({ sector: s.id, stand: s.stand, kind: 'wheelchair', zone: zi + 1, num: i + 1, x: q.x, y: Y1(1), z: q.z, rot: Math.atan2(-q.nx, -q.nz), nx: q.nx, nz: q.nz, u }).i)
    }
  })

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

  // poziția (metri pe contur, de la u = 0) a lui u pe rândul (inel, r) și golul din jurul ei pe acel rând
  const arcOn = (ring, r, u) => lenU(0, wrap8(u), rowDepth(ring, r))
  const gapAround = (ring, r, u) => {
    const sv = arcOn(ring, r, u)
    let lo = -Infinity
    let hi = Infinity
    for (const [a, b] of runs.get(`${ring}:${r}`) || []) {
      if (b <= sv + 0.01) lo = Math.max(lo, b - sv)
      else if (a >= sv - 0.01) hi = Math.min(hi, a - sv)
      else return [0, 0] // un loc chiar în dreptul lui u
    }
    return [lo, hi]
  }

  // vomitoarele (golurile de 3–4,5 m din primele rânduri ale blocurilor de sus). Pe hartă, în fața
  // fiecăruia primele rânduri nu au locuri pe ~12 m, iar pe lângă el urcă două scări: vomitorul iese
  // la nivelul culoarului dintre inele, printr-o tăietură în gradene (`cut`, metri față de centru).
  const voms = (SEATMAP.voms || []).filter((v) => v.w < 6).map((v) => {
    let lo = -3
    let hi = 3
    for (let r = v.j0; r <= v.j1; r++) {
      const [a, b] = gapAround(2, r, v.u)
      lo = Math.max(lo, a)
      hi = Math.min(hi, b)
    }
    return { ...v, cut: [lo, hi], sectorObj: byId.get(v.s) }
  })
  const inCut = (u, r) => voms.some((v) => r <= v.j1 && Math.abs(wrap8(u) - wrap8(v.u)) * lenPerU(v.u, 30) < Math.max(-v.cut[0], v.cut[1]) + 0.3)

  // scările: golurile de 0,45–2,6 m dintre locurile aceluiași rând (culoarele din harta reală)
  const aisles = []
  const aisleAt = (ring, r, u, width) => {
    const d = rowDepth(ring, r) - G.seatInset
    const kind = ring === 1 ? ring1Kind(u) : null
    aisles.push({
      ring, r, u, width, d, y: ring === 1 ? ring1Y(r, kind) : Y2(r),
      depth: ring === 1 ? G.depth : G.ring2.depth, rise: ring === 1 ? (kind === 'P' ? RISE_P : G.ring1.rise) : G.ring2.rise,
    })
  }
  for (const [rk, list] of runs) {
    const [ring, r] = rk.split(':').map(Number)
    const d = rowDepth(ring, r)
    const T = lenU(0, 8, d)
    list.sort((a, b) => a[0] - b[0])
    for (let k = 0; k < list.length; k++) {
      const a = list[k]
      const b = k + 1 < list.length ? list[k + 1] : [list[0][0] + T, list[0][1] + T]
      const gap = b[0] - a[1]
      if (gap < 0.45 || gap > 2.6) continue
      const u = uAtArc((a[1] + b[0]) / 2, d)
      if (ring === 2 && t1Blocked(u, r, d - G.seatInset, 0.3)) continue
      aisleAt(ring, r, u, gap)
    }
  }
  // scările inelului de sus coboară până la culoar și pe rândurile fără locuri din fața lor
  // (ex. lângă vomitoare)
  const cols = new Map()
  for (const a of aisles) {
    if (a.ring !== 2) continue
    const k = Math.round(wrap8(a.u) / 0.003)
    if (!cols.has(k) || cols.get(k).r > a.r) cols.set(k, a)
  }
  for (const a of cols.values()) {
    for (let r = a.r - 1; r >= 0; r--) {
      const [lo, hi] = gapAround(2, r, a.u)
      if (hi - lo < a.width || inCut(a.u, r) || t1Blocked(a.u, r, D2(r), 0.3)) break
      aisleAt(2, r, a.u, a.width)
    }
  }

  return { sectors, boxes, seats, pressIdx, accessibleIdx, zones, pressSpan, pressRows, voms, aisles }
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
