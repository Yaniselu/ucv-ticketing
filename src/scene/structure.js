// Structura detaliată a Stadionului „Ion Oblemenco”, reconstituită după fotografii:
// – inelul de sus are înălțime variabilă (multe rânduri la mijlocul laturilor,
//   puține în colțuri), cu pereți albi în trepte în spatele blocurilor mai joase;
// – vomitoare la jumătatea inelului de sus, balustradă de sticlă pe culoarul dintre inele;
// – grindă inelară cu stâlpi și cupolă din arce de oțel cu panouri translucide;
// – fațada: placaj alb doar deasupra „valului”, dedesubt structura în X și clădirea vitrată.
import * as THREE from 'three'
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js'
import {
  G, D1, Y1, D2, Y2, WALK_D, WALK_Y, RING_TOP, pathPoint, pieceLen, sectorBlocks, ring2RowsAt, VOM_ROWS, vomBlock, vomU, pointU, notchEdges, inNotch, uRanges, lenPerU, wrap8, ring1AisleUs,
  NOTCH_W, NOTCH_TUN_H, cornerAxis, t1CutT, T1_ROWS, zToTW, ring2RowsAtU, insideBack,
} from '../data/layout.js'
import { Quads, strip, samples, P, ellipseBand, ellipseRing, beam, ellipseCurve } from './geom.js'
import * as TX from './textures.js'
import { buildPrecinct, DECK_Y } from './precinct.js'
import { EVENT } from '../data/stadium-data.js'

export const SHELL_TOP = 50.14 // înălțimea maximă (stadiumdb.com)
// carcasa: semiaxele reale după conturul OSM (≈ 207 × 230 m)
export const SHELL_PROFILE = [
  [97, 108.5, 0], [100.8, 112.6, 9], [103, 115, 19], [102.5, 114.5, 30], [99.6, 111.4, 39],
  [94.8, 105.8, 45.4], [88.6, 98.8, 49.1], [84, 94, SHELL_TOP],
]
const BB = G.bowlBack
export const SPRING_Y = RING_TOP + 6.5 // inelul de unde pornesc arcele acoperișului
export const ROOF_PROFILE = [
  [BB.ax + 1.8, BB.az + 1.8, SPRING_Y], [BB.ax + 0.8, BB.az - 0.6, SPRING_Y + 7.5], [84, 94, SHELL_TOP],
  [72, 82, 49.3], [60, 70, 47.2], [48, 62, 44.4], [40, 55, 41.6],
]
const CONCOURSE = { ax: 91.5, az: 103 }
const beamGeo = (a, b, r) => beam(a.toArray(), b.toArray(), r, 6) // fațada vitrată din spatele grinzilor în X
const PLINTH_Y = DECK_Y // soclul = parterul de sub podium; fațada vitrată pornește de pe podium

// valul de la marginea placajului (u ∈ [0,1) în jurul stadionului)
export const waveEdge = (u) => 24 + 7 * Math.sin(Math.PI * 4 * u + 0.3) + 3.5 * Math.sin(Math.PI * 10 * u + 1.1) + 1.6 * Math.sin(Math.PI * 22 * u)

// distanța de la marginea gradenelor până la elipsa din spatele tribunelor
function backOffsetU(u) {
  let lo = 0
  let hi = 90
  for (let k = 0; k < 24; k++) {
    const m = (lo + hi) / 2
    const q = pointU(u, m)
    if ((q.x / BB.ax) ** 2 + (q.z / BB.az) ** 2 > 1) hi = m
    else lo = m
  }
  return lo
}

function profileLookup(profile) {
  const curve = new THREE.CatmullRomCurve3(profile.map(([ax, az, y]) => new THREE.Vector3(ax, y, az)))
  const pts = curve.getPoints(400)
  return (y) => {
    let i = 0
    while (i < pts.length - 2 && pts[i + 1].y < y) i++
    const a = pts[i]
    const b = pts[i + 1]
    const f = b.y === a.y ? 0 : Math.min(1, Math.max(0, (y - a.y) / (b.y - a.y)))
    return [a.x + (b.x - a.x) * f, a.z + (b.z - a.z) * f]
  }
}

// suprafață de revoluție între yBottom(u) și yTop(u)
function shellBand(look, segs, rows, yBot, yTop, inset = 0, uvScale = [1, 1]) {
  const pos = []
  const uv = []
  const idx = []
  for (let i = 0; i <= rows; i++) {
    for (let j = 0; j <= segs; j++) {
      const u = j / segs
      const t = u * Math.PI * 2
      const y0 = yBot(u)
      const y = y0 + (yTop(u) - y0) * (i / rows)
      const [ax, az] = look(y)
      pos.push((ax - inset) * Math.cos(t), y, (az - inset) * Math.sin(t))
      uv.push(u * uvScale[0], (y / SHELL_TOP) * uvScale[1])
    }
  }
  const W = segs + 1
  for (let i = 0; i < rows; i++) {
    for (let j = 0; j < segs; j++) {
      const a = i * W + j
      const b = (i + 1) * W + j
      idx.push(a, b, a + 1, b, b + 1, a + 1)
    }
  }
  const g = new THREE.BufferGeometry()
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3))
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2))
  g.setIndex(idx)
  g.computeVertexNormals()
  return g
}

