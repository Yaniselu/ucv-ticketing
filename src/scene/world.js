// Împrejurimile reale ale stadionului: imagini satelit (Esri World Imagery),
// clădiri și străzi din OpenStreetMap, copaci detectați din imaginea satelit.
import * as THREE from 'three'
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js'

const TILE_URL = (z, x, y) => `https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/${z}/${y}/${x}`

// aceeași transformare ca în scripts/build-osm.mjs
function makeProjection(origin) {
  const KX = Math.cos((origin.lat * Math.PI) / 180) * 111320
  const KZ = 110540
  const th = (origin.rotationDeg * Math.PI) / 180
  const c = Math.cos(th)
  const s = Math.sin(th)
  const toLocal = (lat, lon) => {
    const x = (lon - origin.lon) * KX
    const z = -(lat - origin.lat) * KZ
    return [x * c + z * s, -x * s + z * c]
  }
  const toLatLon = (lx, lz) => {
    // inversa rotației
    const x = lx * c - lz * s
    const z = lx * s + lz * c
    return [origin.lat - z / KZ, origin.lon + x / KX]
  }
  return { toLocal, toLatLon }
}

const lon2x = (lon, z) => ((lon + 180) / 360) * 2 ** z
const lat2y = (lat, z) => ((1 - Math.log(Math.tan((lat * Math.PI) / 180) + 1 / Math.cos((lat * Math.PI) / 180)) / Math.PI) / 2) * 2 ** z
const x2lon = (x, z) => (x / 2 ** z) * 360 - 180
const y2lat = (y, z) => {
  const n = Math.PI - (2 * Math.PI * y) / 2 ** z
  return (180 / Math.PI) * Math.atan(0.5 * (Math.exp(n) - Math.exp(-n)))
}

function loadImage(url) {
  return new Promise((resolve) => {
    const img = new Image()
    img.crossOrigin = 'anonymous'
    img.onload = () => resolve(img)
    img.onerror = () => resolve(null)
    img.src = url
  })
}

// un strat de imagine satelit: o textură compusă din dale, pe un quad rotit
function satelliteLayer(proj, z, radius, y, maxPx, onProgress) {
  const corners = [[-radius, -radius], [radius, -radius], [radius, radius], [-radius, radius]].map(([x, zz]) => proj.toLatLon(x, zz))
  const lats = corners.map((c) => c[0])
  const lons = corners.map((c) => c[1])
  const x0 = Math.floor(lon2x(Math.min(...lons), z))
  const x1 = Math.floor(lon2x(Math.max(...lons), z))
  const y0 = Math.floor(lat2y(Math.max(...lats), z))
  const y1 = Math.floor(lat2y(Math.min(...lats), z))
  const nx = x1 - x0 + 1
  const ny = y1 - y0 + 1
  const tp = Math.min(256, Math.floor(maxPx / Math.max(nx, ny)))
  const canvas = document.createElement('canvas')
  canvas.width = nx * tp
  canvas.height = ny * tp
  const g = canvas.getContext('2d', { willReadFrequently: false })
  g.fillStyle = '#8a8f7a'
  g.fillRect(0, 0, canvas.width, canvas.height)
  const tex = new THREE.CanvasTexture(canvas)
  tex.colorSpace = THREE.SRGBColorSpace
  tex.anisotropy = 8
  // colțurile mozaicului, în coordonatele scenei
  const nw = proj.toLocal(y2lat(y0, z), x2lon(x0, z))
  const ne = proj.toLocal(y2lat(y0, z), x2lon(x1 + 1, z))
  const se = proj.toLocal(y2lat(y1 + 1, z), x2lon(x1 + 1, z))
  const sw = proj.toLocal(y2lat(y1 + 1, z), x2lon(x0, z))
  const geo = new THREE.BufferGeometry()
  geo.setAttribute('position', new THREE.Float32BufferAttribute([nw[0], y, nw[1], ne[0], y, ne[1], se[0], y, se[1], sw[0], y, sw[1]], 3))
  geo.setAttribute('uv', new THREE.Float32BufferAttribute([0, 1, 1, 1, 1, 0, 0, 0], 2))
  geo.setAttribute('normal', new THREE.Float32BufferAttribute([0, 1, 0, 0, 1, 0, 0, 1, 0, 0, 1, 0], 3))
  geo.setIndex([0, 3, 1, 1, 3, 2])
  // imaginea satelit are deja lumina și umbrele reale: o afișăm fără iluminare suplimentară
  const mat = new THREE.MeshBasicMaterial({ map: tex, toneMapped: false, polygonOffset: true, polygonOffsetFactor: 4 - z / 6, polygonOffsetUnits: 4 })
  const mesh = new THREE.Mesh(geo, mat)
  // conversii coordonate scenă ↔ pixeli în mozaic
  const toPx = (lx, lz) => {
    const [lat, lon] = proj.toLatLon(lx, lz)
    return [(lon2x(lon, z) - x0) * tp, (lat2y(lat, z) - y0) * tp]
  }
  const toUV = (lx, lz) => {
    const [px, py] = toPx(lx, lz)
    return [px / canvas.width, 1 - py / canvas.height]
  }
  const jobs = []
  for (let ty = y0; ty <= y1; ty++) for (let tx = x0; tx <= x1; tx++) jobs.push([tx, ty])
  // întâi dalele din centru
  const cx = (x0 + x1) / 2
  const cy = (y0 + y1) / 2
  jobs.sort((a, b) => Math.hypot(a[0] - cx, a[1] - cy) - Math.hypot(b[0] - cx, b[1] - cy))
  let dirty = false
  let loaded = 0
  const flush = () => {
    if (dirty) {
      tex.needsUpdate = true
      dirty = false
    }
  }
  const timer = setInterval(flush, 250)
  const done = (async () => {
    const conc = 8
    let k = 0
    const worker = async () => {
      while (k < jobs.length) {
        const [tx, ty] = jobs[k++]
        const img = await loadImage(TILE_URL(z, tx, ty))
        if (img) g.drawImage(img, (tx - x0) * tp, (ty - y0) * tp, tp, tp)
        loaded++
        dirty = true
        onProgress?.(loaded / jobs.length)
      }
    }
    await Promise.all(Array.from({ length: conc }, worker))
    clearInterval(timer)
    flush()
  })()
  return { mesh, canvas, ctx: g, tex, toPx, toUV, done }
}

