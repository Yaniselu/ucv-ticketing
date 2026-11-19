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
  ring1: { rows: 16, y0: 1.2, rise: 0.4 },
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
export const BACK_D = D2(MAX_R2)
export const TOP_Y = Y2(MAX_R2 - 1)
export const RING_TOP = TOP_Y + 1.6 // peretele alb din spatele tribunelor / grinda inelară

const zToT = (z) => (AZ - z) / (2 * AZ) // tronsonul vest (W)
export const T_BLOCK_A = zToT(G.blockHalf)
export const T_BLOCK_B = zToT(-G.blockHalf)

function ringRows(ring) {
  const rows = []
  if (ring === 1) for (let i = 0; i < G.ring1.rows; i++) rows.push({ ring: 1, idx: i, front: D1(i), y: Y1(i) })
  else for (let j = 0; j < G.ring2.rows; j++) rows.push({ ring: 2, idx: j, front: D2(j), y: Y2(j) })
  return rows
}

// ─── Definirea sectoarelor ───────────────────────────────────────────
function defineSectors() {
  const S = []
  const add = (o) => S.push({ innerAisles: 0, seatW: G.seatW, vomitories: true, ...o })

  // Peluza Nord: 1 (colț NV) + 2–6 în spatele porții
  add({ id: '1', num: 1, stand: 'PN', piece: 7, t0: 0, t1: 1, rings: [1, 2], innerAisles: 2, price: PRICES.PN, demand: 'PN' })
  for (let i = 0; i < 5; i++) {
    add({ id: String(2 + i), num: 2 + i, stand: 'PN', piece: 0, t0: i / 5, t1: (i + 1) / 5, rings: [1, 2], price: PRICES.PN, demand: 'PN' })
  }
  // Tribuna 2: 7 (colț NE), 8–12 pe două inele, 13 (colț SE)
  add({ id: '7', num: 7, stand: 'T2', piece: 1, t0: 0, t1: 1, rings: [1, 2], innerAisles: 2, price: PRICES.T2_7_13, demand: 'T2_corner' })
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
  add({ id: '13', num: 13, stand: 'T2', piece: 3, t0: 0, t1: 1, rings: [1, 2], innerAisles: 2, price: PRICES.T2_7_13, demand: 'T2_corner' })
  // Peluza Sud: sector oaspeți + 14–17 în spatele porții, 18 (colț SV)
  add({ id: 'OAS', num: null, stand: 'PS', piece: 4, t0: 0, t1: 0.2, rings: [1, 2], price: PRICES.PS, demand: 'PS', away: true })
  for (let i = 0; i < 4; i++) {
    add({ id: String(14 + i), num: 14 + i, stand: 'PS', piece: 4, t0: (i + 1) / 5, t1: (i + 2) / 5, rings: [1, 2], price: PRICES.PS, demand: 'PS' })
  }
  add({ id: '18', num: 18, stand: 'PS', piece: 5, t0: 0, t1: 1, rings: [1, 2], innerAisles: 2, price: PRICES.PS, demand: 'PS' })
  // Tribuna 1 (vest): Tribuna 0 = inelul 1 la capete, Tribuna 1 = inelul 2 la capete
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
  add({ id: 'T0N', stand: 'T1', title: 'Tribuna 0 · Nord', piece: 6, t0: T_BLOCK_B, t1: 1, rings: [1], price: PRICES.T0, demand: 'T0' })
  add({ id: 'T1N', stand: 'T1', title: 'Tribuna 1 · Nord', piece: 6, t0: T_BLOCK_B, t1: 1, rings: [2], price: PRICES.T1, demand: 'T1' })

  for (const s of S) {
    if (s.num != null) {
      s.legend = LEGENDS[s.num]
      s.title = s.ringLabel ? `Sector ${s.num} · Inel ${s.ringLabel}` : `Sector ${s.num}`
    }
    if (s.away) s.title = 'Sector Oaspeți'
    s.gate = s.away ? 'P12' : STANDS[s.stand].gate
    s.kind = s.kind || 'seat'
  }
  return S
}

// ─── Generarea rândurilor ────────────────────────────────────────────
function rowSlots(sector, row) {
  const d = row.front + G.seatInset
  const full = pieceLen(sector.piece, d)
  const L = full * (sector.t1 - sector.t0)
  const blocks = sector.innerAisles + 1
  const blockLen = (L - G.aisle * blocks) / blocks
  const n = Math.max(0, Math.floor(blockLen / sector.seatW + 1e-6))
  const slots = []
  for (let b = 0; b < blocks; b++) {
    const start = G.aisle / 2 + b * (blockLen + G.aisle)
    const margin = (blockLen - n * sector.seatW) / 2
    for (let k = 0; k < n; k++) {
      const s = start + margin + (k + 0.5) * sector.seatW
      slots.push({ block: b, s, t: sector.t0 + s / full, blockCenter: start + blockLen / 2, blockLen })
    }
  }
  return { d, L, slots }
}

