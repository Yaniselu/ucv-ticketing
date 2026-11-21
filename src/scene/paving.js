// Pavajul din jurul stadionului, generat procedural la scara reală (UV-urile geometriei sunt în
// metri): fiecare tip are culoare, relief (normal map din hartă de înălțimi, cu muchii teșite și
// rosturi) și rugozitate (rosturile sunt mate, fața pavelei mai netedă).
//   spic    – pavele 20×10 cm în spic (herringbone), gri: trotuarele străzilor
//   rosu    – aceleași pavele, roșu-cărămiziu: aleile din parcuri și pistele
//   dale    – dale 60×40 cm, granit deschis, în rânduri decalate: esplanada stadionului
//   patrat  – pavele 30×30 cm în două nuanțe: piețele și zonele pietonale
//   piatra  – piatră cubică 12×10 cm: străzile pavate (surface = sett / paving_stones)
//   bordura – bordura de granit
import * as THREE from 'three'

function rng(seed) {
  let s = seed >>> 0
  return () => ((s = (s * 1664525 + 1013904223) >>> 0) / 4294967296)
}

const KINDS = {
  spic: { tile: 1.6, palette: [[150, 148, 143], [144, 142, 137], [156, 153, 147], [138, 136, 131], [147, 144, 138], [132, 130, 125]], seed: 3 },
  rosu: { tile: 1.6, palette: [[150, 74, 58], [138, 66, 52], [160, 84, 66], [126, 60, 48], [112, 104, 98]], seed: 5 },
  dale: { tile: 2.4, palette: [[176, 174, 168], [168, 166, 161], [182, 180, 174], [161, 159, 154], [171, 168, 160]], seed: 7, speck: 26 },
  patrat: { tile: 1.8, palette: [[172, 170, 165], [160, 158, 153], [124, 122, 118]], seed: 9 },
  piatra: { tile: 1.2, palette: [[118, 116, 114], [104, 102, 100], [130, 127, 122], [92, 90, 88]], seed: 11, speck: 18 },
}

// dreptunghiurile pavelelor într-o dală de textură de tile × tile metri: [x, y, w, h] în metri
function layout(kind, tile, r) {
  const out = []
  if (kind === 'spic' || kind === 'rosu') {
    // spic de 90°: pavele 2×1 unități (u = 10 cm); rețeaua periodică (1,1) și (4,0)
    const u = 0.1
    const n = Math.round(tile / u)
    for (let d = -n; d < 2 * n; d++) {
      for (let c = -n; c < n; c++) {
        const hx = d - 4 * c
        const hy = d
        out.push([hx * u, hy * u, 2 * u, u])
        out.push([(hx - 3) * u, (hy - 2) * u, u, 2 * u])
      }
    }
  } else if (kind === 'dale') {
    const w = 0.6
    const h = 0.4
    for (let y = 0; y < tile + h; y += h) {
      const off = Math.round(y / h) % 2 ? w / 2 : 0
      for (let x = -w; x < tile + w; x += w) out.push([x + off, y, w, h])
    }
  } else if (kind === 'patrat') {
    const s = 0.3
    for (let y = 0; y < tile; y += s) for (let x = 0; x < tile; x += s) out.push([x, y, s, s])
  } else if (kind === 'piatra') {
    const h = 0.1
    for (let y = 0; y < tile + h; y += h) {
      let x = -0.2 + r() * 0.06
      while (x < tile + 0.2) {
        const w = 0.1 + r() * 0.05
        out.push([x, y, w, h])
        x += w
      }
    }
  }
  // doar cele care ating dala (fiecare se desenează și cu copiile de la margini, ca să se repete)
  return out.filter(([x, y, w, h]) => x < tile && y < tile && x + w > 0 && y + h > 0)
}