function paintPolygon(layer, pts, color) {
  const g = layer.ctx
  g.beginPath()
  pts.forEach(([x, z], i) => {
    const [px, py] = layer.toPx(x, z)
    i ? g.lineTo(px, py) : g.moveTo(px, py)
  })
  g.closePath()
  g.fillStyle = color
  g.fill()
}

// ─── Clădiri ─────────────────────────────────────────────────────────
function windowTexture() {
  const c = document.createElement('canvas')
  c.width = 128
  c.height = 128
  const g = c.getContext('2d')
  g.fillStyle = '#ffffff'
  g.fillRect(0, 0, 128, 128)
  g.fillStyle = '#f2f2f2'
  g.fillRect(0, 116, 128, 12)
  const grd = g.createLinearGradient(0, 30, 0, 92)
  grd.addColorStop(0, '#5f6e7c')
  grd.addColorStop(1, '#3b4652')
  g.fillStyle = grd
  g.fillRect(34, 30, 60, 62)
  g.fillStyle = 'rgba(255,255,255,0.18)'
  g.fillRect(34, 30, 60, 6)
  g.strokeStyle = '#e9e6df'
  g.lineWidth = 4
  g.strokeRect(34, 30, 60, 62)
  g.beginPath(); g.moveTo(64, 30); g.lineTo(64, 92); g.stroke()
  const t = new THREE.CanvasTexture(c)
  t.colorSpace = THREE.SRGBColorSpace
  t.wrapS = t.wrapT = THREE.RepeatWrapping
  t.anisotropy = 4
  return t
}

const WALLS = {
  0: ['#efe7d6', '#f3f1ea', '#eadfbf', '#e9d2b6', '#dedbd3', '#f1e3c8'],
  1: ['#ddd8cd', '#d3d6d8', '#e4dccd', '#cfcac0'],
  2: ['#e3ded4', '#d9dcdf', '#ece6da'],
  3: ['#f2ede2'],
  4: ['#bdb7ad', '#c9c2b6'],
  5: ['#e9ecef'],
}

