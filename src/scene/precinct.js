// Incinta Stadionului „Ion Oblemenco”, modelată 3D după planurile arhitecților (DICO & ȚIGĂNAȘ),
// fotografiile de la inaugurare și OpenStreetMap:
//  – podiumul pietonal (promenada de asfalt) e un planșeu la +4,6 m, pe stâlpi; dedesubt, la nivelul
//    terenului, sunt parterul tehnic (porți cu grilaj de oțel) și parcările de sub peluze; în colțurile
//    de sud podiumul iese în consolă pe stâlpi în V, iar aleile auto intră sub el;
//  – Esplanada dinspre Bd. Ilie Balaci coboară de la podium spre bulevard în cinci trepte late, pe
//    linii ondulate, cu rampe pe laturi; spațiile verzi sunt ridicate, cu ziduri-bancă de beton;
//  – trei curți de lumină coboară până la parter (două cu gazon, una cu mașini);
//  – taluzuri înierbate spre Tribuna 1, scări cu podest și balustrade, lifturi pentru persoanele cu
//    dizabilități, porțile cu turnichete sub streașina fațadei (numele porților ca pe bilete);
//  – statuia lui Ion Oblemenco pe esplanadă.
import * as THREE from 'three'
import polygonClipping from 'polygon-clipping'
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js'
import { OUTLINE_D, ESPLANADE, GRASS, WELLS, STEPS as OSM_STEPS, STATUE } from '../data/precinct.js'
import { ACCESS_MAP, ACCESS_POINTS } from '../data/stadium-data.js'
import { paverMaterial, asphaltMaterial, grassMaterial, concreteMaterial } from './paving.js'
import { beam } from './geom.js'
import { carMeshes } from './cars.js'
import { buildStatue } from './statue.js'

export const DECK_Y = 4.6 // fața de sus a podiumului (parterul are ~3,8 m liberi)
const SLAB = 0.85 // grosimea planșeului + grinda de margine
export const FOOT = { ax: 97, az: 108.5 } // baza carcasei
const CONC = { ax: 91.5, az: 103 } // fațada vitrată (concourse)
const D2R = Math.PI / 180
const Y_LOW = 0.19 // nivelul trotuarului bulevardului
const BED = 0.34 // gazonul ridicat față de pavaj
const TREAD = 0.32
const RISE = (DECK_Y - Y_LOW) / 25 // 5 linii × 5 trepte pe esplanadă

// ─── Marginea podiumului ───────────────────────────────────────────────
// distanța față de baza carcasei: conturul clădirii din OSM + promenada, în consolă (14 m) în colțurile de sud
const OD = OUTLINE_D.map((v, i, a) => (a[(i + a.length - 1) % a.length] + 2 * v + a[(i + 1) % a.length]) / 4)
const EXT = [[25, 45], [133, 150]]
const sstep = (e0, e1, x) => {
  const t = Math.min(1, Math.max(0, (x - e0) / (e1 - e0)))
  return t * t * (3 - 2 * t)
}
const degOf = (t) => {
  let d = ((t / D2R) % 360 + 360) % 360
  if (d > 180) d -= 360
  return d
}
export function deckD(t) {
  const u = ((((t / (2 * Math.PI)) % 1) + 1) % 1) * 72
  const i = Math.floor(u)
  const f = u - i
  const o = OD[i % 72] * (1 - f) + OD[(i + 1) % 72] * f
  let D = Math.min(12, Math.max(6, o + 3.5))
  const d = degOf(t)
  for (const [a, b] of EXT) {
    const w = sstep(a - 6, a, d) * (1 - sstep(b, b + 6, d))
    D += (Math.max(D, 14) - D) * w
  }
  return D
}
const edgeXZ = (t, extra = 0) => {
  const D = deckD(t) + extra
  return [(FOOT.ax + D) * Math.cos(t), (FOOT.az + D) * Math.sin(t)]
}
// „distanța” unui punct față de baza carcasei (elipsa scalată care trece prin el)
function offsetOf(x, z) {
  let lo = -90
  let hi = 400
  for (let k = 0; k < 34; k++) {
    const m = (lo + hi) / 2
    if ((x / (FOOT.ax + m)) ** 2 + (z / (FOOT.az + m)) ** 2 > 1) lo = m
    else hi = m
  }
  return lo
}
const angleAt = (x, z, m) => Math.atan2(z / (FOOT.az + m), x / (FOOT.ax + m))
// normala spre exterior a marginii, la unghiul t
function edgeFrame(t) {
  const a = edgeXZ(t - 0.002)
  const b = edgeXZ(t + 0.002)
  const tx = b[0] - a[0]
  const tz = b[1] - a[1]
  const L = Math.hypot(tx, tz)
  return { tx: tx / L, tz: tz / L, nx: tz / L, nz: -tx / L }
}

// ce se află sub marginea podiumului, pe unghiuri (grade; 0 = est, 90 = sud)
const ZONES = [[-180, -128, 'bank'], [-128, -88, 'open'], [-88, 25, 'grille'], [25, 45, 'open'], [45, 129, 'south'], [129, 133, 'bank'], [133, 150, 'open'], [150, 181, 'bank']]
const zoneOf = (t) => {
  const d = degOf(t)
  for (const [a, b, k] of ZONES) if (d >= a && d < b) return k
  return 'bank'
}

// ─── Poligoane ─────────────────────────────────────────────────────────
const toPts = (flat) => {
  const o = []
  for (let i = 0; i < flat.length; i += 2) o.push([flat[i], flat[i + 1]])
  return o
}
const closeRing = (pts) => [...pts, pts[0]]
const mp = (pts) => [[closeRing(pts)]]
const PC = polygonClipping

function ringPip(ring, x, z) {
  let inside = false
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const [xi, zi] = ring[i]
    const [xj, zj] = ring[j]
    if ((zi > z) !== (zj > z) && x < ((xj - xi) * (z - zi)) / (zj - zi) + xi) inside = !inside
  }
  return inside
}
function bboxOf(multi) {
  let x0 = Infinity, z0 = Infinity, x1 = -Infinity, z1 = -Infinity
  for (const p of multi) for (const [x, z] of p[0]) {
    x0 = Math.min(x0, x); x1 = Math.max(x1, x); z0 = Math.min(z0, z); z1 = Math.max(z1, z)
  }
  return [x0, z0, x1, z1]
}
function inMulti(multi, x, z, bb) {
  if (bb && (x < bb[0] || x > bb[2] || z < bb[1] || z > bb[3])) return false
  for (const p of multi) {
    if (!ringPip(p[0], x, z)) continue
    let hole = false
    for (let k = 1; k < p.length; k++) if (ringPip(p[k], x, z)) { hole = true; break }
    if (!hole) return true
  }
  return false
}
const ellRing = (ax, az, n = 360) => closeRing(Array.from({ length: n }, (_, k) => [ax * Math.cos((k / n) * 2 * Math.PI), az * Math.sin((k / n) * 2 * Math.PI)]))

// ─── Înălțimile esplanadei ─────────────────────────────────────────────
// rampele de pe laturi coboară uniform; spre aleea auto (est) și spre drumul de serviciu (vest)
// terenul cade, ca în fotografii (taluzul de gazon de lângă intrarea în parcare)
const Z_TOP = 129
const Z_BOT = 177
const Hs = (z) => (z <= Z_TOP ? DECK_Y : z >= Z_BOT ? Y_LOW : DECK_Y + ((Y_LOW - DECK_Y) * (z - Z_TOP)) / (Z_BOT - Z_TOP))
const sideH = (x, z) => Math.max(Y_LOW, Math.min(Hs(z), Y_LOW + 0.3 * (95 - x), Y_LOW + 0.3 * (x + 63.5)))
// platoul din mijloc: cinci linii ondulate de câte cinci trepte (ca pe esplanada reală)
const CX0 = -37
const CX1 = 47
const LINES = [131, 142, 152.5, 162.5, 171.5]
const lineZ = (k, x) => LINES[k] + 1.3 * Math.sin(x * 0.07 + k * 1.7) + 0.6 * Math.sin(x * 0.17 + k * 0.6) - 0.025 * x