const cache = new Map()
export function paverSet(kind, { size = 1024 } = {}) {
  const key = `${kind}:${size}`
  if (cache.has(key)) return cache.get(key)
  const K = KINDS[kind]
  const r = rng(K.seed)
  const S = size
  const ppm = S / K.tile
  const col = document.createElement('canvas')
  col.width = col.height = S
  const cg = col.getContext('2d')
  const hgt = new Float32Array(S * S) // înălțimea 0..1
  const tint = new Float32Array(S * S * 3)
  const isJoint = new Uint8Array(S * S).fill(1)
  const gap = kind === 'dale' ? 0.004 : 0.0035 // rostul, în metri
  const bevel = kind === 'piatra' ? 0.018 : kind === 'dale' ? 0.006 : 0.008
  const bricks = layout(kind, K.tile, r)
  // fiecare pavea, cu copiile ei decalate cu ±tile (textura se repetă fără cusături)
  for (const [bx, by, bw, bh] of bricks) {
    const base = K.palette[Math.floor(r() * K.palette.length)]
    const shade = 0.95 + r() * 0.1
    let c = base.map((v) => v * shade)
    if (kind === 'patrat') {
      // benzi mai închise la fiecare al cincilea rând, ca în piețele pietonale
      const row = Math.round(by / 0.3)
      if (row % 5 === 0) c = K.palette[2].map((v) => v * shade)
    }
    const tiltX = (r() - 0.5) * 0.25
    const tiltY = (r() - 0.5) * 0.25
    const lift = 0.85 + r() * 0.15
    for (const ox of [-K.tile, 0, K.tile]) {
      for (const oy of [-K.tile, 0, K.tile]) {
        const x0 = Math.max(0, Math.floor((bx + ox + gap / 2) * ppm))
        const x1 = Math.min(S, Math.ceil((bx + ox + bw - gap / 2) * ppm))
        const y0 = Math.max(0, Math.floor((by + oy + gap / 2) * ppm))
        const y1 = Math.min(S, Math.ceil((by + oy + bh - gap / 2) * ppm))
        if (x1 <= x0 || y1 <= y0) continue
        const ex0 = (bx + ox + gap / 2) * ppm
        const ex1 = (bx + ox + bw - gap / 2) * ppm
        const ey0 = (by + oy + gap / 2) * ppm
        const ey1 = (by + oy + bh - gap / 2) * ppm
        const bv = bevel * ppm
        for (let y = y0; y < y1; y++) {
          for (let x = x0; x < x1; x++) {
            const e = Math.min(x - ex0, ex1 - x, y - ey0, ey1 - y)
            if (e < 0) continue
            const i = y * S + x
            const fx = (x - (ex0 + ex1) / 2) / (ex1 - ex0)
            const fy = (y - (ey0 + ey1) / 2) / (ey1 - ey0)
            // pietrele cubice sunt bombate; pavelele au fața plană cu muchia teșită
            const crown = kind === 'piatra' ? 1 - 0.5 * (fx * fx + fy * fy) : 1
            hgt[i] = (0.25 + 0.75 * Math.min(1, e / bv) ** 0.65) * lift * crown + tiltX * fx * 0.15 + tiltY * fy * 0.15
            const edge = Math.min(1, e / (bv * 1.6))
            tint[i * 3] = c[0] * (0.82 + 0.18 * edge)
            tint[i * 3 + 1] = c[1] * (0.82 + 0.18 * edge)
            tint[i * 3 + 2] = c[2] * (0.82 + 0.18 * edge)
            isJoint[i] = 0
          }
        }
      }
    }
  }
  // culoarea: pavele + agregatul (granulație), rosturile cu nisip / murdărie
  const img = cg.createImageData(S, S)
  const speck = K.speck || 14
  for (let i = 0; i < S * S; i++) {
    const n = (r() - 0.5) * speck
    let R, G, B
    if (isJoint[i]) {
      const v = 70 + r() * 20
      R = v * 0.98; G = v * 0.95; B = v * 0.88
    } else {
      R = tint[i * 3] + n; G = tint[i * 3 + 1] + n; B = tint[i * 3 + 2] + n
      // granule mai deschise / mai închise (granit, beton spălat)
      const q = r()
      if (q < 0.02) { R += 30; G += 30; B += 30 } else if (q < 0.035) { R -= 35; G -= 35; B -= 35 }
    }
    img.data[i * 4] = R
    img.data[i * 4 + 1] = G
    img.data[i * 4 + 2] = B
    img.data[i * 4 + 3] = 255
  }
  // pete de uzură / umezeală, mari și discrete
  cg.putImageData(img, 0, 0)
  cg.globalCompositeOperation = 'multiply'
  for (let k = 0; k < 10; k++) {
    const x = r() * S
    const y = r() * S
    const rad = S * (0.08 + r() * 0.15)
    for (const ox of [-S, 0, S]) for (const oy of [-S, 0, S]) {
      const grd = cg.createRadialGradient(x + ox, y + oy, 0, x + ox, y + oy, rad)
      grd.addColorStop(0, `rgba(170,165,155,${0.18 + r() * 0.12})`)
      grd.addColorStop(1, 'rgba(255,255,255,0)')
      cg.fillStyle = grd
      cg.fillRect(x + ox - rad, y + oy - rad, rad * 2, rad * 2)
    }
  }
  cg.globalCompositeOperation = 'source-over'
  // normal map și rugozitate
  const nc = document.createElement('canvas')
  nc.width = nc.height = S
  const ng = nc.getContext('2d')
  const nimg = ng.createImageData(S, S)
  const rc = document.createElement('canvas')
  rc.width = rc.height = S
  const rg = rc.getContext('2d')
  const rimg = rg.createImageData(S, S)
  const H = (x, y) => hgt[(((y + S) % S) * S) + ((x + S) % S)]
  const k = kind === 'piatra' ? 5 : 3.2
  for (let y = 0; y < S; y++) {
    for (let x = 0; x < S; x++) {
      const dx = (H(x + 1, y) - H(x - 1, y)) * k
      const dy = (H(x, y + 1) - H(x, y - 1)) * k
      const len = Math.hypot(dx, dy, 1)
      const o = (y * S + x) * 4
      nimg.data[o] = (-dx / len * 0.5 + 0.5) * 255
      nimg.data[o + 1] = (dy / len * 0.5 + 0.5) * 255
      nimg.data[o + 2] = (1 / len * 0.5 + 0.5) * 255
      nimg.data[o + 3] = 255
      const rv = isJoint[y * S + x] ? 255 : 200 + r() * 40
      rimg.data[o] = rimg.data[o + 1] = rimg.data[o + 2] = rv
      rimg.data[o + 3] = 255
    }
  }
  ng.putImageData(nimg, 0, 0)
  rg.putImageData(rimg, 0, 0)
  const mk = (c, srgb) => {
    const t = new THREE.CanvasTexture(c)
    if (srgb) t.colorSpace = THREE.SRGBColorSpace
    t.wrapS = t.wrapT = THREE.RepeatWrapping
    t.anisotropy = 16
    t.repeat.set(1 / K.tile, 1 / K.tile) // UV-urile geometriei sunt în metri
    return t
  }
  const set = { map: mk(col, true), normalMap: mk(nc, false), roughnessMap: mk(rc, false), tile: K.tile }
  cache.set(key, set)
  return set
}

