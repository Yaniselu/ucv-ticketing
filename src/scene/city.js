// Împrejurimile construite în 3D din OpenStreetMap, peste imaginea satelit:
// carosabil cu asfalt și marcaje, borduri și trotuare, parcări cu mașini 3D,
// spații verzi cu iarbă și Sala Polivalentă modelată separat.
import * as THREE from 'three'
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js'
import { paverMaterial, curbMaterial, asphaltMaterial, grassMaterial } from './paving.js'
import { inPrecinct } from './precinct.js'
import { carMeshes } from './cars.js'

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

// indexul clădirilor (grilă de 25 m), pentru a nu pune locuri de parcare peste ele
function buildingIndex(buildings) {
  const cell = 25
  const grid = new Map()
  for (const b of buildings) {
    const f = b[2]
    let x0 = Infinity, z0 = Infinity, x1 = -Infinity, z1 = -Infinity
    for (let i = 0; i < f.length; i += 2) {
      x0 = Math.min(x0, f[i]); x1 = Math.max(x1, f[i]); z0 = Math.min(z0, f[i + 1]); z1 = Math.max(z1, f[i + 1])
    }
    for (let i = Math.floor(x0 / cell); i <= Math.floor(x1 / cell); i++) {
      for (let j = Math.floor(z0 / cell); j <= Math.floor(z1 / cell); j++) {
        const k = i + ',' + j
        if (!grid.has(k)) grid.set(k, [])
        grid.get(k).push(f)
      }
    }
  }
  return (x, z) => {
    const list = grid.get(Math.floor(x / cell) + ',' + Math.floor(z / cell))
    return !!list && list.some((f) => inPoly(x, z, f))
  }
}

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
  // incinta stadionului (podiumul, esplanada) e modelată separat, în precinct.js
  const inPodium = (x, z) => inPrecinct(x, z)
  const greens = data.areas.filter((a) => a[0] === 0).map((a) => a[1])
  const inGreen = (x, z) => greens.some((f) => inPoly(x, z, f))
  const pitches = data.areas.filter((a) => a[0] === 2).map((a) => a[1])
  const inPitch = (x, z) => pitches.some((f) => inPoly(x, z, f))
  const B = { asphalt: [], sett: [], gravel: [], lines: [] }
  const walk = { spic: new QuadBuf(), rosu: new QuadBuf(), patrat: new QuadBuf() }
  const curbTop = new QuadBuf()
  const curbFace = new QuadBuf()

  data.roads.forEach((r, id) => {
    const [cls, width, , flat, surf = 0, side = 4, fk = 0] = r
    const mid = [flat[Math.floor(flat.length / 4) * 2], flat[Math.floor(flat.length / 4) * 2 + 1]]
    const d = Math.hypot(mid[0], mid[1])
    if (d > RMAX) return
    if (d < 400) {
      let inside = 0
      for (let i = 0; i < flat.length; i += 2) if (inPodium(flat[i], flat[i + 1])) inside++
      if (inside / (flat.length / 2) > 0.6) return
    }
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
  const centroid = (flat) => {
    let x = 0, z = 0
    for (let i = 0; i < flat.length; i += 2) { x += flat[i]; z += flat[i + 1] }
    return [x / (flat.length / 2), z / (flat.length / 2)]
  }
  for (const [kind, flat] of data.areas) {
    if (kind !== 4 || flat.length < 6) continue
    if (inPodium(...centroid(flat))) continue
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
  // asfaltul la scară reală (agregat, relief), UV-urile benzilor sunt în metri
  const roadMat = asphaltMaterial({ size: lowSpec ? 512 : 1024 })
  Object.assign(roadMat, { side: THREE.DoubleSide, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 })
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

  // spații verzi: gazonul puțin ridicat, cu bordură de granit pe contur (la zonele urbane mici)
  {
    const lawnGeo = []
    const curb = new QuadBuf()
    for (const [kind, flat] of data.areas) {
      if (kind !== 0 || flat.length < 6) continue
      const c = centroid(flat)
      if (Math.hypot(...c) > RMAX || inPodium(...c)) continue
      let per = 0
      let area2 = 0
      const n = flat.length / 2
      for (let i = 0; i < n; i++) {
        const j = (i + 1) % n
        per += Math.hypot(flat[j * 2] - flat[i * 2], flat[j * 2 + 1] - flat[i * 2 + 1])
        area2 += flat[i * 2] * flat[j * 2 + 1] - flat[j * 2] * flat[i * 2 + 1]
      }
      const curbed = per < 700
      const g = polygonGeometry(flat, curbed ? 0.13 : 0.05, 1)
      if (g) lawnGeo.push(g)
      if (!curbed) continue
      // sensul conturului → normala spre interior
      const sgn = area2 > 0 ? 1 : -1
      for (let i = 0; i < n; i++) {
        const j = (i + 1) % n
        const ax = flat[i * 2], az = flat[i * 2 + 1], bx = flat[j * 2], bz = flat[j * 2 + 1]
        const L = Math.hypot(bx - ax, bz - az)
        if (L < 0.05) continue
        const ix = (-(bz - az) / L) * sgn * -1, iz = ((bx - ax) / L) * sgn * -1
        const w = 0.12
        // fața exterioară și partea de sus a bordurii
        curb.quad([ax, 0.02, az], [bx, 0.02, bz], [bx, 0.17, bz], [ax, 0.17, az], [0, 0], [L, 0], [L, 0.15], [0, 0.15])
        curb.quad([ax, 0.17, az], [bx, 0.17, bz], [bx + ix * w, 0.17, bz + iz * w], [ax + ix * w, 0.17, az + iz * w], [0, 0], [L, 0], [L, w], [0, w])
      }
    }
    if (lawnGeo.length) {
      const g = mergeGeometries(lawnGeo)
      // pete de culoare (gazon mai închis / mai uscat), la scara de zeci de metri
      const p = g.attributes.position
      const col = new Float32Array(p.count * 3)
      for (let i = 0; i < p.count; i++) {
        const x = p.getX(i), z = p.getZ(i)
        const v = 0.8 + 0.2 * Math.sin(x * 0.043 + Math.sin(z * 0.05) * 2) * Math.cos(z * 0.037 - x * 0.01) + 0.06 * Math.sin(x * 0.31 + z * 0.27)
        col[i * 3] = v * 1.02
        col[i * 3 + 1] = v
        col[i * 3 + 2] = v * 0.93
      }
      g.setAttribute('color', new THREE.BufferAttribute(col, 3))
      const gm = grassMaterial({ size: lowSpec ? 512 : 1024 })
      Object.assign(gm, { vertexColors: true, side: THREE.DoubleSide, polygonOffset: true, polygonOffsetFactor: -1, polygonOffsetUnits: -1 })
      const m = new THREE.Mesh(g, gm)
      m.receiveShadow = !lowSpec
      group.add(m)
    }
    const cg = curb.geometry()
    if (cg) group.add(new THREE.Mesh(cg, curbMat))
  }

  // parcări: asfalt, locuri trasate de-a lungul culoarelor (OSM: service = parking_aisle),
  // borduri pe contur (în afară de intrări) și mașini 3D
  const lotGeo = []
  const cars = []
  const marks = []
  const r = rng(21)
  const lots = data.areas.filter(([kind, flat]) => kind === 1 && flat.length >= 6 && Math.hypot(...centroid(flat)) < RMAX && !inPodium(...centroid(flat))).map((a) => a[1])
  const inLot = (x, z) => lots.find((f) => inPoly(x, z, f))
  const bIndex = buildingIndex(data.buildings)
  const lotHasAisle = new Set()
  const lotCurb = new QuadBuf()
  for (const flat of lots) {
    const g = polygonGeometry(flat, Y_ROAD - 0.005, 1)
    if (g) lotGeo.push(g)
  }
  // locurile de-a lungul culoarelor
  data.roads.forEach((road, id) => {
    const [cls, width, , flat, , , fk] = road
    if (cls !== 4 || fk !== 3) return
    const mx = flat[Math.floor(flat.length / 4) * 2], mz = flat[Math.floor(flat.length / 4) * 2 + 1]
    if (Math.hypot(mx, mz) > RMAX) return
    const aisleLot = inLot(mx, mz)
    if (aisleLot) lotHasAisle.add(aisleLot)
    const half = Math.max(3, width / 2 + 0.5)
    for (let i = 0; i < flat.length - 2; i += 2) {
      const ax = flat[i], az = flat[i + 1], bx = flat[i + 2], bz = flat[i + 3]
      const len = Math.hypot(bx - ax, bz - az)
      if (len < 3) continue
      const dx = (bx - ax) / len, dz = (bz - az) / len
      for (const sd of [1, -1]) {
        const nx = -dz * sd, nz = dx * sd
        for (let s = 1.6; s < len - 1.6; s += 2.5) {
          const cx = ax + dx * s + nx * (half + 2.5)
          const cz = az + dz * s + nz * (half + 2.5)
          if (inPodium(cx, cz) || onOtherRoad(cx, cz, id, 1.2) || bIndex(cx, cz) || inPitch(cx, cz) || inPitch(cx + nx * 2.6, cz + nz * 2.6)) continue
          if (aisleLot ? !inPoly(cx, cz, aisleLot) : inGreen(cx, cz)) continue
          // linia dintre locuri (perpendiculară pe culoar)
          marks.push([cx + dx * 1.25, cz + dz * 1.25, Math.atan2(nx, nz)])
          if (r() < 0.72) cars.push([cx + dx * (r() - 0.5) * 0.25, Y_ROAD, cz + dz * (r() - 0.5) * 0.25, Math.atan2(nx, nz) + (r() < 0.75 ? Math.PI : 0) + (r() - 0.5) * 0.06])
        }
      }
    }
  })
  for (const flat of lots) {
    // bordura pe contur; unde intră o stradă sau culoarul, rămâne liber
    const n = flat.length / 2
    for (let i = 0; i < n; i++) {
      const j = (i + 1) % n
      const ax = flat[i * 2], az = flat[i * 2 + 1], bx = flat[j * 2], bz = flat[j * 2 + 1]
      const L = Math.hypot(bx - ax, bz - az)
      const k = Math.max(1, Math.ceil(L / 2))
      for (let q = 0; q < k; q++) {
        const x0 = ax + ((bx - ax) * q) / k, z0 = az + ((bz - az) * q) / k
        const x1 = ax + ((bx - ax) * (q + 1)) / k, z1 = az + ((bz - az) * (q + 1)) / k
        if (onOtherRoad((x0 + x1) / 2, (z0 + z1) / 2, -1, 0.4)) continue
        lotCurb.quad([x0, Y_ROAD - 0.01, z0], [x1, Y_ROAD - 0.01, z1], [x1, Y_WALK + 0.01, z1], [x0, Y_WALK + 0.01, z0], [0, 0], [L / k, 0], [L / k, 0.15], [0, 0.15])
      }
    }
    if (lotHasAisle.has(flat)) continue
    // parcările fără culoar în OSM: rânduri de locuri pe axa lungă
    const P = principal(flat)
    const span = P.v1 - P.v0
    if (P.u1 - P.u0 < 6 || span < 5) continue
    for (let v = P.v0 + 2.6; v < P.v1 - 2.4; v += span > 16 ? 8 : 5.2) {
      for (let u = P.u0 + 1.4; u < P.u1 - 1.2; u += 2.6) {
        const x = P.cx + u * P.ux - v * P.uz
        const z = P.cz + u * P.uz + v * P.ux
        if (!inPoly(x, z, flat) || bIndex(x, z)) continue
        marks.push([x + 1.3 * P.ux, z + 1.3 * P.uz, Math.atan2(-P.uz, P.ux)])
        if (r() < 0.68) cars.push([x, Y_ROAD, z, Math.atan2(-P.uz, P.ux) + (r() < 0.5 ? 0 : Math.PI) + (r() - 0.5) * 0.06])
      }
    }
  }
  if (lotGeo.length) group.add(new THREE.Mesh(mergeGeometries(lotGeo), roadMat))
  {
    const cg = lotCurb.geometry()
    if (cg) group.add(new THREE.Mesh(cg, curbMat))
  }
  const m4 = new THREE.Matrix4()
  const q = new THREE.Quaternion()
  const up = new THREE.Vector3(0, 1, 0)
  const one = new THREE.Vector3(1, 1, 1)
  if (marks.length) {
    const mk = new THREE.InstancedMesh(new THREE.PlaneGeometry(0.12, 4.8).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ color: 0xe9e9e4 }), marks.length)
    marks.forEach(([x, z, a], k) => {
      m4.compose(new THREE.Vector3(x, Y_ROAD + 0.01, z), q.setFromAxisAngle(up, a), one)
      mk.setMatrixAt(k, m4)
    })
    mk.computeBoundingSphere()
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
        cars.push([ax + dx * s - dz * off * side, Y_ROAD, az + dz * s + dx * off * side, Math.atan2(dx, dz)])
      }
    }
  }
  // mașinile: x, y, z, unghi (fața spre +z la unghiul 0)
  group.add(carMeshes(cars.map(([x, y, z, a]) => [x, y, z, a]), { seed: 5, shadows: !lowSpec }))

  // Sala Polivalentă: volum vitrat cu acoperiș curb metalic
  const hall = data.buildings.find((b) => b[3] === 'Sala Polivalentă')
  if (hall) group.add(buildHall(hall[2]))
  return group
}