// ─── Construcția ───────────────────────────────────────────────────────
class Buf {
  constructor() {
    this.pos = []
    this.uv = []
  }
  tri(a, b, c, ua, ub, uc) {
    this.pos.push(...a, ...b, ...c)
    this.uv.push(...ua, ...ub, ...uc)
  }
  // patrulater orientat spre (nx, ny, nz)
  quad(a, b, c, d, ua, ub, uc, ud, n) {
    const e1 = [b[0] - a[0], b[1] - a[1], b[2] - a[2]]
    const e2 = [d[0] - a[0], d[1] - a[1], d[2] - a[2]]
    const cx = e1[1] * e2[2] - e1[2] * e2[1]
    const cy = e1[2] * e2[0] - e1[0] * e2[2]
    const cz = e1[0] * e2[1] - e1[1] * e2[0]
    if (cx * n[0] + cy * n[1] + cz * n[2] >= 0) {
      this.tri(a, b, c, ua, ub, uc)
      this.tri(a, c, d, ua, uc, ud)
    } else {
      this.tri(a, c, b, ua, uc, ub)
      this.tri(a, d, c, ua, ud, uc)
    }
  }
  geometry() {
    if (!this.pos.length) return null
    const g = new THREE.BufferGeometry()
    g.setAttribute('position', new THREE.Float32BufferAttribute(this.pos, 3))
    g.setAttribute('uv', new THREE.Float32BufferAttribute(this.uv, 2))
    g.computeVertexNormals()
    return g
  }
}

// triangulează un multipoligon, cu înălțimea dată de h(x, z) (fața în sus sau în jos)
function fillMulti(buf, multi, h, { down = false } = {}) {
  for (const p of multi) {
    const contour = p[0].slice(0, -1).map(([x, z]) => new THREE.Vector2(x, z))
    const holes = p.slice(1).map((r) => r.slice(0, -1).map(([x, z]) => new THREE.Vector2(x, z)))
    if (contour.length < 3) continue
    const all = [...contour, ...holes.flat()]
    let tris
    try {
      tris = THREE.ShapeUtils.triangulateShape(contour, holes)
    } catch {
      continue
    }
    for (const [i, j, k] of tris) {
      const P = [all[i], all[j], all[k]].map((v) => [v.x, h(v.x, v.y), v.y])
      // fața în sus: produsul vectorial are y pozitiv
      const ux = P[1][0] - P[0][0], uz = P[1][2] - P[0][2]
      const vx = P[2][0] - P[0][0], vz = P[2][2] - P[0][2]
      const ny = uz * vx - ux * vz
      const order = (ny >= 0) !== down ? [0, 1, 2] : [0, 2, 1]
      const [a, b, c] = order.map((o) => P[o])
      buf.tri(a, b, c, [a[0], a[2]], [b[0], b[2]], [c[0], c[2]])
    }
  }
}

// împarte un multipoligon pe o grilă (pentru suprafețele curbe: pante, gazon)
function gridSplit(multi, cell) {
  const [x0, z0, x1, z1] = bboxOf(multi)
  const edges = []
  for (const p of multi) for (const r of p) for (let i = 0; i < r.length - 1; i++) edges.push([Math.min(r[i][0], r[i + 1][0]), Math.min(r[i][1], r[i + 1][1]), Math.max(r[i][0], r[i + 1][0]), Math.max(r[i][1], r[i + 1][1])])
  const out = []
  for (let x = Math.floor(x0 / cell) * cell; x < x1; x += cell) {
    for (let z = Math.floor(z0 / cell) * cell; z < z1; z += cell) {
      const crosses = edges.some((e) => e[0] <= x + cell && e[2] >= x && e[1] <= z + cell && e[3] >= z)
      const sq = [[x, z], [x + cell, z], [x + cell, z + cell], [x, z + cell], [x, z]]
      if (!crosses) {
        if (inMulti(multi, x + cell / 2, z + cell / 2)) out.push([sq])
        continue
      }
      const part = PC.intersection(multi, [[sq]])
      for (const q of part) out.push(q)
    }
  }
  return out
}

// zgomot de valoare (pentru variația de culoare a gazonului)
function hash2(i, j) {
  const h = Math.sin(i * 127.1 + j * 311.7) * 43758.5453
  return h - Math.floor(h)
}
function vnoise(x, z) {
  const i = Math.floor(x), j = Math.floor(z)
  const fx = x - i, fz = z - j
  const sx = fx * fx * (3 - 2 * fx), sz = fz * fz * (3 - 2 * fz)
  const a = hash2(i, j) + (hash2(i + 1, j) - hash2(i, j)) * sx
  const b = hash2(i, j + 1) + (hash2(i + 1, j + 1) - hash2(i, j + 1)) * sx
  return a + (b - a) * sz
}
// gazonul real nu e uniform: pete mai închise / mai deschise, la 10–30 m și la 2–3 m
function grassColors(g) {
  if (!g) return g
  const p = g.attributes.position
  const c = new Float32Array(p.count * 3)
  for (let i = 0; i < p.count; i++) {
    const x = p.getX(i), z = p.getZ(i)
    const v = 0.78 + 0.26 * vnoise(x * 0.06, z * 0.06) + 0.1 * vnoise(x * 0.45 + 7, z * 0.45 + 3)
    const dry = Math.max(0, vnoise(x * 0.11 + 31, z * 0.11 + 17) - 0.68) * 0.9
    c[i * 3] = v + dry * 0.35
    c[i * 3 + 1] = v + dry * 0.12
    c[i * 3 + 2] = v * 0.95
  }
  g.setAttribute('color', new THREE.BufferAttribute(c, 3))
  return g
}

function mesh(buf, mat, { cast = false, receive = true } = {}) {
  const g = buf.geometry ? buf.geometry() : buf
  if (!g) return null
  const m = new THREE.Mesh(g, mat)
  m.castShadow = cast
  m.receiveShadow = receive
  return m
}

// textura de balustradă / grilaj cu bare verticale (alpha)
function barsTexture({ gap = 0.11, bar = 0.022, frame = true, h = 1.1 } = {}) {
  const c = document.createElement('canvas')
  c.width = 256
  c.height = 256
  const g = c.getContext('2d')
  g.clearRect(0, 0, 256, 256)
  g.fillStyle = '#b7bdc2'
  const ppm = 256 / 2 // dala de textură: 2 m pe orizontală
  for (let x = 0; x < 2; x += gap) g.fillRect(x * ppm, 0, Math.max(2, bar * ppm), 256)
  if (frame) {
    const py = 256 / h
    g.fillRect(0, 0, 256, Math.max(3, 0.05 * py))
    g.fillRect(0, 256 - Math.max(3, 0.05 * py), 256, Math.max(3, 0.05 * py))
    g.fillRect(0, 0, 5, 256)
  }
  const t = new THREE.CanvasTexture(c)
  t.colorSpace = THREE.SRGBColorSpace
  t.wrapS = THREE.RepeatWrapping
  // fără mipmap-uri: altfel barele subțiri dispar (alphaTest) când sunt văzute de departe
  t.generateMipmaps = false
  t.minFilter = THREE.LinearFilter
  return t
}

// vitrinele parterului din curțile de lumină: sticlă închisă cu montanți
function storefrontTexture() {
  const c = document.createElement('canvas')
  c.width = 256
  c.height = 256
  const g = c.getContext('2d')
  const grd = g.createLinearGradient(0, 0, 0, 256)
  grd.addColorStop(0, '#3b4c58')
  grd.addColorStop(1, '#1d262d')
  g.fillStyle = grd
  g.fillRect(0, 0, 256, 256)
  g.fillStyle = 'rgba(255,255,255,0.07)'
  g.fillRect(0, 20, 256, 70)
  g.fillStyle = '#8f979d'
  for (let x = 0; x < 256; x += 64) g.fillRect(x, 0, 5, 256)
  g.fillRect(0, 0, 256, 6)
  g.fillRect(0, 186, 256, 5)
  g.fillRect(0, 250, 256, 6)
  const t = new THREE.CanvasTexture(c)
  t.colorSpace = THREE.SRGBColorSpace
  t.wrapS = THREE.RepeatWrapping
  return t
}

// ─── Scările ───────────────────────────────────────────────────────────
// două rampe de câte 13 trepte (16,7 × 31 cm) cu podest; `s` = distanța de la marginea de sus
const ST_T = 0.31
const ST_N = 26
const ST_R = DECK_Y / ST_N
function stairProfile(landing) {
  const f1 = 12 * ST_T
  const total = 24 * ST_T + landing
  return {
    total,
    h(s) {
      if (s < 0) return DECK_Y
      if (s < f1) return DECK_Y - (Math.floor(s / ST_T) + 1) * ST_R
      if (s < f1 + landing) return DECK_Y - 13 * ST_R
      if (s < total) return DECK_Y - (13 + Math.floor((s - f1 - landing) / ST_T) + 1) * ST_R
      return 0
    },
    // marginile treptelor (unde se schimbă înălțimea), de la deal la vale
    edges() {
      const out = []
      for (let i = 0; i <= 12; i++) out.push(i * ST_T)
      for (let j = 0; j <= 12; j++) out.push(f1 + landing + j * ST_T)
      return out
    },
  }
}

