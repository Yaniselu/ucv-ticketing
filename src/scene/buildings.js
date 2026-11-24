// Clădirile din jurul stadionului (OpenStreetMap): pereți cu fațade procedurale pe tipuri (bloc,
// casă, birouri, hală), parter separat de etaje, acoperișuri în patru sau două ape la case (cu
// streașină și țiglă), acoperișuri plate cu atic și camere tehnice la blocuri. Culoarea fiecărui
// acoperiș se ia din imaginea satelit, ca să fie cea reală.
import * as THREE from 'three'
import { FACADE, facadeSet, facadeMaterial, roofTileTexture, flatRoofTexture } from './facades.js'

function rng(seed) {
  let s = seed >>> 0
  return () => ((s = (s * 1664525 + 1013904223) >>> 0) / 4294967296)
}
const pick = (r, a) => a[Math.floor(r() * a.length)]
const WALL = {
  house: ['#efe4cf', '#f3efe6', '#ead9b4', '#ecd2b8', '#e3e0d6', '#f1dfc0', '#dfe6d6', '#e7d3c9', '#f4ecd8', '#d9dfe3', '#e9c9a8'],
  block: ['#e8e4da', '#ded9cc', '#d6d9d6', '#e9e1cf', '#d9cfc2', '#cdd5dc', '#e3c9a6', '#c9d6c3', '#e8d4b8', '#f0ebe0'],
  office: ['#e6e8ea', '#d8dde2', '#ecebe8'],
  industrial: ['#c9ccce', '#b9bec2', '#d5d0c4', '#c3c7b8'],
}
const ROOF = ['#b5543a', '#a4482f', '#8e3f2d', '#9b3a30', '#6e4a3a', '#7d8287', '#5c6066', '#a65a3c']

class Buf {
  constructor() {
    this.pos = []
    this.uv = []
    this.col = []
  }
  tri(a, b, c, ua, ub, uc, col) {
    this.pos.push(...a, ...b, ...c)
    this.uv.push(...ua, ...ub, ...uc)
    for (let k = 0; k < 3; k++) this.col.push(col.r, col.g, col.b)
  }
  quad(a, b, c, d, ua, ub, uc, ud, col) {
    this.tri(a, b, c, ua, ub, uc, col)
    this.tri(a, c, d, ua, uc, ud, col)
  }
  mesh(mat) {
    if (!this.pos.length) return null
    const g = new THREE.BufferGeometry()
    g.setAttribute('position', new THREE.Float32BufferAttribute(this.pos, 3))
    g.setAttribute('uv', new THREE.Float32BufferAttribute(this.uv, 2))
    g.setAttribute('color', new THREE.Float32BufferAttribute(this.col, 3))
    g.computeVertexNormals()
    return new THREE.Mesh(g, mat)
  }
}

// dreptunghiul orientat (axa principală) al unei amprente
function orientedRect(pts) {
  let cx = 0, cz = 0
  for (const [x, z] of pts) { cx += x; cz += z }
  cx /= pts.length; cz /= pts.length
  // axa celei mai lungi laturi
  let best = 0, ang = 0
  for (let i = 0; i < pts.length; i++) {
    const a = pts[i], b = pts[(i + 1) % pts.length]
    const l = Math.hypot(b[0] - a[0], b[1] - a[1])
    if (l > best) { best = l; ang = Math.atan2(b[1] - a[1], b[0] - a[0]) }
  }
  const ux = Math.cos(ang), uz = Math.sin(ang)
  let u0 = Infinity, u1 = -Infinity, v0 = Infinity, v1 = -Infinity
  for (const [x, z] of pts) {
    const u = (x - cx) * ux + (z - cz) * uz
    const v = -(x - cx) * uz + (z - cz) * ux
    u0 = Math.min(u0, u); u1 = Math.max(u1, u); v0 = Math.min(v0, v); v1 = Math.max(v1, v)
  }
  return { cx, cz, ux, uz, u0, u1, v0, v1, P: (u, v) => [cx + u * ux - v * uz, cz + u * uz + v * ux] }
}
const polyArea = (pts) => {
  let a = 0
  for (let i = 0; i < pts.length; i++) {
    const p = pts[i], q = pts[(i + 1) % pts.length]
    a += p[0] * q[1] - q[0] * p[1]
  }
  return Math.abs(a / 2)
}
function inPoly(x, z, pts) {
  let c = false
  for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) {
    const [xi, zi] = pts[i], [xj, zj] = pts[j]
    if (zi > z !== zj > z && x < ((xj - xi) * (z - zi)) / (zj - zi) + xi) c = !c
  }
  return c
}