function buildBuildings(data, layers) {
  const wallPos = []
  const wallUV = []
  const wallCol = []
  const roofSets = layers.map(() => ({ pos: [], uv: [] }))
  const col = new THREE.Color()
  let seed = 7
  const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647)
  for (const [h, kind, flat] of data.buildings) {
    const pts = []
    for (let i = 0; i < flat.length; i += 2) pts.push([flat[i], flat[i + 1]])
    const n = pts.length
    if (n < 3) continue
    let cx = 0, cz = 0
    for (const p of pts) { cx += p[0]; cz += p[1] }
    cx /= n; cz /= n
    let area = 0
    for (let i = 0; i < n; i++) {
      const a = pts[i], b = pts[(i + 1) % n]
      area += a[0] * b[1] - b[0] * a[1]
    }
    area = Math.abs(area / 2)
    const hip = kind === 0 && n <= 10
    const roofH = hip ? Math.min(3.4, 0.32 * Math.sqrt(area)) : 0
    const wallH = Math.max(2.6, h - roofH)
    const palette = WALLS[kind] || WALLS[2]
    col.set(palette[Math.floor(rnd() * palette.length)])
    const shade = 0.78 + rnd() * 0.1
    let u = 0
    for (let i = 0; i < n; i++) {
      const a = pts[i]
      const b = pts[(i + 1) % n]
      const len = Math.hypot(b[0] - a[0], b[1] - a[1])
      const u0 = u / 3.3
      const u1 = (u + len) / 3.3
      u += len
      const v1 = wallH / 3
      wallPos.push(a[0], 0, a[1], b[0], 0, b[1], b[0], wallH, b[1], a[0], 0, a[1], b[0], wallH, b[1], a[0], wallH, a[1])
      wallUV.push(u0, 0, u1, 0, u1, v1, u0, 0, u1, v1, u0, v1)
      for (let k = 0; k < 6; k++) wallCol.push(col.r * shade, col.g * shade, col.b * shade)
    }
    // acoperișul: texturat din imaginea satelit
    const li = layers.findIndex((L) => L.covers(cx, cz))
    if (li < 0) continue
    const L = layers[li]
    const R = roofSets[li]
    const push = (x, y, z) => {
      R.pos.push(x, y, z)
      R.uv.push(...L.toUV(x, z))
    }
    if (hip) {
      const top = wallH + roofH
      const inner = pts.map(([x, z]) => [cx + (x - cx) * 0.28, cz + (z - cz) * 0.28])
      for (let i = 0; i < n; i++) {
        const a = pts[i], b = pts[(i + 1) % n], c = inner[(i + 1) % n], d = inner[i]
        push(a[0], wallH, a[1]); push(c[0], top, c[1]); push(b[0], wallH, b[1])
        push(a[0], wallH, a[1]); push(d[0], top, d[1]); push(c[0], top, c[1])
      }
      const tri = THREE.ShapeUtils.triangulateShape(inner.map(([x, z]) => new THREE.Vector2(x, z)), [])
      for (const [i0, i1, i2] of tri) {
        push(inner[i0][0], top, inner[i0][1]); push(inner[i2][0], top, inner[i2][1]); push(inner[i1][0], top, inner[i1][1])
      }
    } else {
      const tri = THREE.ShapeUtils.triangulateShape(pts.map(([x, z]) => new THREE.Vector2(x, z)), [])
      for (const [i0, i1, i2] of tri) {
        push(pts[i0][0], wallH, pts[i0][1]); push(pts[i2][0], wallH, pts[i2][1]); push(pts[i1][0], wallH, pts[i1][1])
      }
    }
  }
  const group = new THREE.Group()
  const wg = new THREE.BufferGeometry()
  wg.setAttribute('position', new THREE.Float32BufferAttribute(wallPos, 3))
  wg.setAttribute('uv', new THREE.Float32BufferAttribute(wallUV, 2))
  wg.setAttribute('color', new THREE.Float32BufferAttribute(wallCol, 3))
  wg.computeVertexNormals()
  const walls = new THREE.Mesh(wg, new THREE.MeshStandardMaterial({ map: windowTexture(), vertexColors: true, roughness: 0.85, side: THREE.DoubleSide }))
  group.add(walls)
  roofSets.forEach((R, i) => {
    if (!R.pos.length) return
    const rg = new THREE.BufferGeometry()
    rg.setAttribute('position', new THREE.Float32BufferAttribute(R.pos, 3))
    rg.setAttribute('uv', new THREE.Float32BufferAttribute(R.uv, 2))
    rg.computeVertexNormals()
    const m = new THREE.Mesh(rg, new THREE.MeshBasicMaterial({ map: layers[i].tex, toneMapped: false, side: THREE.DoubleSide }))
    group.add(m)
  })
  return group
}