// ─── Pentru traseul spre loc (nav/route.js): intrările pe podium și porțile ───
let accessInfo = null
// scările (de la teren la podium), liftul pentru persoanele cu dizabilități și esplanada
export const precinctAccess = () => accessInfo
// punctul de la distanța D față de baza carcasei, la unghiul t (D < 0: sub streașină / în interior)
export const deckPoint = (t, D) => [(FOOT.ax + D) * Math.cos(t), (FOOT.az + D) * Math.sin(t)]
export const angleOfPoint = (x, z) => Math.atan2(z / FOOT.az, x / FOOT.ax)
// accesele cu turnichete de pe planul stadionului, cu numele porții (ca pe indicatoare)
export function gatePoints() {
  const { cx, cy, rx, ry } = ACCESS_MAP
  return ACCESS_POINTS.map(([mx, my, n, kind], i) => {
    const t = Math.atan2(-(mx - cx) / rx, (my - cy) / ry)
    const [title, sub] = gateName((t * 180) / Math.PI, kind)
    const [x, z] = deckPoint(t, -3.4)
    return { i, t, n, kind: kind || 'public', title, sub, x, z }
  })
}

// ─── Pentru împrejurimi (world.js / city.js): ce acoperă incinta ─────
let lastSurfaceAt = null
let espUnion = null
const espBB = () => {
  if (!espUnion) {
    espUnion = PC.union(mp(toPts(ESPLANADE)), mp(toPts(GRASS.west)), mp(toPts(GRASS.eastA)), mp(toPts(GRASS.eastB)))
    espUnion.bb = bboxOf(espUnion)
  }
  return espUnion
}
// înălțimea suprafeței incintei (podium, esplanadă, gazon, scări) sau null în afara ei
export const precinctSurface = (x, z) => (lastSurfaceAt ? lastSurfaceAt(x, z) : null)
// e punctul în incintă (podiumul + taluzul / aleea din jur, esplanada)?
export function inPrecinct(x, z, pad = 0) {
  const m = offsetOf(x, z)
  if (m <= deckD(angleAt(x, z, m)) + 9.5 + pad) return true
  const e = espBB()
  return inMulti(e, x, z, [e.bb[0] - pad, e.bb[1] - pad, e.bb[2] + pad, e.bb[3] + pad])
}
// contururile incintei (pentru masca copacilor din imaginea satelit)
export function precinctRings() {
  const outerRing = Array.from({ length: 240 }, (_, k) => edgeXZ((k / 240) * 2 * Math.PI, 9.5)).flat()
  return [outerRing, ESPLANADE, GRASS.west, GRASS.eastA, GRASS.eastB]
}
// copacii de pe esplanadă și din curțile de lumină (ca în imaginile din satelit)
const TREES = [[-50, 150], [-47, 128], [-53, 162], [78, 150], [69, 166], [84, 128], [74, 140], [66, 112], [60, 128], [-30, 116], [-1, 122]]
export function precinctTrees() {
  return TREES.map(([x, z]) => [x, z, lastSurfaceAt?.(x, z)?.y ?? 0])
}