export function paverMaterial(kind, opts = {}) {
  const s = paverSet(kind, opts)
  return new THREE.MeshStandardMaterial({
    map: s.map, normalMap: s.normalMap, roughnessMap: s.roughnessMap, roughness: 1, metalness: 0,
    normalScale: new THREE.Vector2(1, 1), polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2,
  })
}

// bordura de granit: textură gri cu granulație
export function curbMaterial() {
  const c = document.createElement('canvas')
  c.width = c.height = 256
  const g = c.getContext('2d')
  const img = g.createImageData(256, 256)
  const r = rng(13)
  for (let i = 0; i < 256 * 256; i++) {
    const v = 168 + (r() - 0.5) * 50 + (r() < 0.03 ? -50 : 0)
    img.data[i * 4] = v
    img.data[i * 4 + 1] = v
    img.data[i * 4 + 2] = v * 0.98
    img.data[i * 4 + 3] = 255
  }
  g.putImageData(img, 0, 0)
  // rosturile dintre borduri, la 1 m
  g.fillStyle = 'rgba(40,40,40,0.8)'
  g.fillRect(0, 0, 3, 256)
  const t = new THREE.CanvasTexture(c)
  t.colorSpace = THREE.SRGBColorSpace
  t.wrapS = t.wrapT = THREE.RepeatWrapping
  t.anisotropy = 8
  return new THREE.MeshStandardMaterial({ map: t, roughness: 0.8 })
}

