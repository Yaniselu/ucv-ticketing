// Bazele sportive din jur (1 km), după OpenStreetMap și imaginea satelit:
//  – Stadionul de Atletism „Nicolae Mărășescu”: pista de tartan cu 8 culoare și liniile lor, terenul de
//    fotbal cu marcaje și porți, tribuna cu gradene și scaune albastre, patru stâlpi de nocturnă;
//  – pista de antrenament de lângă el;
//  – terenurile de fotbal (cu porți și plase), de tenis (zgură, fileu, gard), de baschet (panouri, coșuri).
import * as THREE from 'three'
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js'
import { beam } from './geom.js'

const toPts = (flat) => {
  const o = []
  for (let i = 0; i < flat.length; i += 2) o.push(new THREE.Vector2(flat[i], flat[i + 1]))
  return o
}
const area2 = (pts) => {
  let a = 0
  for (let i = 0; i < pts.length; i++) {
    const p = pts[i], q = pts[(i + 1) % pts.length]
    a += p.x * q.y - q.x * p.y
  }
  return a
}
function inPoly(x, z, pts) {
  let inside = false
  for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) {
    const a = pts[i], b = pts[j]
    if ((a.y > z) !== (b.y > z) && x < ((b.x - a.x) * (z - a.y)) / (b.y - a.y) + a.x) inside = !inside
  }
  return inside
}
// dreptunghiul orientat al unui contur (axa lungă u, cea scurtă v)
function frame(pts) {
  let cx = 0, cz = 0
  for (const p of pts) { cx += p.x; cz += p.y }
  cx /= pts.length; cz /= pts.length
  let sxx = 0, szz = 0, sxz = 0
  for (const p of pts) {
    const x = p.x - cx, z = p.y - cz
    sxx += x * x; szz += z * z; sxz += x * z
  }
  const th = 0.5 * Math.atan2(2 * sxz, sxx - szz)
  const ux = Math.cos(th), uz = Math.sin(th)
  let u0 = Infinity, u1 = -Infinity, v0 = Infinity, v1 = -Infinity
  for (const p of pts) {
    const x = p.x - cx, z = p.y - cz
    const u = x * ux + z * uz
    const v = -x * uz + z * ux
    u0 = Math.min(u0, u); u1 = Math.max(u1, u); v0 = Math.min(v0, v); v1 = Math.max(v1, v)
  }
  // centrul dreptunghiului (nu centroidul vârfurilor)
  const mu = (u0 + u1) / 2, mv = (v0 + v1) / 2
  return { cx: cx + mu * ux - mv * uz, cz: cz + mu * uz + mv * ux, ux, uz, L: (u1 - u0) / 2, W: (v1 - v0) / 2 }
}
const local = (F, u, v) => [F.cx + u * F.ux - v * F.uz, F.cz + u * F.uz + v * F.ux]

// suprafață plană dintr-un contur (cu goluri), cu UV în cadrul terenului (0..1 pe lungime/lățime)
function surface(pts, holes, y, F, { uvMeters = false } = {}) {
  if (area2(pts) < 0) pts = pts.slice().reverse()
  holes = holes.map((h) => (area2(h) > 0 ? h.slice().reverse() : h))
  const tris = THREE.ShapeUtils.triangulateShape(pts, holes)
  const all = [...pts, ...holes.flat()]
  const pos = []
  const uv = []
  for (const [a, b, c] of tris) {
    for (const k of [a, c, b]) {
      const p = all[k]
      pos.push(p.x, y, p.y)
      if (uvMeters) uv.push(p.x, p.y)
      else {
        const x = p.x - F.cx, z = p.y - F.cz
        uv.push((x * F.ux + z * F.uz) / (2 * F.L) + 0.5, (-x * F.uz + z * F.ux) / (2 * F.W) + 0.5)
      }
    }
  }
  const g = new THREE.BufferGeometry()
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3))
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2))
  g.computeVertexNormals()
  return g
}