export function buildPrecinct(root, { lowSpec = false } = {}) {
  const group = new THREE.Group()
  group.name = 'precinct'
  root.add(group)

  // ── scările: cele din OSM (paralele cu fațada) și cele de la accese (perpendiculare)
  const stairs = []
  const addStair = (topX, topZ, ax, az, width, landing) => {
    const prof = stairProfile(landing)
    stairs.push({ top: [topX, topZ], ax, az, px: -az, pz: ax, w: width, prof })
  }
  for (const st of OSM_STEPS) {
    const [fx, fz] = st.down ? st.from : st.to
    const [tx, tz] = st.down ? st.to : st.from
    const L = Math.hypot(tx - fx, tz - fz)
    addStair(fx, fz, (tx - fx) / L, (tz - fz) / L, 4, Math.max(1.2, L - 24 * ST_T))
  }
  // [unghi, lățime]: intrarea principală (Tribuna 1 / VIP), oaspeții, colțurile
  for (const [deg, w] of [[180, 14], [157, 6], [-157, 6], [-126, 6], [-47, 6], [20, 6]]) {
    const t = deg * D2R
    const [ex, ez] = edgeXZ(t, -0.02)
    const f = edgeFrame(t)
    addStair(ex, ez, f.nx, f.nz, w, 1.8)
  }
  const inStair = (s, x, z, pad = 0) => {
    const dx = x - s.top[0]
    const dz = z - s.top[1]
    const a = dx * s.ax + dz * s.az
    const p = dx * s.px + dz * s.pz
    return a >= -pad && a <= s.prof.total + pad && Math.abs(p) <= s.w / 2 + pad ? a : null
  }

  // ── podestele de sus ale scărilor OSM (legătura cu podiumul) și pasarelele lifturilor
  const bridges = []
  for (const s of stairs.slice(0, OSM_STEPS.length)) {
    const [x, z] = s.top
    const L = [x - s.px * s.w / 2, z - s.pz * s.w / 2]
    const R = [x + s.px * s.w / 2, z + s.pz * s.w / 2]
    const back = (p) => {
      const m = offsetOf(p[0], p[1])
      return edgeXZ(angleAt(p[0], p[1], m), -1.2)
    }
    // puțin peste marginea treptei de sus, ca podestul să o atingă
    const L0 = [L[0] + s.ax * 0.02, L[1] + s.az * 0.02]
    const R0 = [R[0] + s.ax * 0.02, R[1] + s.az * 0.02]
    bridges.push([L0, R0, back(R), back(L)])
  }
  const LIFTS = [36, -36, -141].map((deg) => {
    const t = deg * D2R
    const f = edgeFrame(t)
    const [cx, cz] = edgeXZ(t, 3.0)
    const [ex, ez] = edgeXZ(t, -1)
    const w = 1.1
    bridges.push([[ex - f.tx * w, ez - f.tz * w], [ex + f.tx * w, ez + f.tz * w], [cx + f.tx * w - f.nx * 1.3, cz + f.tz * w - f.nz * 1.3], [cx - f.tx * w - f.nx * 1.3, cz - f.tz * w - f.nz * 1.3]])
    return { x: cx, z: cz, f, t }
  })
  accessInfo = {
    stairs: stairs.map((st, k) => ({
      top: st.top, bottom: [st.top[0] + st.ax * (st.prof.total + 0.6), st.top[1] + st.az * (st.prof.total + 0.6)],
      w: st.w, osm: k < OSM_STEPS.length,
    })),
    lifts: LIFTS.map((l) => ({ bottom: [l.x + l.f.nx * 1.6, l.z + l.f.nz * 1.6], top: edgeXZ(l.t, -1.5) })),
    // esplanada dinspre Bd. Ilie Balaci: de la trotuar urcă în trepte până la nivelul podiumului
    esplanade: [-28, 4, 38].map((x) => ({ bottom: [x, 181], top: [x, 124] })),
  }

  // ── poligoanele
  const N = 720
  const outer = closeRing(Array.from({ length: N }, (_, k) => edgeXZ((k / N) * 2 * Math.PI)))
  const wells = { A: toPts(WELLS.A), B: toPts(WELLS.B), C: toPts(WELLS.C) }
  const wellsMP = PC.union(...Object.values(wells).map(mp))
  const bridgesMP = PC.union(...bridges.map(mp))
  let deck = PC.difference(PC.union([[outer]], bridgesMP), [[ellRing(CONC.ax, CONC.az)]], wellsMP)
  const deckBB = bboxOf(deck)
  const esp = mp(toPts(ESPLANADE))
  const lawnsRaw = { west: mp(toPts(GRASS.west)), eastA: mp(toPts(GRASS.eastA)), eastB: mp(toPts(GRASS.eastB)) }
  const upperOut = PC.difference(PC.union(esp, ...Object.values(lawnsRaw)), [[outer]], wellsMP, bridgesMP)
  const lawns = Object.fromEntries(Object.entries(lawnsRaw).map(([k, v]) => [k, PC.intersection(v, upperOut)]))
  const lawnsAll = PC.union(...Object.values(lawns))
  const paved = PC.difference(upperOut, lawnsAll)
  const strip = [[[CX0, 95], [CX1, 95], [CX1, 190], [CX0, 190], [CX0, 95]]]
  const centerMP = PC.intersection(paved, [strip])
  const sideMP = PC.difference(paved, [strip])

  // benzile platoului din mijloc (trepte și platforme), de la podium spre bulevard
  const xs = []
  for (let x = CX0 - 1; x <= CX1 + 1.001; x += 1) xs.push(x)
  const bandPoly = (top, bot) => [[...xs.map((x) => [x, top(x)]), ...xs.slice().reverse().map((x) => [x, bot(x)]), [xs[0], top(xs[0])]]]
  const bands = []
  {
    let prev = () => 95
    let level = DECK_Y
    for (let k = 0; k < 5; k++) {
      for (let j = 0; j < 5; j++) {
        const c = (x) => lineZ(k, x) + j * TREAD
        bands.push({ poly: bandPoly(prev, c), y: level })
        level -= RISE
        prev = c
      }
    }
    bands.push({ poly: bandPoly(prev, () => 190), y: level })
  }
  const bandPatches = bands
    .map((b) => ({ multi: PC.intersection(centerMP, [b.poly]), y: b.y }))
    .filter((b) => b.multi.length)
    .map((b) => ({ ...b, bb: bboxOf(b.multi) }))

  // ── înălțimea suprafeței în orice punct (null = terenul)
  const wellFloor = { A: 0.03, B: 0.1, C: 0.1 }
  const lawnBB = Object.fromEntries(Object.entries(lawns).map(([k, v]) => [k, bboxOf(v)]))
  const sideBB = bboxOf(sideMP)
  const wellAt = (x, z) => {
    for (const k of ['A', 'B', 'C']) if (ringPip(wells[k], x, z)) return k
    return null
  }
  const inConc = (x, z) => (x / CONC.ax) ** 2 + (z / CONC.az) ** 2 < 1
  const bridgeAt = (x, z) => bridges.some((b) => ringPip(b, x, z))
  const deckAt = (x, z) => {
    if (x < deckBB[0] - 1 || x > deckBB[2] + 1 || z < deckBB[1] - 1 || z > deckBB[3] + 1) return false
    if (inConc(x, z)) return false
    const m = offsetOf(x, z)
    return m <= deckD(angleAt(x, z, m)) || bridgeAt(x, z)
  }
  function surfaceAt(x, z) {
    const w = wellAt(x, z)
    if (w) return { y: wellFloor[w], kind: 'well', well: w }
    if (deckAt(x, z)) return { y: DECK_Y, kind: 'deck' }
    for (const s of stairs) {
      const a = inStair(s, x, z)
      if (a !== null) return { y: s.prof.h(a), kind: 'stair' }
    }
    for (const [k, m] of Object.entries(lawns)) if (inMulti(m, x, z, lawnBB[k])) return { y: sideH(x, z) + BED, kind: 'lawn' }
    for (const b of bandPatches) if (inMulti(b.multi, x, z, b.bb)) return { y: b.y, kind: 'band' }
    if (inMulti(sideMP, x, z, sideBB)) return { y: sideH(x, z), kind: 'side' }
    return null
  }

  lastSurfaceAt = surfaceAt

  // ── materialele
  const size = lowSpec ? 512 : 1024
  const M = {
    asphalt: asphaltMaterial({ size }),
    plaza: paverMaterial('dale', { size }),
    lawn: Object.assign(grassMaterial({ size }), { vertexColors: true }),
    riser: concreteMaterial({ tone: 112, color: 0xd6d8dc }),
    wall: concreteMaterial({ tone: 196 }),
    seat: concreteMaterial({ tone: 96, color: 0xb9bcc2 }),
    white: concreteMaterial({ tone: 226 }),
    ceiling: concreteMaterial({ tone: 172 }),
    granite: paverMaterial('dale', { size: 512 }),
    ground: asphaltMaterial({ size: lowSpec ? 512 : 1024 }),
    steel: new THREE.MeshStandardMaterial({ color: 0xa9b0b6, metalness: 0.75, roughness: 0.32 }),
    dark: new THREE.MeshStandardMaterial({ color: 0x2b2f33, metalness: 0.5, roughness: 0.5 }),
    glass: new THREE.MeshStandardMaterial({ color: 0xcfe3ea, metalness: 0.2, roughness: 0.05, transparent: true, opacity: 0.28, depthWrite: false, side: THREE.DoubleSide }),
  }
  for (const k of ['asphalt', 'plaza', 'granite', 'ground']) M[k].polygonOffset = false
  M.plaza.side = THREE.FrontSide

  // ── suprafețele de sus
  const B = { asphalt: new Buf(), plaza: new Buf(), lawn: new Buf(), ceiling: new Buf(), granite: new Buf() }
  const south = [[[0, 0], ...Array.from({ length: 43 }, (_, k) => {
    const t = (45 + k * 2) * D2R
    return [400 * Math.cos(t), 400 * Math.sin(t)]
  }), [0, 0]]]
  fillMulti(B.asphalt, PC.difference(deck, [south]), () => DECK_Y)
  fillMulti(B.plaza, PC.intersection(deck, [south]), () => DECK_Y)
  // tavanul parterului (fața de jos a planșeului)
  fillMulti(B.ceiling, deck, () => DECK_Y - SLAB, { down: true })
  for (const b of bandPatches) fillMulti(B.plaza, b.multi, () => b.y)
  fillMulti(B.plaza, gridSplit(sideMP, 4), sideH)
  for (const m of Object.values(lawns)) fillMulti(B.lawn, gridSplit(m, 3), (x, z) => sideH(x, z) + BED)
  // fundul curților de lumină
  const wellGround = new Buf()
  fillMulti(wellGround, mp(wells.A), () => wellFloor.A)
  fillMulti(B.lawn, PC.union(mp(wells.B), mp(wells.C)), () => wellFloor.B)

  // ── pereții, balustradele și fronturile parterului, pe conturul fiecărei suprafețe
  const W = { wall: new Buf(), seat: new Buf(), white: new Buf(), granite: new Buf(), seatTop: new Buf() }
  const rails = [] // [x0, z0, y0, x1, z1, y1, nx, nz, tip]
  const front = [] // bucățile din marginea podiumului sub care e parterul liber
  const BAR_TYPES = { open: 'parapet', grille: 'bars', bank: 'parapet', south: 'glass', glass: 'glass' }
  function boundary(multi, selfY, kind) {
    for (const p of multi) {
      for (const ring of p) {
        const pts = ring.slice(0, -1)
        if (pts.length < 3) continue
        // normala spre exterior: verificăm sensul inelului pe un segment
        let flip = 1
        {
          let best = 0
          let bi = 0
          for (let i = 0; i < pts.length; i++) {
            const a = pts[i], b = pts[(i + 1) % pts.length]
            const l = Math.hypot(b[0] - a[0], b[1] - a[1])
            if (l > best) { best = l; bi = i }
          }
          const a = pts[bi], b = pts[(bi + 1) % pts.length]
          const tx = (b[0] - a[0]) / best, tz = (b[1] - a[1]) / best
          const mx = (a[0] + b[0]) / 2, mz = (a[1] + b[1]) / 2
          if (inMulti(multi, mx + tz * 0.05, mz - tx * 0.05)) flip = -1
        }
        let acc = 0
        for (let i = 0; i < pts.length; i++) {
          const a = pts[i], b = pts[(i + 1) % pts.length]
          const len = Math.hypot(b[0] - a[0], b[1] - a[1])
          if (len < 1e-4) continue
          const tx = (b[0] - a[0]) / len, tz = (b[1] - a[1]) / len
          const nx = tz * flip, nz = -tx * flip
          const n = Math.max(1, Math.ceil(len / 1.0))
          for (let k = 0; k < n; k++) {
            const p0 = [a[0] + (b[0] - a[0]) * (k / n), a[1] + (b[1] - a[1]) * (k / n)]
            const p1 = [a[0] + (b[0] - a[0]) * ((k + 1) / n), a[1] + (b[1] - a[1]) * ((k + 1) / n)]
            const s0 = acc + (len * k) / n, s1 = acc + (len * (k + 1)) / n
            edgePiece(p0, p1, nx, nz, s0, s1, selfY, kind)
          }
          acc += len
        }
      }
    }
  }
  const outY = (x, z, nx, nz) => {
    const s = surfaceAt(x + nx * 0.12, z + nz * 0.12)
    return s
  }
  function edgePiece(p0, p1, nx, nz, s0, s1, selfY, kind) {
    const mx = (p0[0] + p1[0]) / 2, mz = (p0[1] + p1[1]) / 2
    const yIn0 = selfY(p0[0] - nx * 0.05, p0[1] - nz * 0.05)
    const yIn1 = selfY(p1[0] - nx * 0.05, p1[1] - nz * 0.05)
    const o0 = outY(p0[0], p0[1], nx, nz)
    const o1 = outY(p1[0], p1[1], nx, nz)
    const om = outY(mx, mz, nx, nz)
    const yo0 = o0 ? o0.y : 0
    const yo1 = o1 ? o1.y : 0
    const n3 = [nx, 0, nz]
    if (Math.max(yIn0 - yo0, yIn1 - yo1) < 0.02) return
    // marginea podiumului: sub ea parterul e liber (front), cu grinda albă de margine
    if (kind === 'deck') {
      const m = offsetOf(mx, mz)
      const t = angleAt(mx, mz, m)
      const zone = zoneOf(t)
      const low = !om || om.kind === 'well'
      const frontType = om?.kind === 'well' ? (om.well === 'A' ? 'open' : 'glass') : zone === 'south' ? 'glass' : zone
      if (low && frontType !== 'bank') {
        const yb = DECK_Y - SLAB
        W.white.quad([p0[0], yb, p0[1]], [p1[0], yb, p1[1]], [p1[0], DECK_Y + 0.02, p1[1]], [p0[0], DECK_Y + 0.02, p0[1]], [s0, yb], [s1, yb], [s1, DECK_Y], [s0, DECK_Y], n3)
        front.push({ p0, p1, nx, nz, type: frontType, floor: om ? om.y : 0.02, s0 })
        rails.push([p0[0], p0[1], DECK_Y, p1[0], p1[1], DECK_Y, nx, nz, BAR_TYPES[frontType] || 'bars'])
        return
      }
    }
    // perete de sprijin / zid-bancă / contratreaptă
    const mat = kind === 'lawn' ? W.seat : kind === 'band' && om && om.kind === 'band' ? W.granite : W.wall
    mat.quad([p0[0], yo0, p0[1]], [p1[0], yo1, p1[1]], [p1[0], yIn1, p1[1]], [p0[0], yIn0, p0[1]], [s0, yo0], [s1, yo1], [s1, yIn1], [s0, yIn0], n3)
    if (kind === 'lawn') {
      // capacul zidului-bancă, 30 cm lățime, 4 cm peste gazon
      const ix = -nx * 0.3, iz = -nz * 0.3
      W.seatTop.quad([p0[0], yIn0 + 0.04, p0[1]], [p1[0], yIn1 + 0.04, p1[1]], [p1[0] + ix, yIn1 + 0.04, p1[1] + iz], [p0[0] + ix, yIn0 + 0.04, p0[1] + iz], [s0, 0], [s1, 0], [s1, 0.3], [s0, 0.3], [0, 1, 0])
      W.seat.quad([p0[0], yIn0, p0[1]], [p1[0], yIn1, p1[1]], [p1[0], yIn1 + 0.04, p1[1]], [p0[0], yIn0 + 0.04, p0[1]], [s0, yIn0], [s1, yIn1], [s1, yIn1 + 0.04], [s0, yIn0 + 0.04], n3)
    }
    // balustradă unde diferența de nivel trece de 70 cm
    if (Math.min(yIn0 - yo0, yIn1 - yo1) > 0.7) {
      let tip = 'glass'
      if (kind === 'deck') {
        const m = offsetOf(mx, mz)
        tip = BAR_TYPES[zoneOf(angleAt(mx, mz, m))] || 'bars'
      }
      if (kind === 'lawn') tip = 'none'
      if (tip !== 'none') rails.push([p0[0], p0[1], yIn0, p1[0], p1[1], yIn1, nx, nz, tip])
    }
  }
  boundary(deck, () => DECK_Y, 'deck')
  for (const b of bandPatches) boundary(b.multi, () => b.y, 'band')
  boundary(sideMP, sideH, 'side')
  for (const m of Object.values(lawns)) boundary(m, (x, z) => sideH(x, z) + BED, 'lawn')

  // ── treptele scărilor (podiumul ↔ terenul)
  const railsGeo = []
  const ST = { tread: new Buf(), side: new Buf() }
  for (const s of stairs) {
    const P = (a, p, y) => [s.top[0] + s.ax * a + s.px * p, y, s.top[1] + s.az * a + s.pz * p]
    const hw = s.w / 2
    const edges = s.prof.edges()
    const segs = []
    // tronsoanele cu înălțime constantă: [a0, a1, y]
    for (let i = 0; i < edges.length - 1; i++) segs.push([edges[i], edges[i + 1], s.prof.h((edges[i] + edges[i + 1]) / 2)])
    for (const [a0, a1, y] of segs) {
      ST.tread.quad(P(a0, -hw, y), P(a0, hw, y), P(a1, hw, y), P(a1, -hw, y), [-hw, a0], [hw, a0], [hw, a1], [-hw, a1], [0, 1, 0])
      // contratreapta de la începutul tronsonului (fața spre vale)
      const yPrev = s.prof.h(a0 - 0.01)
      if (a0 > 0 && yPrev > y + 0.01) ST.side.quad(P(a0, -hw, y), P(a0, hw, y), P(a0, hw, yPrev), P(a0, -hw, yPrev), [-hw, y], [hw, y], [hw, yPrev], [-hw, yPrev], [s.ax, 0, s.az])
      // pereții laterali (până la teren)
      for (const sd of [-1, 1]) {
        const off = sd * (hw + 0.25)
        ST.side.quad(P(a0, off, 0), P(a1, off, 0), P(a1, off, y + 0.15), P(a0, off, y + 0.15), [a0, 0], [a1, 0], [a1, y], [a0, y], [s.px * sd, 0, s.pz * sd])
        ST.side.quad(P(a0, sd * hw, y), P(a1, sd * hw, y), P(a1, sd * hw, y + 0.15), P(a0, sd * hw, y + 0.15), [a0, 0], [a1, 0], [a1, 0.15], [a0, 0.15], [-s.px * sd, 0, -s.pz * sd])
        ST.side.quad(P(a0, sd * hw, y + 0.15), P(a1, sd * hw, y + 0.15), P(a1, off, y + 0.15), P(a0, off, y + 0.15), [a0, 0], [a1, 0], [a1, 0.25], [a0, 0.25], [0, 1, 0])
      }
    }
    // ultima contratreaptă (spre teren)
    const yl = s.prof.h(s.prof.total - 0.01)
    ST.side.quad(P(s.prof.total, -hw, 0), P(s.prof.total, hw, 0), P(s.prof.total, hw, yl), P(s.prof.total, -hw, yl), [0, 0], [1, 0], [1, 1], [0, 1], [s.ax, 0, s.az])
    // mâna curentă de oțel pe ambele părți (și la mijloc pe scările late)
    const nose = (a) => (s.prof.h(a - 0.31) + s.prof.h(a) + s.prof.h(a + 0.31)) / 3 + 0.95
    const railAt = (off) => {
      const pts = []
      for (let a = 0.15; a < s.prof.total; a += 0.6) pts.push(P(a, off, nose(a)))
      pts.push(P(s.prof.total - 0.1, off, nose(s.prof.total - 0.2)))
      for (let i = 0; i < pts.length - 1; i++) railsGeo.push(beam(pts[i], pts[i + 1], 0.025, 6))
      for (let i = 0; i < pts.length; i += 2) railsGeo.push(beam([pts[i][0], pts[i][1] - 0.95, pts[i][2]], pts[i], 0.02, 5))
    }
    railAt(-hw + 0.08)
    railAt(hw - 0.08)
    if (s.w > 8) {
      railAt(0)
      railAt(-s.w / 4)
      railAt(s.w / 4)
    }
  }

  // ── balustradele
  const barTex = barsTexture({ gap: 0.12, bar: 0.03 })
  const R = { bars: new Buf(), glass: new Buf(), parapet: new Buf() }
  const capGeo = []
  for (const [x0, z0, y0, x1, z1, y1, nx, nz, tip] of rails) {
    const L = Math.hypot(x1 - x0, z1 - z0)
    if (tip === 'bars') {
      R.bars.quad([x0, y0, z0], [x1, y1, z1], [x1, y1 + 1.1, z1], [x0, y0 + 1.1, z0], [0, 0], [L / 2, 0], [L / 2, 1], [0, 1], [nx, 0, nz])
      capGeo.push(beam([x0, y0 + 1.1, z0], [x1, y1 + 1.1, z1], 0.03, 5))
    } else if (tip === 'glass') {
      R.glass.quad([x0, y0 + 0.06, z0], [x1, y1 + 0.06, z1], [x1, y1 + 1.05, z1], [x0, y0 + 1.05, z0], [0, 0], [1, 0], [1, 1], [0, 1], [nx, 0, nz])
      capGeo.push(beam([x0 - nx * 0.03, y0 + 1.07, z0 - nz * 0.03], [x1 - nx * 0.03, y1 + 1.07, z1 - nz * 0.03], 0.028, 5))
    } else {
      // parapet de beton, 1,1 m, gros de 25 cm
      const ix = -nx * 0.25, iz = -nz * 0.25
      const h = 1.1
      R.parapet.quad([x0, y0, z0], [x1, y1, z1], [x1, y1 + h, z1], [x0, y0 + h, z0], [0, y0], [L, y1], [L, y1 + h], [0, y0 + h], [nx, 0, nz])
      R.parapet.quad([x0 + ix, y0, z0 + iz], [x1 + ix, y1, z1 + iz], [x1 + ix, y1 + h, z1 + iz], [x0 + ix, y0 + h, z0 + iz], [0, y0], [L, y1], [L, y1 + h], [0, y0 + h], [-nx, 0, -nz])
      R.parapet.quad([x0, y0 + h, z0], [x1, y1 + h, z1], [x1 + ix, y1 + h, z1 + iz], [x0 + ix, y0 + h, z0 + iz], [0, 0], [L, 0], [L, 0.25], [0, 0.25], [0, 1, 0])
    }
  }

  // ── fronturile parterului: stâlpi (în V sub console), grilaje de oțel, vitrine, mașini
  const colGeo = []
  const grille = new Buf()
  const shop = new Buf()
  const groundCars = []
  const bayLines = []
  const lightPanels = []
  {
    // bucățile consecutive de același tip formează un front; stâlpii la ~8,4 m
    let run = null
    const runs = []
    for (const f of front) {
      const key = f.type
      if (run && run.type === key && Math.hypot(f.p0[0] - run.last[0], f.p0[1] - run.last[1]) < 0.05) {
        run.pieces.push(f)
        run.last = f.p1
      } else {
        run = { type: key, pieces: [f], last: f.p1 }
        runs.push(run)
      }
    }
    const yb = DECK_Y - SLAB
    for (const r of runs) {
      let s = 0
      let nextCol = 2
      const cols = []
      for (const f of r.pieces) {
        const L = Math.hypot(f.p1[0] - f.p0[0], f.p1[1] - f.p0[1])
        while (nextCol <= s + L) {
          const u = (nextCol - s) / L
          cols.push({ x: f.p0[0] + (f.p1[0] - f.p0[0]) * u - f.nx * 0.5, z: f.p0[1] + (f.p1[1] - f.p0[1]) * u - f.nz * 0.5, nx: f.nx, nz: f.nz, floor: f.floor })
          nextCol += 8.4
        }
        // între stâlpi: grilaj (parter tehnic) sau vitrină (curțile de lumină)
        const a = [f.p0[0] - f.nx * 0.5, f.p0[1] - f.nz * 0.5]
        const b = [f.p1[0] - f.nx * 0.5, f.p1[1] - f.nz * 0.5]
        if (r.type === 'grille') grille.quad([a[0], f.floor, a[1]], [b[0], f.floor, b[1]], [b[0], yb, b[1]], [a[0], yb, a[1]], [s / 2, 0], [(s + L) / 2, 0], [(s + L) / 2, 1], [s / 2, 1], [f.nx, 0, f.nz])
        if (r.type === 'glass') shop.quad([a[0] - f.nx * 1.5, f.floor, a[1] - f.nz * 1.5], [b[0] - f.nx * 1.5, f.floor, b[1] - f.nz * 1.5], [b[0] - f.nx * 1.5, yb, b[1] - f.nz * 1.5], [a[0] - f.nx * 1.5, yb, a[1] - f.nz * 1.5], [s / 5, 0], [(s + L) / 5, 0], [(s + L) / 5, 1], [s / 5, 1], [f.nx, 0, f.nz])
        s += L
      }
      for (const c of cols) {
        const y0 = c.floor
        if (r.type === 'open') {
          // stâlp în V: două brațe din aceeași talpă, deschise de-a lungul fațadei
          const tx = -c.nz, tz = c.nx
          colGeo.push(beam([c.x, y0, c.z], [c.x + tx * 1.7, yb, c.z + tz * 1.7], 0.22, 6))
          colGeo.push(beam([c.x, y0, c.z], [c.x - tx * 1.7, yb, c.z - tz * 1.7], 0.22, 6))
          colGeo.push(new THREE.BoxGeometry(0.8, 0.5, 0.8).translate(c.x, y0 + 0.25, c.z).toNonIndexed())
        } else {
          const g = new THREE.BoxGeometry(0.6, yb - y0, 0.6)
          g.rotateY(Math.atan2(c.nx, c.nz))
          g.translate(c.x, (y0 + yb) / 2, c.z)
          colGeo.push(g.toNonIndexed())
        }
      }
      // parcarea: rânduri de locuri perpendiculare pe fațadă, sub planșeu
      if (r.type === 'open') {
        let acc = 0
        for (const f of r.pieces) {
          const L = Math.hypot(f.p1[0] - f.p0[0], f.p1[1] - f.p0[1])
          for (let u = (2.6 - (acc % 2.6)) % 2.6; u < L; u += 2.6) {
            const x = f.p0[0] + (f.p1[0] - f.p0[0]) * (u / L)
            const z = f.p0[1] + (f.p1[1] - f.p0[1]) * (u / L)
            const m = offsetOf(x, z)
            const depth = m // de la baza carcasei la margine
            const tx = -f.nz, tz = f.nx
            const rows = f.floor > 0.02 + 0.001 ? [] : depth > 11 ? [2.6, depth - 3.4] : depth > 6.5 ? [2.6] : []
            if (f.floor < 0.05 && Math.abs((acc + u) % 7.8) < 0.2) lightPanels.push([x - f.nx * depth * 0.5, z - f.nz * depth * 0.5, Math.atan2(tx, tz)])
            for (const back of rows) {
              const cx = x - f.nx * (depth - back), cz = z - f.nz * (depth - back)
              if (((acc + u) * 7.31) % 1 < 0.78) groundCars.push([cx, 0.02, cz, Math.atan2(f.nx, f.nz) + (back < 5 ? Math.PI : 0) + (Math.sin(cx * 3.1) * 0.03)])
              bayLines.push([cx + tx * 1.3, cz + tz * 1.3, Math.atan2(f.nx, f.nz)])
            }
          }
          acc += L
        }
      }
    }
  }
  // curtea de lumină A: parcare deschisă, cu două rânduri de mașini
  {
    const [a, b, c, d] = wells.A
    const along = [b[0] - a[0], b[1] - a[1]]
    const L = Math.hypot(...along)
    const ux = along[0] / L, uz = along[1] / L
    for (const [row, rot] of [[2.9, 0], [6.8, Math.PI]]) {
      for (let s = 1.6; s < L - 1.4; s += 2.6) {
        const x = a[0] + ux * s - uz * row
        const z = a[1] + uz * s + ux * row
        if (!ringPip(wells.A, x, z)) continue
        if ((s * 13.7 + row) % 1 < 0.85) groundCars.push([x, wellFloor.A, z, Math.atan2(-uz, ux) + rot])
        bayLines.push([x + ux * 1.3, z + uz * 1.3, Math.atan2(-uz, ux)])
      }
    }
    void c
    void d
  }

  // ── terenul din jurul podiumului: asfalt (alei, parcarea de la parter) și taluzurile de gazon
  const ground = new Buf()
  const bank = new Buf()
  const toe = new Buf()
  {
    const K = 1440
    for (let k = 0; k < K; k++) {
      const t0 = (k / K) * 2 * Math.PI
      const t1 = ((k + 1) / K) * 2 * Math.PI
      const P = (t, d, y) => [(FOOT.ax + d) * Math.cos(t), y, (FOOT.az + d) * Math.sin(t)]
      const D0 = deckD(t0), D1 = deckD(t1)
      const zone = zoneOf((t0 + t1) / 2)
      // asfaltul de la baza carcasei până la 7 m în fața podiumului
      if (zone !== 'south') {
        const a = P(t0, -0.5, 0.025), b = P(t1, -0.5, 0.025), c = P(t1, D1 + 7, 0.025), d = P(t0, D0 + 7, 0.025)
        const mx = (c[0] + d[0]) / 2, mz = (c[2] + d[2]) / 2
        if (!inMulti(upperOut, mx, mz) && !wellAt(mx, mz)) ground.quad(a, b, c, d, [a[0], a[2]], [b[0], b[2]], [c[0], c[2]], [d[0], d[2]], [0, 1, 0])
      }
      if (zone !== 'bank') continue
      // taluzul: de sub parapet până la 9 m în afară; se oprește la scări
      const mid = edgeXZ((t0 + t1) / 2, 4)
      if (stairs.some((s) => inStair(s, mid[0], mid[1], 0.35) !== null)) continue
      const rows = [[0, DECK_Y - 1.0], [2.5, DECK_Y - 1.75], [5.5, 1.35], [8, 0.3], [9, 0.04]]
      for (let i = 0; i < rows.length - 1; i++) {
        const [o0, y0] = rows[i]
        const [o1, y1] = rows[i + 1]
        const a = P(t0, D0 + o0, y0), b = P(t1, D1 + o0, y0), c = P(t1, D1 + o1, y1), d = P(t0, D0 + o1, y1)
        bank.quad(a, b, c, d, [a[0], a[2]], [b[0], b[2]], [c[0], c[2]], [d[0], d[2]], [0, 1, 0])
      }
      // bordura de la piciorul taluzului
      const e0 = P(t0, D0 + 9, 0.04), e1 = P(t1, D1 + 9, 0.04), f0 = P(t0, D0 + 9.2, 0.16), f1 = P(t1, D1 + 9.2, 0.16)
      toe.quad(e0, e1, f1, f0, [0, 0], [1, 0], [1, 1], [0, 1], [0, 1, 0])
    }
  }

  // ── adăugăm totul în scenă
  const add = (m) => m && group.add(m)
  add(mesh(B.asphalt, M.asphalt))
  add(mesh(B.plaza, M.plaza))
  add(mesh(grassColors(B.lawn.geometry()), M.lawn))
  add(mesh(B.ceiling, M.ceiling))
  add(mesh(wellGround, M.ground))
  add(mesh(ground, M.ground))
  add(mesh(grassColors(bank.geometry()), M.lawn))
  add(mesh(toe, M.wall))
  add(mesh(W.wall, M.wall, { cast: true }))
  add(mesh(W.white, M.white, { cast: true }))
  add(mesh(W.seat, M.seat, { cast: true }))
  add(mesh(W.seatTop, M.seat))
  add(mesh(W.granite, M.riser, { cast: true }))
  add(mesh(ST.tread, M.granite))
  add(mesh(ST.side, M.wall, { cast: true }))
  add(mesh(R.parapet, M.wall, { cast: true }))
  const barMat = new THREE.MeshStandardMaterial({ map: barTex, alphaTest: 0.35, side: THREE.DoubleSide, metalness: 0.7, roughness: 0.35 })
  add(mesh(R.bars, barMat))
  add(mesh(R.glass, M.glass, { receive: false }))
  if (capGeo.length || railsGeo.length) add(mesh(mergeGeometries([...capGeo, ...railsGeo]), M.steel))
  if (colGeo.length) add(mesh(mergeGeometries(colGeo), M.white, { cast: true }))
  const grilleTex = barsTexture({ gap: 0.13, bar: 0.04, h: 3.7 })
  add(mesh(grille, new THREE.MeshStandardMaterial({ map: grilleTex, alphaTest: 0.35, side: THREE.DoubleSide, metalness: 0.7, roughness: 0.4 })))
  add(mesh(shop, new THREE.MeshStandardMaterial({ map: storefrontTexture(), roughness: 0.15, metalness: 0.4 })))
  // liniile locurilor de parcare
  if (bayLines.length) {
    const lm = new THREE.InstancedMesh(new THREE.PlaneGeometry(0.12, 4.8).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ color: 0xe8e8e2 }), bayLines.length)
    const m4 = new THREE.Matrix4()
    const q = new THREE.Quaternion()
    const up = new THREE.Vector3(0, 1, 0)
    bayLines.forEach(([x, z, a], k) => {
      m4.compose(new THREE.Vector3(x, 0.045, z), q.setFromAxisAngle(up, a), new THREE.Vector3(1, 1, 1))
      lm.setMatrixAt(k, m4)
    })
    lm.computeBoundingSphere()
    group.add(lm)
  }
  // corpurile de iluminat din tavanul parcării
  if (lightPanels.length) {
    const lp = new THREE.InstancedMesh(new THREE.BoxGeometry(1.2, 0.06, 0.25), new THREE.MeshStandardMaterial({ color: 0xffffff, emissive: 0xf4f1e6, emissiveIntensity: 1.2 }), lightPanels.length)
    const m4 = new THREE.Matrix4()
    const q = new THREE.Quaternion()
    const up = new THREE.Vector3(0, 1, 0)
    lightPanels.forEach(([x, z, a], k) => {
      m4.compose(new THREE.Vector3(x, DECK_Y - SLAB - 0.04, z), q.setFromAxisAngle(up, a), new THREE.Vector3(1, 1, 1))
      lp.setMatrixAt(k, m4)
    })
    lp.computeBoundingSphere()
    group.add(lp)
  }
  group.add(carMeshes(groundCars, { seed: 17, shadows: !lowSpec }))

  // ── lifturile pentru persoanele cu dizabilități (turn de sticlă lângă podium)
  for (const L of LIFTS) {
    const g = new THREE.Group()
    const h = DECK_Y + 3.2
    const frame = []
    for (const [sx, sz] of [[-1, -1], [1, -1], [1, 1], [-1, 1]]) frame.push(new THREE.BoxGeometry(0.12, h, 0.12).translate(sx * 1.25, h / 2, sz * 1.25).toNonIndexed())
    for (const y of [0.1, DECK_Y, h - 0.1]) {
      frame.push(new THREE.BoxGeometry(2.62, 0.14, 0.12).translate(0, y, 1.25).toNonIndexed(), new THREE.BoxGeometry(2.62, 0.14, 0.12).translate(0, y, -1.25).toNonIndexed())
      frame.push(new THREE.BoxGeometry(0.12, 0.14, 2.62).translate(1.25, y, 0).toNonIndexed(), new THREE.BoxGeometry(0.12, 0.14, 2.62).translate(-1.25, y, 0).toNonIndexed())
    }
    g.add(new THREE.Mesh(mergeGeometries(frame), M.dark))
    const box = new THREE.Mesh(new THREE.BoxGeometry(2.5, h - 0.2, 2.5).translate(0, h / 2, 0), M.glass)
    g.add(box)
    const roof = new THREE.Mesh(new THREE.BoxGeometry(2.9, 0.25, 2.9).translate(0, h + 0.1, 0), M.white)
    roof.castShadow = true
    g.add(roof)
    const cab = new THREE.Mesh(new THREE.BoxGeometry(1.6, 2.3, 1.6).translate(0, 0.1 + 1.15, 0), new THREE.MeshStandardMaterial({ color: 0x9da4aa, metalness: 0.8, roughness: 0.3 }))
    g.add(cab)
    g.add(signBoard('♿  LIFT', '#1f5fbf', 1.3, 0.42).translateY(h - 0.6).translateZ(1.33))
    g.position.set(L.x, 0, L.z)
    g.rotation.y = Math.atan2(L.f.nx, L.f.nz)
    group.add(g)
  }

  // ── porțile cu turnichete (sub streașina fațadei, în fața ușilor vitrate) – numele ca pe bilete
  buildGates(group, M)

  // ── esplanada: statuia lui Ion Oblemenco și stâlpii de iluminat
  {
    const [sx, sz] = STATUE
    const sy = surfaceAt(sx, sz)?.y ?? Y_LOW
    const st = buildStatue()
    st.position.set(sx, sy, sz)
    // privește spre bulevard (sud)
    group.add(st)
  }
  const lamps = [[-34, 134], [-34, 152], [-34, 168], [45, 134], [45, 152], [45, 168], [5, 176], [-62, 112], [92, 116]]
  {
    const parts = []
    const H = 10
    parts.push(new THREE.CylinderGeometry(0.08, 0.13, H, 10).translate(0, H / 2, 0).toNonIndexed())
    parts.push(new THREE.CylinderGeometry(0.22, 0.25, 0.6, 10).translate(0, 0.3, 0).toNonIndexed())
    parts.push(new THREE.BoxGeometry(2.2, 0.08, 0.08).translate(0, H - 0.25, 0).toNonIndexed())
    for (const sx of [-1, 1]) parts.push(new THREE.BoxGeometry(0.7, 0.1, 0.32).translate(sx * 1.2, H - 0.3, 0).toNonIndexed())
    const lampGeo = mergeGeometries(parts)
    const im = new THREE.InstancedMesh(lampGeo, new THREE.MeshStandardMaterial({ color: 0x8e959b, metalness: 0.7, roughness: 0.35 }), lamps.length)
    const m4 = new THREE.Matrix4()
    const q = new THREE.Quaternion()
    const up = new THREE.Vector3(0, 1, 0)
    lamps.forEach(([x, z], k) => {
      const y = surfaceAt(x, z)?.y ?? 0
      m4.compose(new THREE.Vector3(x, y, z), q.setFromAxisAngle(up, 0.2 + k), new THREE.Vector3(1, 1, 1))
      im.setMatrixAt(k, m4)
    })
    im.castShadow = !lowSpec
    im.computeBoundingSphere()
    group.add(im)
  }

  return { group, surfaceAt }
}