// ─── Asfalt, gazon și beton la scară reală (UV în metri) ─────────────────
// Același principiu ca la pavele: culoare + relief (normal map din hartă de înălțimi) + rugozitate.
function heightToNormal(hgt, S, k) {
  const nc = document.createElement('canvas')
  nc.width = nc.height = S
  const ng = nc.getContext('2d')
  const nimg = ng.createImageData(S, S)
  const H = (x, y) => hgt[(((y + S) % S) * S) + ((x + S) % S)]
  for (let y = 0; y < S; y++) {
    for (let x = 0; x < S; x++) {
      const dx = (H(x + 1, y) - H(x - 1, y)) * k
      const dy = (H(x, y + 1) - H(x, y - 1)) * k
      const len = Math.hypot(dx, dy, 1)
      const o = (y * S + x) * 4
      nimg.data[o] = (-dx / len * 0.5 + 0.5) * 255
      nimg.data[o + 1] = (dy / len * 0.5 + 0.5) * 255
      nimg.data[o + 2] = (1 / len * 0.5 + 0.5) * 255
      nimg.data[o + 3] = 255
    }
  }
  ng.putImageData(nimg, 0, 0)
  return nc
}

function wrapTex(c, srgb, tile) {
  const t = new THREE.CanvasTexture(c)
  if (srgb) t.colorSpace = THREE.SRGBColorSpace
  t.wrapS = t.wrapT = THREE.RepeatWrapping
  t.anisotropy = 16
  t.repeat.set(1 / tile[0], 1 / tile[1])
  return t
}

// zgomot neted periodic (valoare 0..1) pe o grilă de `cells` celule
function smoothNoise(S, cells, r) {
  const g = new Float32Array(cells * cells).map(() => r())
  const out = new Float32Array(S * S)
  for (let y = 0; y < S; y++) {
    for (let x = 0; x < S; x++) {
      const fx = (x / S) * cells
      const fy = (y / S) * cells
      const x0 = Math.floor(fx), y0 = Math.floor(fy)
      const tx = fx - x0, ty = fy - y0
      const sx = tx * tx * (3 - 2 * tx), sy = ty * ty * (3 - 2 * ty)
      const v = (i, j) => g[((j % cells) * cells) + (i % cells)]
      const a = v(x0, y0) + (v(x0 + 1, y0) - v(x0, y0)) * sx
      const b = v(x0, y0 + 1) + (v(x0 + 1, y0 + 1) - v(x0, y0 + 1)) * sx
      out[y * S + x] = a + (b - a) * sy
    }
  }
  return out
}