export function buildBuildings(data, { lowSpec = false } = {}) {
  const T = ['block', 'house', 'office', 'industrial']
  const sets = Object.fromEntries(T.map((t, k) => [t, facadeSet(t, 11 + k * 13)]))
  const mats = Object.fromEntries(T.flatMap((t) => [[`${t}U`, facadeMaterial(sets[t].upper)], [`${t}G`, facadeMaterial(sets[t].ground)]]))
  const bufs = Object.fromEntries(Object.keys(mats).map((k) => [k, new Buf()]))
  const tile = new Buf()
  const flat = new Buf()
  const trim = new Buf()
  const roofs = [] // pentru culoarea din satelit: [buf, start, end, pts]
  const r = rng(2026)
  const col = new THREE.Color()
  const white = new THREE.Color(1, 1, 1)
  const pitchCentres = data.areas.filter((a) => a[0] === 2).map((a) => {
    let x = 0, z = 0
    const n = a[1].length / 2
    for (let i = 0; i < a[1].length; i += 2) { x += a[1][i]; z += a[1][i + 1] }
    return [x / n, z / n]
  })

  for (const [h, kind, fl, bname] of data.buildings) {
    if (bname === 'Sala Polivalentă' || bname === 'tribuna') continue // modelate separat (city.js, sports.js)
    const pts = []
    for (let i = 0; i < fl.length; i += 2) pts.push([fl[i], fl[i + 1]])
    const n = pts.length
    if (n < 3) continue
    const area = polyArea(pts)
    const R = orientedRect(pts)
    const W = R.v1 - R.v0
    const Lr = R.u1 - R.u0
    const rectFill = area / Math.max(1, W * Lr)
    let type = 'house'
    if (kind === 1) type = 'block'
    else if (kind === 2) type = h > 14 ? 'office' : area > 900 ? 'industrial' : h > 8 ? 'office' : 'house'
    else if (kind === 5) type = 'industrial'
    const F = FACADE[type]
    const pitched = (kind === 0 || kind === 3 || (kind === 4 && area > 25 && r() < 0.5)) && rectFill > 0.72 && W < 22
    const roofH = pitched ? Math.min(kind === 3 ? 6 : 3.6, Math.max(1.4, 0.42 * W)) : 0
    const wallH = Math.max(2.6, h - roofH)
    // tribune (sport): treptele urcă dinspre teren spre spate
    let hv = null
    if (kind === 5 && area > 1500 && pitchCentres.length) {
      const pc = pitchCentres.reduce((b, c) => (Math.hypot(c[0] - R.cx, c[1] - R.cz) < Math.hypot(b[0] - R.cx, b[1] - R.cz) ? c : b))
      const ds = pts.map(([x, z]) => Math.hypot(x - pc[0], z - pc[1]))
      const dmin = Math.min(...ds)
      const dmax = Math.max(...ds)
      if (dmax - dmin > 8) hv = ds.map((d) => 1.2 + (h + 3 - 1.2) * ((d - dmin) / (dmax - dmin)))
    }
    const Hh = (i) => (hv ? hv[i] : wallH)
    col.set(pick(r, WALL[type]))
    const shade = 0.9 + r() * 0.1
    col.multiplyScalar(shade)
    const uOff = Math.floor(r() * 8)
    const vOff = Math.floor(r() * 8)
    const gH = Math.min(F.ground, wallH)
    const BU = bufs[`${type}U`]
    const BG = bufs[`${type}G`]
    let acc = 0
    for (let i = 0; i < n; i++) {
      const a = pts[i]
      const b = pts[(i + 1) % n]
      const len = Math.hypot(b[0] - a[0], b[1] - a[1])
      if (len < 0.05) continue
      const ua = (acc / F.bay + uOff) / 8
      const ub = ((acc + len) / F.bay + uOff) / 8
      acc += len
      const ha = Hh(i)
      const hb = Hh((i + 1) % n)
      const ga = Math.min(gH, ha)
      const gb = Math.min(gH, hb)
      // parterul
      BG.quad([a[0], 0, a[1]], [b[0], 0, b[1]], [b[0], gb, b[1]], [a[0], ga, a[1]], [ua, 0], [ub, 0], [ub, gb / F.ground], [ua, ga / F.ground], col)
      // etajele
      if (ha > ga + 0.05 || hb > gb + 0.05) {
        const va = ((ha - gH) / F.floor + vOff) / 8
        const vb = ((hb - gH) / F.floor + vOff) / 8
        const v0 = vOff / 8
        BU.quad([a[0], ga, a[1]], [b[0], gb, b[1]], [b[0], hb, b[1]], [a[0], ha, a[1]], [ua, v0], [ub, v0], [ub, vb], [ua, va], col)
      }
      // aticul acoperișului plat
      if (!pitched && !hv && h > 6) {
        trim.quad([a[0], ha, a[1]], [b[0], hb, b[1]], [b[0], hb + 0.7, b[1]], [a[0], ha + 0.7, a[1]], [0, 0], [1, 0], [1, 1], [0, 1], col)
      }
    }
    // ─── acoperișul ───
    if (pitched) {
      const o = 0.4 // streașina
      const u0 = R.u0 - o, u1 = R.u1 + o, v0 = R.v0 - o, v1 = R.v1 + o
      const vm = (v0 + v1) / 2
      const half = (v1 - v0) / 2
      const gable = kind === 0 && r() < 0.35
      const ins = gable ? 0 : Math.min(half, (u1 - u0) / 2)
      const top = wallH + roofH
      const eave = wallH - 0.15
      const P = (u, v, y) => {
        const [x, z] = R.P(u, v)
        return [x, y, z]
      }
      const S = 1.0 // o țiglă ≈ 1 m în textură
      const start = tile.pos.length
      const rc = new THREE.Color(pick(r, ROOF))
      const slope = Math.hypot(half, roofH)
      // cele două ape lungi
      for (const side of [-1, 1]) {
        const ve = side < 0 ? v0 : v1
        const a = P(u0, ve, eave), b = P(u1, ve, eave), c = P(u1 - ins, vm, top), d = P(u0 + ins, vm, top)
        tile.quad(a, b, c, d, [u0 / S, 0], [u1 / S, 0], [(u1 - ins) / S, slope / S], [(u0 + ins) / S, slope / S], rc)
      }
      if (!gable) {
        // capetele în pantă (patru ape)
        for (const end of [-1, 1]) {
          const ue = end < 0 ? u0 : u1
          const ur = end < 0 ? u0 + ins : u1 - ins
          tile.tri(P(ue, v0, eave), P(ue, v1, eave), P(ur, vm, top), [v0 / S, 0], [v1 / S, 0], [vm / S, slope / S], rc)
        }
      } else {
        // fronton vertical, în culoarea peretelui
        for (const end of [-1, 1]) {
          const ue = end < 0 ? R.u0 : R.u1
          trim.tri(P(ue, R.v0, wallH), P(ue, R.v1, wallH), P(ue, vm, top - 0.1), [0, 0], [1, 0], [0.5, 1], col)
        }
      }
      roofs.push([tile, start, tile.pos.length, pts])
    } else if (hv) {
      const tri = THREE.ShapeUtils.triangulateShape(pts.map(([x, z]) => new THREE.Vector2(x, z)), [])
      const start = flat.pos.length
      for (const [i0, i1, i2] of tri) flat.tri([pts[i0][0], Hh(i0), pts[i0][1]], [pts[i2][0], Hh(i2), pts[i2][1]], [pts[i1][0], Hh(i1), pts[i1][1]], [pts[i0][0] / 8, pts[i0][1] / 8], [pts[i2][0] / 8, pts[i2][1] / 8], [pts[i1][0] / 8, pts[i1][1] / 8], white)
      roofs.push([flat, start, flat.pos.length, pts])
    } else {
      const tri = THREE.ShapeUtils.triangulateShape(pts.map(([x, z]) => new THREE.Vector2(x, z)), [])
      const start = flat.pos.length
      const y = wallH + 0.02
      for (const [i0, i1, i2] of tri) flat.tri([pts[i0][0], y, pts[i0][1]], [pts[i2][0], y, pts[i2][1]], [pts[i1][0], y, pts[i1][1]], [pts[i0][0] / 8, pts[i0][1] / 8], [pts[i2][0] / 8, pts[i2][1] / 8], [pts[i1][0] / 8, pts[i1][1] / 8], white)
      roofs.push([flat, start, flat.pos.length, pts])
      // camerele tehnice de pe blocuri (lift, casa scării), pe axa lungă
      if (type === 'block' && area > 250) {
        const nb = Math.max(1, Math.floor(Lr / 26))
        const mid = (R.v0 + R.v1) / 2
        for (let k = 0; k < nb; k++) {
          const u = R.u0 + ((k + 0.5) * Lr) / nb
          const [bx, bz] = R.P(u, mid)
          if (!inPoly(bx, bz, pts)) continue
          const bw = 3.2, bd = 4.2, bh = 2.6
          const cs = [[-bw / 2, -bd / 2], [bw / 2, -bd / 2], [bw / 2, bd / 2], [-bw / 2, bd / 2]].map(([du, dv]) => R.P(u + du, mid + dv))
          for (let e = 0; e < 4; e++) {
            const a2 = cs[e], b2 = cs[(e + 1) % 4]
            trim.quad([a2[0], y, a2[1]], [b2[0], y, b2[1]], [b2[0], y + bh, b2[1]], [a2[0], y + bh, a2[1]], [0, 0], [1, 0], [1, 1], [0, 1], col)
          }
          trim.quad([cs[0][0], y + bh, cs[0][1]], [cs[3][0], y + bh, cs[3][1]], [cs[2][0], y + bh, cs[2][1]], [cs[1][0], y + bh, cs[1][1]], [0, 0], [1, 0], [1, 1], [0, 1], col)
        }
      }
    }
  }

  const group = new THREE.Group()
  for (const [k, B] of Object.entries(bufs)) {
    const m = B.mesh(mats[k])
    if (m) group.add(m)
  }
  const tileMat = new THREE.MeshStandardMaterial({ map: roofTileTexture(), vertexColors: true, roughness: 0.75, side: THREE.DoubleSide })
  const flatMat = new THREE.MeshStandardMaterial({ map: flatRoofTexture(), vertexColors: true, roughness: 0.95, side: THREE.DoubleSide })
  const trimMat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.9, side: THREE.DoubleSide })
  const tileMesh = tile.mesh(tileMat)
  const flatMesh = flat.mesh(flatMat)
  const trimMesh = trim.mesh(trimMat)
  for (const m of [tileMesh, flatMesh, trimMesh]) if (m) group.add(m)
  if (!lowSpec) group.traverse((o) => { if (o.isMesh) o.receiveShadow = true })

  // culoarea reală a acoperișurilor, luată din imaginea satelit (după ce s-a încărcat)
  function applyRoofColors(layers) {
    const cache = new Map()
    const pixels = (L) => {
      if (!cache.has(L)) cache.set(L, L.ctx.getImageData(0, 0, L.canvas.width, L.canvas.height))
      return cache.get(L)
    }
    const c = new THREE.Color()
    const touched = new Set()
    for (const [B, start, end, pts] of roofs) {
      let cx = 0, cz = 0
      for (const [x, z] of pts) { cx += x; cz += z }
      cx /= pts.length; cz /= pts.length
      const L = layers.find((l) => l && l.covers(cx, cz))
      if (!L) continue
      const img = pixels(L)
      let rr = 0, gg = 0, bb = 0, k = 0
      for (let s = 0; s < 9; s++) {
        const f = 0.25 + (s % 3) * 0.25
        const g2 = 0.25 + Math.floor(s / 3) * 0.25
        const p = pts[Math.floor(f * pts.length) % pts.length]
        const q = pts[Math.floor(g2 * pts.length + pts.length / 2) % pts.length]
        const x = cx + ((p[0] + q[0]) / 2 - cx) * 0.5
        const z = cz + ((p[1] + q[1]) / 2 - cz) * 0.5
        const [px, py] = L.toPx(x, z)
        const ix = Math.round(px), iy = Math.round(py)
        if (ix < 0 || iy < 0 || ix >= img.width || iy >= img.height) continue
        const o = (iy * img.width + ix) * 4
        rr += img.data[o]; gg += img.data[o + 1]; bb += img.data[o + 2]; k++
      }
      if (!k) continue
      c.setRGB(rr / k / 255, gg / k / 255, bb / k / 255, THREE.SRGBColorSpace)
      // imaginea satelit are umbre și ceață: luminăm și accentuăm puțin culoarea; dacă punctele au
      // nimerit în coroana unui copac (verde), rămâne culoarea de țiglă/tablă aleasă
      const hsl = {}
      c.getHSL(hsl)
      const greenish = hsl.h > 0.17 && hsl.h < 0.5 && hsl.s > 0.12
      if (greenish) continue
      // acoperișurile reale: țiglă (roșu–maro), tablă (gri, roșu), carton bitumat (gri închis)
      const sat = Math.min(0.62, hsl.s * 1.3)
      c.setHSL(hsl.s < 0.15 ? hsl.h : Math.min(0.11, Math.max(0.0, hsl.h > 0.5 ? 0.0 : hsl.h)), sat, Math.min(0.66, hsl.l * 1.4 + 0.04))
      const arr = B.col
      for (let i = start; i < end; i += 3) {
        arr[i] = c.r
        arr[i + 1] = c.g
        arr[i + 2] = c.b
      }
      touched.add(B)
    }
    for (const [B, m] of [[tile, tileMesh], [flat, flatMesh]]) {
      if (!m || !touched.has(B)) continue
      m.geometry.setAttribute('color', new THREE.Float32BufferAttribute(B.col, 3))
    }
  }
  return { group, applyRoofColors }
}