// panou cu text (indicatoare)
function signBoard(text, bg, w, h, sub = '') {
  const c = document.createElement('canvas')
  c.width = 512
  c.height = Math.round((512 * h) / w)
  const g = c.getContext('2d')
  g.fillStyle = bg
  g.fillRect(0, 0, c.width, c.height)
  g.fillStyle = 'rgba(255,255,255,0.12)'
  g.fillRect(0, 0, c.width, 6)
  g.fillStyle = '#fff'
  g.textAlign = 'center'
  g.textBaseline = 'middle'
  const big = sub ? c.height * 0.46 : c.height * 0.62
  g.font = `800 ${big}px "Barlow Condensed", "Arial Narrow", sans-serif`
  let fs = big
  while (g.measureText(text).width > c.width * 0.9 && fs > 10) {
    fs -= 2
    g.font = `800 ${fs}px "Barlow Condensed", "Arial Narrow", sans-serif`
  }
  g.fillText(text, c.width / 2, sub ? c.height * 0.36 : c.height / 2)
  if (sub) {
    g.font = `600 ${c.height * 0.22}px "Barlow Condensed", "Arial Narrow", sans-serif`
    g.fillStyle = 'rgba(255,255,255,0.88)'
    g.fillText(sub, c.width / 2, c.height * 0.76)
  }
  const t = new THREE.CanvasTexture(c)
  t.colorSpace = THREE.SRGBColorSpace
  t.anisotropy = 8
  const m = new THREE.Mesh(new THREE.PlaneGeometry(w, h), new THREE.MeshStandardMaterial({ map: t, roughness: 0.5, emissive: 0xffffff, emissiveMap: t, emissiveIntensity: 0.25 }))
  return m
}