const surfCache = new Map()
// asfalt: liant închis cu agregat (pietriș) deschis și închis, pete de uzură, granulație în relief
export function asphaltSet({ size = 1024 } = {}) {
  const key = `asfalt:${size}`
  if (surfCache.has(key)) return surfCache.get(key)
  const S = size
  const tile = 3
  const r = rng(41)
  const big = smoothNoise(S, 6, r)
  const mid = smoothNoise(S, 24, r)
  const hgt = new Float32Array(S * S)
  const col = document.createElement('canvas')
  col.width = col.height = S
  const g = col.getContext('2d')
  const img = g.createImageData(S, S)
  for (let i = 0; i < S * S; i++) {
    const v = 62 + (big[i] - 0.5) * 16 + (mid[i] - 0.5) * 10 + (r() - 0.5) * 14
    img.data[i * 4] = v
    img.data[i * 4 + 1] = v + 1
    img.data[i * 4 + 2] = v + 4
    img.data[i * 4 + 3] = 255
    hgt[i] = r() * 0.25
  }
  // agregatul: pietricele de 2–9 mm
  const ppm = S / tile
  for (let k = 0; k < S * S * 0.018; k++) {
    const x = Math.floor(r() * S)
    const y = Math.floor(r() * S)
    const rad = Math.max(1, (0.001 + r() * 0.0035) * ppm)
    const light = r() < 0.55
    const c = light ? 120 + r() * 70 : 30 + r() * 25
    for (let dy = -Math.ceil(rad); dy <= Math.ceil(rad); dy++) {
      for (let dx = -Math.ceil(rad); dx <= Math.ceil(rad); dx++) {
        const d = Math.hypot(dx, dy)
        if (d > rad) continue
        const px = (x + dx + S) % S
        const py = (y + dy + S) % S
        const i = py * S + px
        const f = 1 - d / (rad + 0.5)
        img.data[i * 4] = img.data[i * 4] * (1 - f) + c * f
        img.data[i * 4 + 1] = img.data[i * 4 + 1] * (1 - f) + c * f
        img.data[i * 4 + 2] = img.data[i * 4 + 2] * (1 - f) + (c + 3) * f
        hgt[i] = Math.max(hgt[i], 0.4 + f * 0.6)
      }
    }
  }
  g.putImageData(img, 0, 0)
  const rc = document.createElement('canvas')
  rc.width = rc.height = S
  const rg = rc.getContext('2d')
  const rimg = rg.createImageData(S, S)
  for (let i = 0; i < S * S; i++) {
    const v = 215 + (big[i] - 0.5) * 50 - hgt[i] * 30
    rimg.data[i * 4] = rimg.data[i * 4 + 1] = rimg.data[i * 4 + 2] = v
    rimg.data[i * 4 + 3] = 255
  }
  rg.putImageData(rimg, 0, 0)
  const set = { map: wrapTex(col, true, [tile, tile]), normalMap: wrapTex(heightToNormal(hgt, S, 2.2), false, [tile, tile]), roughnessMap: wrapTex(rc, false, [tile, tile]), tile }
  surfCache.set(key, set)
  return set
}

export function asphaltMaterial(opts = {}) {
  const s = asphaltSet(opts)
  return new THREE.MeshStandardMaterial({ map: s.map, normalMap: s.normalMap, roughnessMap: s.roughnessMap, roughness: 1, metalness: 0, normalScale: new THREE.Vector2(0.8, 0.8) })
}