function canvasTex(w, h, draw, repeat = false) {
  const c = document.createElement('canvas')
  c.width = w
  c.height = h
  draw(c.getContext('2d'), w, h)
  const t = new THREE.CanvasTexture(c)
  t.colorSpace = THREE.SRGBColorSpace
  t.anisotropy = 8
  if (repeat) t.wrapS = t.wrapT = THREE.RepeatWrapping
  return t
}
const noise = (g, w, h, amp, seed = 3) => {
  const img = g.getImageData(0, 0, w, h)
  let s = seed
  for (let i = 0; i < img.data.length; i += 4) {
    s = (s * 16807) % 2147483647
    const n = (s / 2147483647 - 0.5) * amp
    img.data[i] += n; img.data[i + 1] += n; img.data[i + 2] += n
  }
  g.putImageData(img, 0, 0)
}

// ─── Marcajele terenurilor (desenate pe textura întregului teren, la scară) ───
function soccerTexture(L, W, { turf = false } = {}) {
  const px = 10 // pixeli pe metru
  const w = Math.min(2048, Math.round(2 * L * px))
  const h = Math.min(2048, Math.round(2 * W * px))
  const s = w / (2 * L)
  return canvasTex(w, h, (g) => {
    // iarbă tunsă în benzi (sau gazon sintetic, mai uniform)
    const stripes = Math.max(6, Math.round((2 * L) / 6))
    for (let k = 0; k < stripes; k++) {
      g.fillStyle = turf ? (k % 2 ? '#3f7d3a' : '#447f3d') : k % 2 ? '#4f8a3a' : '#5a9842'
      g.fillRect((k * w) / stripes, 0, w / stripes + 1, h)
    }
    noise(g, w, h, 16)
    // terenul de joc propriu-zis: 105 × 68 pe terenurile mari, altfel la scară
    const big = L > 45
    const PL = big ? Math.min(52.5, L - 2.5) : L - 1
    const PW = big ? Math.min(34, W - 2.5) : W - 1
    const cx = w / 2, cy = h / 2
    const X = (m) => cx + m * s
    const Y = (m) => cy + m * s
    g.strokeStyle = 'rgba(255,255,255,0.92)'
    g.lineWidth = Math.max(2, 0.12 * s)
    g.strokeRect(X(-PL), Y(-PW), 2 * PL * s, 2 * PW * s)
    g.beginPath(); g.moveTo(cx, Y(-PW)); g.lineTo(cx, Y(PW)); g.stroke()
    const cr = big ? 9.15 : Math.min(3, PW * 0.3)
    g.beginPath(); g.arc(cx, cy, cr * s, 0, Math.PI * 2); g.stroke()
    g.fillStyle = 'rgba(255,255,255,0.92)'
    g.beginPath(); g.arc(cx, cy, 0.2 * s, 0, Math.PI * 2); g.fill()
    const pa = big ? [16.5, 20.15, 5.5, 9.16, 11] : [Math.min(6, PL * 0.3), Math.min(PW * 0.6, 8), 0, 0, Math.min(6, PL * 0.3)]
    for (const sd of [-1, 1]) {
      const gx = sd > 0 ? X(PL) : X(-PL)
      g.strokeRect(sd > 0 ? gx - pa[0] * s : gx, Y(-pa[1]), pa[0] * s, 2 * pa[1] * s)
      if (big) {
        g.strokeRect(sd > 0 ? gx - pa[2] * s : gx, Y(-pa[3]), pa[2] * s, 2 * pa[3] * s)
        g.beginPath(); g.arc(gx - sd * pa[4] * s, cy, 0.2 * s, 0, Math.PI * 2); g.fill()
        // semicercul de la marginea careului
        g.beginPath()
        const a = Math.acos((pa[0] - pa[4]) / 9.15)
        if (sd > 0) g.arc(gx - pa[4] * s, cy, 9.15 * s, Math.PI - a, Math.PI + a)
        else g.arc(gx + pa[4] * s, cy, 9.15 * s, -a, a)
        g.stroke()
      }
    }
    // colțurile
    for (const [sx, sy] of [[-1, -1], [1, -1], [1, 1], [-1, 1]]) {
      g.beginPath(); g.arc(X(sx * PL), Y(sy * PW), 1 * s, 0, Math.PI * 2); g.stroke()
    }
  })
}
function tennisTexture(L, W) {
  const px = 24
  const w = Math.min(2048, Math.round(2 * L * px))
  const h = Math.min(2048, Math.round(2 * W * px))
  const s = w / (2 * L)
  return canvasTex(w, h, (g) => {
    g.fillStyle = '#b8623f' // zgură
    g.fillRect(0, 0, w, h)
    noise(g, w, h, 22, 7)
    const cx = w / 2, cy = h / 2
    // terenul: 23,77 × 10,97 m (dublu), încăput în contur
    const k = Math.min(1, (L - 1) / 11.885, (W - 1) / 5.485)
    const hl = 11.885 * k, hw = 5.485 * k, sw = 4.115 * k, sv = 6.4 * k
    g.strokeStyle = '#f4f1ea'
    g.lineWidth = Math.max(2, 0.05 * s * 1.4)
    g.strokeRect(cx - hl * s, cy - hw * s, 2 * hl * s, 2 * hw * s)
    g.strokeRect(cx - hl * s, cy - sw * s, 2 * hl * s, 2 * sw * s)
    g.beginPath()
    g.moveTo(cx - sv * s, cy - sw * s); g.lineTo(cx - sv * s, cy + sw * s)
    g.moveTo(cx + sv * s, cy - sw * s); g.lineTo(cx + sv * s, cy + sw * s)
    g.moveTo(cx - sv * s, cy); g.lineTo(cx + sv * s, cy)
    g.moveTo(cx - hl * s, cy); g.lineTo(cx - hl * s + 0.3 * s, cy)
    g.moveTo(cx + hl * s, cy); g.lineTo(cx + hl * s - 0.3 * s, cy)
    g.stroke()
  })
}
function basketTexture(L, W, asphalt) {
  const px = 20
  const w = Math.min(2048, Math.round(2 * L * px))
  const h = Math.min(2048, Math.round(2 * W * px))
  const s = w / (2 * L)
  return canvasTex(w, h, (g) => {
    g.fillStyle = asphalt ? '#55585c' : '#3d6f9e'
    g.fillRect(0, 0, w, h)
    noise(g, w, h, 18, 11)
    const cx = w / 2, cy = h / 2
    const k = Math.min(1, (L - 1) / 14, (W - 1) / 7.5)
    const hl = 14 * k, hw = 7.5 * k
    g.strokeStyle = 'rgba(255,255,255,0.9)'
    g.lineWidth = Math.max(2, 0.05 * s * 1.5)
    g.strokeRect(cx - hl * s, cy - hw * s, 2 * hl * s, 2 * hw * s)
    g.beginPath(); g.moveTo(cx, cy - hw * s); g.lineTo(cx, cy + hw * s); g.stroke()
    g.beginPath(); g.arc(cx, cy, 1.8 * k * s, 0, Math.PI * 2); g.stroke()
    for (const sd of [-1, 1]) {
      const bx = cx + sd * hl * s
      g.strokeRect(sd > 0 ? bx - 5.8 * k * s : bx, cy - 2.45 * k * s, 5.8 * k * s, 4.9 * k * s)
      g.beginPath()
      if (sd > 0) g.arc(bx - 5.8 * k * s, cy, 1.8 * k * s, Math.PI / 2, (3 * Math.PI) / 2)
      else g.arc(bx + 5.8 * k * s, cy, 1.8 * k * s, -Math.PI / 2, Math.PI / 2)
      g.stroke()
      // linia de trei puncte
      g.beginPath()
      if (sd > 0) g.arc(bx - 1.575 * k * s, cy, 6.75 * k * s, Math.PI / 2 + 0.22, (3 * Math.PI) / 2 - 0.22)
      else g.arc(bx + 1.575 * k * s, cy, 6.75 * k * s, -Math.PI / 2 + 0.22, Math.PI / 2 - 0.22)
      g.stroke()
    }
  })
}
function tartanTexture() {
  return canvasTex(512, 512, (g) => {
    g.fillStyle = '#b4513b'
    g.fillRect(0, 0, 512, 512)
    noise(g, 512, 512, 30, 5)
    let s = 19
    for (let k = 0; k < 6000; k++) {
      s = (s * 16807) % 2147483647
      const x = (s % 512), y = ((s >> 9) % 512)
      g.fillStyle = k % 3 ? 'rgba(90,30,20,0.35)' : 'rgba(230,140,110,0.3)'
      g.fillRect(x, y, 1.5, 1.5)
    }
  }, true)
}
// plasă (porți, garduri): romburi de sârmă, decupate prin alphaTest
export function meshTexture(cell = 16, line = 2, color = '#d9dde0') {
  const t = canvasTex(128, 128, (g) => {
    g.clearRect(0, 0, 128, 128)
    g.strokeStyle = color
    g.lineWidth = line
    for (let k = -128; k < 256; k += cell) {
      g.beginPath(); g.moveTo(k, 0); g.lineTo(k + 128, 128); g.stroke()
      g.beginPath(); g.moveTo(k + 128, 0); g.lineTo(k, 128); g.stroke()
    }
  }, true)
  t.generateMipmaps = false
  t.minFilter = THREE.LinearFilter
  return t
}