// Sala Polivalentă (4 215 locuri): volum paralelipipedic placat cu panouri metalice gri-deschis, cu
// bandă vitrată, fațada principală (spre bulevard) cu perete-cortină și copertină, acoperiș plat cu
// atic, luminatoare în rețea și agregatele de ventilație (ca în imaginea satelit).
function buildHall(flat) {
  const P = principal(flat)
  const L = P.u1 - P.u0
  const W = P.v1 - P.v0
  const g = new THREE.Group()
  const H = 18
  const south = P.ux >= 0 ? 1 : -1 // latura dinspre bulevard (sud), în coordonatele locale
  // placajul: panouri de 3 × 1 m, cu rosturi, bandă de ferestre și soclu
  const clad = (len) => {
    const t = canvasTex(512, 512, (c) => {
      c.fillStyle = '#c9cdd1'
      c.fillRect(0, 0, 512, 512)
      for (let y = 0; y < 512; y += 28) {
        c.fillStyle = `rgba(${y % 56 ? '255,255,255' : '0,0,0'},0.04)`
        c.fillRect(0, y, 512, 28)
        c.fillStyle = 'rgba(70,76,82,0.55)'
        c.fillRect(0, y, 512, 2)
      }
      for (let x = 0; x < 512; x += 85) {
        c.fillStyle = 'rgba(70,76,82,0.35)'
        c.fillRect(x, 0, 2, 512)
      }
      // banda vitrată (între 4,5 și 6,5 m)
      const y0 = 512 - (6.5 / H) * 512
      const y1 = 512 - (4.5 / H) * 512
      const grd = c.createLinearGradient(0, y0, 0, y1)
      grd.addColorStop(0, '#3f5566')
      grd.addColorStop(1, '#22313c')
      c.fillStyle = grd
      c.fillRect(0, y0, 512, y1 - y0)
      c.fillStyle = '#9aa3aa'
      for (let x = 0; x < 512; x += 43) c.fillRect(x, y0, 3, y1 - y0)
      // soclul de beton
      c.fillStyle = '#8c8e8f'
      c.fillRect(0, 512 - (0.7 / H) * 512, 512, (0.7 / H) * 512)
    })
    t.repeat.set(len / 15, 1)
    return t
  }
  const wallMat = (len) => new THREE.MeshStandardMaterial({ map: clad(len), roughness: 0.42, metalness: 0.35 })
  const wall = (len, x, z, ry) => {
    const m = new THREE.Mesh(new THREE.PlaneGeometry(len, H), wallMat(len))
    m.position.set(x, H / 2, z)
    m.rotation.y = ry
    g.add(m)
  }
  wall(L, 0, -south * W / 2, south > 0 ? Math.PI : 0)
  wall(W, L / 2, 0, Math.PI / 2)
  wall(W, -L / 2, 0, -Math.PI / 2)
  // fațada principală: perete-cortină pe 70% din lungime, în rest placaj
  const gw = L * 0.7
  const side = (L - gw) / 2
  for (const sx of [-1, 1]) wall(side, sx * (gw / 2 + side / 2), south * W / 2, south > 0 ? 0 : Math.PI)
  const curtain = canvasTex(512, 512, (c) => {
    const grd = c.createLinearGradient(0, 0, 0, 512)
    grd.addColorStop(0, '#7f9aae')
    grd.addColorStop(0.55, '#4b6578')
    grd.addColorStop(1, '#2b3c48')
    c.fillStyle = grd
    c.fillRect(0, 0, 512, 512)
    c.fillStyle = 'rgba(255,255,255,0.08)'
    c.beginPath()
    c.moveTo(0, 120); c.lineTo(512, 40); c.lineTo(512, 140); c.lineTo(0, 220)
    c.fill()
    c.fillStyle = '#d5dadd'
    for (let x = 0; x < 512; x += 64) c.fillRect(x, 0, 4, 512)
    for (let y = 0; y < 512; y += 85) c.fillRect(0, y, 512, 3)
    // ușile de la parter
    c.fillStyle = '#1b252c'
    for (let x = 16; x < 512; x += 128) c.fillRect(x, 512 - 76, 96, 76)
    c.fillStyle = '#c8ced2'
    for (let x = 16; x < 512; x += 128) c.fillRect(x + 46, 512 - 76, 4, 76)
  })
  curtain.repeat.set(gw / 12, 1)
  const cw = new THREE.Mesh(new THREE.PlaneGeometry(gw, H - 1.5), new THREE.MeshStandardMaterial({ map: curtain, roughness: 0.08, metalness: 0.6 }))
  cw.position.set(0, (H - 1.5) / 2, south * W / 2)
  if (south < 0) cw.rotation.y = Math.PI
  g.add(cw)
  // fâșia albă de deasupra peretelui-cortină, cu numele sălii
  const band = canvasTex(1024, 96, (c) => {
    c.fillStyle = '#eef0f1'
    c.fillRect(0, 0, 1024, 96)
    c.fillStyle = '#123a73'
    c.font = '800 60px "Barlow Condensed", "Arial Narrow", sans-serif'
    c.textAlign = 'center'
    c.textBaseline = 'middle'
    c.fillText('SALA POLIVALENTĂ CRAIOVA', 512, 50)
  }, { repeat: false })
  const bandMesh = new THREE.Mesh(new THREE.PlaneGeometry(gw, 1.5), new THREE.MeshStandardMaterial({ map: band, roughness: 0.4 }))
  bandMesh.position.set(0, H - 0.75, south * (W / 2 + 0.02))
  if (south < 0) bandMesh.rotation.y = Math.PI
  g.add(bandMesh)
  // copertina de la intrare, pe stâlpi subțiri
  const canopy = new THREE.Mesh(new THREE.BoxGeometry(gw * 0.6, 0.35, 5), new THREE.MeshStandardMaterial({ color: 0xe6e8ea, roughness: 0.5, metalness: 0.3 }))
  canopy.position.set(0, 4.6, south * (W / 2 + 2.5))
  canopy.castShadow = true
  g.add(canopy)
  const postGeo = []
  for (let x = -gw * 0.28; x <= gw * 0.28 + 0.01; x += (gw * 0.56) / 6) postGeo.push(new THREE.CylinderGeometry(0.12, 0.12, 4.45, 10).translate(x, 2.22, south * (W / 2 + 4.6)).toNonIndexed())
  g.add(new THREE.Mesh(mergeGeometries(postGeo), new THREE.MeshStandardMaterial({ color: 0xbfc5ca, metalness: 0.7, roughness: 0.3 })))
  // acoperișul plat cu atic
  const roof = new THREE.Mesh(new THREE.BoxGeometry(L, 0.3, W), new THREE.MeshStandardMaterial({ color: 0xd9dad6, roughness: 0.95 }))
  roof.position.y = H - 0.15
  roof.receiveShadow = true
  g.add(roof)
  const coping = new THREE.MeshStandardMaterial({ color: 0xb8bcc0, roughness: 0.5, metalness: 0.4 })
  for (const [w, d, x, z] of [[L + 0.6, 0.6, 0, W / 2], [L + 0.6, 0.6, 0, -W / 2], [0.6, W, L / 2, 0], [0.6, W, -L / 2, 0]]) {
    const m = new THREE.Mesh(new THREE.BoxGeometry(w, 1.1, d), coping)
    m.position.set(x, H + 0.4, z)
    m.castShadow = true
    g.add(m)
  }
  // luminatoarele (cupole în rețea) și agregatele de pe acoperiș
  const domes = []
  const nx = 9
  const nz = 5
  for (let i = 0; i < nx; i++) for (let j = 0; j < nz; j++) domes.push([(-0.5 + (i + 0.5) / nx) * L * 0.86, (-0.5 + (j + 0.5) / nz) * W * 0.78])
  const domeGeo = mergeGeometries([
    new THREE.BoxGeometry(1.7, 0.35, 1.7).translate(0, 0.17, 0).toNonIndexed(),
    new THREE.SphereGeometry(0.85, 12, 6, 0, Math.PI * 2, 0, Math.PI / 2).scale(1, 0.45, 1).translate(0, 0.35, 0).toNonIndexed(),
  ])
  const dm = new THREE.InstancedMesh(domeGeo, new THREE.MeshStandardMaterial({ color: 0xe4ecef, roughness: 0.2, metalness: 0.1 }), domes.length)
  const m4 = new THREE.Matrix4()
  domes.forEach(([x, z], k) => dm.setMatrixAt(k, m4.makeTranslation(x, H, z)))
  dm.castShadow = true
  g.add(dm)
  const hvacMat = new THREE.MeshStandardMaterial({ color: 0xa9adb0, roughness: 0.6, metalness: 0.5 })
  for (const [x, z, w, d, h] of [[L * 0.36, W * 0.3, 7, 3.2, 2.2], [L * 0.36, -W * 0.3, 7, 3.2, 2.2], [-L * 0.38, 0, 4, 9, 1.8], [0, -W * 0.42, 10, 2.2, 1.4]]) {
    const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), hvacMat)
    m.position.set(x, H + h / 2, z)
    m.castShadow = true
    g.add(m)
  }
  g.position.set(P.cx, 0, P.cz)
  g.rotation.y = -Math.atan2(P.uz, P.ux)
  g.traverse((o) => {
    if (o.isMesh) o.receiveShadow = true
  })
  return g
}
