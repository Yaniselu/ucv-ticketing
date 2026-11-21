// Împrejurimile construite în 3D din OpenStreetMap, peste imaginea satelit:
// carosabil cu asfalt și marcaje, borduri și trotuare, parcări cu mașini 3D,
// spații verzi cu iarbă și Sala Polivalentă modelată separat.
import * as THREE from 'three'
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js'
import { paverMaterial, curbMaterial } from './paving.js'

function rng(seed) {
  let s = seed >>> 0
  return () => ((s = (s * 1664525 + 1013904223) >>> 0) / 4294967296)
}

function canvasTex(w, h, draw, { repeat = true, srgb = true } = {}) {
  const c = document.createElement('canvas')
  c.width = w
  c.height = h
  draw(c.getContext('2d'), w, h)
  const t = new THREE.CanvasTexture(c)
  if (srgb) t.colorSpace = THREE.SRGBColorSpace
  if (repeat) t.wrapS = t.wrapT = THREE.RepeatWrapping
  t.anisotropy = 8
  return t
}

function noiseFill(g, w, h, base, amp, seed) {
  g.fillStyle = base
  g.fillRect(0, 0, w, h)
  const img = g.getImageData(0, 0, w, h)
  const r = rng(seed)
  for (let i = 0; i < img.data.length; i += 4) {
    const n = (r() - 0.5) * amp
    img.data[i] += n
    img.data[i + 1] += n
    img.data[i + 2] += n
  }
  g.putImageData(img, 0, 0)
}

const asphaltTex = () => canvasTex(256, 256, (g, w, h) => {
  noiseFill(g, w, h, '#3d4045', 26, 4)
  // pete de reparații și uzură
  const r = rng(8)
  for (let k = 0; k < 14; k++) {
    g.fillStyle = `rgba(${r() < 0.5 ? '20,22,25' : '90,92,96'},${0.12 + r() * 0.12})`
    g.fillRect(r() * w, r() * h, 10 + r() * 50, 6 + r() * 30)
  }
})
const pavingTex = () => canvasTex(256, 256, (g, w, h) => {
  g.fillStyle = '#9c9a95'
  g.fillRect(0, 0, w, h)
  const r = rng(3)
  for (let y = 0; y < h; y += 16) for (let x = 0; x < w; x += 16) {
    const v = 150 + Math.floor(r() * 40)
    g.fillStyle = `rgb(${v},${v - 2},${v - 6})`
    g.fillRect(x + 1, y + 1, 14, 14)
  }
})
const grassTex = () => canvasTex(256, 256, (g, w, h) => {
  noiseFill(g, w, h, '#58733a', 40, 12)
  const r = rng(5)
  for (let k = 0; k < 900; k++) {
    g.fillStyle = `rgba(${r() < 0.5 ? '120,150,70' : '50,70,30'},0.35)`
    g.fillRect(r() * w, r() * h, 1, 3 + r() * 4)
  }
})
const dashTex = () => canvasTex(16, 64, (g) => {
  g.clearRect(0, 0, 16, 64)
  g.fillStyle = '#f2f2ee'
  g.fillRect(0, 0, 16, 32)
})

// bandă de lățime w în jurul unei polilinii; off = deplasarea laterală
function ribbon(flat, w, y, off = 0, vScale = 8, meters = false) {
  const pts = []
  for (let i = 0; i < flat.length; i += 2) pts.push([flat[i], flat[i + 1]])
  const n = pts.length
  if (n < 2) return null
  const pos = []
  const uv = []
  let acc = 0
  const L = []
  const R = []
  for (let i = 0; i < n; i++) {
    const a = pts[Math.max(0, i - 1)]
    const b = pts[Math.min(n - 1, i + 1)]
    let dx = b[0] - a[0]
    let dz = b[1] - a[1]
    const len = Math.hypot(dx, dz) || 1
    dx /= len
    dz /= len
    const nx = -dz
    const nz = dx
    L.push([pts[i][0] + nx * (off + w / 2), pts[i][1] + nz * (off + w / 2)])
    R.push([pts[i][0] + nx * (off - w / 2), pts[i][1] + nz * (off - w / 2)])
  }
  for (let i = 0; i < n - 1; i++) {
    const seg = Math.hypot(pts[i + 1][0] - pts[i][0], pts[i + 1][1] - pts[i][1])
    const v0 = acc / vScale
    const v1 = (acc + seg) / vScale
    acc += seg
    pos.push(L[i][0], y, L[i][1], R[i][0], y, R[i][1], R[i + 1][0], y, R[i + 1][1], L[i][0], y, L[i][1], R[i + 1][0], y, R[i + 1][1], L[i + 1][0], y, L[i + 1][1])
    const uw = meters ? w : 1
    const a0 = meters ? acc - seg : 0
    if (meters) uv.push(0, a0, uw, a0, uw, a0 + seg, 0, a0, uw, a0 + seg, 0, a0 + seg)
    else uv.push(0, v0, 1, v0, 1, v1, 0, v0, 1, v1, 0, v1)
  }
  const g = new THREE.BufferGeometry()
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3))
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2))
  g.computeVertexNormals()
  return g
}