// inel netezit (curbă închisă) dintr-un contur cu puține vârfuri
function smoothRing(pts, n = 320) {
  const curve = new THREE.CatmullRomCurve3(pts.map((p) => new THREE.Vector3(p.x, 0, p.y)), true, 'centripetal')
  return curve.getSpacedPoints(n).slice(0, -1).map((v) => new THREE.Vector2(v.x, v.z))
}
// inel deplasat spre exterior cu d metri
function offsetRing(ring, d) {
  const n = ring.length
  const ccw = area2(ring) > 0
  return ring.map((p, i) => {
    const a = ring[(i - 1 + n) % n]
    const b = ring[(i + 1) % n]
    let tx = b.x - a.x, tz = b.y - a.y
    const L = Math.hypot(tx, tz) || 1
    tx /= L; tz /= L
    // normala spre exterior
    const nx = ccw ? tz : -tz
    const nz = ccw ? -tx : tx
    return new THREE.Vector2(p.x + nx * d, p.y + nz * d)
  })
}
// bandă (linie) de-a lungul unui inel închis
function ringLine(ring, width, y) {
  const pos = []
  const n = ring.length
  const L = offsetRing(ring, width / 2)
  const R = offsetRing(ring, -width / 2)
  for (let i = 0; i < n; i++) {
    const j = (i + 1) % n
    pos.push(L[i].x, y, L[i].y, R[i].x, y, R[i].y, R[j].x, y, R[j].y, L[i].x, y, L[i].y, R[j].x, y, R[j].y, L[j].x, y, L[j].y)
  }
  const g = new THREE.BufferGeometry()
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3))
  g.computeVertexNormals()
  return g
}