// gazon tuns: fire scurte în mai multe nuanțe, pete mai închise / mai uscate, relief de fire
export function grassSet({ size = 1024 } = {}) {
  const key = `iarba:${size}`
  if (surfCache.has(key)) return surfCache.get(key)
  const S = size
  const tile = 2.5
  const r = rng(77)
  const big = smoothNoise(S, 5, r)
  const mid = smoothNoise(S, 20, r)
  const col = document.createElement('canvas')
  col.width = col.height = S
  const g = col.getContext('2d')
  const img = g.createImageData(S, S)
  const hgt = new Float32Array(S * S)
  for (let i = 0; i < S * S; i++) {
    const dry = Math.max(0, big[i] - 0.62) * 2
    const v = (mid[i] - 0.5) * 18 + (r() - 0.5) * 22
    img.data[i * 4] = 58 + v + dry * 40
    img.data[i * 4 + 1] = 92 + v + dry * 22
    img.data[i * 4 + 2] = 34 + v * 0.5
    img.data[i * 4 + 3] = 255
  }
  g.putImageData(img, 0, 0)
  // firele: liniuțe scurte, ușor înclinate, deschise la vârf
  const ppm = S / tile
  const blades = Math.floor(S * S * 0.07)
  const shades = ['#4f7a2c', '#5d8a33', '#6e9a3c', '#3f6624', '#7aa548', '#87a656', '#2f5120']
  for (let k = 0; k < blades; k++) {
    const x = r() * S
    const y = r() * S
    const len = (0.008 + r() * 0.018) * ppm
    const a = -Math.PI / 2 + (r() - 0.5) * 1.2
    g.strokeStyle = shades[Math.floor(r() * shades.length)]
    g.globalAlpha = 0.55 + r() * 0.45
    g.lineWidth = Math.max(1, 0.0012 * ppm)
    g.beginPath()
    for (const ox of [0, -S, S]) for (const oy of [0, -S, S]) {
      g.moveTo(x + ox, y + oy)
      g.lineTo(x + ox + Math.cos(a) * len, y + oy + Math.sin(a) * len)
    }
    g.stroke()
  }
  g.globalAlpha = 1
  const data = g.getImageData(0, 0, S, S).data
  for (let i = 0; i < S * S; i++) hgt[i] = (data[i * 4 + 1] / 255) * 0.9 + r() * 0.1
  const rc = document.createElement('canvas')
  rc.width = rc.height = S
  const rg = rc.getContext('2d')
  rg.fillStyle = '#f0f0f0'
  rg.fillRect(0, 0, S, S)
  const set = { map: wrapTex(col, true, [tile, tile]), normalMap: wrapTex(heightToNormal(hgt, S, 1.6), false, [tile, tile]), roughnessMap: wrapTex(rc, false, [tile, tile]), tile }
  surfCache.set(key, set)
  return set
}

export function grassMaterial(opts = {}) {
  const s = grassSet(opts)
  return new THREE.MeshStandardMaterial({ map: s.map, normalMap: s.normalMap, roughness: 0.95, metalness: 0, normalScale: new THREE.Vector2(0.9, 0.9) })
}

// beton aparent turnat în cofraj: panouri de 2,4 × 1,2 m cu rosturi și găurile tiranților
export function concreteSet({ size = 512, tone = 200 } = {}) {
  const key = `beton:${size}:${tone}`
  if (surfCache.has(key)) return surfCache.get(key)
  const S = size
  const tile = [2.4, 1.2]
  const r = rng(91 + tone)
  const big = smoothNoise(S, 4, r)
  const col = document.createElement('canvas')
  col.width = col.height = S
  const g = col.getContext('2d')
  const img = g.createImageData(S, S)
  const hgt = new Float32Array(S * S)
  for (let y = 0; y < S; y++) {
    for (let x = 0; x < S; x++) {
      const i = y * S + x
      let v = tone + (big[i] - 0.5) * 22 + (r() - 0.5) * 12
      let h = 0.5 + (r() - 0.5) * 0.05
      // rosturile panourilor (marginea dalei de textură = rostul)
      if (x < 2 || y < 2) { v -= 38; h = 0.2 }
      // găurile tiranților, câte 3 × 2 pe panou
      for (const tx of [0.2, 0.5, 0.8]) for (const ty of [0.25, 0.75]) {
        const d = Math.hypot(x - tx * S, (y - ty * S) * 0.5)
        if (d < S * 0.008) { v -= 55; h = 0.1 }
      }
      img.data[i * 4] = v
      img.data[i * 4 + 1] = v
      img.data[i * 4 + 2] = v * 0.985
      img.data[i * 4 + 3] = 255
      hgt[i] = h
    }
  }
  g.putImageData(img, 0, 0)
  const set = { map: wrapTex(col, true, tile), normalMap: wrapTex(heightToNormal(hgt, S, 2), false, tile), tile }
  surfCache.set(key, set)
  return set
}

export function concreteMaterial({ tone = 200, color = 0xffffff, size = 512 } = {}) {
  const s = concreteSet({ size, tone })
  return new THREE.MeshStandardMaterial({ map: s.map, normalMap: s.normalMap, color, roughness: 0.88, metalness: 0, normalScale: new THREE.Vector2(0.6, 0.6) })
}