function polygonGeometry(flat, y, uvScale) {
  const pts = []
  for (let i = 0; i < flat.length; i += 2) pts.push(new THREE.Vector2(flat[i], flat[i + 1]))
  if (pts.length < 3) return null
  const tri = THREE.ShapeUtils.triangulateShape(pts, [])
  const pos = []
  const uv = []
  for (const t of tri) for (const k of [t[0], t[2], t[1]]) {
    pos.push(pts[k].x, y, pts[k].y)
    uv.push(pts[k].x / uvScale, pts[k].y / uvScale)
  }
  const g = new THREE.BufferGeometry()
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3))
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2))
  g.computeVertexNormals()
  return g
}

function inPoly(x, z, flat) {
  let inside = false
  for (let i = 0, j = flat.length - 2; i < flat.length; j = i, i += 2) {
    const xi = flat[i], zi = flat[i + 1], xj = flat[j], zj = flat[j + 1]
    if ((zi > z) !== (zj > z) && x < ((xj - xi) * (z - zi)) / (zj - zi) + xi) inside = !inside
  }
  return inside
}

// axa principală a unui poligon (pentru orientarea locurilor de parcare / a sălii)
function principal(flat) {
  const n = flat.length / 2
  let cx = 0, cz = 0
  for (let i = 0; i < flat.length; i += 2) { cx += flat[i]; cz += flat[i + 1] }
  cx /= n; cz /= n
  let sxx = 0, szz = 0, sxz = 0
  for (let i = 0; i < flat.length; i += 2) {
    const x = flat[i] - cx, z = flat[i + 1] - cz
    sxx += x * x; szz += z * z; sxz += x * z
  }
  const th = 0.5 * Math.atan2(2 * sxz, sxx - szz)
  const ux = Math.cos(th), uz = Math.sin(th)
  let u0 = Infinity, u1 = -Infinity, v0 = Infinity, v1 = -Infinity
  for (let i = 0; i < flat.length; i += 2) {
    const x = flat[i] - cx, z = flat[i + 1] - cz
    const u = x * ux + z * uz
    const v = -x * uz + z * ux
    u0 = Math.min(u0, u); u1 = Math.max(u1, u); v0 = Math.min(v0, v); v1 = Math.max(v1, v)
  }
  return { cx, cz, ux, uz, u0, u1, v0, v1 }
}

function carGeometry() {
  const parts = []
  const box = (w, h, d, y, z = 0) => parts.push(new THREE.BoxGeometry(w, h, d).translate(0, y, z).toNonIndexed())
  box(1.78, 0.62, 4.35, 0.52)
  box(1.7, 0.18, 4.2, 0.18)
  const cabin = new THREE.CylinderGeometry(0.62, 0.86, 0.5, 4, 1)
  cabin.rotateY(Math.PI / 4)
  cabin.scale(1.38, 1, 2.3)
  cabin.translate(0, 1.07, -0.2)
  parts.push(cabin.toNonIndexed())
  return mergeGeometries(parts)
}
const CAR_COLORS = ['#f2f2f2', '#e8e8e8', '#1c1c1e', '#2a2d33', '#8d9196', '#b8bcc1', '#6f747a', '#1f3b6e', '#7a1f1f', '#3b4a3a', '#c9c3b5', '#24425f', '#9a9fa5']