// poartă de fotbal: bare albe și plasă
export function goal(width, height, depth, white, netMat) {
  const g = new THREE.Group()
  const r = 0.06
  const parts = [
    beam([-width / 2, 0, 0], [-width / 2, height, 0], r, 10),
    beam([width / 2, 0, 0], [width / 2, height, 0], r, 10),
    beam([-width / 2, height, 0], [width / 2, height, 0], r, 10),
    beam([-width / 2, height, 0], [-width / 2, height * 0.8, -depth], 0.03, 6),
    beam([width / 2, height, 0], [width / 2, height * 0.8, -depth], 0.03, 6),
    beam([-width / 2, 0, -depth], [width / 2, 0, -depth], 0.03, 6),
  ]
  g.add(new THREE.Mesh(mergeGeometries(parts), white))
  const net = new THREE.Group()
  const back = new THREE.Mesh(new THREE.PlaneGeometry(width, height * 0.8), netMat)
  back.position.set(0, height * 0.4, -depth)
  const top = new THREE.Mesh(new THREE.PlaneGeometry(width, Math.hypot(depth, height * 0.2)), netMat)
  top.position.set(0, height * 0.9, -depth / 2)
  top.rotation.x = -Math.PI / 2 + Math.atan2(height * 0.2, depth)
  for (const sx of [-1, 1]) {
    const side = new THREE.Mesh(new THREE.PlaneGeometry(depth, height * 0.9), netMat)
    side.position.set((sx * width) / 2, height * 0.45, -depth / 2)
    side.rotation.y = Math.PI / 2
    net.add(side)
  }
  net.add(back, top)
  g.add(net)
  return g
}
function floodMast(h, white, lamp) {
  const g = new THREE.Group()
  g.add(new THREE.Mesh(new THREE.CylinderGeometry(0.28, 0.55, h, 10).translate(0, h / 2, 0), white))
  const head = new THREE.Mesh(new THREE.BoxGeometry(5, 3.2, 0.5).translate(0, h + 1, 0), white)
  head.rotation.x = 0.35
  g.add(head)
  const lights = new THREE.Mesh(new THREE.PlaneGeometry(4.6, 2.8).translate(0, h + 1, 0.27), lamp)
  lights.rotation.x = 0.35
  g.add(lights)
  return g
}

