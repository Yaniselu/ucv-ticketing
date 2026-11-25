// Structura detaliată a Stadionului „Ion Oblemenco”, reconstituită după fotografii:
// – inelul de sus are înălțime variabilă (multe rânduri la mijlocul laturilor,
//   puține în colțuri), cu pereți albi în trepte în spatele blocurilor mai joase;
// – vomitoare la jumătatea inelului de sus, balustradă de sticlă pe culoarul dintre inele;
// – grindă inelară cu stâlpi și cupolă din arce de oțel cu panouri translucide;
// – fațada: placaj alb doar deasupra „valului”, dedesubt structura în X și clădirea vitrată.
import * as THREE from 'three'
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js'
import {
  G, D1, Y1, Y1P, D2, Y2, D2u, Y2u, WALK_D, WALK_DP, WALK_Y, RING_TOP, pieceLen, pointU, notchEdges, lenPerU, wrap8,
  NOTCH_W, NOTCH_TUN_H, cornerAxis, t1CutT, T1_ROWS, T1_HALF, T1_ZC, zToTW, backRowsAt, BACK_DIV,
} from '../data/layout.js'
import { Quads, strip, ellipseBand, ellipseRing, beam, ellipseCurve } from './geom.js'
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
const CONCOURSE = { ax: 91.5, az: 103 } // fațada vitrată (aceeași ca în precinct.js)
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
  // Inelul de jos, între două tranșee: pe tribune 22 de rânduri (panta 0,4 m/rând), pe peluze 15
  // (panta mai mare), ca pe harta reală; culoarul dintre inele e la aceeași înălțime peste tot, iar pe
  // peluze începe mai în față.
  const SEG = { 1: 'T', 3: 'P', 5: 'T', 7: 'P' } // segmentul care începe după tranșeea din colțul c
  const RAKE = {
    T: { rows: G.ring1.rows, Y: Y1, wd: WALK_D },
    P: { rows: G.ring1.rowsP, Y: Y1P, wd: WALK_DP },
  }
  const segBand = (q, c, d0, y0, d1, y1) => {
    const n = c + 2
    const w = n >= 8 ? 8 : 0
    bandU(q, eHi(c, d0), eLo(n % 8, d0) + w, eHi(c, d1), eLo(n % 8, d1) + w, d0, y0, d1, y1)
  }
  // segBand restrâns la intervalele din `ivs` (în u)
  const segBandIn = (q, c, ivs, d0, y0, d1, y1) => {
    const n = c + 2
    const w = n >= 8 ? 8 : 0
    for (const [uA, uB] of ivs) {
      const a0 = Math.max(eHi(c, d0), uA)
      const b0 = Math.min(eLo(n % 8, d0) + w, uB)
      const a1 = Math.max(eHi(c, d1), uA)
      const b1 = Math.min(eLo(n % 8, d1) + w, uB)
      if (b0 > a0 + 1e-7 || b1 > a1 + 1e-7) bandU(q, a0, Math.max(a0, b0), a1, Math.max(a1, b1), d0, y0, d1, y1)
    }
  }
  // terasa din fața lounge-ului VIP (Tribuna 1): ultimele rânduri ale inelului de jos, fără locuri pe
  // hartă, sunt o terasă la nivelul culoarului, cu scările VIP tăiate în ea
  const TER = layout.terrace
  const ALL = [[-Infinity, Infinity]]
  const OUT = TER ? [[-Infinity, TER.u0], [TER.u1, Infinity]] : ALL
  const CUTS = TER ? TER.cuts : []
  for (const c of [1, 3, 5, 7]) {
    const { rows, Y, wd } = RAKE[SEG[c]]
    const ter = TER && c === 5
    segBand(walls, c, 0, 0, 0, Y(0))
    for (let i = 0; i < rows; i++) {
      const ivs = ter && i >= TER.r ? [...OUT, ...CUTS] : ALL
      if (i > 0) segBandIn(steps, c, ivs, D1(i), Y(i - 1), D1(i), Y(i))
      segBandIn(steps, c, ivs, D1(i), Y(i), D1(i + 1), Y(i))
    }
    segBandIn(steps, c, ter ? [...OUT, ...CUTS] : ALL, wd, Y(rows - 1), wd, WALK_Y)
    if (wd < WALK_D) segBand(steps, c, wd, WALK_Y, WALK_D, WALK_Y)
    // balustrada de sticlă și mâna curentă de la capătul inelului de jos
    segBandIn(glassQ, c, ter ? OUT : ALL, wd + 0.05, WALK_Y, wd + 0.05, WALK_Y + 1.05)
    segBandIn(walls, c, ter ? OUT : ALL, wd, WALK_Y + 1.05, wd + 0.1, WALK_Y + 1.05)
  }
  if (TER) {
    const r0 = TER.r
    const dF = D1(r0)
    // bucățile de terasă dintre scări
    const edges = [TER.u0, ...CUTS.flat(), TER.u1]
    for (let k = 0; k < edges.length; k += 2) {
      const [a, b] = [edges[k], edges[k + 1]]
      if (b - a < 1e-6) continue
      bandU(steps, a, b, a, b, dF, WALK_Y, WALK_D, WALK_Y)
      bandU(walls, a, b, a, b, dF, Y1(r0 - 1), dF, WALK_Y)
      bandU(glassQ, a, b, a, b, dF + 0.05, WALK_Y, dF + 0.05, WALK_Y + 1.05)
      bandU(walls, a, b, a, b, dF, WALK_Y + 1.05, dF + 0.1, WALK_Y + 1.05)
    }
    // pereții laterali: la capetele terasei și pe marginile scărilor (de la treaptă până la terasă)
    for (const u of edges) {
      for (let i = r0; i < G.ring1.rows; i++) walls.quad(PUc(u, D1(i), Y1(i)), PUc(u, D1(i), WALK_Y), PUc(u, D1(i + 1), WALK_Y), PUc(u, D1(i + 1), Y1(i)))
    }
    for (const u of [TER.u0, TER.u1]) glassQ.quad(PUc(u, dF, WALK_Y), PUc(u, dF, WALK_Y + 1.05), PUc(u, WALK_D, WALK_Y + 1.05), PUc(u, WALK_D, WALK_Y))
  }
  const paveQ = new Quads()
  const railPts = []
  const TUN = 3.5 // adâncimea tunelului de sub culoar
  const TH = NOTCH_TUN_H - 1.0 // înălțimea portalului (pereții drepți ai tunelului acoperit)
  const slopeOf = (kind) => {
    const { wd } = RAKE[kind]
    return (d) => Y1(0) + 0.15 + (Math.min(d, wd) / wd) * (WALK_Y - Y1(0))
  }
  for (const p of [1, 3, 5, 7]) {
    // pavajul: de la teren până în tunel
    const N = 12
    for (let k = 0; k < N; k++) {
      const d0 = 0.05 + ((WALK_D + TUN) * k) / N
      const d1 = 0.05 + ((WALK_D + TUN) * (k + 1)) / N
      bandU(paveQ, eLo(p, d0), eHi(p, d0), eLo(p, d1), eHi(p, d1), d0, 0.04, d1, 0.04)
    }
    // pereții laterali netezi (muchia de sus urcă odată cu gradenele: de o parte tribuna, de cealaltă
    // peluza) și balustrada
    for (const [side, kind] of [[eLo, SEG[(p + 6) % 8]], [eHi, SEG[p]]]) {
      const slope = slopeOf(kind)
      const line = [...new Set([...Array.from({ length: N + 1 }, (_, k) => 0.05 + (WALK_D * k) / N), RAKE[kind].wd])].sort((a, b) => a - b)
      for (let k = 0; k < line.length - 1; k++) {
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
    // balustrada de sticlă de deasupra portalului
    const dg = WALK_D + 0.05
    bandU(glassQ, eLo(p, dg), eHi(p, dg), eLo(p, dg), eHi(p, dg), dg, WALK_Y, dg, WALK_Y + 1.05)
  }
  strip(steps, FULL, WALK_D, WALK_Y, D2(0), WALK_Y)

  // ─── Inelul 2: treptele până la ultimul rând cu locuri din harta reală ───
  const PU = (u, d, y) => {
    const q = pointU(u, d)
    return [q.x, y, q.z]
  }
  const blockedAt = (u, j) => {
    const c = t1CutT(j)
    if (!c) return false
    const w = wrap8(u)
    return w >= 6 && w < 7 && w - 6 > c[0] - 0.006 && w - 6 < c[1] + 0.006
  }
  // vomitoarele (harta reală): tunelul iese la nivelul culoarului dintre inele, printr-o tăietură
  // în gradene cât golul din hartă (rândurile 0…j1); gura tunelului e sub rândul j1 + 1, cu numărul
  // sectorului. Pe lângă tăietură, rândurile din față n-au locuri: acolo încep cele două scări.
  const voms = layout.voms.map((v) => {
    const k = lenPerU(v.u, 30)
    return { ...v, ua: v.u + v.cut[0] / k, ub: v.u + v.cut[1] / k, yT: Y2u(v.j1 + 1, v.u) - 0.32 }
  })
  const vomAt = (u, j) => voms.find((v) => j <= v.j1 + 1 && wrap8(u) > wrap8(v.ua) && wrap8(u) < wrap8(v.ub))
  // palierele de lângă lojele de la nivelul 2 (Tribuna 1): rândurile j0…j1 tăiate până la podeaua lojelor
  const lands = layout.landings || []
  const landAt = (u, j) => lands.find((l) => j >= l.j0 && j <= l.j1 + 1 && wrap8(u) > l.ua && wrap8(u) < l.ub)
  // eșantioanele în u: la ~1,2 m, plus marginile lojelor, ale vomitoarelor și locurile unde spatele
  // gradenelor își schimbă înălțimea
  const uset = new Set()
  for (let p = 0; p < 8; p++) {
    const n = Math.max(p % 2 ? 28 : 2, Math.ceil(pieceLen(p, 32) / 1.2))
    for (let k = 0; k < n; k++) uset.add(+(p + k / n).toFixed(7))
  }
  for (const h of T1_HALF) for (const e of [zToTW(T1_ZC + h), zToTW(T1_ZC - h)]) uset.add(e)
  for (const v of voms) uset.add(v.ua).add(v.ub)
  for (const l of lands) uset.add(l.ua).add(l.ub)
  for (let i = 0; i < 8 / BACK_DIV; i++) if (backRowsAt((i + 0.5) * BACK_DIV) !== backRowsAt((i - 0.5) * BACK_DIV)) uset.add(+(i * BACK_DIV).toFixed(7))
  const us = [...uset].map(wrap8).sort((a, b) => a - b)
  us.push(us[0] + 8)
  const backFloor = new Quads()
  const topAt = [] // [u, înălțimea ultimei trepte] de-a lungul spatelui tribunelor
  // punct pe rândul j al inelului de sus, în dreptul lui u (pe peluze, rândurile încep mai în față și
  // urcă mai abrupt): marginea din față a rândului (sau `dd` metri mai în spate) la înălțimea y
  const R2 = (u, j, y, dd = 0) => PU(u, D2u(j, u) + dd, y)
  let prev = null
  for (let i = 0; i < us.length - 1; i++) {
    const a = us[i]
    const b = us[i + 1]
    const um = (a + b) / 2
    const n = backRowsAt(um)
    const Ea = D2u(n, a)
    const Eb2 = D2u(n, b)
    const ya = Y2u(n - 1, a)
    const yb = Y2u(n - 1, b)
    const Eback = Math.max(D2u(n, um) + 2.2, backOffsetU(um) + 2.2)
    if (!blockedAt(um, 0) && !vomAt(um, 0)) walls.quad(R2(a, 0, WALK_Y), R2(a, 0, Y2(0)), R2(b, 0, Y2(0)), R2(b, 0, WALK_Y))
    for (let j = 0; j < n; j++) {
      if (blockedAt(um, j)) continue
      const v = vomAt(um, j) || landAt(um, j)
      if (!v || j > v.j1) steps.quad(R2(a, j, Y2u(j, a)), R2(a, j + 1, Y2u(j, a)), R2(b, j + 1, Y2u(j, b)), R2(b, j, Y2u(j, b)))
      if (j > 0 && !v) {
        const drop = T1_ROWS.includes(j) ? 0.4 : 0
        steps.quad(R2(a, j, Y2u(j - 1, a) - drop), R2(a, j, Y2u(j, a)), R2(b, j, Y2u(j, b)), R2(b, j, Y2u(j - 1, b) - drop))
      }
    }
    // parapetul din spatele ultimului rând și platforma de sus din spatele lui
    walls.quad(PU(a, Ea, ya - 1.6), PU(a, Ea, ya + 1.15), PU(b, Eb2, yb + 1.15), PU(b, Eb2, yb - 1.6))
    walls.quad(PU(a, Ea, ya + 1.15), PU(a, Ea + 0.3, ya + 1.15), PU(b, Eb2 + 0.3, yb + 1.15), PU(b, Eb2, yb + 1.15))
    walls.quad(PU(a, Ea + 0.3, ya + 1.15), PU(a, Ea + 0.3, ya + 0.02), PU(b, Eb2 + 0.3, yb + 0.02), PU(b, Eb2 + 0.3, yb + 1.15))
    backFloor.quad(PU(a, Ea + 0.3, ya + 0.02), PU(a, Eback, ya + 0.02), PU(b, Eback, yb + 0.02), PU(b, Eb2 + 0.3, yb + 0.02))
    topAt.push([a, ya, Ea], [um, (ya + yb) / 2, (Ea + Eb2) / 2])
    // unde spatele își schimbă înălțimea: peretele alb lateral al blocului mai înalt
    if (prev && prev.n !== n) {
      const lo = Math.min(prev.n, n)
      const hi = Math.max(prev.n, n)
      const yLo = Y2u(lo - 1, a)
      const yHi = Y2u(hi - 1, a)
      const eb = Math.max(prev.Eback, Eback)
      walls.quad(R2(a, lo, yLo), R2(a, lo, Y2u(lo, a) + 1.15), R2(a, hi, yHi + 1.15), R2(a, hi, yLo))
      walls.quad(R2(a, hi, yLo), R2(a, hi, yHi), PU(a, eb, yHi), PU(a, eb, yLo))
    }
    prev = { n, Eback }
  }
  // pereții vomitoarelor: pardoseala tăieturii (la nivelul culoarului), pereții laterali în trepte cu
  // balustradă de sticlă, gura tunelului și buiandrugul alb de sub rândul din spate
  const vomGeo = []
  for (const v of voms) {
    steps.quad(R2(v.ua, 0, WALK_Y), R2(v.ua, v.j1 + 1, WALK_Y), R2(v.ub, v.j1 + 1, WALK_Y), R2(v.ub, 0, WALK_Y))
    const tw = 0.15 / lenPerU(v.u, 30)
    for (const [u, u2] of [[v.ua, v.ua - tw], [v.ub, v.ub + tw]]) {
      for (let j = 0; j <= v.j1; j++) {
        const yj = Y2u(j, u)
        walls.quad(R2(u, j, WALK_Y), R2(u, j, yj), R2(u, j + 1, yj), R2(u, j + 1, WALK_Y))
        glassQ.quad(R2(u2, j, yj), R2(u2, j, yj + 1.0), R2(u2, j + 1, yj + 1.0), R2(u2, j + 1, yj))
      }
      walls.quad(R2(u, 0, WALK_Y), R2(u, 0, Y2(0)), R2(u2, 0, Y2(0)), R2(u2, 0, WALK_Y))
    }
    const top = (u) => Y2u(v.j1 + 1, u)
    darkQ.quad(R2(v.ua, v.j1 + 1, WALK_Y, -0.02), R2(v.ua, v.j1 + 1, v.yT, -0.02), R2(v.ub, v.j1 + 1, v.yT, -0.02), R2(v.ub, v.j1 + 1, WALK_Y, -0.02))
    walls.quad(R2(v.ua, v.j1 + 1, v.yT, -0.03), R2(v.ua, v.j1 + 1, top(v.ua), -0.03), R2(v.ub, v.j1 + 1, top(v.ub), -0.03), R2(v.ub, v.j1 + 1, v.yT, -0.03))
    const s = v.sectorObj
    vomGeo.push({ u: v.u, d: D2u(v.j1 + 1, v.u) - 0.06, y: v.yT - 0.42, label: s?.num != null ? String(s.num) : s?.letter || 'T1' })
  }
  // palierele T1: pardoseala la nivelul lojelor 2, pereții laterali în trepte (cu sticlă spre locuri),
  // peretele din spate cu gura vomitorului și plăcuța sectorului
  for (const l of lands) {
    const { j0, j1, ua, ub, y } = l
    const jb = j1 + 1
    steps.quad(R2(ua, j0, y), R2(ua, jb, y), R2(ub, jb, y), R2(ub, j0, y))
    walls.quad(R2(ua, j0, Y2(j0 - 1)), R2(ua, j0, y), R2(ub, j0, y), R2(ub, j0, Y2(j0 - 1)))
    const tw = 0.15 / lenPerU(l.uOut, 30)
    const out = l.uOut === ua ? -1 : 1
    for (const u of [ua, ub]) {
      for (let j = j0; j <= j1; j++) walls.quad(R2(u, j, y), R2(u, j, Y2(j)), R2(u, j + 1, Y2(j)), R2(u, j + 1, y))
    }
    const u2 = l.uOut + out * tw
    for (let j = j0; j <= j1; j++) glassQ.quad(R2(u2, j, Y2(j)), R2(u2, j, Y2(j) + 1.0), R2(u2, j + 1, Y2(j) + 1.0), R2(u2, j + 1, Y2(j)))
    // peretele din spate: gura vomitorului (3,6 m) la mijloc, alb în rest
    const k = lenPerU(ua, 30)
    const um = (ua + ub) / 2
    const pa = um - 1.8 / k
    const pb = um + 1.8 / k
    const yT = Y2(jb) - 0.32
    darkQ.quad(R2(pa, jb, y, -0.02), R2(pa, jb, yT, -0.02), R2(pb, jb, yT, -0.02), R2(pb, jb, y, -0.02))
    walls.quad(R2(pa, jb, yT, -0.03), R2(pa, jb, Y2(jb), -0.03), R2(pb, jb, Y2(jb), -0.03), R2(pb, jb, yT, -0.03))
    walls.quad(R2(ua, jb, y, -0.03), R2(ua, jb, Y2(jb), -0.03), R2(pa, jb, Y2(jb), -0.03), R2(pa, jb, y, -0.03))
    walls.quad(R2(pb, jb, y, -0.03), R2(pb, jb, Y2(jb), -0.03), R2(ub, jb, Y2(jb), -0.03), R2(ub, jb, y, -0.03))
    const s = l.sectorObj
    vomGeo.push({ u: um, d: D2(jb) - 0.06, y: yT - 0.42, label: s?.num != null ? String(s.num) : 'T1' })
  }
  // înălțimea ultimei trepte în dreptul fiecărui unghi al elipsei din spate (pentru stâlpi și vitraj)
  const NA = 720
  const topByAngle = new Float32Array(NA).fill(NaN)
  for (const [u, y, d] of topAt) {
    const p = pointU(u, d) // unghiul spatelui gradenelor (în colțuri diferă mult de cel al marginii terenului)
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

  // scările: culoarele din harta reală (golurile dintre locurile aceluiași rând). Beton deschis,
  // cât lățimea culoarului, cu o treaptă intermediară pe fiecare rând (ca în fotografii).
  const aisles = layout.aisles
  // mâna curentă de pe scările inelului de sus (pe mijlocul culoarelor lungi)
  const railByAisle = new Map()
  for (const a of aisles) {
    if (a.ring !== 2 || a.width < 0.8) continue
    const key = Math.round(wrap8(a.u) / 0.0025)
    if (!railByAisle.has(key)) railByAisle.set(key, [])
    railByAisle.get(key).push(a)
  }
  const railGeo = []
  for (const pts of railByAisle.values()) {
    if (pts.length < 8) continue
    pts.sort((a, b) => a.r - b.r)
    const curve = new THREE.CatmullRomCurve3(pts.map((a) => {
      const q = pointU(a.u, a.d + 0.4)
      return new THREE.Vector3(q.x, a.y + 0.95, q.z)
    }))
    railGeo.push(new THREE.TubeGeometry(curve, pts.length * 2, 0.03, 4, false).toNonIndexed())
  }
  if (railGeo.length) root.add(new THREE.Mesh(mergeGeometries(railGeo), new THREE.MeshStandardMaterial({ color: 0xb8bec4, metalness: 0.7, roughness: 0.3 })))

  // treapta unui rând (1 m lățime, 1 m adâncime, 0,48 m între rânduri), scalată pe fiecare culoar;
  // treapta intermediară e în spatele rândului, lângă rândul următor
  const stairGeo = mergeGeometries([
    new THREE.BoxGeometry(1, 0.04, 1).toNonIndexed(),
    new THREE.BoxGeometry(1, 0.24, 0.5).translate(0, 0.12, -0.25).toNonIndexed(),
  ])
  const aisleMesh = new THREE.InstancedMesh(stairGeo, new THREE.MeshStandardMaterial({ color: 0xd2d5d4, roughness: 0.85 }), aisles.length)
  const m4 = new THREE.Matrix4()
  const q4 = new THREE.Quaternion()
  const up = new THREE.Vector3(0, 1, 0)
  const sc = new THREE.Vector3()
  aisles.forEach((a, k) => {
    const q = pointU(a.u, a.d + a.depth / 2)
    m4.compose(new THREE.Vector3(q.x, a.y + 0.015, q.z), q4.setFromAxisAngle(up, Math.atan2(-q.nx, -q.nz)), sc.set(a.width + 0.04, a.rise / 0.48, a.depth))
    aisleMesh.setMatrixAt(k, m4)
  })
  aisleMesh.receiveShadow = true
  root.add(aisleMesh)

  // de pe culoarul dintre inele urci câteva trepte (zidul de 1,1 m din fața inelului de sus) și abia
  // apoi scara te duce în sus: 5 trepte de 22 cm, pe 1,25 m din culoar, la baza fiecărei scări
  const NST = 5
  const stH = (Y2(0) - WALK_Y) / NST
  const flight = mergeGeometries(Array.from({ length: NST }, (_, k) =>
    new THREE.BoxGeometry(1, (k + 1) * stH, 0.25).translate(0, ((k + 1) * stH) / 2, 0.625 - 0.125 - k * 0.25).toNonIndexed()))
  const starts = aisles.filter((a) => a.ring === 2 && a.r === 0)
  const flights = new THREE.InstancedMesh(flight, aisleMesh.material, starts.length)
  starts.forEach((a, k) => {
    const q = pointU(a.u, a.d - 0.625)
    m4.compose(new THREE.Vector3(q.x, WALK_Y, q.z), q4.setFromAxisAngle(up, Math.atan2(-q.nx, -q.nz)), sc.set(a.width + 0.04, 1, 1))
    flights.setMatrixAt(k, m4)
  })
  flights.receiveShadow = true
  flights.castShadow = !lowSpec
  root.add(flights)

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
  // la capete, elipsa din spatele gradenelor (BB) atinge fațada vitrată: grinda rămâne în fața ei
  const RB = { ax: BB.ax, az: Math.min(BB.az, CONCOURSE.az - 2.1) }
  ellipseBand(ringQ, RB.ax + 0.4, RB.az + 0.4, RING_TOP, RING_TOP + 1.0)
  ellipseRing(ringQ, RB.ax + 0.3, RB.az + 0.3, CONCOURSE.ax, CONCOURSE.az, RING_TOP)
  const ringMesh = new THREE.Mesh(ringQ.geometry(), white)
  ringMesh.castShadow = true
  root.add(ringMesh)
  // stâlpii colonadei: pornesc de pe platforma din spatele tribunei (mai jos în colțuri) și se
  // ramifică în V spre inelul acoperișului, ca „arborii” din fotografiile interioare
  const colN = 96
  const colGeo = []
  const colBase = (a) => out.topAtAngle(a) + 0.02
  const colPt = (a, y) => new THREE.Vector3((BB.ax + 1.6) * Math.cos(a), y, (BB.az + 1.6) * Math.sin(a))
  // trunchiurile și vitrajul stau în interiorul clădirii vitrate (la capete, elipsa din spatele
  // gradenelor ajunge până la peretele ei); ramurile urcă apoi spre inelul acoperișului
  const IN = { ax: Math.min(BB.ax + 1.6, CONCOURSE.ax - 0.9), az: Math.min(BB.az + 1.6, CONCOURSE.az - 0.9) }
  const colPtIn = (a, y) => new THREE.Vector3(IN.ax * Math.cos(a), y, IN.az * Math.sin(a))
  for (let k = 0; k < colN; k++) {
    const a = (k / colN) * Math.PI * 2
    const y0 = Math.min(colBase(a), RING_TOP)
    const yb = SPRING_Y - 5.2 // de aici pornesc ramurile
    const p0 = colPtIn(a, y0)
    const p1 = colPtIn(a, yb)
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
      const r = [IN.ax + 0.5, IN.az + 0.5]
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
    const beamRing = new THREE.TubeGeometry(ellipseCurve(IN.ax, IN.az, (RING_TOP + SPRING_Y) / 2), 256, 0.22, 5, true)
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