// numele porții, la fel ca pe bilete (STANDS[...].gate în stadium-data.js)
function gateName(deg, kind) {
  if (kind === 'vip') return ['VIP / LOJE', 'Tribuna VIP & Loje', '#9b1d4a']
  if (kind === 'oaspeti') return ['ACCES OASPEȚI', 'Sectorul oaspeților', '#c35aa6']
  if (kind === 'handicap') return ['ACCES ♿', 'Persoane cu dizabilități', '#1f5fbf']
  if (deg > -135 && deg < -45) return ['POARTA 6', 'Peluza Nord', '#0b4aa2']
  if (deg >= -45 && deg <= 45) return ['POARTA 8', 'Tribuna 2', '#0b4aa2']
  if (deg > 45 && deg < 135) return ['PELUZA SUD', 'Peluza Sud', '#0b4aa2']
  return ['TRIBUNA 1', 'Tribuna 1', '#0b4aa2']
}

function buildGates(group, M) {
  const { cx, cy, rx, ry } = ACCESS_MAP
  // turnichetul tripod: dulapul de inox cu capac rotunjit, rotorul cu trei brațe, cititorul de bilete
  const cab = mergeGeometries([
    new THREE.BoxGeometry(0.28, 0.86, 1.1).translate(0, 0.43, 0).toNonIndexed(),
    new THREE.CylinderGeometry(0.14, 0.14, 1.1, 10, 1, false, 0, Math.PI).rotateX(Math.PI / 2).rotateZ(-Math.PI / 2).translate(0, 0.86, 0).toNonIndexed(),
  ])
  // rotorul: axa înclinată la 45° spre sensul de trecere, trei brațe la 120°, unul orizontal peste culoar
  const axis = new THREE.Vector3(0, Math.SQRT1_2, Math.SQRT1_2)
  const u = new THREE.Vector3(1, 0, 0)
  const v = new THREE.Vector3().crossVectors(axis, u)
  const hub = [0.2, 0.84, 0.05]
  const rotorParts = [beam([hub[0] - axis.x * 0.08, hub[1] - axis.y * 0.08, hub[2] - axis.z * 0.08], [hub[0] + axis.x * 0.06, hub[1] + axis.y * 0.06, hub[2] + axis.z * 0.06], 0.07, 10)]
  for (let k = 0; k < 3; k++) {
    const a = (k / 3) * Math.PI * 2
    const arm = u.clone().multiplyScalar(Math.cos(a)).add(v.clone().multiplyScalar(Math.sin(a)))
    if (arm.x < -0.1) arm.x *= 0.2 // brațele care nu sunt peste culoar rămân lângă dulap
    arm.normalize()
    rotorParts.push(beam(hub, [hub[0] + arm.x * 0.5, hub[1] + arm.y * 0.5, hub[2] + arm.z * 0.5], 0.022, 6))
  }
  const rotor = mergeGeometries(rotorParts)
  const reader = new THREE.BoxGeometry(0.2, 0.05, 0.16).translate(0, 1.0, 0.32)
  const posts = []
  const cabs = []
  const rotors = []
  const readers = []
  const signs = []
  ACCESS_POINTS.forEach(([mx, my, n, kind]) => {
    const t = Math.atan2(-(mx - cx) / rx, (my - cy) / ry)
    const deg = (t * 180) / Math.PI
    // pe podium, între fațada vitrată și stâlpii în X
    const D = -3.4
    const px = (FOOT.ax + D) * Math.cos(t)
    const pz = (FOOT.az + D) * Math.sin(t)
    const nrm = new THREE.Vector2(Math.cos(t) / FOOT.ax, Math.sin(t) / FOOT.az).normalize()
    const tx = -nrm.y
    const tz = nrm.x
    const rot = Math.atan2(nrm.x, nrm.y)
    const lanes = n || 1
    const pitch = 0.95
    for (let k = 0; k <= lanes; k++) {
      const o = (k - lanes / 2) * pitch
      cabs.push([px + tx * o, pz + tz * o, rot])
      if (k < lanes && n) {
        rotors.push([px + tx * o, pz + tz * o, rot])
        readers.push([px + tx * o, pz + tz * o, rot])
      }
      // barele de dirijare a cozii, 2,4 m spre exterior
      const bx = px + tx * o + nrm.x * 0.55
      const bz = pz + tz * o + nrm.y * 0.55
      const ex = bx + nrm.x * 2.4
      const ez = bz + nrm.y * 2.4
      posts.push(beam([bx, DECK_Y + 1.0, bz], [ex, DECK_Y + 1.0, ez], 0.025, 6))
      posts.push(beam([ex, DECK_Y, ez], [ex, DECK_Y + 1.02, ez], 0.03, 6))
    }
    if (!n) {
      // poarta batantă largă pentru scaune cu rotile
      posts.push(beam([px - tx * 0.6, DECK_Y + 1.0, pz - tz * 0.6], [px + tx * 0.6, DECK_Y + 1.0, pz + tz * 0.6], 0.03, 6))
      posts.push(beam([px - tx * 0.6, DECK_Y + 0.15, pz - tz * 0.6], [px + tx * 0.6, DECK_Y + 0.15, pz + tz * 0.6], 0.03, 6))
    }
    // portalul cu numele porții
    const half = Math.max(1.6, (lanes * pitch) / 2 + 0.6)
    for (const sd of [-1, 1]) posts.push(beam([px + tx * half * sd, DECK_Y, pz + tz * half * sd], [px + tx * half * sd, DECK_Y + 3.4, pz + tz * half * sd], 0.06, 8))
    posts.push(beam([px - tx * half, DECK_Y + 3.4, pz - tz * half], [px + tx * half, DECK_Y + 3.4, pz + tz * half], 0.05, 6))
    const [title, sub, color] = gateName(deg, kind)
    const board = signBoard(title, color, Math.min(2 * half - 0.2, 3.4), 0.85, sub)
    board.position.set(px + nrm.x * 0.08, DECK_Y + 2.9, pz + nrm.y * 0.08)
    board.rotation.y = rot
    signs.push(board)
  })
  const inst = (geo, mat, list, yOff = 0) => {
    const im = new THREE.InstancedMesh(geo, mat, list.length)
    const m4 = new THREE.Matrix4()
    const q = new THREE.Quaternion()
    const up = new THREE.Vector3(0, 1, 0)
    list.forEach(([x, z, r], k) => {
      m4.compose(new THREE.Vector3(x, DECK_Y + yOff, z), q.setFromAxisAngle(up, r), new THREE.Vector3(1, 1, 1))
      im.setMatrixAt(k, m4)
    })
    im.computeBoundingSphere()
    im.castShadow = true
    return im
  }
  group.add(inst(cab, M.steel, cabs))
  group.add(inst(rotor, M.steel, rotors))
  group.add(inst(reader, new THREE.MeshStandardMaterial({ color: 0x111111, emissive: 0x2bd46b, emissiveIntensity: 0.9, roughness: 0.3 }), readers))
  group.add(new THREE.Mesh(mergeGeometries(posts), M.steel))
  for (const s of signs) group.add(s)
}
