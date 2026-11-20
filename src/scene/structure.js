// Structura detaliată a Stadionului „Ion Oblemenco”, reconstituită după fotografii:
// – inelul de sus are înălțime variabilă (multe rânduri la mijlocul laturilor,
//   puține în colțuri), cu pereți albi în trepte în spatele blocurilor mai joase;
// – vomitoare la jumătatea inelului de sus, balustradă de sticlă pe culoarul dintre inele;
// – grindă inelară cu stâlpi și cupolă din arce de oțel cu panouri translucide;
// – fațada: placaj alb doar deasupra „valului”, dedesubt structura în X și clădirea vitrată.
import * as THREE from 'three'
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js'
import {
  G, D1, Y1, D2, Y2, WALK_D, WALK_Y, RING_TOP, pathPoint, pieceLen, sectorBlocks, ring2RowsAt, VOM_ROWS, vomBlock, vomU, pointU, ring1Ranges, notchRanges, uRanges, lenPerU, wrap8, ring1AisleUs,
} from '../data/layout.js'
import { Quads, strip, samples, P, ellipseBand, ellipseRing, beam, ellipseCurve } from './geom.js'
import * as TX from './textures.js'
import { ACCESS_MAP, ACCESS_POINTS } from '../data/stadium-data.js'

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
const CONCOURSE = { ax: 91.5, az: 103 } // fațada vitrată din spatele grinzilor în X
const PLINTH_Y = 5.5

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
  strip(walls, ring1Ranges(0.3), 0, 0, 0, Y1(0))
  const notchQ = new Quads()
  for (let i = 0; i < G.ring1.rows; i++) {
    const R = ring1Ranges(D1(i) + 0.4)
    if (i > 0) strip(steps, R, D1(i), Y1(i - 1), D1(i), Y1(i))
    strip(steps, R, D1(i), Y1(i), D1(i + 1), Y1(i))
    // deschiderile din colțuri: podea la nivelul terenului și pereți laterali albi, în trepte
    for (const [p, t0, t1] of notchRanges(D1(i) + 0.4)) {
      strip(notchQ, [[p, t0, t1]], D1(i), 0.04, D1(i + 1), 0.04)
      for (const t of [t0, t1]) walls.quad(P(p, t, D1(i), 0), P(p, t, D1(i), Y1(i)), P(p, t, D1(i + 1), Y1(i)), P(p, t, D1(i + 1), 0))
    }
  }
  // tunelul de sub culoar, în capătul fiecărei deschideri
  for (const [p, t0, t1] of notchRanges(WALK_D)) darkQ.quad(P(p, t0, WALK_D - 0.02, 0), P(p, t0, WALK_D - 0.02, WALK_Y - 0.3), P(p, t1, WALK_D - 0.02, WALK_Y - 0.3), P(p, t1, WALK_D - 0.02, 0))
  strip(steps, ring1Ranges(WALK_D), WALK_D, Y1(G.ring1.rows - 1), WALK_D, WALK_Y)
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
  blocks.sort((a, b) => wrap8(a.u0) - wrap8(b.u0))
  const n = blocks.length
  const shares = (a, b) => {
    const g = Math.abs(wrap8(a.u1) - wrap8(b.u0))
    return g < 1e-6 || g > 8 - 1e-6
  }
  const aisleMarks = []
  const vomGeo = []
  for (let k = 0; k < n; k++) {
    const B = blocks[k]
    const rng = rangesOf(B.u0, B.u1)
    strip(walls, rng, D2(0), WALK_Y, D2(0), Y2(0))
    for (let j = 0; j < B.rows; j++) {
      if (j > 0) strip(steps, rng, D2(j), Y2(j - 1), D2(j), Y2(j))
      strip(steps, rng, D2(j), Y2(j), D2(j + 1), Y2(j))
    }
    // peretele alb din spatele blocului, până la grinda inelară
    strip(walls, rng, D2(B.rows), Y2(B.rows - 1), D2(B.rows), RING_TOP)
    // acoperișul concourse-ului, din spatele blocului până la elipsă
    const us = samplesU(B.u0, B.u1)
    for (let i = 0; i < us.length - 1; i++) {
      const e0 = Math.max(D2(B.rows), backOffsetU(us[i]) + 0.4)
      const e1 = Math.max(D2(B.rows), backOffsetU(us[i + 1]) + 0.4)
      walls.quad(PU(us[i], D2(B.rows), RING_TOP), PU(us[i], e0, RING_TOP), PU(us[i + 1], e1, RING_TOP), PU(us[i + 1], D2(B.rows), RING_TOP))
    }
    // pereții laterali în trepte, între blocuri de înălțimi diferite
    const prev = blocks[(k - 1 + n) % n]
    const hasPrev = shares(prev, B)
    const aisleRows = hasPrev ? Math.max(prev.rows, B.rows) : B.rows
    if (hasPrev && prev.rows !== B.rows) {
      const lo = Math.min(prev.rows, B.rows)
      const hi = Math.max(prev.rows, B.rows)
      for (let j = lo; j < hi; j++) walls.quad(PU(B.u0, D2(j), Y2(j)), PU(B.u0, D2(j + 1), Y2(j)), PU(B.u0, D2(j + 1), RING_TOP), PU(B.u0, D2(j), RING_TOP))
    }
    for (let j = 0; j < aisleRows; j++) aisleMarks.push([B.u0, D2(j), Y2(j)])
    const next = blocks[(k + 1) % n]
    if (!shares(B, next)) {
      for (let j = 0; j < B.rows; j++) aisleMarks.push([B.u1, D2(j), Y2(j)])
    }
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
  // scările culoarelor din inelul 1
  const ring1Us = new Map()
  for (const s of layout.sectors) {
    if (!s.rings.includes(1)) continue
    for (const u of ring1AisleUs(s)) ring1Us.set(wrap8(u).toFixed(5), u)
  }
  for (const u of ring1Us.values()) {
    for (let i = 0; i < G.ring1.rows; i++) aisleMarks.push([u, D1(i), Y1(i)])
  }

  const stepsMesh = new THREE.Mesh(steps.geometry(), concrete)
  stepsMesh.receiveShadow = true
  stepsMesh.castShadow = !lowSpec
  const wallMesh = new THREE.Mesh(walls.geometry(), white)
  wallMesh.receiveShadow = true
  wallMesh.castShadow = !lowSpec
  const darkMesh = new THREE.Mesh(darkQ.geometry(), new THREE.MeshStandardMaterial({ color: 0x1b2129, roughness: 0.9, side: THREE.DoubleSide }))
  const glassMesh = new THREE.Mesh(glassQ.geometry(), glass)
  const notchMesh = new THREE.Mesh(notchQ.geometry(), new THREE.MeshStandardMaterial({ color: 0x9c9f9e, roughness: 0.95, side: THREE.DoubleSide }))
  notchMesh.receiveShadow = true
  root.add(stepsMesh, wallMesh, darkMesh, glassMesh, notchMesh)

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
  const colN = 96
  const cols = new THREE.InstancedMesh(new THREE.BoxGeometry(0.55, SPRING_Y - RING_TOP, 0.55).translate(0, (SPRING_Y - RING_TOP) / 2, 0), white, colN)
  for (let k = 0; k < colN; k++) {
    const a = (k / colN) * Math.PI * 2
    m4.makeTranslation((BB.ax + 1.6) * Math.cos(a), RING_TOP, (BB.az + 1.6) * Math.sin(a))
    cols.setMatrixAt(k, m4)
  }
  cols.castShadow = true
  root.add(cols)
  // între stâlpi: grindă la jumătate și vitraj, ca în spatele tribunelor din fotografii
  {
    const gq = new Quads()
    ellipseBand(gq, BB.ax + 1.95, BB.az + 1.95, RING_TOP + 1.0, SPRING_Y, 192)
    root.add(new THREE.Mesh(gq.geometry(), new THREE.MeshStandardMaterial({ color: 0xc7d3dc, roughness: 0.15, metalness: 0.2, transparent: true, opacity: 0.38, side: THREE.DoubleSide, depthWrite: false })))
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
    trussGeo.push(beam(at(k, 1.2), at(k, MIDY), 0.5, 8))
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

  // ─── Ecranele din colțurile NE și SV, deasupra tribunelor joase ───
  const screenMat = new THREE.MeshBasicMaterial({ map: TX.screenTexture('Universitatea Craiova', 'FC Copenhaga') })
  for (const piece of [1, 5]) {
    const rows = ring2RowsAt(piece, 0.5)
    const p = pathPoint(piece, 0.5, D2(rows) - 1.0)
    const scr = new THREE.Group()
    const frame = new THREE.Mesh(new THREE.BoxGeometry(14.6, 8.4, 0.6), new THREE.MeshStandardMaterial({ color: 0x15181d }))
    const face = new THREE.Mesh(new THREE.PlaneGeometry(14, 7.9), screenMat)
    face.position.z = 0.31
    scr.add(frame, face)
    scr.position.set(p.x, Y2(rows - 1) + 7.5, p.z)
    scr.lookAt(0, Y2(rows - 1) + 3, 0)
    root.add(scr)
  }
  buildPodium(root, lowSpec)
  return out
}

// ─── Podiumul / pasarela din jurul stadionului ─────────────────────────
// Stadionul stă pe un podium pietonal (pavaj gri) mărginit de ziduri de beton,
// cu trepte de granit spre platou; poziția treptelor e după OpenStreetMap.
export const PODIUM = { ax: 113, az: 125, h: 1.2 }
function buildPodium(root, lowSpec) {
  const ell = (ax, az, n = 160) => {
    const sh = new THREE.Shape()
    for (let k = 0; k <= n; k++) {
      const a = (k / n) * Math.PI * 2
      k ? sh.lineTo(ax * Math.cos(a), az * Math.sin(a)) : sh.moveTo(ax, 0)
    }
    return sh
  }
  const shape = ell(PODIUM.ax, PODIUM.az)
  shape.holes.push(ell(96, 107.6))
  const top = new THREE.ShapeGeometry(shape, 96)
  top.rotateX(-Math.PI / 2)
  top.translate(0, PODIUM.h, 0)
  const pav = TX.pavingTexture()
  pav.repeat.set(0.5, 0.5)
  const topMesh = new THREE.Mesh(top, new THREE.MeshStandardMaterial({ map: pav, roughness: 0.92, side: THREE.DoubleSide }))
  topMesh.receiveShadow = true
  root.add(topMesh)
  const wq = new Quads()
  ellipseBand(wq, PODIUM.ax, PODIUM.az, -0.3, PODIUM.h, 200)
  ellipseRing(wq, PODIUM.ax, PODIUM.az, PODIUM.ax + 0.45, PODIUM.az + 0.45, PODIUM.h + 0.02, 200)
  const wallMesh = new THREE.Mesh(wq.geometry(), new THREE.MeshStandardMaterial({ color: 0xb4b7b7, roughness: 0.95, side: THREE.DoubleSide }))
  wallMesh.castShadow = !lowSpec
  wallMesh.receiveShadow = true
  root.add(wallMesh)
  // treptele de granit: [unghi pe elipsă, lățime în metri]
  const STEPS = [
    [0.14, 16], [-0.39, 14], [-1.34, 16], [Math.PI / 2, 48], [2.05, 18], [Math.PI, 22], [-2.35, 14], [0.95, 16], [-Math.PI / 2 - 0.25, 12],
  ]
  const granite = new THREE.MeshStandardMaterial({ map: TX.graniteTexture(), roughness: 0.75 })
  const sg = []
  const nSteps = 4
  for (const [a, w] of STEPS) {
    const px = PODIUM.ax * Math.cos(a)
    const pz = PODIUM.az * Math.sin(a)
    const n = new THREE.Vector2(Math.cos(a) / PODIUM.ax, Math.sin(a) / PODIUM.az).normalize()
    const rot = Math.atan2(n.x, n.y)
    for (let k = 0; k < nSteps; k++) {
      const h = PODIUM.h * (1 - k / nSteps)
      const g = new THREE.BoxGeometry(w, h, 0.42)
      g.translate(0, h / 2, 0)
      g.rotateY(rot)
      g.translate(px + n.x * (0.15 + 0.42 * k), 0, pz + n.y * (0.15 + 0.42 * k))
      sg.push(g.toNonIndexed())
    }
  }
  const steps = new THREE.Mesh(mergeGeometries(sg), granite)
  steps.receiveShadow = true
  root.add(steps)

  // accesele cu turnichete, după planul stadionului
  const { cx, cy, rx, ry } = ACCESS_MAP
  const tGeo = mergeGeometries([
    new THREE.BoxGeometry(0.3, 1.0, 0.9).translate(0, 0.5, 0).toNonIndexed(),
    new THREE.CylinderGeometry(0.03, 0.03, 0.5, 5).rotateZ(Math.PI / 2).translate(0.4, 0.85, 0).toNonIndexed(),
  ])
  const units = []
  const signs = []
  for (const [mx, my, n, kind] of ACCESS_POINTS) {
    const a = Math.atan2(-(mx - cx) / rx, (my - cy) / ry)
    const r = 0.965
    const px = PODIUM.ax * r * Math.cos(a)
    const pz = PODIUM.az * r * Math.sin(a)
    const nrm = new THREE.Vector2(Math.cos(a) / PODIUM.ax, Math.sin(a) / PODIUM.az).normalize()
    const tx = -nrm.y
    const tz = nrm.x
    const count = n || 1
    for (let k = 0; k < count; k++) {
      const o = (k - (count - 1) / 2) * 1.0
      units.push([px + tx * o, pz + tz * o, Math.atan2(tx, tz)])
    }
    signs.push([px + nrm.x * 1.2, pz + nrm.y * 1.2, Math.atan2(nrm.x, nrm.y), kind || 'spectatori', n])
  }
  const tMesh = new THREE.InstancedMesh(tGeo, new THREE.MeshStandardMaterial({ color: 0x8d949a, metalness: 0.7, roughness: 0.35 }), units.length)
  const m = new THREE.Matrix4()
  const q = new THREE.Quaternion()
  const Y = new THREE.Vector3(0, 1, 0)
  units.forEach(([x, z, rot], k) => {
    m.compose(new THREE.Vector3(x, PODIUM.h, z), q.setFromAxisAngle(Y, rot), new THREE.Vector3(1, 1, 1))
    tMesh.setMatrixAt(k, m)
  })
  tMesh.castShadow = !lowSpec
  root.add(tMesh)
  const signColors = { spectatori: '#0b4aa2', oaspeti: '#c35aa6', handicap: '#1f5fbf', vip: '#9b1d4a' }
  const signText = { spectatori: 'ACCES', oaspeti: 'OASPEȚI', handicap: 'ACCES ♿', vip: 'VIP / LOJE' }
  const mats = {}
  const signMat = (kind, n) => {
    const key = kind + n
    if (mats[key]) return mats[key]
    const c = document.createElement('canvas')
    c.width = 256
    c.height = 96
    const g = c.getContext('2d')
    g.fillStyle = signColors[kind]
    g.fillRect(0, 0, 256, 96)
    g.fillStyle = '#fff'
    g.textAlign = 'center'
    g.font = '800 40px "Barlow Condensed", Arial Narrow, sans-serif'
    g.fillText(signText[kind], 128, 46)
    g.font = '600 26px "Barlow Condensed", Arial Narrow, sans-serif'
    if (n) g.fillText(`${n} turnichete`, 128, 80)
    const t = new THREE.CanvasTexture(c)
    t.colorSpace = THREE.SRGBColorSpace
    mats[key] = new THREE.MeshBasicMaterial({ map: t, side: THREE.DoubleSide })
    return mats[key]
  }
  const pole = new THREE.CylinderGeometry(0.06, 0.06, 2.6, 6).translate(0, 1.3, 0)
  const poleMat = new THREE.MeshStandardMaterial({ color: 0x9aa0a6, metalness: 0.6, roughness: 0.4 })
  const board = new THREE.PlaneGeometry(1.6, 0.6)
  for (const [x, z, rot, kind, n] of signs) {
    const p = new THREE.Mesh(pole, poleMat)
    p.position.set(x, PODIUM.h, z)
    const b = new THREE.Mesh(board, signMat(kind, n))
    b.position.set(x, PODIUM.h + 2.9, z)
    b.rotation.y = rot
    root.add(p, b)
  }
}