// ─── Străzile, trotuarele și pavajul ────────────────────────────────
// Carosabilul (asfalt / piatră cubică / neasfaltat), bordurile de granit înălțate, trotuarele cu
// pavele pe ambele părți (după eticheta sidewalk din OSM), aleile cu pavele, piețele pietonale și
// trecerile de pietoni. Trotuarele se opresc în intersecții (acolo unde intră altă stradă).
const Y_ROAD = 0.06
const Y_WALK = 0.19
const CURB = 0.16
const WALK_W = [4.0, 3.5, 3.0, 2.2]

class QuadBuf {
  constructor() {
    this.pos = []
    this.uv = []
  }
  quad(a, b, c, d, ua, ub, uc, ud) {
    this.pos.push(...a, ...b, ...c, ...a, ...c, ...d)
    this.uv.push(...ua, ...ub, ...uc, ...ua, ...uc, ...ud)
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

// indexul segmentelor de stradă, pentru a afla unde intră altă stradă (intersecții)
function roadIndex(roads) {
  const cell = 20
  const grid = new Map()
  const key = (i, j) => `${i},${j}`
  roads.forEach((r, id) => {
    const [cls, width, , flat] = r
    if (cls > 4) return
    for (let i = 0; i < flat.length - 2; i += 2) {
      const ax = flat[i], az = flat[i + 1], bx = flat[i + 2], bz = flat[i + 3]
      const seg = [ax, az, bx, bz, width / 2, id]
      const i0 = Math.floor(Math.min(ax, bx) / cell) - 1, i1 = Math.floor(Math.max(ax, bx) / cell) + 1
      const j0 = Math.floor(Math.min(az, bz) / cell) - 1, j1 = Math.floor(Math.max(az, bz) / cell) + 1
      for (let x = i0; x <= i1; x++) for (let z = j0; z <= j1; z++) {
        const k = key(x, z)
        if (!grid.has(k)) grid.set(k, [])
        grid.get(k).push(seg)
      }
    }
  })
  // e punctul (x, z) pe carosabilul altei străzi decât `self` (cu o margine)?
  return (x, z, self, margin) => {
    const list = grid.get(key(Math.floor(x / cell), Math.floor(z / cell)))
    if (!list) return false
    for (const [ax, az, bx, bz, hw, id] of list) {
      if (id === self) continue
      const dx = bx - ax, dz = bz - az
      const L2 = dx * dx + dz * dz || 1
      const t = Math.max(0, Math.min(1, ((x - ax) * dx + (z - az) * dz) / L2))
      const px = ax + dx * t - x, pz = az + dz * t - z
      if (px * px + pz * pz < (hw + margin) ** 2) return true
    }
    return false
  }
}

// împarte o polilinie în bucăți de cel mult `step` metri: [x, z, dirX, dirZ, s0, s1]
function pieces(flat, step) {
  const out = []
  let acc = 0
  for (let i = 0; i < flat.length - 2; i += 2) {
    const ax = flat[i], az = flat[i + 1], bx = flat[i + 2], bz = flat[i + 3]
    const len = Math.hypot(bx - ax, bz - az)
    if (len < 0.01) continue
    const n = Math.max(1, Math.ceil(len / step))
    const dx = (bx - ax) / len, dz = (bz - az) / len
    for (let k = 0; k < n; k++) {
      const t0 = k / n, t1 = (k + 1) / n
      out.push([ax + (bx - ax) * t0, az + (bz - az) * t0, ax + (bx - ax) * t1, az + (bz - az) * t1, dx, dz, acc + len * t0, acc + len * t1])
    }
    acc += len
  }
  return out
}

export function buildCity(data, { lowSpec = false } = {}) {
  const group = new THREE.Group()
  const RMAX = lowSpec ? 700 : 1050
  const onOtherRoad = roadIndex(data.roads)
  const inPodium = (x, z) => (x / 116) ** 2 + (z / 128) ** 2 < 1
  const greens = data.areas.filter((a) => a[0] === 0).map((a) => a[1])
  const inGreen = (x, z) => greens.some((f) => inPoly(x, z, f))
  const B = { asphalt: [], sett: [], gravel: [], lines: [] }
  const walk = { spic: new QuadBuf(), rosu: new QuadBuf(), patrat: new QuadBuf() }
  const curbTop = new QuadBuf()
  const curbFace = new QuadBuf()

  data.roads.forEach((r, id) => {
    const [cls, width, , flat, surf = 0, side = 4, fk = 0] = r
    const mid = [flat[Math.floor(flat.length / 4) * 2], flat[Math.floor(flat.length / 4) * 2 + 1]]
    const d = Math.hypot(mid[0], mid[1])
    if (d > RMAX || inPodium(mid[0], mid[1])) return
    if (cls <= 4) {
      const g = ribbon(flat, width, cls <= 3 ? Y_ROAD : Y_ROAD - 0.01, 0, 1, true)
      if (g) (surf === 1 ? B.sett : surf === 2 ? B.gravel : B.asphalt).push(g)
      if (cls <= 2 && surf === 0) {
        const ln = ribbon(flat, 0.14, Y_ROAD + 0.012, 0, 6)
        if (ln) B.lines.push(ln)
      }
      // trotuare și borduri pe străzile cu trotuar (după OSM; implicit pe ambele părți)
      if (cls <= 3 && side !== 0 && surf !== 2) {
        const sides = side === 1 ? [1] : side === 2 ? [-1] : [1, -1]
        const sw = WALK_W[cls]
        for (const sd of sides) {
          for (const [ax, az, bx, bz, dx, dz, s0, s1] of pieces(flat, 3)) {
            const nx = -dz * sd, nz = dx * sd
            const mx = (ax + bx) / 2 + nx * (width / 2 + CURB + sw / 2)
            const mz = (az + bz) / 2 + nz * (width / 2 + CURB + sw / 2)
            if (Math.hypot(mx, mz) > RMAX || inPodium(mx, mz)) continue
            // în intersecții (pe carosabilul altei străzi) nu e trotuar
            if (onOtherRoad(mx, mz, id, 0.6) || onOtherRoad((ax + bx) / 2 + nx * (width / 2 + 0.05), (az + bz) / 2 + nz * (width / 2 + 0.05), id, 0.3)) continue
            const P = (x, z, off, y) => [x + nx * off, y, z + nz * off]
            const o0 = width / 2
            const o1 = o0 + CURB
            const o2 = o1 + sw
            // bordura: fața spre carosabil și partea de sus
            curbFace.quad(P(ax, az, o0, Y_ROAD), P(bx, bz, o0, Y_ROAD), P(bx, bz, o0, Y_WALK + 0.01), P(ax, az, o0, Y_WALK + 0.01), [s0, 0], [s1, 0], [s1, 0.13], [s0, 0.13])
            curbTop.quad(P(ax, az, o0, Y_WALK + 0.01), P(bx, bz, o0, Y_WALK + 0.01), P(bx, bz, o1, Y_WALK + 0.01), P(ax, az, o1, Y_WALK + 0.01), [s0, 0], [s1, 0], [s1, CURB], [s0, CURB])
            // trotuarul cu pavele (UV în metri: de-a lungul străzii și pe lățime)
            walk.spic.quad(P(ax, az, o1, Y_WALK), P(bx, bz, o1, Y_WALK), P(bx, bz, o2, Y_WALK), P(ax, az, o2, Y_WALK), [s0, 0], [s1, 0], [s1, sw], [s0, sw])
            // marginea exterioară (spre curți / spațiu verde), 12 cm mai sus decât terenul
            curbFace.quad(P(ax, az, o2, Y_WALK), P(bx, bz, o2, Y_WALK), P(bx, bz, o2, Y_ROAD - 0.02), P(ax, az, o2, Y_ROAD - 0.02), [s0, 0], [s1, 0], [s1, 0.13], [s0, 0.13])
          }
        }
      }
    } else if (fk !== 2) {
      // aleile: pavele gri lângă străzi, roșii prin parcuri
      const w = Math.min(Math.max(width, 1.6), 3)
      const parkPath = fk !== 1 && inGreen(mid[0], mid[1])
      const buf = parkPath ? walk.rosu : walk.spic
      for (const [ax, az, bx, bz, dx, dz, s0, s1] of pieces(flat, 4)) {
        const mx = (ax + bx) / 2, mz = (az + bz) / 2
        if (Math.hypot(mx, mz) > RMAX || inPodium(mx, mz) || onOtherRoad(mx, mz, id, 0.2)) continue
        const nx = -dz, nz = dx
        const y = Y_ROAD + 0.05
        buf.quad([ax + nx * w / 2, y, az + nz * w / 2], [bx + nx * w / 2, y, bz + nz * w / 2], [bx - nx * w / 2, y, bz - nz * w / 2], [ax - nx * w / 2, y, az - nz * w / 2], [s0, 0], [s1, 0], [s1, w], [s0, w])
      }
    }
  })

  // piețele pietonale: pavele pătrate
  for (const [kind, flat] of data.areas) {
    if (kind !== 4 || flat.length < 6) continue
    const pts = []
    for (let i = 0; i < flat.length; i += 2) pts.push(new THREE.Vector2(flat[i], flat[i + 1]))
    const tri = THREE.ShapeUtils.triangulateShape(pts, [])
    const y = Y_ROAD + 0.07
    for (const t of tri) {
      const [a, b, c] = [pts[t[0]], pts[t[2]], pts[t[1]]]
      walk.patrat.pos.push(a.x, y, a.y, b.x, y, b.y, c.x, y, c.y)
      walk.patrat.uv.push(a.x, a.y, b.x, b.y, c.x, c.y)
    }
  }

  // materialele
  const asphalt = asphaltTex()
  asphalt.repeat.set(1 / 6, 1 / 6)
  const roadMat = new THREE.MeshStandardMaterial({ map: asphalt, roughness: 0.95, side: THREE.DoubleSide, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 })
  const add = (geos, mat, shadow = true) => {
    mat.side = THREE.DoubleSide
    if (!geos.length) return
    const m = new THREE.Mesh(mergeGeometries(geos), mat)
    m.receiveShadow = shadow && !lowSpec
    group.add(m)
  }
  add(B.asphalt, roadMat)
  add(B.sett, paverMaterial('piatra', { size: lowSpec ? 512 : 1024 }))
  add(B.gravel, new THREE.MeshStandardMaterial({ color: 0x9c9585, roughness: 1, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 }))
  add(B.lines, new THREE.MeshStandardMaterial({ map: dashTex(), alphaTest: 0.5, roughness: 0.6, polygonOffset: true, polygonOffsetFactor: -4, polygonOffsetUnits: -4 }), false)
  const size = lowSpec ? 512 : 1024
  for (const [k, buf] of Object.entries(walk)) {
    const g = buf.geometry()
    if (!g) continue
    const pm = paverMaterial(k, { size })
    pm.side = THREE.DoubleSide
    const m = new THREE.Mesh(g, pm)
    m.receiveShadow = !lowSpec
    group.add(m)
  }
  const curbMat = curbMaterial()
  curbMat.side = THREE.DoubleSide
  for (const buf of [curbTop, curbFace]) {
    const g = buf.geometry()
    if (g) group.add(new THREE.Mesh(g, curbMat))
  }

  // trecerile de pietoni (zebra): benzi albe de 50 cm, paralele cu strada, pe toată lățimea ei
  {
    const bars = []
    for (const [cx, cz] of data.crossings || []) {
      if (Math.hypot(cx, cz) > RMAX || inPodium(cx, cz)) continue
      // strada cea mai apropiată (segmentul) din jurul trecerii
      let best = null
      for (const r of data.roads) {
        if (r[0] > 3) continue
        const f = r[3]
        for (let i = 0; i < f.length - 2; i += 2) {
          const ax = f[i], az = f[i + 1], bx = f[i + 2], bz = f[i + 3]
          const dx = bx - ax, dz = bz - az
          const L2 = dx * dx + dz * dz || 1
          const t = Math.max(0, Math.min(1, ((cx - ax) * dx + (cz - az) * dz) / L2))
          const dd = Math.hypot(ax + dx * t - cx, az + dz * t - cz)
          if (dd < 2 && (!best || dd < best.dd)) best = { dd, dx, dz, w: r[1] }
        }
      }
      if (!best) continue
      const L = Math.hypot(best.dx, best.dz)
      const ux = best.dx / L, uz = best.dz / L
      const n = Math.floor((best.w - 0.4) / 1.0)
      for (let k = 0; k < n; k++) {
        const off = -((n - 1) * 1.0) / 2 + k * 1.0
        bars.push([cx - uz * off, cz + ux * off, Math.atan2(ux, uz)])
      }
    }
    if (bars.length) {
      const zeb = new THREE.InstancedMesh(new THREE.PlaneGeometry(0.5, 3.2).rotateX(-Math.PI / 2), new THREE.MeshStandardMaterial({ color: 0xeeeeea, roughness: 0.7, polygonOffset: true, polygonOffsetFactor: -5, polygonOffsetUnits: -5 }), bars.length)
      const m4 = new THREE.Matrix4()
      const q = new THREE.Quaternion()
      const up = new THREE.Vector3(0, 1, 0)
      bars.forEach(([x, z, a], k) => {
        m4.compose(new THREE.Vector3(x, Y_ROAD + 0.008, z), q.setFromAxisAngle(up, a), new THREE.Vector3(1, 1, 1))
        zeb.setMatrixAt(k, m4)
      })
      zeb.computeBoundingSphere()
      group.add(zeb)
    }
  }

  // spații verzi
  const grassGeo = []
  for (const [kind, flat] of data.areas) {
    if (kind !== 0 || flat.length < 6) continue
    const g = polygonGeometry(flat, 0.04, 6)
    if (g) grassGeo.push(g)
  }
  if (grassGeo.length) group.add(new THREE.Mesh(mergeGeometries(grassGeo), new THREE.MeshStandardMaterial({ map: grassTex(), roughness: 1, polygonOffset: true, polygonOffsetFactor: -1, polygonOffsetUnits: -1 })))

  // parcări: asfalt, marcaje și mașini 3D
  const lotGeo = []
  const cars = []
  const marks = []
  const r = rng(21)
  for (const [kind, flat] of data.areas) {
    if (kind !== 1 || flat.length < 6) continue
    const g = polygonGeometry(flat, Y_ROAD - 0.005, 6)
    if (g) lotGeo.push(g)
    const P = principal(flat)
    const span = P.v1 - P.v0
    if (P.u1 - P.u0 < 6 || span < 5) continue
    // rânduri de locuri: 5 m adâncime, culoar de 6 m
    for (let v = P.v0 + 2.6; v < P.v1 - 2.4; v += span > 16 ? 8 : 5.2) {
      for (let u = P.u0 + 1.4; u < P.u1 - 1.2; u += 2.6) {
        const x = P.cx + u * P.ux - v * P.uz
        const z = P.cz + u * P.uz + v * P.ux
        if (!inPoly(x, z, flat)) continue
        marks.push([x + 1.3 * P.ux, z + 1.3 * P.uz, Math.atan2(P.ux, P.uz)])
        if (r() < 0.68) cars.push([x, z, Math.atan2(-P.uz, P.ux) + (r() < 0.5 ? 0 : Math.PI) + (r() - 0.5) * 0.06])
      }
    }
  }
  if (lotGeo.length) group.add(new THREE.Mesh(mergeGeometries(lotGeo), roadMat))
  const m4 = new THREE.Matrix4()
  const q = new THREE.Quaternion()
  const up = new THREE.Vector3(0, 1, 0)
  const one = new THREE.Vector3(1, 1, 1)
  if (marks.length) {
    const mk = new THREE.InstancedMesh(new THREE.PlaneGeometry(0.12, 5).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ color: 0xe9e9e4 }), marks.length)
    marks.forEach(([x, z, a], k) => {
      m4.compose(new THREE.Vector3(x, Y_ROAD + 0.01, z), q.setFromAxisAngle(up, a + Math.PI / 2), one)
      mk.setMatrixAt(k, m4)
    })
    group.add(mk)
  }
  // mașini parcate și pe marginea străzilor rezidențiale de lângă stadion
  for (const [cls, width, , flat] of data.roads) {
    if (cls !== 3) continue
    for (let i = 0; i < flat.length - 2; i += 2) {
      const ax = flat[i], az = flat[i + 1], bx = flat[i + 2], bz = flat[i + 3]
      const len = Math.hypot(bx - ax, bz - az)
      if (!len || Math.hypot(ax, az) > 420) continue
      const dx = (bx - ax) / len, dz = (bz - az) / len
      for (let s = 3; s < len - 3; s += 6.5) {
        if (r() > 0.32) continue
        const side = r() < 0.5 ? 1 : -1
        const off = width / 2 - 1.1
        cars.push([ax + dx * s - dz * off * side, az + dz * s + dx * off * side, Math.atan2(dx, dz)])
      }
    }
  }
  if (cars.length) {
    const body = new THREE.InstancedMesh(carGeometry(), new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.32, metalness: 0.5 }), cars.length)
    const glass = new THREE.InstancedMesh(new THREE.BoxGeometry(1.5, 0.36, 1.9).translate(0, 1.1, -0.2), new THREE.MeshStandardMaterial({ color: 0x1b2430, roughness: 0.1, metalness: 0.6 }), cars.length)
    const c = new THREE.Color()
    cars.forEach(([x, z, a], k) => {
      m4.compose(new THREE.Vector3(x, Y_ROAD, z), q.setFromAxisAngle(up, a), one)
      body.setMatrixAt(k, m4)
      glass.setMatrixAt(k, m4)
      body.setColorAt(k, c.set(CAR_COLORS[Math.floor(r() * CAR_COLORS.length)]))
    })
    body.castShadow = !lowSpec
    group.add(body, glass)
  }

  // Sala Polivalentă: volum vitrat cu acoperiș curb metalic
  const hall = data.buildings.find((b) => b[3] === 'Sala Polivalentă')
  if (hall) group.add(buildHall(hall[2]))
  return group
}