// limitele blocurilor din inelul 2 (folosite și pentru gradenele 3D)
export function sectorBlocks(sector) {
  const n = sector.innerAisles + 1
  const out = []
  for (let b = 0; b < n; b++) {
    const t0 = sector.t0 + ((sector.t1 - sector.t0) * b) / n
    const t1 = sector.t0 + ((sector.t1 - sector.t0) * (b + 1)) / n
    out.push({ b, t0, t1, rows: ring2RowsAt(sector.piece, (t0 + t1) / 2) })
  }
  return out
}
export const VOM_ROWS = [5, 9] // vomitoarele sunt la jumătatea de jos a inelului 2

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
        if (sector.vomitories && ring === 2 && blocks[sl.block].rows >= 16 && row.idx >= VOM_ROWS[0] && row.idx < VOM_ROWS[1] && Math.abs(sl.s - sl.blockCenter) < 1.6) continue
        const p = pathPoint(sector.piece, sl.t, d)
        // tunelul jucătorilor, sub Tribuna VIP (între sectoarele C și D)
        if (sector.kind === 'vip' && row.idx < 7 && Math.abs(p.z) < 3.2) continue
        seats.push({ t: sl.t, block: sl.block, x: p.x, z: p.z, nx: p.nx, nz: p.nz, y: row.y })
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
function buildBoxes() {
  const boxes = []
  const perLevel = (2 * G.blockHalf) / G.boxW
  for (let level = 1; level <= 2; level++) {
    for (let k = 0; k < perLevel; k++) {
      const n = (level - 1) * perLevel + k + 1
      // numerotare de la sud spre nord
      const z1 = G.blockHalf - k * G.boxW
      const z0 = z1 - G.boxW
      const floorY = WALK_Y + (level - 1) * G.boxH
      const frontD = WALK_D + G.walkway
      const zc = (z0 + z1) / 2
      const seats = []
      // 6 fotolii în față, 5 în spate (pe treaptă) = 11 locuri / lojă
      for (let i = 0; i < 6; i++) {
        seats.push({ row: 1, num: i + 1, x: -(G.hx + frontD + 1.15), y: floorY, z: zc + 1.55 - i * 0.62 })
      }
      for (let i = 0; i < 5; i++) {
        seats.push({ row: 2, num: 7 + i, x: -(G.hx + frontD + 2.45), y: floorY + 0.35, z: zc + 1.24 - i * 0.62 })
      }
      boxes.push({ id: `L${n}`, num: n, level, z0, z1, zc, floorY, frontD, seats })
    }
  }
  return boxes
}

function buildPress() {
  const seats = []
  const perRow = CAPACITY.press / 5
  const spacing = 0.55
  for (let k = 0; k < 5; k++) {
    const d = D2(0) + 0.8 + k * 1.0
    const y = WALK_Y + 2 * G.boxH + 0.3 + k * 0.45
    for (let i = 0; i < perRow; i++) {
      const z = ((perRow - 1) / 2 - i) * spacing
      seats.push({ row: k + 1, num: i + 1, x: -(G.hx + d), y, z })
    }
  }
  return seats
}

// locuri pentru persoane în scaun rulant + însoțitori, pe culoarul dintre inele
function buildAccessible(sectors) {
  const eligible = sectors.filter((s) => s.rings.includes(1) && s.kind !== 'vip')
  const d = WALK_D + 1.0
  const lengths = eligible.map((s) => pieceLen(s.piece, d) * (s.t1 - s.t0))
  const counts = apportion(CAPACITY.wheelchair, lengths)
  const pairs = []
  eligible.forEach((s, k) => {
    const n = counts[k]
    const L = lengths[k]
    for (let i = 0; i < n; i++) {
      // grupuri de câte două perechi, distribuite pe lungimea sectorului
      const pos = (L * (i + 0.5)) / n
      const t = s.t0 + (pos / L) * (s.t1 - s.t0)
      const p = pathPoint(s.piece, t, d)
      pairs.push({ sector: s.id, x: p.x, z: p.z, nx: p.nx, nz: p.nz, y: WALK_Y, t })
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
