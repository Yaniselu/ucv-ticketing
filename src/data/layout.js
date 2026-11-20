// Generator determinist pentru toate locurile stadionului.
// Nu depinde de three.js, rulează și în Node (scripts/verify-capacity.mjs).
//
// Sistem de coordonate (metri): originea în centrul terenului,
// x = est, z = sud, y = sus. Terenul are 105 × 68 m pe axa nord–sud.

import { CAPACITY, LEGENDS, PRICES, STANDS, SECTOR_SEATS, WHEELCHAIR_PER_ZONE } from './stadium-data.js'
import { BOUNDS } from './sector-bounds.js'

export const G = {
  pitchL: 105,
  pitchW: 68,
  // marginea interioară a tribunelor (dreptunghi cu colțuri rotunjite)
  // după conturul real al gazonului din OpenStreetMap (77 × 113 m)
  hx: 39.5,
  hz: 57.5,
  // colțurile interioare sunt aproape drepte (planul oficial): laturile drepte au lungimea reală
  r: 2,
  depth: 0.8, // adâncimea unui rând
  ring1: { rows: 16, y0: 2.5, rise: 0.4 },
  walkway: 2.6, // culoarul dintre inele
  // inelul 2: numărul de rânduri variază după elipsa din spatele tribunelor
  // (multe rânduri la mijlocul laturilor, puține în colțuri, ca la stadionul real)
  ring2: { rows: 42, wall: 1.1, rise: 0.52 },
  bowlBack: { ax: 86.7, az: 100.7 },
  // distanța dintre axele scaunelor, reglată cu scripts/tune-seats.mjs
  seatW: 0.5333,
  vipSeatW: 0.5516,
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
// marginea din spate a inelului de sus e elipsa: un rând există în dreptul lui u doar dacă se
// termină în interiorul ei, deci marginea de sus a tribunelor e o curbă continuă (ca pe stadion)
export function insideBack(u, d) {
  const q = pointU(u, d)
  return (q.x / G.bowlBack.ax) ** 2 + (q.z / G.bowlBack.az) ** 2 <= 1
}

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
// ─── Deschiderile din colțuri (accesul pentru ambulanță) ───
// O tranșee dreaptă, de lățime constantă, paralelă cu diagonala colțului, prin tot inelul de jos
// (ca în fotografii); la capăt intră într-un tunel sub culoar, iar peste ea e un tunel acoperit
// alb cu „UNIVERSITATEA CRAIOVA”.
export const NOTCH_W = 7.0
export const NOTCH_TUN_H = 4.4 // înălțimea tunelului acoperit, la coamă (pereții drepți au 3,4 m)
const CORNER_PIECES = [1, 3, 5, 7]
// diagonala colțului: pornește din centrul arcului, spre exterior
export function cornerAxis(p) {
  const [cx, cz, a0] = CORNERS[p]
  const a = a0 + Math.PI / 4
  return { cx, cz, vx: Math.cos(a), vz: Math.sin(a) }
}
const notchPerp = (p, x, z) => {
  const { cx, cz, vx, vz } = cornerAxis(p)
  const rx = x - cx
  const rz = z - cz
  return { along: rx * vx + rz * vz, perp: rx * vz - rz * vx }
}
export function inNotch(u, d, pad = 0) {
  const q = pointU(u, d)
  return CORNER_PIECES.some((p) => {
    const { along, perp } = notchPerp(p, q.x, q.z)
    return along > 0 && Math.abs(perp) < NOTCH_W / 2 + pad
  })
}
// marginile tranșeei (în u) la distanța d de marginea gradenelor: [înainte de colț, după colț]
const edgeCache = new Map()
export function notchEdges(p, d) {
  const key = `${p}:${d.toFixed(4)}`
  if (edgeCache.has(key)) return edgeCache.get(key)
  const solve = (lo, hi, sign) => {
    // |perp| scade spre diagonala colțului (u = p + 0.5)
    for (let k = 0; k < 40; k++) {
      const m = (lo + hi) / 2
      const q = pointU(m, d)
      const inside = Math.abs(notchPerp(p, q.x, q.z).perp) < NOTCH_W / 2
      if (sign < 0 ? inside : !inside) hi = m
      else lo = m
    }
    return (lo + hi) / 2
  }
  const out = [solve(p - 0.5, p + 0.5, -1), solve(p + 0.5, p + 1.5, 1)]
  edgeCache.set(key, out)
  return out
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

// Tribuna 1, după fotografia tribunei principale: VIP A–F jos (inelul de jos), deasupra lor
// un nivel lounge vitrat (fără locuri în față), apoi lojele 101–120 și 201–222 cu balcoane.
// Nivelurile se termină în trepte (lounge-ul cel mai lung, nivelul 2 cel mai scurt), iar rândurile
// sectoarelor 19 și 1 din inelul de sus coboară pe lângă capete. Deasupra lojelor (după un parapet)
// G, presa (H) și I continuă exact panta inelului de sus: aceleași rânduri, la aceeași înălțime.
export const LOUNGE_H = 4.2
export const BOX_SETBACK = [0, 1.4]
export const boxFloorY = (level) => WALK_Y + LOUNGE_H + (level - 1) * G.boxH
export const boxFrontD = (level) => D2(0) + BOX_SETBACK[level - 1]
export const UPPER_Y0 = WALK_Y + LOUNGE_H + 2 * G.boxH // acoperișul lojelor de la nivelul 2
// jumătatea lungimii fiecărui nivel: lounge, loje nivel 1, loje nivel 2
export const T1_HALF = [G.blockHalf, G.blockHalf - 3, G.blockHalf - 6]
export const T1_TOP_HALF = T1_HALF[2]
// primul rând al inelului de sus care trece peste fiecare nivel (după capătul lui)
const firstRowAbove = (y) => {
  let j = 0
  while (Y2(j) < y + 0.25) j++
  return j
}
export const T1_ROWS = [firstRowAbove(boxFloorY(1)), firstRowAbove(boxFloorY(2)), firstRowAbove(UPPER_Y0)]
export const J0 = T1_ROWS[2] // primul rând al sectoarelor G, H, I
// pe latura de vest, rândul j al inelului de sus e întrerupt de bloc pentru |z| < t1EdgeZ(j)
export const t1EdgeZ = (j) => (j < T1_ROWS[0] ? T1_HALF[0] : j < T1_ROWS[1] ? T1_HALF[1] : j < T1_ROWS[2] ? T1_HALF[2] : 0)
export function t1Blocked(u, j, d, pad = 0) {
  const w = wrap8(u)
  if (w < 6 || w >= 7) return false
  const e = t1EdgeZ(j)
  return e > 0 && Math.abs(pointU(u, d).z) < e + pad
}
// presa (H): 7 rânduri cu pupitre, din două în două rânduri ale pantei (pupitrul pe rândul din față)
export const PRESS_ROWS = 7
export const PRESS_J = (k) => J0 + 1 + 2 * k
export const PRESS_D = (k) => D2(PRESS_J(k)) + G.seatInset
export const PRESS_Y = (k) => Y2(PRESS_J(k))
export const zToTW = (z) => 6 + (AZ - z) / (2 * AZ)
// intervalul (în t, pe latura de vest) ocupat de bloc pentru rândul j al inelului de sus
export const t1CutT = (j) => {
  const e = t1EdgeZ(j)
  return e > 0 ? [zToT(e), zToT(-e)] : null
}

function ringRows(ring) {
  const rows = []
  if (ring === 1) for (let i = 0; i < G.ring1.rows; i++) rows.push({ ring: 1, idx: i, front: D1(i), y: Y1(i) })
  else for (let j = 0; j < G.ring2.rows; j++) rows.push({ ring: 2, idx: j, front: D2(j), y: Y2(j) })
  return rows
}

// lățimea unui loc (distanța dintre axele scaunelor) și granițele sectoarelor sunt calculate
// de scripts/tune-seats.mjs (→ sector-bounds.js) ca fiecare sector să aibă numărul oficial de locuri
let SW = { pub: BOUNDS.seatW, vip: BOUNDS.vipSeatW }

// ─── Definirea sectoarelor ───────────────────────────────────────────
// După planul oficial al stadionului: Tribuna 1 la vest, Tribuna 2 la est, Peluza 2 (Nord) cu
// sectoarele 3–6, Peluza 1 (Sud) cu 14–17, colțurile 2 (NV, oaspeți), 7 (NE), 13 (SE), 18 (SV),
// capetele Tribunei 1: 19 (sud) și 1 (nord). Ordinea în sensul lui u, pornind de la capătul
// nordic al blocului VIP:
export const CHAIN = ['1', '2', '3', '4', '5', '6', '7', '8', '9', '10', '11', '12', '13', '14', '15', '16', '17', '18', '19']
export const CHAIN_START = 6 + T_BLOCK_B
export const CHAIN_END = 14 + T_BLOCK_A
export const VIP_LETTERS = ['A', 'B', 'C', 'D', 'E', 'F']
const T2P = {
  8: [PRICES.T2_8_12_R1, PRICES.T2_8_12_R2], 9: [PRICES.T2_9_11_R1, PRICES.T2_9_11_R2], 10: [PRICES.T2_10_R1, PRICES.T2_10_R2],
  11: [PRICES.T2_9_11_R1, PRICES.T2_9_11_R2], 12: [PRICES.T2_8_12_R1, PRICES.T2_8_12_R2],
}
function sectorCfg(key) {
  const n = +key
  if (n >= 3 && n <= 6) return { stand: 'PN', ia: 1, price: PRICES.PN, demand: 'PN' }
  if (n >= 14 && n <= 17) return { stand: 'PS', ia: 1, price: PRICES.PS, demand: 'PS' }
  if (n === 7) return { stand: 'T2', ia: 1, price: PRICES.T2_7_13, demand: 'T2_corner', vomAbs: 9.75 }
  if (n === 13) return { stand: 'T2', ia: 1, price: PRICES.T2_7_13, demand: 'T2_corner', vomAbs: 11.25 }
  if (n >= 8 && n <= 12) return { stand: 'T2', ia: 1, split: T2P[n], demand: n === 10 ? 'T2_center' : 'T2_side' }
  // sectorul oaspeților: 18 și jumătatea sectorului 19 dinspre colț (o scară le desparte de restul lui 19)
  if (n === 19) return { stand: 'T1', ia: 1, split: [PRICES.T0, PRICES.T1], demand: 'T1', awaySplit: 0.5 }
  if (n === 1) return { stand: 'T1', ia: 0, split: [PRICES.T0, PRICES.T1], demand: 'T1' }
  if (n === 18) return { stand: 'T1', ia: 1, price: PRICES.T1, demand: 'T1', away: true, vomAbs: 13.75 }
  return { stand: 'T1', ia: 1, price: PRICES.T1, demand: 'T1', vomAbs: 7.25 } // sectorul 2 (colț NV)
}
// zonele pentru persoane în scaun rulant: în fața Tribunei 2, la sectoarele 8–9 și 11–12
export function wheelchairZones(B = BOUNDS) {
  const c = B.chain
  const i8 = CHAIN.indexOf('8')
  const i11 = CHAIN.indexOf('11')
  return [[c[i8], c[i8 + 2]], [c[i11], c[i11 + 2]]].map(([a, b]) => {
    const m = (b - a) * 0.06
    return [a + m - 8, b - m - 8]
  })
}

function defineSectors(B) {
  const S = []
  const add = (o) => {
    let { u0, u1 } = o
    while (u0 >= 8) { u0 -= 8; u1 -= 8 }
    S.push({ innerAisles: 0, seatW: SW.pub, vomitories: true, ...o, u0, u1, piece: Math.floor(u0) })
  }
  CHAIN.forEach((key, k) => {
    const c = sectorCfg(key)
    const base = { num: +key, group: key, stand: c.stand, u0: B.chain[k], u1: B.chain[k + 1], innerAisles: c.ia, demand: c.demand, awaySplit: c.awaySplit, vomFrac: c.vomFrac, vomAbs: c.vomAbs }
    if (c.split) {
      for (const ring of [1, 2]) {
        const o = { ...base, id: `${key}-${ring}`, ringLabel: ring, rings: [ring], price: c.split[ring - 1] }
        // în inelul de sus, sectoarele 19 și 1 trec pe lângă capetele în trepte ale blocului de loje
        if (ring === 2 && key === '19') o.u1 = base.u1 + zToTW(T1_TOP_HALF) - zToTW(G.blockHalf)
        if (ring === 2 && key === '1') o.u0 = base.u0 + zToTW(-T1_TOP_HALF) - zToTW(-G.blockHalf)
        add(o)
      }
    } else {
      add({ ...base, id: key, rings: [1, 2], price: c.price, away: !!c.away })
    }
  })
  const vipPrice = { A: PRICES.VIP_AF, B: PRICES.VIP_BE, C: PRICES.VIP_CD, D: PRICES.VIP_CD, E: PRICES.VIP_BE, F: PRICES.VIP_AF }
  VIP_LETTERS.forEach((L, k) => {
    add({
      id: `VIP-${L}`, letter: L, group: L, stand: 'VIP', title: `VIP · Sector ${L}`, u0: B.vip[k], u1: B.vip[k + 1],
      rings: [1], seatW: SW.vip, price: vipPrice[L], demand: 'VIP', kind: 'vip', vomitories: false,
    })
  })
  // deasupra lojelor, pe aceeași pantă cu inelul de sus: G (sud) și I (nord), de o parte și de alta a presei
  const [zG, zI] = B.terrace
  add({ id: 'G', letter: 'G', group: 'G', stand: 'T1', title: 'Sector G', u0: zToTW(T1_TOP_HALF), u1: zToTW(zG), rings: [2], minRow: J0, price: PRICES.T0, demand: 'T0', vomitories: false })
  add({ id: 'I', letter: 'I', group: 'I', stand: 'T1', title: 'Sector I', u0: zToTW(zI), u1: zToTW(-T1_TOP_HALF), rings: [2], minRow: J0, price: PRICES.T0, demand: 'T0', vomitories: false })

  for (const s of S) {
    if (s.num != null) {
      s.legend = LEGENDS[s.num]
      s.title = s.ringLabel ? `Sector ${s.num} · Inel ${s.ringLabel}` : `Sector ${s.num}`
    }
    s.baseTitle = s.title
    s.baseGate = STANDS[s.stand].gate
    if (s.away) s.title = `Sector ${s.num} · Oaspeți`
    s.gate = s.away ? 'Acces oaspeți' : s.baseGate
    s.basePrice = s.price
    s.kind = s.kind || 'seat'
    s.ring1Vom = s.rings.includes(1) && s.kind !== 'vip'
  }
  // în inelul de jos, peluza coboară până la deschiderea din colț (granița cu sectorul de colț)
  for (const [corner, pel, side, cu] of [['2', '3', 'u1', 7.5], ['7', '6', 'u0', 9.5], ['13', '14', 'u1', 11.5], ['18', '17', 'u0', 13.5]]) {
    const c = S.find((s) => s.group === corner)
    const p = S.find((s) => s.group === pel)
    if (side === 'u1') {
      c.r1u1 = nearU(cu, c.u1)
      p.r1u0 = nearU(cu, p.u0)
    } else {
      c.r1u0 = nearU(cu, c.u0)
      p.r1u1 = nearU(cu, p.u1)
    }
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
    // numărul maxim de rânduri din bloc (la capătul cel mai adânc)
    let rows = 0
    for (let k = 0; k <= 8; k++) rows = Math.max(rows, ring2RowsAtU(u0 + ((u1 - u0) * k) / 8))
    out.push({ b, u0, u1, rows })
  }
  return out
}
export const VOM_ROWS = [0, 5] // vomitoarele ies pe culoarul dintre inele (ca în fotografii)
// un singur vomitor pe sector (fotografia Peluzei Nord: intrările 3, 4, 5, 6), sub primul bloc
// poziția vomitorului ca fracțiune din lățimea sectorului; implicit centrul blocului din mijloc
const nearU = (v, ref) => {
  while (v > ref + 4) v -= 8
  while (v < ref - 4) v += 8
  return v
}
const baseFrac = (s) => s.vomFrac ?? (Math.floor(s.innerAisles / 2) + 0.5) / (s.innerAisles + 1)
// colțurile au intrarea la o poziție fixă pe colț (vomAbs), de partea tribunei, după deschidere
export function vomU(s) {
  if (s.vomAbs == null) return s.u0 + (s.u1 - s.u0) * baseFrac(s)
  const v = nearU(s.vomAbs, (s.u0 + s.u1) / 2)
  const m = (s.u1 - s.u0) * 0.12
  return Math.min(s.u1 - m, Math.max(s.u0 + m, v))
}
export const vomFrac = (s) => (vomU(s) - s.u0) / (s.u1 - s.u0)
export const vomBlock = (s) => Math.min(s.innerAisles, Math.floor(vomFrac(s) * (s.innerAisles + 1)))
// scările inelului de jos: ca în fotografii, câte una pe sector, care urcă spre vomitor;
// blocurile de jos trec peste granița dintre sectoare (doar VIP-ul are scări la margini)
export const awaySplitU = (s) => (s.awaySplit != null ? s.u0 + (s.u1 - s.u0) * s.awaySplit : null)
export function ring1AisleUs(sector) {
  if (sector.ring1Vom) return sector.awaySplit != null ? [vomU(sector), awaySplitU(sector)] : [vomU(sector)]
  const nb = sector.innerAisles + 1
  return Array.from({ length: nb + 1 }, (_, b) => sector.u0 + ((sector.u1 - sector.u0) * b) / nb)
}

function buildNaturalRows(sector, r1) {
  const rows = []
  let rowNum = 0
  const blocks = sectorBlocks(sector)
  for (const ring of sector.rings) {
    for (const row of ringRows(ring)) {
      if (ring === 2 && !blocks.some((bl) => row.idx < bl.rows)) continue
      const { d, slots } = ring === 1 && r1 ? { d: row.front + G.seatInset, slots: r1.get(sector.id)[row.idx] } : rowSlots(sector, row)
      const seats = []
      for (const sl of slots) {
        if (ring === 2 && !insideBack(sl.u, D2(row.idx + 1))) continue
        // vomitoare: ieșiri din inelul 2, în mijlocul blocurilor înalte
        if (sector.vomitories && ring === 2 && sl.block === vomBlock(sector) && blocks[sl.block].rows >= 16 && row.idx >= VOM_ROWS[0] && row.idx < VOM_ROWS[1] && lenU(Math.min(sl.u, vomU(sector)), Math.max(sl.u, vomU(sector)), d) < 1.6) continue
        const p = pointU(sl.u, d)
        // blocul de loje al Tribunei 1 (capetele în trepte)
        if (ring === 2 && t1Blocked(sl.u, row.idx, d, 0.45)) continue
        // tunelul jucătorilor, sub Tribuna VIP (între sectoarele C și D)
        if (sector.kind === 'vip' && row.idx < 7 && Math.abs(p.z) < 3.2) continue
        seats.push({ u: sl.u, block: sl.block, x: p.x, z: p.z, nx: p.nx, nz: p.nz, y: row.y })
      }
      if (!seats.length) continue
      rows.push({ num: ++rowNum, ring, ringRow: row.idx + 1, d, y: row.y, seats })
    }
  }
  return rows
}

// ─── Inelul de jos: rânduri continue de la o scară la alta ───────────
// Ca pe stadion, între două scări rândul e neîntrerupt, chiar dacă trece granița dintre
// două sectoare; fiecare loc aparține sectorului în dreptul căruia se află.
const inRange = (a, b, u) => {
  const w = wrap8(u)
  return [w - 8, w, w + 8].some((x) => x >= a - 1e-9 && x < b - 1e-9)
}
const inSector = (s, u) => inRange(s.u0, s.u1, u)
// în inelul de jos, peluza coboară până la scara de la intrarea colțului (granița e scara)
const inSector1 = (s, u) => inRange(s.r1u0 ?? s.u0, s.r1u1 ?? s.u1, u)
const inZone = (u, z) => {
  const w = wrap8(u)
  return w >= z[0] && w <= z[1]
}
function ring1Slots(sectors, zones) {
  const r1 = sectors.filter((s) => s.rings.includes(1))
  const aisles = new Map()
  for (const s of r1) for (const u of ring1AisleUs(s)) aisles.set(wrap8(u).toFixed(5), wrap8(u))
  const A = [...aisles.values()].sort((a, b) => a - b)
  const out = new Map(r1.map((s) => [s.id, Array.from({ length: G.ring1.rows }, () => [])]))
  for (let k = 0; k < A.length; k++) {
    const a = A[k]
    const b = k + 1 < A.length ? A[k + 1] : A[0] + 8
    const ms = r1.find((s) => inSector1(s, (a + b) / 2))
    if (!ms) continue
    for (let i = 0; i < G.ring1.rows; i++) {
      const d = D1(i) + G.seatInset
      const L = lenU(a, b, d)
      const n = Math.max(0, Math.floor((L - G.aisle) / ms.seatW + 1e-6))
      const margin = (L - n * ms.seatW) / 2
      for (let j = 0; j < n; j++) {
        const u = uAtLen(a, b, d, margin + (j + 0.5) * ms.seatW)
        if (i < 2 && zones.some((z) => inZone(u, z))) continue
        if (inNotch(u, d, 0.3)) continue
        const s = r1.find((x) => inSector1(x, u)) || ms
        const rel = wrap8(u - s.u0)
        const block = s.ring1Vom && rel >= wrap8(vomU(s) - s.u0) ? 1 : 0
        out.get(s.id)[i].push({ u, rel, block })
      }
    }
  }
  // numerotarea locurilor merge de la începutul sectorului spre capăt
  for (const rows of out.values()) for (const r of rows) r.sort((x, y) => x.rel - y.rel)
  return out
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

// Ajustarea finală la numărul oficial de locuri al sectorului: în câteva rânduri din inelul de sus
// (răspândite uniform) se scoate câte un loc, iar locurile rămase se redistribuie egal între
// primul și ultimul loc al rândului. Marginile blocurilor rămân drepte, fără zimți.
function trimBack(list, excess) {
  if (excess <= 0) return
  const pairs = []
  for (const s of list) {
    const maxRing = Math.max(...s.rows.map((r) => r.ring))
    for (const r of s.rows) {
      if (r.ring !== maxRing) continue
      const blocks = [...new Set(r.seats.map((p) => p.block))]
      for (const b of blocks) pairs.push({ r, b })
    }
  }
  // de la spate spre față, alternând blocurile; doar rândurile cu destule locuri
  const usable = (pr) => pr.r.seats.filter((p) => p.block === pr.b).length > 6
  pairs.sort((x, y) => y.r.ringRow - x.r.ringRow || x.b - y.b)
  let pass = 0
  while (excess > 0) {
    const ok = pairs.filter(usable)
    if (!ok.length) throw new Error(`Nu se pot elimina locuri din sectorul ${list[0].group}`)
    const k = Math.min(excess, ok.length)
    for (let j = 0; j < k; j++) {
      const { r, b } = ok[Math.floor(((j + 0.5) * ok.length) / k)]
      const idx = []
      r.seats.forEach((p, i) => p.block === b && idx.push(i))
      if (idx.length <= 6) continue
      const first = r.seats[idx[0]]
      const last = r.seats[idx[idx.length - 1]]
      const L = lenU(first.u, last.u, r.d)
      const n = idx.length - 1
      r.seats.splice(idx[idx.length - 1], 1)
      for (let i = 0; i < n; i++) {
        const u = uAtLen(first.u, last.u, r.d, (L * i) / (n - 1))
        const p = pointU(u, r.d)
        Object.assign(r.seats[idx[i]], { u, x: p.x, z: p.z, nx: p.nx, nz: p.nz })
      }
      excess--
    }
    if (++pass > 6) throw new Error(`Nu se pot elimina suficiente locuri din sectorul ${list[0].group} (rămase: ${excess}, rânduri: ${pairs.length})`)
  }
}

// ─── Lojele și tribuna presei (Tribuna 1, centru) ────────────────────
// Lojele, după harta oficială: nivelul 1 = 101–120 (119 și 120 sunt duble),
// nivelul 2 = 201–222, numerotate de la sud spre nord. 10 locuri într-o lojă simplă,
// 20 într-una dublă (2 rânduri) → 18×10 + 2×20 + 22×10 = 440.
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

// presa (sectorul H): 7 rânduri × 48 de locuri cu pupitre, între sectoarele G și I
function buildPress(B) {
  const [zG, zI] = B.terrace
  const seats = []
  const perRow = CAPACITY.press / PRESS_ROWS
  const spacing = (zG - zI - 1.6) / perRow
  for (let k = 0; k < PRESS_ROWS; k++) {
    for (let i = 0; i < perRow; i++) {
      const z = (zG + zI) / 2 + ((perRow - 1) / 2 - i) * spacing
      seats.push({ row: k + 1, num: i + 1, x: -(G.hx + PRESS_D(k)), y: PRESS_Y(k) + 0.02, z })
    }
  }
  return seats
}

// locurile pentru persoane în scaun rulant: 2 × 31 pe platforma din fața Tribunei 2
function buildAccessible(sectors, zones) {
  const out = []
  const d = D1(1)
  zones.forEach((z, zi) => {
    const L = lenU(z[0], z[1], d)
    for (let i = 0; i < WHEELCHAIR_PER_ZONE; i++) {
      const u = uAtLen(z[0], z[1], d, (L * (i + 0.5)) / WHEELCHAIR_PER_ZONE)
      const p = pointU(u, d)
      const s = sectors.find((x) => x.rings.includes(1) && inSector1(x, u))
      out.push({ sector: s.id, stand: s.stand, zone: zi + 1, num: i + 1, x: p.x, z: p.z, nx: p.nx, nz: p.nz, y: Y1(1), u })
    }
  })
  return out
}

// ─── Layout complet ──────────────────────────────────────────────────
function naturalSectors(opts = {}) {
  const B = opts.bounds || BOUNDS
  SW = { pub: B.seatW, vip: B.vipSeatW }
  const sectors = defineSectors(B)
  const zones = wheelchairZones(B)
  const r1 = ring1Slots(sectors, zones)
  for (const s of sectors) s.rows = buildNaturalRows(s, r1)
  return { sectors, B, zones }
}
const groupsOf = (sectors) => {
  const m = new Map()
  for (const s of sectors) {
    if (!m.has(s.group)) m.set(s.group, [])
    m.get(s.group).push(s)
  }
  return m
}

// locurile pe sector înainte de ajustarea finală (folosit de scripts/tune-seats.mjs)
export function countNatural(opts) {
  const { sectors } = naturalSectors(opts)
  const out = {}
  for (const [g, list] of groupsOf(sectors)) out[g] = list.reduce((a, s) => a + countRows(s.rows), 0)
  return out
}

export function buildLayout(opts) {
  const { sectors, B, zones } = naturalSectors(opts)
  const trimmed = {}
  for (const [g, list] of groupsOf(sectors)) {
    const target = SECTOR_SEATS[g]
    const nat = list.reduce((a, s) => a + countRows(s.rows), 0)
    if (nat < target) throw new Error(`Sectorul ${g}: geometria are ${nat} locuri, sub cele ${target} oficiale (rulează npm run tune)`)
    for (const s of list) s.natural = countRows(s.rows)
    trimBack(list, nat - target)
    trimmed[g] = nat - target
  }

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
          away: s.away || (s.awaySplit != null && p.u < awaySplitU(s)),
          awayHalf: s.awaySplit != null && p.u < awaySplitU(s),
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
  const pressIdx = buildPress(B).map((p) =>
    push({ sector: 'PRESA', stand: 'VIP', kind: 'press', row: p.row, num: p.num, x: p.x, y: p.y, z: p.z, rot: Math.PI / 2, nx: -1, nz: 0 }).i,
  )
  const accessibleIdx = buildAccessible(sectors, zones).map((a) =>
    push({ sector: a.sector, stand: a.stand, kind: 'wheelchair', zone: a.zone, num: a.num, x: a.x, y: a.y, z: a.z, rot: Math.atan2(-a.nx, -a.nz), nx: a.nx, nz: a.nz }).i,
  )

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

  return { sectors, boxes, seats, pressIdx, accessibleIdx, trimmed, zones, pressSpan: [B.terrace[1], B.terrace[0]] }
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