// ─── Copaci: coroanele detectate pe imaginea satelit ─────────────────
function treeGeometry() {
  const g = new THREE.IcosahedronGeometry(1, 2)
  const p = g.attributes.position
  const v = new THREE.Vector3()
  for (let i = 0; i < p.count; i++) {
    v.fromBufferAttribute(p, i)
    const n = 1 + 0.16 * Math.sin(v.x * 5.1 + v.y * 3.7) * Math.cos(v.z * 4.3 - v.y * 2.1) + 0.08 * Math.sin(v.x * 11 + v.z * 9)
    v.multiplyScalar(n)
    v.y *= 0.82
    p.setXYZ(i, v.x, v.y, v.z)
  }
  g.computeVertexNormals()
  g.translate(0, 1.25, 0)
  return g
}

function detectTrees(layer, data, radius, maxTrees) {
  const W = layer.canvas.width
  const H = layer.canvas.height
  // masca pentru clădiri, străzi, terenuri și stadion
  const mask = document.createElement('canvas')
  mask.width = W
  mask.height = H
  const m = mask.getContext('2d')
  const path = (flat, close) => {
    m.beginPath()
    for (let i = 0; i < flat.length; i += 2) {
      const [px, py] = layer.toPx(flat[i], flat[i + 1])
      i ? m.lineTo(px, py) : m.moveTo(px, py)
    }
    if (close) m.closePath()
  }
  m.fillStyle = '#000'
  m.strokeStyle = '#000'
  for (const b of data.buildings) { path(b[2], true); m.fill() }
  const pxPerM = layer.toPx(1, 0)[0] - layer.toPx(0, 0)[0]
  const ppm = Math.hypot(layer.toPx(1, 0)[0] - layer.toPx(0, 0)[0], layer.toPx(1, 0)[1] - layer.toPx(0, 0)[1]) || pxPerM
  for (const r of data.roads) {
    m.lineWidth = Math.max(1, r[1] * ppm * 0.9)
    path(r[3], false)
    m.stroke()
  }
  for (const a of data.areas) if (a[0] === 2 || a[0] === 1) { path(a[1], true); m.fill() }
  const ell = []
  for (let k = 0; k < 64; k++) ell.push(118 * Math.cos((k / 64) * Math.PI * 2), 130 * Math.sin((k / 64) * Math.PI * 2))
  path(ell, true)
  m.fill()
  const maskPx = m.getImageData(0, 0, W, H).data
  const img = layer.ctx.getImageData(0, 0, W, H).data
  const trees = []
  const step = 4.2
  let seed = 11
  const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647)
  for (let x = -radius; x <= radius && trees.length < maxTrees; x += step) {
    for (let z = -radius; z <= radius && trees.length < maxTrees; z += step) {
      const jx = x + (rnd() - 0.5) * step * 0.8
      const jz = z + (rnd() - 0.5) * step * 0.8
      const [px, py] = layer.toPx(jx, jz)
      const ix = Math.round(px)
      const iy = Math.round(py)
      if (ix < 2 || iy < 2 || ix >= W - 2 || iy >= H - 2) continue
      const o = (iy * W + ix) * 4
      if (maskPx[o + 3] > 0) continue
      // medie 3×3
      let r = 0, gg = 0, b = 0
      for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
        const q = ((iy + dy) * W + ix + dx) * 4
        r += img[q]; gg += img[q + 1]; b += img[q + 2]
      }
      r /= 9; gg /= 9; b /= 9
      const lum = (r + gg + b) / 3
      const canopy = gg > r + 4 && gg > b + 6 && lum < 98 && lum > 22
      if (!canopy) continue
      trees.push([jx, jz, r, gg, b, lum])
    }
  }
  for (const a of data.areas) if (a[0] === 3) trees.push([a[1][0], a[1][1], 70, 95, 55, 70])
  return trees
}