// ─── Tribuna stadionului de atletism: gradene cu scaune albastre ───
function seatTexture() {
  return canvasTex(256, 128, (g) => {
    // un rând de 0,8 m adâncime × 2 m: treapta de beton și patru scaune
    g.fillStyle = '#c9cbcc'
    g.fillRect(0, 0, 256, 128)
    g.fillStyle = '#a6a9ab'
    g.fillRect(0, 0, 256, 10)
    for (let k = 0; k < 4; k++) {
      const x = 8 + k * 64
      g.fillStyle = '#1f5fb5'
      g.fillRect(x, 40, 48, 46)
      g.fillStyle = '#2f74cf'
      g.fillRect(x, 40, 48, 12)
      g.fillStyle = '#163f78'
      g.fillRect(x, 86, 48, 8)
    }
  }, true)
}
function grandstand(flat, trackRing, M) {
  const pts = toPts(flat)
  const near = (p) => {
    let best = Infinity
    for (let i = 0; i < trackRing.length; i++) {
      const a = trackRing[i], b = trackRing[(i + 1) % trackRing.length]
      const dx = b.x - a.x, dz = b.y - a.y
      const t = Math.max(0, Math.min(1, ((p.x - a.x) * dx + (p.y - a.y) * dz) / (dx * dx + dz * dz || 1)))
      best = Math.min(best, Math.hypot(a.x + dx * t - p.x, a.y + dz * t - p.y))
    }
    return best
  }
  const ds = pts.map(near)
  const d0 = Math.min(...ds), d1 = Math.max(...ds)
  const H = 9
  const hAt = (d) => 0.8 + (H - 0.8) * Math.min(1, Math.max(0, (d - d0) / (d1 - d0)))
  const F = frame(pts)
  const ordered = area2(pts) < 0 ? pts.slice().reverse() : pts
  const dOrd = ordered.map(near)
  const tris = THREE.ShapeUtils.triangulateShape(ordered, [])
  const pos = []
  const uv = []
  for (const [a, b, c] of tris) {
    for (const k of [a, c, b]) {
      const p = ordered[k]
      pos.push(p.x, hAt(dOrd[k]), p.y)
      const x = p.x - F.cx, z = p.y - F.cz
      uv.push((x * F.ux + z * F.uz) / 2, dOrd[k] / 0.8)
    }
  }
  const g = new THREE.Group()
  const top = new THREE.BufferGeometry()
  top.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3))
  top.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2))
  top.computeVertexNormals()
  const stand = new THREE.Mesh(top, M.seats)
  stand.castShadow = true
  stand.receiveShadow = true
  g.add(stand)
  // pereții de pe contur (spatele înalt, parapetul din față)
  const wall = []
  for (let i = 0; i < ordered.length; i++) {
    const j = (i + 1) % ordered.length
    const a = ordered[i], b = ordered[j]
    const ha = hAt(dOrd[i]) + (dOrd[i] - d0 < 1.5 ? 1.0 : 1.1)
    const hb = hAt(dOrd[j]) + (dOrd[j] - d0 < 1.5 ? 1.0 : 1.1)
    wall.push(a.x, 0, a.y, b.x, 0, b.y, b.x, hb, b.y, a.x, 0, a.y, b.x, hb, b.y, a.x, ha, a.y)
  }
  const wg = new THREE.BufferGeometry()
  wg.setAttribute('position', new THREE.Float32BufferAttribute(wall, 3))
  wg.computeVertexNormals()
  const wm = new THREE.Mesh(wg, M.concrete)
  wm.castShadow = true
  g.add(wm)
  // copertina albă peste mijlocul tribunei (loja oficială), pe stâlpi în spate
  const mid = ordered.reduce((best, p, k) => (Math.abs((p.x - F.cx) * F.ux + (p.y - F.cz) * F.uz) < Math.abs((best.p.x - F.cx) * F.ux + (best.p.y - F.cz) * F.uz) && dOrd[k] > (d0 + d1) / 2 ? { p, k } : best), { p: ordered[0], k: 0 })
  const roofW = 42
  const depth = d1 - d0 + 2
  const roof = new THREE.Mesh(new THREE.BoxGeometry(roofW, 0.4, depth), M.white)
  const toTrack = new THREE.Vector2(F.cx - mid.p.x, F.cz - mid.p.y)
  const ang = Math.atan2(toTrack.x, toTrack.y)
  roof.position.set(mid.p.x + Math.sin(ang) * depth * 0.45, H + 4.2, mid.p.y + Math.cos(ang) * depth * 0.45)
  roof.rotation.y = ang
  roof.castShadow = true
  g.add(roof)
  for (const o of [-1, -0.5, 0, 0.5, 1]) {
    const px = mid.p.x + Math.cos(ang) * o * roofW * 0.46
    const pz = mid.p.y - Math.sin(ang) * o * roofW * 0.46
    g.add(new THREE.Mesh(new THREE.CylinderGeometry(0.25, 0.25, H + 4.2, 8).translate(px, (H + 4.2) / 2, pz), M.white))
  }
  return g
}

