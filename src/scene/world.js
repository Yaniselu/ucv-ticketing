// Împrejurimile reale ale stadionului: imagini satelit (Esri World Imagery),
// clădiri și străzi din OpenStreetMap, copaci detectați din imaginea satelit.
import * as THREE from 'three'
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js'
import { buildCity } from './city.js'
import { buildBuildings as buildBuildings2 } from './buildings.js'
import { paverSet } from './paving.js'
import { inPrecinct, precinctRings, precinctTrees } from './precinct.js'
import { SHELL_PROFILE } from './structure.js'

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

let _detail = null
function detailTexture() {
  if (_detail) return _detail
  const c = document.createElement('canvas')
  c.width = c.height = 256
  const g = c.getContext('2d')
  const img = g.createImageData(256, 256)
  let seed = 41
  const r = () => ((seed = (seed * 16807) % 2147483647) / 2147483647)
  // canalul R: granulație fină (pietriș, fire de iarbă); G: pete mai mari
  const coarse = new Float32Array(32 * 32).map(() => r())
  const cs = (x, y) => coarse[((y & 31) << 5) | (x & 31)]
  for (let y = 0; y < 256; y++) {
    for (let x = 0; x < 256; x++) {
      const fx = x / 8, fy = y / 8
      const ix = Math.floor(fx), iy = Math.floor(fy)
      const tx = fx - ix, ty = fy - iy
      const v = cs(ix, iy) * (1 - tx) * (1 - ty) + cs(ix + 1, iy) * tx * (1 - ty) + cs(ix, iy + 1) * (1 - tx) * ty + cs(ix + 1, iy + 1) * tx * ty
      const o = (y * 256 + x) * 4
      img.data[o] = 128 + (r() - 0.5) * 150
      img.data[o + 1] = v * 255
      img.data[o + 2] = 128
      img.data[o + 3] = 255
    }
  }
  g.putImageData(img, 0, 0)
  _detail = new THREE.CanvasTexture(c)
  _detail.wrapS = _detail.wrapT = THREE.RepeatWrapping
  _detail.anisotropy = 8
  return _detail
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
  // imaginea satelit are deja lumina și umbrele reale: o afișăm fără iluminare suplimentară;
  // de aproape adăugăm un detaliu fin (granulația solului), ca imaginea să nu pară neclară
  const mat = new THREE.MeshBasicMaterial({ map: tex, toneMapped: false, polygonOffset: true, polygonOffsetFactor: 4 - z / 6, polygonOffsetUnits: 4 })
  if (z >= 16) {
    mat.onBeforeCompile = (sh) => {
      sh.uniforms.detailMap = { value: detailTexture() }
      sh.vertexShader = sh.vertexShader
        .replace('#include <common>', '#include <common>\nvarying vec3 vGroundPos;')
        .replace('#include <project_vertex>', '#include <project_vertex>\nvGroundPos = (modelMatrix * vec4(transformed, 1.0)).xyz;')
      sh.fragmentShader = sh.fragmentShader
        .replace('#include <common>', '#include <common>\nvarying vec3 vGroundPos;\nuniform sampler2D detailMap;')
        .replace('#include <map_fragment>', `#include <map_fragment>
          float gd = distance(cameraPosition, vGroundPos);
          float fade = 1.0 - smoothstep(60.0, 520.0, gd);
          float d1 = texture2D(detailMap, vGroundPos.xz / 2.3).r;
          float d2 = texture2D(detailMap, vGroundPos.xz / 9.1 + 0.37).g;
          float d = (d1 - 0.5) * 0.55 + (d2 - 0.5) * 0.45;
          diffuseColor.rgb *= 1.0 + d * 0.55 * fade;`)
    }
    mat.customProgramCacheKey = () => 'ground-detail-v1'
  }
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

// Umbra stadionului e „pictată” în imaginea satelit (soarele de la sud-est, jos): fără ea, terenul
// de la nord de stadion pare pătat. O ridicăm: zona umbrei = carcasa (profilul real) proiectată pe
// direcția umbrei; pixelii întunecați de acolo sunt luminați până la nivelul terenului din soare.
const SHADOW_DIR = [-0.34, -1.25] // deplasarea umbrei pe metru de înălțime (măsurată pe imagine)
function liftStadiumShadow(layer) {
  const g = layer.ctx
  const [ax, ay] = layer.toPx(0, 0)
  const [bx, by] = layer.toPx(100, 0)
  const [cx, cy] = layer.toPx(0, 100)
  // transformarea afină scenă → pixeli, și inversa ei
  const a = (bx - ax) / 100, b = (cx - ax) / 100, d = (by - ay) / 100, e = (cy - ay) / 100
  const det = a * e - b * d
  const toScene = (px, py) => [((px - ax) * e - (py - ay) * b) / det, (-(px - ax) * d + (py - ay) * a) / det]
  const corners = [[-210, -240], [190, -240], [190, 130], [-210, 130]].map(([x, z]) => layer.toPx(x, z))
  const x0 = Math.max(0, Math.floor(Math.min(...corners.map((c) => c[0]))))
  const x1 = Math.min(layer.canvas.width, Math.ceil(Math.max(...corners.map((c) => c[0]))))
  const y0 = Math.max(0, Math.floor(Math.min(...corners.map((c) => c[1]))))
  const y1 = Math.min(layer.canvas.height, Math.ceil(Math.max(...corners.map((c) => c[1]))))
  if (x1 <= x0 || y1 <= y0) return
  const img = g.getImageData(x0, y0, x1 - x0, y1 - y0) // o singură citire
  const D = img.data
  const W = x1 - x0
  const hs = []
  for (let h = 0; h <= 50; h += 2.5) {
    let k = 0
    while (k < SHELL_PROFILE.length - 2 && SHELL_PROFILE[k + 1][2] < h) k++
    const [p0x, p0z, p0y] = SHELL_PROFILE[k]
    const [p1x, p1z, p1y] = SHELL_PROFILE[k + 1]
    const f = Math.min(1, Math.max(0, (h - p0y) / (p1y - p0y)))
    hs.push([h, p0x + (p1x - p0x) * f + 2, p0z + (p1z - p0z) * f + 2])
  }
  for (let py = y0; py < y1; py++) {
    for (let px = x0; px < x1; px++) {
      const [x, z] = toScene(px, py)
      if ((x / 99) ** 2 + (z / 110.5) ** 2 < 1) continue
      // cât de adânc e punctul în umbra proiectată (0 = afară, 1 = adânc)
      let w = 0
      for (const [h, rx, rz] of hs) {
        const qx = x - SHADOW_DIR[0] * h
        const qz = z - SHADOW_DIR[1] * h
        const v = (qx / rx) ** 2 + (qz / rz) ** 2
        if (v < 1.12) w = Math.max(w, Math.min(1, (1.12 - v) / 0.12))
        if (w >= 1) break
      }
      if (w <= 0) continue
      const o = ((py - y0) * W + (px - x0)) * 4
      const lum = (D[o] + D[o + 1] + D[o + 2]) / 3
      if (lum > 105) continue
      const k = 1 + (Math.min(2.4, 112 / Math.max(lum, 22)) - 1) * w * (1 - Math.max(0, lum - 80) / 25)
      // umbra din imagine e albăstruie: luminăm, desaturăm parțial și încălzim culoarea
      const L2 = lum * k
      const sat = 1 - 0.5 * w
      D[o] = Math.min(255, (L2 + (D[o] * k - L2) * sat) * (1 + 0.07 * w))
      D[o + 1] = Math.min(255, (L2 + (D[o + 1] * k - L2) * sat) * (1 + 0.01 * w))
      D[o + 2] = Math.min(255, (L2 + (D[o + 2] * k - L2) * sat) * (1 - 0.12 * w))
    }
  }
  g.putImageData(img, x0, y0)
  layer.tex.needsUpdate = true
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

// ─── Copaci: coroanele detectate pe imaginea satelit ─────────────────
// coroana: 6 volume rotunjite, deformate cu zgomot (miezul) și un strat exterior puțin mai mare,
// cu frunziș decupat (alphaTest), ca silueta să fie neregulată și să treacă lumina pe margini
// lod 0: trei volume (copacii din jurul stadionului); lod 1: un volum (copacii depărtați)
function crownGeometry(shell = 1, lod = 0) {
  const parts = []
  const blobs = lod === 0 ? [[0, 1.05, 0, 1.0], [0.52, 0.8, 0.22, 0.74], [-0.42, 1.3, -0.3, 0.72]] : [[0, 1.05, 0, 1.12]]
  for (const [x, y, z, r] of blobs) {
    const g = new THREE.IcosahedronGeometry(r * shell, 1)
    const p = g.attributes.position
    const v = new THREE.Vector3()
    for (let i = 0; i < p.count; i++) {
      v.fromBufferAttribute(p, i)
      const n = 1 + 0.12 * Math.sin(v.x * 7.1 + v.y * 4.7 + x) * Math.cos(v.z * 6.3 - v.y * 3.1 + z) + 0.06 * Math.sin(v.x * 17 + v.z * 13)
      v.multiplyScalar(n)
      p.setXYZ(i, v.x + x, v.y * 0.92 + y, v.z + z)
    }
    // UV sferice pentru textura de frunziș
    const uv = g.attributes.uv
    for (let i = 0; i < p.count; i++) {
      v.fromBufferAttribute(p, i).sub(new THREE.Vector3(x, y, z)).normalize()
      uv.setXY(i, (Math.atan2(v.z, v.x) / (Math.PI * 2) + 0.5) * 3, Math.acos(v.y) / Math.PI * 2)
    }
    parts.push(g.toNonIndexed())
  }
  const m = mergeGeometries(parts)
  m.computeVertexNormals()
  return m
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
  // incinta (podiumul, taluzurile, esplanada) e modelată separat, cu copacii ei
  for (const r of precinctRings()) { path(r, true); m.fill() }
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
  for (const a of data.areas) if (a[0] === 3 && !inPrecinct(a[1][0], a[1][1])) trees.push([a[1][0], a[1][1], 70, 95, 55, 70])
  for (const [x, z, y] of precinctTrees()) trees.push([x, z, 64, 98, 50, 66, y])
  return trees
}

function leafTexture() {
  // frunziș: pete de frunze deschise pe fond transparent, cu goluri
  const c = document.createElement('canvas')
  c.width = c.height = 512
  const g = c.getContext('2d')
  g.clearRect(0, 0, 512, 512)
  let seed = 3
  const r = () => ((seed = (seed * 16807) % 2147483647) / 2147483647)
  for (let k = 0; k < 5200; k++) {
    const x = r() * 512
    const y = r() * 512
    const v = 120 + r() * 135
    g.fillStyle = `rgb(${v},${v},${v})`
    g.beginPath()
    g.ellipse(x, y, 3 + r() * 6, 2 + r() * 3.5, r() * Math.PI, 0, Math.PI * 2)
    g.fill()
  }
  const t = new THREE.CanvasTexture(c)
  t.colorSpace = THREE.SRGBColorSpace
  t.wrapS = t.wrapT = THREE.RepeatWrapping
  t.anisotropy = 4
  return t
}

function buildTrees(trees) {
  // Două niveluri de detaliu: copacii până la 320 m de stadion au coroana din trei volume, cei mai
  // depărtați (văzuți doar de sus / de departe) dintr-unul. Totalul rămâne sub ~1,5 milioane de
  // triunghiuri, față de ~40 de milioane cu coroanele detaliate peste tot.
  const leaf = leafTexture()
  const coreMat = new THREE.MeshStandardMaterial({ color: 0xa8a8a8, roughness: 0.95 })
  const shellMat = new THREE.MeshStandardMaterial({ map: leaf, alphaTest: 0.42, side: THREE.DoubleSide, roughness: 0.85 })
  // întunecăm baza coroanei (umbra proprie), ca la copacii reali
  for (const m of [coreMat, shellMat]) {
    m.onBeforeCompile = (sh) => {
      sh.vertexShader = sh.vertexShader.replace('#include <common>', '#include <common>\nvarying float vCrownY;').replace('#include <begin_vertex>', '#include <begin_vertex>\nvCrownY = position.y;')
      sh.fragmentShader = sh.fragmentShader.replace('#include <common>', '#include <common>\nvarying float vCrownY;').replace('#include <color_fragment>', '#include <color_fragment>\ndiffuseColor.rgb *= 0.7 + 0.42 * smoothstep(0.2, 1.9, vCrownY);')
    }
    m.customProgramCacheKey = () => 'crown-v3'
  }
  const NEAR = 320
  const groups = [trees.filter(([x, z]) => Math.hypot(x, z) < NEAR), trees.filter(([x, z]) => Math.hypot(x, z) >= NEAR)]
  const trunkGeo = new THREE.CylinderGeometry(0.11, 0.24, 1, 5, 1, true).translate(0, 0.5, 0)
  const trunk = new THREE.InstancedMesh(trunkGeo, new THREE.MeshStandardMaterial({ color: 0x5a4a3c, roughness: 1 }), groups[0].length)
  const m4 = new THREE.Matrix4()
  const q = new THREE.Quaternion()
  const up = new THREE.Vector3(0, 1, 0)
  const c = new THREE.Color()
  const c2 = new THREE.Color()
  const hsl = {}
  let seed = 5
  const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647)
  const g = new THREE.Group()
  groups.forEach((list, lod) => {
    const core = new THREE.InstancedMesh(crownGeometry(0.86, lod), coreMat, list.length)
    const shell = new THREE.InstancedMesh(crownGeometry(1.0, lod), shellMat, list.length)
    list.forEach(([x, z, r, gg, b, lum, y0 = 0], k) => {
      const poplar = rnd() < 0.07
      const s = (2.1 + rnd() * 1.7 + (lum < 55 ? 0.6 : 0)) * (poplar ? 0.85 : 1)
      const sy = poplar ? s * 2.6 : s * (0.85 + rnd() * 0.3)
      const sx = poplar ? s * 0.5 : s
      const trunkH = poplar ? s * 0.9 : s * 0.7 + 1.2
      m4.compose(new THREE.Vector3(x, y0 + trunkH - 0.5 * (poplar ? 1.6 : 1), z), q.setFromAxisAngle(up, rnd() * 6.28), new THREE.Vector3(sx, sy * 0.62, sx))
      core.setMatrixAt(k, m4)
      shell.setMatrixAt(k, m4)
      // culoarea frunzișului: din satelit, ținută în gama verdelui real (fără negru, fără gri)
      c.setRGB(r / 255, gg / 255, b / 255, THREE.SRGBColorSpace)
      c.getHSL(hsl)
      c.setHSL(0.2 + Math.min(0.09, Math.max(0, hsl.h - 0.2)) + (rnd() - 0.5) * 0.03, 0.38 + rnd() * 0.18, 0.2 + Math.min(0.12, hsl.l * 0.35) + rnd() * 0.06)
      c2.copy(c).multiplyScalar(0.62)
      shell.setColorAt(k, c)
      core.setColorAt(k, c2)
      if (lod === 0) {
        m4.compose(new THREE.Vector3(x, y0, z), q.identity(), new THREE.Vector3(poplar ? 0.8 : 1, trunkH, poplar ? 0.8 : 1))
        trunk.setMatrixAt(k, m4)
      }
    })
    core.computeBoundingSphere()
    shell.computeBoundingSphere()
    g.add(core, shell)
  })
  trunk.computeBoundingSphere()
  g.add(trunk)
  return g
}

// stâlpii de iluminat de pe bulevarde și din jurul stadionului
function buildStreetLights(data) {
  const spots = []
  for (const [cls, width, , flat] of data.roads) {
    if (cls > 2) continue
    let acc = 0
    let side = 1
    for (let i = 0; i < flat.length - 2; i += 2) {
      const ax = flat[i], az = flat[i + 1], bx = flat[i + 2], bz = flat[i + 3]
      const len = Math.hypot(bx - ax, bz - az)
      if (!len) continue
      const dx = (bx - ax) / len, dz = (bz - az) / len
      for (let s = (30 - acc) % 30; s < len; s += 30) {
        const x = ax + dx * s, z = az + dz * s
        if (Math.hypot(x, z) > 720 || inPrecinct(x, z)) continue
        const off = width / 2 + 1.3
        const sides = cls <= 1 ? [1, -1] : [side]
        for (const sd of sides) spots.push([x - dz * off * sd, z + dx * off * sd, Math.atan2(dz * sd, -dx * sd)])
        side = -side
      }
      acc = (acc + len) % 30
    }
  }
  // pe promenada din jurul stadionului
  for (let k = 0; k < 40; k++) {
    const a = (k / 40) * Math.PI * 2
    const x = 124 * Math.cos(a)
    const z = 137 * Math.sin(a)
    // pe esplanadă și pe podium sunt stâlpii incintei
    if (!inPrecinct(x, z, 1)) spots.push([x, z, a + Math.PI / 2])
  }
  const pole = new THREE.CylinderGeometry(0.09, 0.14, 9, 6).translate(0, 4.5, 0)
  const arm = new THREE.BoxGeometry(1.7, 0.09, 0.09).translate(0.8, 8.9, 0)
  const head = new THREE.BoxGeometry(0.7, 0.16, 0.32).translate(1.6, 8.85, 0)
  const geo = mergeGeometries([pole.toNonIndexed(), arm.toNonIndexed(), head.toNonIndexed()])
  const mesh = new THREE.InstancedMesh(geo, new THREE.MeshStandardMaterial({ color: 0x9aa0a6, roughness: 0.5, metalness: 0.6 }), spots.length)
  const m4 = new THREE.Matrix4()
  const q = new THREE.Quaternion()
  const up = new THREE.Vector3(0, 1, 0)
  spots.forEach(([x, z, r], k) => {
    m4.compose(new THREE.Vector3(x, 0, z), q.setFromAxisAngle(up, r), new THREE.Vector3(1, 1, 1))
    mesh.setMatrixAt(k, m4)
  })
  return mesh
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
  // nivelul 17 (≈ 0,9 m/pixel) până la 1 km de stadion, între nivelul 16 și 18
  const ring = lowSpec ? null : satelliteLayer(proj, 17, 1000, -0.4, 2560, () => {})
  group.add(far.mesh, mid.mesh, near.mesh)
  if (ring) group.add(ring.mesh)
  // Notă: Esri nu are nivelul 19 pentru Craiova (dalele sunt „Map data not yet available”),
  // deci nivelul 18 (≈ 0,4 m/pixel) este cel mai detaliat disponibil.
  const close = null
  const nearR = lowSpec ? 330 : 480
  const midR = lowSpec ? 1100 : 1500
  near.covers = (x, z) => Math.abs(x) < nearR - 20 && Math.abs(z) < nearR - 20
  mid.covers = (x, z) => Math.abs(x) < midR && Math.abs(z) < midR
  if (ring) ring.covers = (x, z) => Math.abs(x) < 980 && Math.abs(z) < 980

  // sub carcasa stadionului pictăm betonul promenadei (imaginea are acoperișul real)
  const footprint = []
  for (let k = 0; k < 72; k++) footprint.push([100 * Math.cos((k / 72) * Math.PI * 2), 111.5 * Math.sin((k / 72) * Math.PI * 2)])
  const cover = () => {
    for (const L of [mid, ring, near, close].filter(Boolean)) {
      paintPolygon(L, footprint, '#b9bab4')
      L.tex.needsUpdate = true
    }
  }
  cover()
  // pașii grei se fac pe rând, cu câte un cadru liber între ei (intro-ul și harta rămân fluide)
  const yieldFrame = () => new Promise((r) => requestAnimationFrame(() => setTimeout(r, 0)))
  const buildings = buildBuildings2(data, { lowSpec })
  group.add(buildings.group)
  await yieldFrame()
  group.add(buildStreetLights(data))
  for (const k of ['spic', 'rosu', 'patrat', 'piatra']) {
    paverSet(k, { size: lowSpec ? 512 : 1024 })
    await yieldFrame()
  }
  group.add(buildCity(data, { lowSpec }))

  const labels = streetLabels(data)
  const ready = (async () => {
    await Promise.all([near.done, mid.done, ring ? ring.done : null, close ? close.done : null])
    for (const L of [near, ring].filter(Boolean)) liftStadiumShadow(L)
    cover()
    buildings.applyRoofColors([near, ring, mid].filter(Boolean))
    const trees = detectTrees(near, data, nearR - 10, lowSpec ? 2500 : 6500)
    group.add(buildTrees(trees))
    return trees.length
  })()
  return { group, labels, ready, data }
}