function buildTrees(trees) {
  const geo = treeGeometry()
  const crown = new THREE.InstancedMesh(geo, new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.95 }), trees.length)
  const trunkGeo = new THREE.CylinderGeometry(0.16, 0.26, 1, 6).translate(0, 0.5, 0)
  const trunk = new THREE.InstancedMesh(trunkGeo, new THREE.MeshStandardMaterial({ color: 0x5b4a3a, roughness: 1 }), trees.length)
  const m4 = new THREE.Matrix4()
  const q = new THREE.Quaternion()
  const up = new THREE.Vector3(0, 1, 0)
  const c = new THREE.Color()
  let seed = 5
  const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647)
  trees.forEach(([x, z, r, g, b, lum], k) => {
    const s = 2.3 + rnd() * 1.6 + (lum < 55 ? 0.6 : 0)
    const trunkH = s * 0.9 + 1.2
    m4.compose(new THREE.Vector3(x, trunkH - 0.6, z), q.setFromAxisAngle(up, rnd() * 6.28), new THREE.Vector3(s, s * (0.9 + rnd() * 0.35), s))
    crown.setMatrixAt(k, m4)
    // culoarea reală a coroanei, ușor luminată (imaginea satelit conține umbre)
    c.setRGB((r / 255) ** 2.2, (g / 255) ** 2.2, (b / 255) ** 2.2).multiplyScalar(1.7)
    crown.setColorAt(k, c)
    m4.compose(new THREE.Vector3(x, 0, z), q.identity(), new THREE.Vector3(1, trunkH, 1))
    trunk.setMatrixAt(k, m4)
  })
  const g = new THREE.Group()
  g.add(trunk, crown)
  return g
}

// etichetele străzilor importante (pentru vederea de ansamblu)
function streetLabels(data) {
  const best = new Map()
  for (const [cls, , ni, flat] of data.roads) {
    if (ni < 0 || cls > 3) continue
    for (let i = 0; i < flat.length - 2; i += 2) {
      const x = (flat[i] + flat[i + 2]) / 2
      const z = (flat[i + 1] + flat[i + 3]) / 2
      const d = Math.hypot(x, z)
      if (d < 150 || d > 520) continue
      const score = d + cls * 140
      const cur = best.get(ni)
      if (!cur || score < cur.score) best.set(ni, { score, x, z, cls, name: data.names[ni] })
    }
  }
  return [...best.values()].sort((a, b) => a.score - b.score).slice(0, 9)
}

export async function buildWorld(scene, { lowSpec = false, onProgress } = {}) {
  const res = await fetch('/data/craiova.json')
  const data = await res.json()
  const proj = makeProjection(data.origin)
  const group = new THREE.Group()
  scene.add(group)
  const pr = [0, 0, 0]
  const prog = (i) => (p) => {
    pr[i] = p
    onProgress?.((pr[0] + pr[1] * 2 + pr[2] * 3) / 6)
  }
  const far = satelliteLayer(proj, 13, 6500, -1.2, 1024, prog(0))
  const mid = satelliteLayer(proj, 16, lowSpec ? 1100 : 1500, -0.6, lowSpec ? 1536 : 2304, prog(1))
  const near = satelliteLayer(proj, 18, lowSpec ? 330 : 480, -0.15, lowSpec ? 1536 : 2560, prog(2))
  group.add(far.mesh, mid.mesh, near.mesh)
  const nearR = lowSpec ? 330 : 480
  const midR = lowSpec ? 1100 : 1500
  near.covers = (x, z) => Math.abs(x) < nearR - 20 && Math.abs(z) < nearR - 20
  mid.covers = (x, z) => Math.abs(x) < midR && Math.abs(z) < midR

  // sub carcasa stadionului pictăm betonul promenadei (imaginea are acoperișul real)
  const footprint = []
  for (let k = 0; k < 72; k++) footprint.push([106 * Math.cos((k / 72) * Math.PI * 2), 118 * Math.sin((k / 72) * Math.PI * 2)])
  const cover = () => {
    for (const L of [mid, near]) {
      paintPolygon(L, footprint, '#b9bab4')
      L.tex.needsUpdate = true
    }
  }
  cover()
  const buildings = buildBuildings(data, [near, mid])
  group.add(buildings)

  const labels = streetLabels(data)
  const ready = (async () => {
    await Promise.all([near.done, mid.done])
    cover()
    const trees = detectTrees(near, data, nearR - 10, lowSpec ? 2500 : 6500)
    group.add(buildTrees(trees))
    return trees.length
  })()
  return { group, labels, ready, data }
}