export function buildSports(data, { lowSpec = false } = {}) {
  const root = new THREE.Group()
  root.name = 'sports'
  const white = new THREE.MeshStandardMaterial({ color: 0xf4f6f8, roughness: 0.4, metalness: 0.2 })
  const netMat = new THREE.MeshStandardMaterial({ map: meshTexture(10, 1.5, '#f2f2f2'), alphaTest: 0.4, side: THREE.DoubleSide, roughness: 0.8 })
  const fenceMat = new THREE.MeshStandardMaterial({ map: meshTexture(18, 2.2, '#8f979c'), alphaTest: 0.4, side: THREE.DoubleSide, metalness: 0.6, roughness: 0.5 })
  const steel = new THREE.MeshStandardMaterial({ color: 0x8a9298, metalness: 0.7, roughness: 0.4 })
  const lamp = new THREE.MeshStandardMaterial({ color: 0xffffff, emissive: 0xfff4d6, emissiveIntensity: 0.6 })
  const tartan = new THREE.MeshStandardMaterial({ map: tartanTexture(), roughness: 0.9 })
  tartan.map.repeat.set(1 / 4, 1 / 4)
  const lineMat = new THREE.MeshStandardMaterial({ color: 0xf6f6f2, roughness: 0.7, polygonOffset: true, polygonOffsetFactor: -3, polygonOffsetUnits: -3 })
  const M = {
    seats: new THREE.MeshStandardMaterial({ map: seatTexture(), roughness: 0.75 }),
    concrete: new THREE.MeshStandardMaterial({ color: 0xc6c8c9, roughness: 0.9, side: THREE.DoubleSide }),
    white,
  }
  const sports = data.sports || []
  const tracks = []
  const lineGeo = []
  // ── pistele de alergare: tartan, culoarele cu liniile albe
  for (const [type, , , outerFlat, innerFlat, lanes] of sports) {
    if (type !== 'track') continue
    const outer = toPts(outerFlat)
    const holes = innerFlat ? [toPts(innerFlat)] : []
    const F = frame(outer)
    const g = surface(outer, holes, 0.09, F, { uvMeters: true })
    const m = new THREE.Mesh(g, tartan)
    m.receiveShadow = true
    root.add(m)
    if (!innerFlat) continue
    // interiorul (în jurul terenului) e tot din tartan, ca la stadionul real
    const inner = toPts(innerFlat)
    const fill = new THREE.Mesh(surface(inner, [], 0.088, frame(inner), { uvMeters: true }), tartan)
    fill.receiveShadow = true
    root.add(fill)
    const ring = smoothRing(inner)
    // numărul de culoare: din OSM sau din lățimea pistei (1,22 m pe culoar)
    let n = lanes
    if (!n) {
      let wsum = 0
      let cnt = 0
      for (const p of outer) {
        let best = Infinity
        for (const q of ring) best = Math.min(best, p.distanceTo(q))
        wsum += best
        cnt++
      }
      n = Math.max(3, Math.min(8, Math.floor((wsum / cnt - 0.6) / 1.22)))
    }
    for (let k = 0; k <= n; k++) lineGeo.push(ringLine(offsetRing(ring, 0.25 + k * 1.22), 0.05, 0.1))
    tracks.push({ outer, inner, ring: offsetRing(ring, 0.25 + n * 1.22), lanes: n, F })
  }
  if (lineGeo.length) root.add(new THREE.Mesh(mergeGeometries(lineGeo), lineMat))

  // ── terenurile
  for (const [type, sport, surf, flat, , hoops] of sports) {
    if (type !== 'pitch') continue
    const pts = toPts(flat)
    const F = frame(pts)
    const L = F.L, W = F.W
    if (L < 4 || W < 3) continue
    let tex
    let kind = sport
    if (sport === 'athletics' || (sport === 'soccer' || !sport) && L > 40) kind = 'soccer'
    if (kind === 'soccer') tex = soccerTexture(L, W, { turf: surf !== 'grass' && L < 45 })
    else if (kind === 'tennis') tex = tennisTexture(L, W)
    else if (kind === 'basketball') tex = basketTexture(L, W, surf === 'asphalt')
    else {
      tex = canvasTex(64, 64, (g) => {
        g.fillStyle = surf === 'asphalt' ? '#5d6064' : '#4f8a3a'
        g.fillRect(0, 0, 64, 64)
        noise(g, 64, 64, 14)
      })
    }
    const m = new THREE.Mesh(surface(pts, [], 0.1, F), new THREE.MeshStandardMaterial({ map: tex, roughness: 0.92, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 }))
    m.receiveShadow = true
    root.add(m)
    const fenceH = kind === 'tennis' ? 3.5 : kind === 'soccer' && L < 45 ? 4 : kind === 'basketball' ? 3 : 0
    if (kind === 'soccer') {
      const big = L > 45
      const PL = big ? Math.min(52.5, L - 2.5) : L - 1
      const [gw, gh, gd] = big ? [7.32, 2.44, 2] : L > 25 ? [5, 2, 1.2] : [3, 2, 1]
      for (const sd of [-1, 1]) {
        const go = goal(gw, gh, gd, white, netMat)
        const [x, z] = local(F, sd * PL, 0)
        go.position.set(x, 0, z)
        // plasa (spre −z local) în afara terenului
        go.rotation.y = Math.atan2(F.ux, F.uz) + (sd > 0 ? Math.PI : 0)
        root.add(go)
      }
    } else if (kind === 'tennis') {
      const k = Math.min(1, (W - 1) / 5.485)
      const half = 5.485 * k + 0.9
      const [ax, az] = local(F, 0, -half)
      const [bx, bz] = local(F, 0, half)
      root.add(new THREE.Mesh(mergeGeometries([beam([ax, 0, az], [ax, 1.07, az], 0.04, 8), beam([bx, 0, bz], [bx, 1.07, bz], 0.04, 8), beam([ax, 1.07, az], [bx, 1.07, bz], 0.012, 5)]), steel))
      const net = new THREE.Mesh(new THREE.PlaneGeometry(2 * half, 0.95), netMat)
      net.position.set(F.cx, 0.5, F.cz)
      net.rotation.y = Math.atan2(F.ux, F.uz)
      root.add(net)
    } else if (kind === 'basketball' && (hoops || 2)) {
      const k = Math.min(1, (L - 1) / 14)
      for (const sd of [-1, 1]) {
        const [px, pz] = local(F, sd * (14 * k + 0.6), 0)
        const [bx, bz] = local(F, sd * (14 * k - 1.2), 0)
        const [rx, rz] = local(F, sd * (14 * k - 1.58), 0)
        const parts = [beam([px, 0, pz], [px, 3.3, pz], 0.08, 8), beam([px, 3.3, pz], [bx, 3.3, bz], 0.06, 6)]
        root.add(new THREE.Mesh(mergeGeometries(parts), steel))
        const board = new THREE.Mesh(new THREE.BoxGeometry(1.8, 1.05, 0.05), white)
        board.position.set(bx, 3.35, bz)
        board.rotation.y = Math.atan2(F.ux, F.uz) + Math.PI / 2
        root.add(board)
        const ring = new THREE.Mesh(new THREE.TorusGeometry(0.23, 0.012, 6, 20), new THREE.MeshStandardMaterial({ color: 0xe0571c, metalness: 0.5, roughness: 0.4 }))
        ring.rotation.x = Math.PI / 2
        ring.position.set(rx, 3.05, rz)
        root.add(ring)
      }
    }
    // gardul de plasă pe contur
    if (fenceH) {
      const posts = []
      const fpos = []
      const fuv = []
      let acc = 0
      for (let i = 0; i < pts.length; i++) {
        const a = pts[i], b = pts[(i + 1) % pts.length]
        const len = a.distanceTo(b)
        fpos.push(a.x, 0, a.y, b.x, 0, b.y, b.x, fenceH, b.y, a.x, 0, a.y, b.x, fenceH, b.y, a.x, fenceH, a.y)
        fuv.push(acc / 1.5, 0, (acc + len) / 1.5, 0, (acc + len) / 1.5, fenceH / 1.5, acc / 1.5, 0, (acc + len) / 1.5, fenceH / 1.5, acc / 1.5, fenceH / 1.5)
        for (let s = 0; s < len; s += 3) {
          const x = a.x + ((b.x - a.x) * s) / len, z = a.y + ((b.y - a.y) * s) / len
          posts.push(beam([x, 0, z], [x, fenceH, z], 0.035, 5))
        }
        posts.push(beam([a.x, fenceH, a.y], [b.x, fenceH, b.y], 0.025, 5))
        acc += len
      }
      const fg = new THREE.BufferGeometry()
      fg.setAttribute('position', new THREE.Float32BufferAttribute(fpos, 3))
      fg.setAttribute('uv', new THREE.Float32BufferAttribute(fuv, 2))
      fg.computeVertexNormals()
      root.add(new THREE.Mesh(fg, fenceMat))
      root.add(new THREE.Mesh(mergeGeometries(posts), steel))
    }
  }

  // ── stadionul de atletism: tribuna și stâlpii de nocturnă
  const main = tracks.find((t) => t.lanes >= 6) || tracks[0]
  if (main) {
    for (const b of data.buildings) if (b[3] === 'tribuna') root.add(grandstand(b[2], main.ring, M))
    const F = frame(main.ring)
    const hl = F.L * 0.62
    const hw = F.W + 9
    for (const [su, sv] of [[-1, -1], [1, -1], [1, 1], [-1, 1]]) {
      const mast = floodMast(36, white, lamp)
      const [x, z] = local(F, su * hl, sv * hw)
      mast.position.set(x, 0, z)
      mast.lookAt(F.cx, 0, F.cz)
      mast.castShadow = !lowSpec
      root.add(mast)
    }
  }
  return root
}
