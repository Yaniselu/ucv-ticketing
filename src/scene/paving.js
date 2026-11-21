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
  dale: { tile: 2.4, palette: [[192, 190, 184], [186, 184, 178], [198, 196, 190], [182, 180, 175]], seed: 7, speck: 26 },
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