function buildHall(flat) {
  const P = principal(flat)
  const L = P.u1 - P.u0
  const W = P.v1 - P.v0
  const g = new THREE.Group()
  const wallH = 13
  const facade = canvasTex(256, 256, (c) => {
    const grd = c.createLinearGradient(0, 0, 0, 256)
    grd.addColorStop(0, '#6f8597')
    grd.addColorStop(1, '#42525f')
    c.fillStyle = grd
    c.fillRect(0, 0, 256, 256)
    c.fillStyle = '#d9dde0'
    for (let x = 0; x < 256; x += 32) c.fillRect(x, 0, 3, 256)
    c.fillRect(0, 124, 256, 6)
    c.fillRect(0, 0, 256, 10)
  })
  facade.repeat.set(L / 6, 2)
  const body = new THREE.Mesh(new THREE.BoxGeometry(L, wallH, W), new THREE.MeshStandardMaterial({ map: facade, roughness: 0.25, metalness: 0.35 }))
  body.position.y = wallH / 2
  g.add(body)
  // bolta metalică pe lungime
  const ribs = canvasTex(512, 16, (c) => {
    c.fillStyle = '#d6dade'
    c.fillRect(0, 0, 512, 16)
    c.fillStyle = 'rgba(120,128,136,0.5)'
    for (let x = 0; x < 512; x += 8) c.fillRect(x, 0, 1, 16)
  })
  ribs.repeat.set(4, 1)
  const rise = 8
  const R = (W * W) / (8 * rise) + rise / 2
  const ang = 2 * Math.asin(W / 2 / R)
  const vault = new THREE.CylinderGeometry(R, R, L + 1.5, 64, 1, false, -ang / 2, ang)
  vault.rotateZ(Math.PI / 2)
  vault.rotateX(-Math.PI / 2)
  vault.translate(0, wallH + rise - R, 0)
  const roof = new THREE.Mesh(vault, new THREE.MeshStandardMaterial({ map: ribs, roughness: 0.35, metalness: 0.6, side: THREE.DoubleSide }))
  g.add(roof)
  g.position.set(P.cx, 0, P.cz)
  g.rotation.y = -Math.atan2(P.uz, P.ux)
  g.traverse((o) => { o.castShadow = true; o.receiveShadow = true })
  return g
}