export function buildStructure(root, layout, mats, { lowSpec = false } = {}) {
  const { concrete, white, glass } = mats
  const out = {}
  const steps = new Quads()
  const walls = new Quads()
  const darkQ = new Quads()
  const glassQ = new Quads()

  // ─── Inelul 1 (constant) și culoarul dintre inele ───
  const FULL = [0, 1, 2, 3, 4, 5, 6, 7].map((p) => [p, 0, 1])
  // ─── Inelul de jos, cu accesul pentru ambulanță din fiecare colț ───
  // Accesul e o tranșee dreaptă de lățime constantă, paralelă cu diagonala colțului: pereți albi
  // netezi, înclinați după panta tribunei, cu balustradă, pavaj la nivelul terenului, un portal mai
  // jos sub culoar și, peste tranșee, tunelul acoperit alb cu „UNIVERSITATEA CRAIOVA”.
  const PUc = (u, d, y) => {
    const q = pointU(u, d)
    return [q.x, y, q.z]
  }
  // bandă între intervalul [a0,b0] (la d0,y0) și [a1,b1] (la d1,y1), în u continuu;
  // capetele pot fi pe porțiuni diferite (colț sau latură dreaptă)
  const bandU = (q, a0, b0, a1, b1, d0, y0, d1, y1) => {
    const lo = Math.min(a0, a1)
    const hi = Math.max(b0, b1)
    const br = [lo]
    for (let n = Math.floor(lo) + 1; n < hi; n++) br.push(n)
    br.push(hi)
    const cl = (v, a, b) => Math.min(b, Math.max(a, v))
    for (let i = 0; i < br.length - 1; i++) {
      const s0 = [cl(br[i], a0, b0), cl(br[i + 1], a0, b0)]
      const s1 = [cl(br[i], a1, b1), cl(br[i + 1], a1, b1)]
      if (s0[1] - s0[0] < 1e-7 && s1[1] - s1[0] < 1e-7) continue
      const piece = ((Math.floor((br[i] + br[i + 1]) / 2) % 8) + 8) % 8
      const n = piece % 2 ? 10 : 1
      for (let k = 0; k < n; k++) {
        const f0 = k / n
        const f1 = (k + 1) / n
        const u00 = s0[0] + (s0[1] - s0[0]) * f0
        const u01 = s0[0] + (s0[1] - s0[0]) * f1
        const u10 = s1[0] + (s1[1] - s1[0]) * f0
        const u11 = s1[0] + (s1[1] - s1[0]) * f1
        q.quad(PUc(u00, d0, y0), PUc(u10, d1, y1), PUc(u11, d1, y1), PUc(u01, d0, y0))
      }
    }
  }
  // marginile tranșeei: [înainte, după] diagonala colțului p, la distanța d
  const eLo = (p, d) => notchEdges(p, d)[0]
  const eHi = (p, d) => notchEdges(p, d)[1]
  const ring1Band = (q, d0, y0, d1, y1) => {
    for (const c of [1, 3, 5, 7]) {
      const n = c + 2
      const lo0 = eHi(c, d0)
      const lo1 = eHi(c, d1)
      const hi0 = eLo(n % 8, d0) + (n >= 8 ? 8 : 0)
      const hi1 = eLo(n % 8, d1) + (n >= 8 ? 8 : 0)
      bandU(q, lo0, hi0, lo1, hi1, d0, y0, d1, y1)
    }
  }
  ring1Band(walls, 0, 0, 0, Y1(0))
  for (let i = 0; i < G.ring1.rows; i++) {
    if (i > 0) ring1Band(steps, D1(i), Y1(i - 1), D1(i), Y1(i))
    ring1Band(steps, D1(i), Y1(i), D1(i + 1), Y1(i))
  }
  ring1Band(steps, WALK_D, Y1(G.ring1.rows - 1), WALK_D, WALK_Y)
  const paveQ = new Quads()
  const railPts = []
  const TUN = 3.5 // adâncimea tunelului de sub culoar
  const TH = NOTCH_TUN_H - 1.0 // înălțimea portalului (pereții drepți ai tunelului acoperit)
  const slope = (d) => Y1(0) + 0.15 + (Math.min(d, WALK_D) / WALK_D) * (WALK_Y - Y1(0))
  for (const p of [1, 3, 5, 7]) {
    // pavajul: de la teren până în tunel
    const N = 12
    for (let k = 0; k < N; k++) {
      const d0 = 0.05 + ((WALK_D + TUN) * k) / N
      const d1 = 0.05 + ((WALK_D + TUN) * (k + 1)) / N
      bandU(paveQ, eLo(p, d0), eHi(p, d0), eLo(p, d1), eHi(p, d1), d0, 0.04, d1, 0.04)
    }
    // pereții laterali netezi (muchia de sus urcă odată cu gradenele) și balustrada
    for (const side of [eLo, eHi]) {
      const line = []
      for (let k = 0; k <= N; k++) line.push(0.05 + (WALK_D * k) / N)
      for (let k = 0; k < N; k++) {
        const [d0, d1] = [line[k], line[k + 1]]
        walls.quad(PUc(side(p, d0), d0, 0), PUc(side(p, d0), d0, slope(d0)), PUc(side(p, d1), d1, slope(d1)), PUc(side(p, d1), d1, 0))
      }
      railPts.push(line.map((d) => PUc(side(p, d), d, slope(d) + 1.0)))
      // pereții tunelului
      const [d0, d1] = [WALK_D, WALK_D + TUN]
      darkQ.quad(PUc(side(p, d0), d0, 0), PUc(side(p, d0), d0, TH), PUc(side(p, d1), d1, TH), PUc(side(p, d1), d1, 0))
    }
    // tavanul și fundul tunelului, plus peretele alb de deasupra portalului (până la culoar)
    const dT = WALK_D + TUN
    bandU(darkQ, eLo(p, WALK_D), eHi(p, WALK_D), eLo(p, dT), eHi(p, dT), WALK_D, TH, dT, TH)
    bandU(darkQ, eLo(p, dT), eHi(p, dT), eLo(p, dT), eHi(p, dT), dT, 0, dT, TH)
    bandU(walls, eLo(p, WALK_D - 0.01), eHi(p, WALK_D - 0.01), eLo(p, WALK_D - 0.01), eHi(p, WALK_D - 0.01), WALK_D - 0.01, TH, WALK_D - 0.01, WALK_Y)
  }
  strip(steps, FULL, WALK_D, WALK_Y, D2(0), WALK_Y)
  // balustrada de sticlă și mâna curentă de pe culoar
  strip(glassQ, FULL, WALK_D + 0.05, WALK_Y, WALK_D + 0.05, WALK_Y + 1.05)
  strip(walls, FULL, WALK_D, WALK_Y + 1.05, WALK_D + 0.1, WALK_Y + 1.05)

  // ─── Inelul 2: blocuri cu număr variabil de rânduri ───
  const PU = (u, d, y) => {
    const q = pointU(u, d)
    return [q.x, y, q.z]
  }
  const rangesOf = (u0, u1) => uRanges(u0, u1).map((r) => r.slice(0, 3))
  const samplesU = (u0, u1) => {
    const out = []
    for (const [p, t0, t1, pa] of uRanges(u0, u1)) {
      const ts = samples(p, t0, t1).map((t) => pa + t)
      out.push(...(out.length ? ts.slice(1) : ts))
    }
    return out
  }
  const blocks = []
  for (const s of layout.sectors) {
    if (!s.rings.includes(2)) continue
    for (const bl of sectorBlocks(s)) blocks.push({ ...bl, sector: s })
  }
  // presa (H), între G și I: aceeași pantă, doar pentru gradene (locurile presei sunt separate)
  {
    const [zI, zG] = layout.pressSpan
    for (const [za, zb] of [[zG, 0], [0, zI]]) {
      const uo = zToTW(Math.abs(za) > Math.abs(zb) ? za : zb)
      blocks.push({ b: 0, u0: zToTW(za), u1: zToTW(zb), rows: ring2RowsAtU(uo), sector: { vomitories: false } })
    }
  }
  blocks.sort((a, b) => wrap8(a.u0) - wrap8(b.u0))
  // rândurile inelului de sus întrerupte de blocul de loje al Tribunei 1 (latura de vest)
  const cutT1 = (rng, j) => {
    const c = t1CutT(j)
    if (!c) return rng
    return rng.flatMap(([p, t0, t1]) => (p !== 6 ? [[p, t0, t1]] : [[p, t0, Math.min(t1, c[0])], [p, Math.max(t0, c[1]), t1]].filter(([, a, b]) => b - a > 1e-6)))
  }
  const blockedAt = (u, j) => {
    const c = t1CutT(j)
    if (!c) return false
    const w = wrap8(u)
    return w >= 6 && w < 7 && w - 6 > c[0] - 0.006 && w - 6 < c[1] + 0.006
  }
  const n = blocks.length
  const shares = (a, b) => {
    const g = Math.abs(wrap8(a.u1) - wrap8(b.u0))
    return g < 1e-6 || g > 8 - 1e-6
  }
  const aisleMarks = []
  const vomGeo = []
  const backFloor = new Quads()
  const topAt = [] // [u, înălțimea ultimei trepte] de-a lungul spatelui tribunelor
  // puncte de-a lungul unui bloc: la ~1,5 m pe laturile drepte (marginea din spate e o curbă),
  // plus capetele blocului de loje al Tribunei 1, ca tăieturile să fie exacte
  const T1_EDGES = [40, 37, 34].flatMap((z) => [zToTW(z), zToTW(-z)])
  const fineU = (u0, u1) => {
    const set = new Set()
    for (const [p, t0, t1, pa] of uRanges(u0, u1)) {
      const L = pieceLen(p, 40) * (t1 - t0)
      const nseg = Math.max(p % 2 ? 24 : 2, Math.ceil(L / 1.5))
      for (let k = 0; k <= nseg; k++) set.add(+(pa + t0 + ((t1 - t0) * k) / nseg).toFixed(7))
    }
    for (const e of T1_EDGES) for (const off of [0, 8, -8]) if (e + off > u0 + 1e-6 && e + off < u1 - 1e-6) set.add(e + off)
    return [...set].sort((a, b) => a - b)
  }
  const rise = G.ring2.rise
  const rakeAt = (d) => Y2(0) + ((d - D2(0)) / G.depth - 0.5) * rise // înălțimea pantei la adâncimea d
  for (let k = 0; k < n; k++) {
    const B = blocks[k]
    const rng = rangesOf(B.u0, B.u1)
    strip(walls, cutT1(rng, 0), D2(0), WALK_Y, D2(0), Y2(0))
    const us = fineU(B.u0, B.u1)
    const E = us.map((u) => backOffsetU(u))
    // treptele: fiecare rând se termină pe elipsa din spate (marginea de sus e o curbă continuă)
    for (let j = 0; j < B.rows + 1; j++) {
      for (let i = 0; i < us.length - 1; i++) {
        const a = us[i]
        const b = us[i + 1]
        if (blockedAt((a + b) / 2, j)) continue
        const ea = E[i]
        const eb = E[i + 1]
        if (Math.max(ea, eb) <= D2(j) + 0.02) continue
        const ba = Math.max(D2(j), Math.min(D2(j + 1), ea))
        const bb = Math.max(D2(j), Math.min(D2(j + 1), eb))
        steps.quad(PU(a, D2(j), Y2(j)), PU(a, ba, Y2(j)), PU(b, bb, Y2(j)), PU(b, D2(j), Y2(j)))
        if (j > 0) {
          const y0 = Y2(j - 1) - (T1_ROWS.includes(j) ? 0.4 : 0)
          steps.quad(PU(a, D2(j), y0), PU(a, D2(j), Y2(j)), PU(b, D2(j), Y2(j)), PU(b, D2(j), y0))
        }
      }
    }
    // parapetul de pe elipsa din spate, platforma de sus din spatele lui
    for (let i = 0; i < us.length - 1; i++) {
      const a = us[i]
      const b = us[i + 1]
      const ya = rakeAt(E[i])
      const yb = rakeAt(E[i + 1])
      walls.quad(PU(a, E[i], ya - 1.6), PU(a, E[i], ya + 1.15), PU(b, E[i + 1], yb + 1.15), PU(b, E[i + 1], yb - 1.6))
      walls.quad(PU(a, E[i], ya + 1.15), PU(a, E[i] + 0.3, ya + 1.15), PU(b, E[i + 1] + 0.3, yb + 1.15), PU(b, E[i + 1], yb + 1.15))
      walls.quad(PU(a, E[i] + 0.3, ya + 1.15), PU(a, E[i] + 0.3, ya + 0.02), PU(b, E[i + 1] + 0.3, yb + 0.02), PU(b, E[i + 1] + 0.3, yb + 1.15))
      backFloor.quad(PU(a, E[i] + 0.3, ya + 0.02), PU(a, E[i] + 2.2, ya + 0.02), PU(b, E[i + 1] + 2.2, yb + 0.02), PU(b, E[i + 1] + 0.3, yb + 0.02))
      topAt.push([a, ya])
    }
    // scările dintre blocuri urcă până la ultimul rând existent în dreptul lor
    const rowsAt = (u) => {
      let j = 0
      while (j < G.ring2.rows && insideBack(u, D2(j + 1))) j++
      return j
    }
    const prev = blocks[(k - 1 + n) % n]
    const hasPrev = shares(prev, B)
    for (let j = 0, r = rowsAt(B.u0); j < r; j++) if (!blockedAt(B.u0, j)) aisleMarks.push([B.u0, D2(j), Y2(j)])
    const next = blocks[(k + 1) % n]
    if (!shares(B, next)) {
      for (let j = 0, r = rowsAt(B.u1); j < r; j++) if (!blockedAt(B.u1, j)) aisleMarks.push([B.u1, D2(j), Y2(j)])
    }
    void hasPrev
    // vomitorul sectorului (unul singur, ca în fotografia Peluzei Nord)
    if (B.sector.vomitories && B.b === vomBlock(B.sector) && B.rows >= 16) {
      const uc = vomU(B.sector)
      const dm = (D2(VOM_ROWS[0]) + D2(VOM_ROWS[1])) / 2
      const du = 1.55 / lenPerU(uc, dm)
      const d0 = D2(VOM_ROWS[0])
      const d1 = D2(VOM_ROWS[1])
      const yb = VOM_ROWS[0] === 0 ? WALK_Y : Y2(VOM_ROWS[0]) - 0.25
      const yt = Y2(VOM_ROWS[1]) - 0.03
      for (const side of [-1, 1]) {
        const u = uc + side * du
        const u2 = uc + side * (du + 0.22 / lenPerU(uc, dm))
        for (const uu of [u, u2]) walls.quad(PU(uu, d0, yb), PU(uu, d1, yb), PU(uu, d1, yt + 1.0), PU(uu, d0, yt + 1.0))
        walls.quad(PU(u, d0, yt + 1.0), PU(u, d1, yt + 1.0), PU(u2, d1, yt + 1.0), PU(u2, d0, yt + 1.0))
        walls.quad(PU(u, d0, yb), PU(u, d0, yt + 1.0), PU(u2, d0, yt + 1.0), PU(u2, d0, yb))
      }
      // golul tunelului (întunecat)
      darkQ.quad(PU(uc - du, d0 - 0.03, yb), PU(uc - du, d0 - 0.03, yt), PU(uc + du, d0 - 0.03, yt), PU(uc + du, d0 - 0.03, yb))
      darkQ.quad(PU(uc - du, d0, yt), PU(uc - du, d1, yt), PU(uc + du, d1, yt), PU(uc + du, d0, yt))
      // rama albă a vomitorului
      const fw = 0.25 / lenPerU(uc, d0)
      const fw2 = 0.4 / lenPerU(uc, d0)
      walls.quad(PU(uc - du - fw2, d0 - 0.25, yt), PU(uc - du - fw2, d0 - 0.25, yt + 0.85), PU(uc + du + fw2, d0 - 0.25, yt + 0.85), PU(uc + du + fw2, d0 - 0.25, yt))
      // stâlpii albi ai portalului și fețele lui laterale (portalul iese puțin în față)
      for (const side of [-1, 1]) {
        const a = uc + side * du
        const b = uc + side * (du + fw2)
        walls.quad(PU(a, d0 - 0.25, yb), PU(a, d0 - 0.25, yt), PU(b, d0 - 0.25, yt), PU(b, d0 - 0.25, yb))
        walls.quad(PU(b, d0 - 0.25, yb), PU(b, d0 - 0.25, yt + 0.85), PU(b, d0 + 0.2, yt + 0.85), PU(b, d0 + 0.2, yb))
      }
      walls.quad(PU(uc - du - fw2, d0 - 0.25, yt + 0.85), PU(uc - du - fw2, d0 + 0.2, yt + 0.85), PU(uc + du + fw2, d0 + 0.2, yt + 0.85), PU(uc + du + fw2, d0 - 0.25, yt + 0.85))
      // acoperișul alb al vomitorului (de sus se vede o cutie albă, nu golul tunelului)
      walls.quad(PU(uc - du, d0 + 0.2, yt + 1.0), PU(uc - du, d1, yt + 1.0), PU(uc + du, d1, yt + 1.0), PU(uc + du, d0 + 0.2, yt + 1.0))
      vomGeo.push({ u: uc, d: d0 - 0.28, y: yt + 0.43, label: B.sector.num != null ? String(B.sector.num) : B.sector.letter || (B.sector.away ? 'OAS' : 'T1') })
    }
  }
  // înălțimea ultimei trepte în dreptul fiecărui unghi al elipsei din spate (pentru stâlpi și vitraj)
  const NA = 720
  const topByAngle = new Float32Array(NA).fill(NaN)
  for (const [u, y] of topAt) {
    const p = pointU(u, 0)
    const t = (Math.atan2(p.z / BB.az, p.x / BB.ax) + Math.PI * 2) % (Math.PI * 2)
    const b = Math.floor((t / (Math.PI * 2)) * NA) % NA
    topByAngle[b] = Number.isNaN(topByAngle[b]) ? y : Math.min(topByAngle[b], y)
  }
  for (let pass = 0; pass < NA; pass++) {
    let missing = 0
    for (let b = 0; b < NA; b++) {
      if (!Number.isNaN(topByAngle[b])) continue
      const l = topByAngle[(b + NA - 1) % NA]
      const r = topByAngle[(b + 1) % NA]
      if (!Number.isNaN(l) || !Number.isNaN(r)) topByAngle[b] = Number.isNaN(l) ? r : Number.isNaN(r) ? l : Math.min(l, r)
      else missing++
    }
    if (!missing) break
  }
  out.topAtAngle = (t) => topByAngle[Math.floor(((((t % (Math.PI * 2)) + Math.PI * 2) % (Math.PI * 2)) / (Math.PI * 2)) * NA) % NA]
  const backFloorMesh = new THREE.Mesh(backFloor.geometry(), new THREE.MeshStandardMaterial({ color: 0x9aa1a6, roughness: 0.95, side: THREE.DoubleSide }))
  backFloorMesh.receiveShadow = true
  root.add(backFloorMesh)

  // scările culoarelor din inelul 1
  const ring1Us = new Map()
  for (const s of layout.sectors) {
    if (!s.rings.includes(1)) continue
    for (const u of ring1AisleUs(s)) ring1Us.set(wrap8(u).toFixed(5), u)
  }
  for (const u of ring1Us.values()) {
    for (let i = 0; i < G.ring1.rows; i++) if (!inNotch(u, D1(i) + 0.4, 0.6)) aisleMarks.push([u, D1(i), Y1(i)])
  }

  const stepsMesh = new THREE.Mesh(steps.geometry(), concrete)
  stepsMesh.receiveShadow = true
  stepsMesh.castShadow = !lowSpec
  const wallMesh = new THREE.Mesh(walls.geometry(), white)
  wallMesh.receiveShadow = true
  wallMesh.castShadow = !lowSpec
  const darkMesh = new THREE.Mesh(darkQ.geometry(), new THREE.MeshStandardMaterial({ color: 0x1b2129, roughness: 0.9, side: THREE.DoubleSide }))
  const glassMesh = new THREE.Mesh(glassQ.geometry(), glass)
  const paveTex = TX.pavingTexture()
  paveTex.repeat.set(0.25, 0.25)
  const paveMesh = new THREE.Mesh(paveQ.geometry(), new THREE.MeshStandardMaterial({ color: 0xc9cbcb, roughness: 0.95, side: THREE.DoubleSide }))
  paveMesh.receiveShadow = true
  const railGeo1 = railPts.flatMap((pts) => {
    const v = pts.map((q) => new THREE.Vector3(...q))
    const c = new THREE.CatmullRomCurve3(v)
    const posts = v.filter((_, k) => k % 2 === 0).map((q) => new THREE.CylinderGeometry(0.025, 0.025, 1.0, 5).translate(q.x, q.y - 0.5, q.z).toNonIndexed())
    return [new THREE.TubeGeometry(c, 24, 0.035, 5, false).toNonIndexed(), ...posts]
  })
  const notchRail = new THREE.Mesh(mergeGeometries(railGeo1), new THREE.MeshStandardMaterial({ color: 0xb8bec4, metalness: 0.7, roughness: 0.3 }))
  root.add(stepsMesh, wallMesh, darkMesh, glassMesh, paveMesh, notchRail)

  // tunelul acoperit de peste fiecare acces din colț: prelată albă cu „UNIVERSITATEA CRAIOVA”,
  // de la marginea terenului până la portalul de sub culoar
  {
    const CW = NOTCH_W - 0.25
    const WALL_H = TH
    const a0 = G.r - 1.6
    const a1 = G.r + WALK_D
    const L = a1 - a0
    const sideTex = TX.coverTexture()
    sideTex.anisotropy = 8
    const sideMat = new THREE.MeshStandardMaterial({ map: sideTex, roughness: 0.55 })
    const roofMat = new THREE.MeshStandardMaterial({ color: 0xf2f4f6, roughness: 0.5, side: THREE.DoubleSide })
    const roofTopMat = new THREE.MeshStandardMaterial({ map: TX.coverRoofTexture(), roughness: 0.5 })
    const frontMat = new THREE.MeshStandardMaterial({ map: TX.coverFrontTexture(), roughness: 0.6 })
    const roofGeo = new THREE.CylinderGeometry(CW / 2, CW / 2, L, 28, 1, true, Math.PI, Math.PI)
    roofGeo.rotateZ(-Math.PI / 2)
    roofGeo.scale(1, 1.0 / (CW / 2), 1)
    roofGeo.translate(0, WALL_H, 0)
    const cap = new THREE.Shape()
    for (let k = 0; k <= 20; k++) {
      const t = (k / 20) * Math.PI
      const x = (CW / 2) * Math.cos(t)
      const y = WALL_H + Math.sin(t)
      k ? cap.lineTo(x, y) : cap.moveTo(x, y)
    }
    const capGeo = new THREE.ShapeGeometry(cap)
    for (const p of [1, 3, 5, 7]) {
      const { cx, cz, vx, vz } = cornerAxis(p)
      const g = new THREE.Group()
      for (const sd of [-1, 1]) {
        const m = new THREE.Mesh(new THREE.PlaneGeometry(L, WALL_H), sideMat)
        m.position.set(0, WALL_H / 2, (sd * CW) / 2)
        if (sd < 0) m.rotation.y = Math.PI
        m.castShadow = true
        m.receiveShadow = true
        g.add(m)
      }
      const roof = new THREE.Mesh(roofGeo, roofTopMat)
      roof.castShadow = true
      roof.receiveShadow = true
      g.add(roof)
      const front = new THREE.Mesh(new THREE.PlaneGeometry(CW, WALL_H), frontMat)
      front.rotation.y = -Math.PI / 2
      front.position.set(-L / 2, WALL_H / 2, 0)
      const capM = new THREE.Mesh(capGeo, roofMat)
      capM.rotation.y = -Math.PI / 2
      capM.position.set(-L / 2, 0, 0)
      // cadrul metalic al capătului
      const frame = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.12, CW + 0.1), new THREE.MeshStandardMaterial({ color: 0x9aa4ad, metalness: 0.6, roughness: 0.35 }))
      frame.position.set(-L / 2 - 0.02, WALL_H, 0)
      g.add(front, capM, frame)
      const am = (a0 + a1) / 2
      g.position.set(cx + vx * am, 0, cz + vz * am)
      g.rotation.y = Math.atan2(-vz, vx)
      root.add(g)
    }
  }

  // mâna curentă de pe scările inelului de sus
  const railByAisle = new Map()
  for (const [u, front, y] of aisleMarks) {
    if (front < D2(0) - 0.01) continue
    const key = wrap8(u).toFixed(5)
    if (!railByAisle.has(key)) railByAisle.set(key, [])
    railByAisle.get(key).push([u, front, y])
  }
  const railGeo = []
  for (const pts of railByAisle.values()) {
    if (pts.length < 8) continue
    pts.sort((a, b) => a[1] - b[1])
    const curve = new THREE.CatmullRomCurve3(pts.map(([u, front, y]) => {
      const q = pointU(u, front + 0.4)
      return new THREE.Vector3(q.x, y + 0.95, q.z)
    }))
    railGeo.push(new THREE.TubeGeometry(curve, pts.length * 2, 0.03, 4, false).toNonIndexed())
  }
  if (railGeo.length) root.add(new THREE.Mesh(mergeGeometries(railGeo), new THREE.MeshStandardMaterial({ color: 0xb8bec4, metalness: 0.7, roughness: 0.3 })))

  // scările culoarelor: beton gri cu muchia treptei mai deschisă (ca în fotografii)
  // scările: beton deschis, late, cu o treaptă intermediară pe fiecare rând (ca în fotografii)
  const stairGeo = mergeGeometries([
    new THREE.BoxGeometry(G.aisle + 0.05, 0.04, G.depth).translate(0, 0, 0).toNonIndexed(),
    new THREE.BoxGeometry(G.aisle + 0.05, 0.24, G.depth / 2).translate(0, 0.12, G.depth / 4).toNonIndexed(),
  ])
  const aisleMesh = new THREE.InstancedMesh(stairGeo, new THREE.MeshStandardMaterial({ color: 0xd2d5d4, roughness: 0.85 }), aisleMarks.length)
  const m4 = new THREE.Matrix4()
  const q4 = new THREE.Quaternion()
  const up = new THREE.Vector3(0, 1, 0)
  const one = new THREE.Vector3(1, 1, 1)
  aisleMarks.forEach(([u, front, y], k) => {
    const q = pointU(u, front + G.depth / 2)
    m4.compose(new THREE.Vector3(q.x, y + 0.015, q.z), q4.setFromAxisAngle(up, Math.atan2(-q.nx, -q.nz)), one)
    aisleMesh.setMatrixAt(k, m4)
  })
  aisleMesh.receiveShadow = true
  root.add(aisleMesh)

  // plăcuțele cu numărul sectorului deasupra fiecărui vomitor
  const signMats = new Map()
  const signFor = (label) => {
    if (signMats.has(label)) return signMats.get(label)
    const c = document.createElement('canvas')
    c.width = 128
    c.height = 64
    const g = c.getContext('2d')
    g.fillStyle = '#0b4aa2'
    g.fillRect(0, 0, 128, 64)
    g.fillStyle = '#ffffff'
    g.font = '800 44px "Barlow Condensed", Arial Narrow, sans-serif'
    g.textAlign = 'center'
    g.textBaseline = 'middle'
    g.fillText(label, 64, 34)
    const t = new THREE.CanvasTexture(c)
    t.colorSpace = THREE.SRGBColorSpace
    const m = new THREE.MeshBasicMaterial({ map: t })
    signMats.set(label, m)
    return m
  }
  const signGeo = new THREE.PlaneGeometry(1.4, 0.7)
  for (const v of vomGeo) {
    const q = pointU(v.u, v.d)
    const sign = new THREE.Mesh(signGeo, signFor(v.label))
    sign.position.set(q.x, v.y, q.z)
    sign.rotation.y = Math.atan2(-q.nx, -q.nz)
    root.add(sign)
  }

  // ─── Grinda inelară, stâlpii, cupola din arce ───
  const ringQ = new Quads()
  ellipseBand(ringQ, BB.ax + 0.4, BB.az + 0.4, RING_TOP, RING_TOP + 1.0)
  ellipseRing(ringQ, BB.ax + 0.3, BB.az + 0.3, CONCOURSE.ax, CONCOURSE.az, RING_TOP)
  const ringMesh = new THREE.Mesh(ringQ.geometry(), white)
  ringMesh.castShadow = true
  root.add(ringMesh)
  // stâlpii colonadei: pornesc de pe platforma din spatele tribunei (mai jos în colțuri) și se
  // ramifică în V spre inelul acoperișului, ca „arborii” din fotografiile interioare
  const colN = 96
  const colGeo = []
  const colBase = (a) => out.topAtAngle(a) + 0.02
  const colPt = (a, y) => new THREE.Vector3((BB.ax + 1.6) * Math.cos(a), y, (BB.az + 1.6) * Math.sin(a))
  for (let k = 0; k < colN; k++) {
    const a = (k / colN) * Math.PI * 2
    const y0 = Math.min(colBase(a), RING_TOP)
    const yb = SPRING_Y - 5.2 // de aici pornesc ramurile
    const p0 = colPt(a, y0)
    const p1 = colPt(a, yb)
    colGeo.push(beamGeo(p0, p1, 0.32))
    const da = (Math.PI * 2) / colN / 2
    for (const s of [-1, 1]) colGeo.push(beamGeo(p1, colPt(a + s * da, SPRING_Y), 0.16))
    colGeo.push(beamGeo(p1, colPt(a, SPRING_Y), 0.2))
  }
  const cols = new THREE.Mesh(mergeGeometries(colGeo), white)
  cols.castShadow = true
  root.add(cols)
  // în spatele stâlpilor: vitrajul fațadei (închis la culoare, cu montanți), de la platformă până sus
  {
    const gq = []
    const N = 384
    const gTex = TX.glazingTexture()
    gTex.wrapS = gTex.wrapT = THREE.RepeatWrapping
    const pos = []
    const uv = []
    for (let k = 0; k < N; k++) {
      const a0 = (k / N) * Math.PI * 2
      const a1 = ((k + 1) / N) * Math.PI * 2
      const r = [BB.ax + 2.1, BB.az + 2.1]
      const y0a = colBase(a0)
      const y0b = colBase(a1)
      const P0 = [r[0] * Math.cos(a0), r[1] * Math.sin(a0)]
      const P1 = [r[0] * Math.cos(a1), r[1] * Math.sin(a1)]
      const u0 = (k / N) * 160
      const u1 = ((k + 1) / N) * 160
      pos.push(P0[0], y0a, P0[1], P1[0], y0b, P1[1], P1[0], SPRING_Y, P1[1], P0[0], y0a, P0[1], P1[0], SPRING_Y, P1[1], P0[0], SPRING_Y, P0[1])
      uv.push(u0, y0a / 4, u1, y0b / 4, u1, SPRING_Y / 4, u0, y0a / 4, u1, SPRING_Y / 4, u0, SPRING_Y / 4)
    }
    const g = new THREE.BufferGeometry()
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3))
    g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2))
    g.computeVertexNormals()
    root.add(new THREE.Mesh(g, new THREE.MeshStandardMaterial({ map: gTex, color: 0x5d6a78, roughness: 0.18, metalness: 0.55, side: THREE.DoubleSide })))
    void gq
    const beamRing = new THREE.TubeGeometry(ellipseCurve(BB.ax + 1.6, BB.az + 1.6, (RING_TOP + SPRING_Y) / 2), 256, 0.22, 5, true)
    const topRing = new THREE.TubeGeometry(ellipseCurve(BB.ax + 1.6, BB.az + 1.6, SPRING_Y), 256, 0.45, 6, true)
    const rings = new THREE.Mesh(mergeGeometries([beamRing.toNonIndexed(), topRing.toNonIndexed()]), white)
    rings.castShadow = true
    root.add(rings)
  }

  const roofParts = new THREE.Group()
  root.add(roofParts)
  out.roofParts = roofParts
  const roofCurveAt = (t) => new THREE.CatmullRomCurve3(ROOF_PROFILE.map(([ax, az, y]) => new THREE.Vector3(ax * Math.cos(t), y, az * Math.sin(t))))
  const archGeo = []
  const archN = lowSpec ? 64 : 128
  for (let k = 0; k < archN; k++) {
    const curve = roofCurveAt((k / archN) * Math.PI * 2)
    archGeo.push(new THREE.TubeGeometry(curve, 36, 0.32, 5, false).toNonIndexed())
  }
  // inele secundare (pane) pe cupolă
  const roofLook = new THREE.CatmullRomCurve3(ROOF_PROFILE.map(([ax, az, y]) => new THREE.Vector3(ax, y, az)))
  for (const f of [0.0, 0.08, 0.18, 0.3, 0.42, 0.54, 0.66, 0.78, 0.9]) {
    const p = roofLook.getPoint(f)
    archGeo.push(new THREE.TubeGeometry(ellipseCurve(p.x, p.z, p.y - 0.25), 220, f === 0 ? 0.7 : 0.24, 5, true).toNonIndexed())
  }
  const arches = new THREE.Mesh(mergeGeometries(archGeo), white)
  arches.castShadow = true
  roofParts.add(arches)

  // structura spațială pe două straturi (piramide pătrate), ca în fotografiile din interior:
  // nodurile de jos sunt la jumătatea ochiurilor, cu 2,6 m mai jos, legate de cele 4 noduri de sus
  {
    const curves = []
    for (let k = 0; k <= archN; k++) curves.push(roofCurveAt((k / archN) * Math.PI * 2))
    const halfCurves = []
    for (let k = 0; k < archN; k++) halfCurves.push(roofCurveAt(((k + 0.5) / archN) * Math.PI * 2))
    const NF = lowSpec ? 10 : 16
    const fs = Array.from({ length: NF + 1 }, (_, i) => 0.03 + (0.95 * i) / NF)
    const up = (k, i) => curves[k].getPoint(fs[i])
    const low = (k, i) => {
      const a = halfCurves[k].getPoint((fs[i] + fs[i + 1]) / 2)
      const r = Math.hypot(a.x, a.z)
      return new THREE.Vector3(a.x * (1 - 0.9 / r), a.y - 2.6, a.z * (1 - 0.9 / r))
    }
    const beams = []
    for (let k = 0; k < archN; k++) {
      for (let i = 0; i < NF; i++) {
        const L = low(k, i)
        beams.push([L, up(k, i)], [L, up(k + 1, i)], [L, up(k, i + 1)], [L, up(k + 1, i + 1)])
        beams.push([L, low((k + 1) % archN, i)])
        if (i < NF - 1) beams.push([L, low(k, i + 1)])
      }
    }
    const unit = new THREE.CylinderGeometry(lowSpec ? 0.1 : 0.12, lowSpec ? 0.1 : 0.12, 1, 5, 1, true).translate(0, 0.5, 0)
    const web = new THREE.InstancedMesh(unit, white, beams.length)
    const m = new THREE.Matrix4()
    const q = new THREE.Quaternion()
    const Y = new THREE.Vector3(0, 1, 0)
    const d = new THREE.Vector3()
    beams.forEach(([a, b], n) => {
      d.subVectors(b, a)
      const len = d.length()
      q.setFromUnitVectors(Y, d.normalize())
      m.compose(a, q, new THREE.Vector3(1, len, 1))
      web.setMatrixAt(n, m)
    })
    web.castShadow = !lowSpec
    roofParts.add(web)
  }
  // panourile translucide ale cupolei
  const latticeRoof = TX.latticeTexture()
  latticeRoof.repeat.set(256, 16)
  const roofMat = new THREE.MeshStandardMaterial({
    map: latticeRoof, color: 0xffffff, transparent: true, opacity: 0.5, side: THREE.DoubleSide, roughness: 0.5, depthWrite: false,
  })
  const roofLookFn = (() => {
    const pts = roofLook.getPoints(80)
    return pts
  })()
  {
    const pos = []
    const uv = []
    const idx = []
    const segs = 256
    for (let i = 0; i < roofLookFn.length; i++) {
      for (let j = 0; j <= segs; j++) {
        const t = (j / segs) * Math.PI * 2
        const p = roofLookFn[i]
        pos.push(p.x * Math.cos(t), p.y, p.z * Math.sin(t))
        uv.push(j / segs, i / (roofLookFn.length - 1))
      }
    }
    const W = segs + 1
    for (let i = 0; i < roofLookFn.length - 1; i++) for (let j = 0; j < segs; j++) {
      const a = i * W + j
      const b = (i + 1) * W + j
      idx.push(a, b, a + 1, b, b + 1, a + 1)
    }
    const g = new THREE.BufferGeometry()
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3))
    g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2))
    g.setIndex(idx)
    g.computeVertexNormals()
    const roofMesh = new THREE.Mesh(g, roofMat)
    roofMesh.renderOrder = 2
    // stratul 2: panourile translucide umbresc doar jumătate din lumina soarelui (vezi main.js)
    roofMesh.layers.set(2)
    roofMesh.castShadow = true
    out.roofPanels = roofMesh
    root.add(roofMesh)
  }
  out.roofMat = roofMat
  // proiectoarele: pe marginea ochiului de cer și pe un inel mai jos
  const [oax, oaz, oy] = ROOF_PROFILE[ROOF_PROFILE.length - 1]
  const lights = new THREE.InstancedMesh(new THREE.BoxGeometry(1.5, 0.5, 0.9), new THREE.MeshStandardMaterial({ color: 0xffffff, emissive: 0xfff4d6, emissiveIntensity: 1.6 }), 168)
  let li = 0
  for (const [ax, az, y, cnt] of [[oax + 0.4, oaz + 0.4, oy - 0.9, 96], [60.5, 70.5, 46.2, 72]]) {
    for (let k = 0; k < cnt; k++) {
      const t = (k / cnt) * Math.PI * 2
      const p = new THREE.Vector3(ax * Math.cos(t), y, az * Math.sin(t))
      m4.lookAt(p, new THREE.Vector3(0, 0, 0), up)
      m4.setPosition(p)
      lights.setMatrixAt(li++, m4)
    }
  }
  roofParts.add(lights)

  // ─── Fațada ───
  const look = profileLookup(SHELL_PROFILE)
  const cladTex = TX.claddingTexture()
  cladTex.repeat.set(10, 1)
  const cladNormal = TX.ribNormalTexture()
  cladNormal.repeat.set(10, 1)
  // tablă de aluminiu fălțuită, cu nervuri pe meridiane (ca în fotografiile exterioare)
  const cladMat = new THREE.MeshStandardMaterial({ map: cladTex, normalMap: cladNormal, normalScale: new THREE.Vector2(1.2, 1.2), color: 0xdfe3e7, roughness: 0.3, metalness: 0.62 })
  const clad = new THREE.Mesh(shellBand(look, 320, 24, waveEdge, () => SHELL_TOP), cladMat)
  clad.castShadow = true
  clad.receiveShadow = true
  root.add(clad)
  out.shell = clad
  // jgheabul / bordura albă de la marginea de sus a placajului
  const rim = new THREE.Mesh(new THREE.TubeGeometry(ellipseCurve(84, 94, SHELL_TOP - 0.1), 256, 0.55, 8, true), new THREE.MeshStandardMaterial({ color: 0xf2f4f6, roughness: 0.4, metalness: 0.3 }))
  rim.castShadow = true
  root.add(rim)
  const latticeIn = TX.latticeTexture(true)
  latticeIn.repeat.set(150, 9)
  const shellInMat = new THREE.MeshStandardMaterial({ map: latticeIn, color: 0xffffff, side: THREE.BackSide, roughness: 0.7 })
  root.add(new THREE.Mesh(clad.geometry, shellInMat))
  out.shellInMat = shellInMat
  // lamelele de aluminiu de sub val
  const louverGeo = []
  for (let k = 0; k < 9; k++) {
    const top = (u) => waveEdge(u) - 0.6 - k * 1.05
    const bot = (u) => top(u) - 0.62
    louverGeo.push(shellBand(look, 320, 1, (u) => Math.max(PLINTH_Y + 1, bot(u)), (u) => Math.max(PLINTH_Y + 1.02, top(u)), -0.15))
  }
  const louvers = new THREE.Mesh(mergeGeometries(louverGeo), new THREE.MeshStandardMaterial({ color: 0xf3f5f7, roughness: 0.45, metalness: 0.3, side: THREE.DoubleSide }))
  louvers.castShadow = true
  root.add(louvers)
  // soclul de beton
  const plTex = TX.plinthTexture()
  plTex.repeat.set(60, 1)
  const plinthQ = shellBand(look, 256, 2, () => 0, () => PLINTH_Y, 0)
  const uvA = plinthQ.attributes.uv
  for (let i = 0; i < uvA.count; i++) uvA.setY(i, (plinthQ.attributes.position.getY(i) / PLINTH_Y) * 0.999)
  root.add(new THREE.Mesh(plinthQ, new THREE.MeshStandardMaterial({ map: plTex, roughness: 0.9 })))
  // clădirea vitrată (concourse) din spatele structurii
  const glazTex = TX.glazingTexture()
  glazTex.repeat.set(150, (RING_TOP - PLINTH_Y) / 4.2)
  const cq = new Quads()
  ellipseBand(cq, CONCOURSE.ax, CONCOURSE.az, PLINTH_Y, RING_TOP + 0.2, 200)
  const cg = cq.geometry()
  {
    const p = cg.attributes.position
    const uvs = []
    for (let i = 0; i < p.count; i++) {
      const a = Math.atan2(p.getZ(i) / CONCOURSE.az, p.getX(i) / CONCOURSE.ax)
      uvs.push(((a / (Math.PI * 2) + 1) % 1), (p.getY(i) - PLINTH_Y) / (RING_TOP - PLINTH_Y))
    }
    // corecție pentru cusătura de la 360°
    for (let i = 0; i < p.count; i += 6) {
      const us = [0, 1, 2, 3, 4, 5].map((k) => uvs[(i + k) * 2])
      if (Math.max(...us) - Math.min(...us) > 0.5) for (let k = 0; k < 6; k++) if (uvs[(i + k) * 2] < 0.5) uvs[(i + k) * 2] += 1
    }
    cg.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2))
  }
  root.add(new THREE.Mesh(cg, new THREE.MeshStandardMaterial({ map: glazTex, roughness: 0.25, metalness: 0.35, side: THREE.DoubleSide })))
  // structura albă în X
  const trussGeo = []
  const K = lowSpec ? 48 : 64
  const TOPY = 37
  const at = (k, y) => {
    const t = (k / K) * Math.PI * 2
    const [ax, az] = look(y)
    return [(ax - 1.0) * Math.cos(t), y, (az - 1.0) * Math.sin(t)]
  }
  // ca în fotografii: stâlpi verticali care se ramifică în V spre carcasă, cu X între ei jos
  const MIDY = 13
  for (let k = 0; k < K; k++) {
    trussGeo.push(beam(at(k, DECK_Y), at(k, MIDY), 0.5, 8))
    trussGeo.push(beam(at(k, MIDY), at(k - 0.5, TOPY), 0.38))
    trussGeo.push(beam(at(k, MIDY), at(k + 0.5, TOPY), 0.38))
    trussGeo.push(beam(at(k, PLINTH_Y), at(k + 1, MIDY), 0.22))
    trussGeo.push(beam(at(k + 1, PLINTH_Y), at(k, MIDY), 0.22))
  }
  for (const y of [PLINTH_Y + 0.3, MIDY, 24]) {
    const [ax, az] = look(y)
    trussGeo.push(new THREE.TubeGeometry(ellipseCurve(ax - 1.0, az - 1.0, y), 256, 0.3, 5, true).toNonIndexed())
  }
  const truss = new THREE.Mesh(mergeGeometries(trussGeo), new THREE.MeshStandardMaterial({ color: 0xf4f6f8, roughness: 0.4, metalness: 0.3 }))
  truss.castShadow = true
  root.add(truss)

  // ─── Ecranele (tabelele) din colțurile NE și SV ───
  // Ca în fotografii: ecran video negru, plat, agățat sus în colonada din colț, între stâlpii
  // acoperișului (marginea de sus aproape de inelul pe care stă acoperișul), cu carcasă adâncă,
  // cadru de oțel prins de stâlpi și pasarelă de service dedesubt.
  const screenTex = TX.screenTexture(EVENT.home, EVENT.away)
  const screenMat = new THREE.MeshStandardMaterial({ color: 0x000000, emissive: 0xffffff, emissiveMap: screenTex, emissiveIntensity: 1.15, roughness: 0.32, metalness: 0.1 })
  const steel = new THREE.MeshStandardMaterial({ color: 0x23272c, metalness: 0.7, roughness: 0.45 })
  const casing = new THREE.MeshStandardMaterial({ color: 0x0b0c0e, roughness: 0.75, metalness: 0.2 })
  for (const piece of [1, 5]) {
    const u = piece + 0.5
    const W = 13.6
    const H = 7.65
    const top = SPRING_Y - 0.7
    const yc = top - H / 2
    const q = pointU(u, backOffsetU(u) - 0.6)
    const scr = new THREE.Group()
    // carcasa (adâncă de 1,1 m) și rama
    const box = new THREE.Mesh(new THREE.BoxGeometry(W + 0.36, H + 0.36, 1.1), casing)
    box.position.z = -0.55
    const face = new THREE.Mesh(new THREE.PlaneGeometry(W, H), screenMat)
    face.position.z = 0.012
    scr.add(box, face)
    // cadrul de oțel din spate, prins de cei doi stâlpi vecini
    const fr = []
    const z = -1.3
    for (const y of [-H / 2 + 0.4, 0, H / 2 - 0.4]) fr.push(beam([-W / 2 - 1.8, y, z], [W / 2 + 1.8, y, z], 0.12, 6))
    for (const x of [-W / 2 + 0.6, -W / 6, W / 6, W / 2 - 0.6]) fr.push(beam([x, -H / 2, z], [x, H / 2 + 0.7, z], 0.1, 6))
    for (const sx of [-1, 1]) {
      fr.push(beam([sx * (W / 2 + 1.8), -H / 2 - 0.4, z - 0.4], [sx * (W / 2 + 1.8), H / 2 + 0.7, z - 0.4], 0.16, 6))
      fr.push(beam([sx * (W / 2 - 0.6), H / 2 + 0.7, z], [sx * (W / 2 + 1.8), -H / 2 + 0.4, z - 0.4], 0.07, 5))
    }
    const frame = new THREE.Mesh(mergeGeometries(fr), steel)
    // pasarela de service, cu balustradă
    const walk = new THREE.Mesh(new THREE.BoxGeometry(W + 1.4, 0.1, 1.2), steel)
    walk.position.set(0, -H / 2 - 0.35, -0.3)
    const rail = new THREE.Mesh(mergeGeometries([
      beam([-W / 2 - 0.7, -H / 2 + 0.75, 0.25], [W / 2 + 0.7, -H / 2 + 0.75, 0.25], 0.03, 5),
      ...Array.from({ length: 9 }, (_, k) => beam([-W / 2 - 0.7 + (k * (W + 1.4)) / 8, -H / 2 - 0.3, 0.25], [-W / 2 - 0.7 + (k * (W + 1.4)) / 8, -H / 2 + 0.75, 0.25], 0.025, 4)),
    ]), steel)
    scr.add(frame, walk, rail)
    scr.position.set(q.x, yc, q.z)
    scr.lookAt(0, yc - 6, 0)
    scr.traverse((o) => { if (o.isMesh) o.castShadow = true })
    root.add(scr)
  }
  // incinta: podiumul pe stâlpi cu parcarea de dedesubt, esplanada, scările, porțile, statuia
  try {
    out.precinct = buildPrecinct(root, { lowSpec })
  } catch (e) {
    console.error('Incinta stadionului nu s-a putut construi', e)
  }
  return out
}
