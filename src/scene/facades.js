// Fațadele clădirilor din jurul stadionului, desenate procedural în atlase (canvas):
// – blocuri de locuințe românești (panouri prefabricate, balcoane închise sau deschise, casa
//   scării, parter cu intrări), case (tencuială, ferestre cu rame și pervaz, soclu), clădiri de
//   birouri și comerciale (vitraj), hale (tablă cutată, uși mari);
// pentru fiecare: culoare (canalul alfa = zona de perete, nuanțată per clădire), relief (normal
// map din hartă de înălțimi) și rugozitate (geamul lucește, tencuiala nu).
import * as THREE from 'three'

function rng(seed) {
  let s = seed >>> 0
  return () => ((s = (s * 1664525 + 1013904223) >>> 0) / 4294967296)
}
const pick = (r, arr) => arr[Math.floor(r() * arr.length)]

// trei canvasuri paralele: culoare (+masca peretelui în alfa), înălțime, rugozitate
function layers(w, h) {
  const mk = () => {
    const c = document.createElement('canvas')
    c.width = w
    c.height = h
    return [c, c.getContext('2d')]
  }
  const [cc, cg] = mk()
  const [hc, hg] = mk()
  const [rc, rg] = mk()
  return { w, h, cc, cg, hc, hg, rc, rg }
}
// dreptunghi pe toate trei straturile: culoare, înălțime (0–255), rugozitate (0–255), perete (alfa)
function rect(L, x, y, w, h, color, height, rough, wall = false) {
  L.cg.globalCompositeOperation = 'source-over'
  L.cg.fillStyle = color
  L.cg.globalAlpha = 1
  L.cg.fillRect(x, y, w, h)
  if (!wall) {
    // zona care nu e perete: alfa 0 în masca de nuanțare (o desenăm separat)
    L.mask.push([x, y, w, h])
  }
  L.hg.fillStyle = `rgb(${height},${height},${height})`
  L.hg.fillRect(x, y, w, h)
  L.rg.fillStyle = `rgb(${rough},${rough},${rough})`
  L.rg.fillRect(x, y, w, h)
}
function glass(L, x, y, w, h, r, tint = 0) {
  // geam: reflexie de cer sus, interior întunecat jos, uneori perdea / jaluzea
  // reflexia cerului și a clădirilor din față: deschisă sus, mai închisă jos, nuanțe diferite
  const g = L.cg.createLinearGradient(0, y, 0, y + h)
  const sky = [[188, 204, 220], [160, 178, 196], [140, 152, 162]][tint]
  const k = 0.85 + r() * 0.3
  g.addColorStop(0, `rgb(${sky[0] * k},${sky[1] * k},${sky[2] * k})`)
  g.addColorStop(0.5, `rgb(${sky[0] * 0.62 * k},${sky[1] * 0.66 * k},${sky[2] * 0.7 * k})`)
  g.addColorStop(1, `rgb(${70 * k},${78 * k},${88 * k})`)
  rect(L, x, y, w, h, '#000', 70, 30)
  L.cg.fillStyle = g
  L.cg.fillRect(x, y, w, h)
  // o diagonală de reflexie
  L.cg.fillStyle = 'rgba(255,255,255,0.10)'
  L.cg.beginPath()
  L.cg.moveTo(x + w * 0.2, y)
  L.cg.lineTo(x + w * 0.55, y)
  L.cg.lineTo(x + w * 0.15, y + h)
  L.cg.lineTo(x, y + h)
  L.cg.lineTo(x, y + h * 0.5)
  L.cg.closePath()
  L.cg.fill()
  const c = r()
  if (c < 0.06) {
    // geam luminat din interior
    L.cg.fillStyle = 'rgba(255,214,150,0.55)'
    L.cg.fillRect(x + 1, y + 1, w - 2, h - 2)
  } else if (c < 0.36) {
    L.cg.fillStyle = `rgba(${200 + r() * 40},${190 + r() * 40},${170 + r() * 40},0.55)`
    L.cg.fillRect(x + 1, y + 1, w - 2, h * (0.3 + r() * 0.6))
  } else if (c < 0.42) {
    L.cg.fillStyle = 'rgba(230,230,225,0.5)'
    for (let yy = y; yy < y + h * 0.7; yy += 3) L.cg.fillRect(x, yy, w, 1.5)
  }
}
// fereastră cu ramă (PVC alb, maro sau lemn vechi), cu montant
function windowFrame(L, x, y, w, h, r, frame = null) {
  const f = frame || pick(r, ['#f4f4f2', '#f4f4f2', '#f4f4f2', '#f0efea', '#6b4a33', '#8a6a4a', '#d9d4c7'])
  rect(L, x - 2, y - 2, w + 4, h + 4, f, 110, 120)
  glass(L, x + 2, y + 2, w - 4, h - 4, r, Math.floor(r() * 3))
  L.cg.fillStyle = f
  L.cg.fillRect(x + w / 2 - 1.5, y, 3, h)
  L.hg.fillStyle = 'rgb(110,110,110)'
  L.hg.fillRect(x + w / 2 - 1.5, y, 3, h)
  if (r() < 0.6) {
    L.cg.fillRect(x, y + h * 0.3, w, 2.5)
    L.hg.fillRect(x, y + h * 0.3, w, 2.5)
  }
  // pervazul
  rect(L, x - 5, y + h + 1, w + 10, 4, '#d5d2ca', 190, 140)
}
function finish(L) {
  // masca: alfa 1 pe perete, 0 pe restul (geamuri, rame, balcoane colorate separat)
  const img = L.cg.getImageData(0, 0, L.w, L.h)
  const m = document.createElement('canvas')
  m.width = L.w
  m.height = L.h
  const mg = m.getContext('2d')
  mg.fillStyle = '#fff'
  mg.fillRect(0, 0, L.w, L.h)
  mg.fillStyle = '#000'
  for (const [x, y, w, h] of L.mask) mg.fillRect(x, y, w, h)
  const md = mg.getImageData(0, 0, L.w, L.h).data
  // canvasul păstrează alfa premultiplicat: cu alfa 0 s-ar pierde culoarea geamurilor, deci zona
  // care nu e perete are alfa 128 (pragul e 0,75 în shader)
  for (let i = 0; i < img.data.length; i += 4) img.data[i + 3] = md[i] > 127 ? 255 : 128
  L.cg.putImageData(img, 0, 0)
  // normal map din înălțimi
  const hd = L.hg.getImageData(0, 0, L.w, L.h).data
  const nimg = L.hg.createImageData(L.w, L.h)
  const H = (x, y) => hd[(Math.min(L.h - 1, Math.max(0, y)) * L.w + Math.min(L.w - 1, Math.max(0, x))) * 4] / 255
  const k = 2.2
  for (let y = 0; y < L.h; y++) {
    for (let x = 0; x < L.w; x++) {
      const dx = (H(x + 1, y) - H(x - 1, y)) * k
      const dy = (H(x, y + 1) - H(x, y - 1)) * k
      const len = Math.hypot(dx, dy, 1)
      const o = (y * L.w + x) * 4
      nimg.data[o] = (-dx / len * 0.5 + 0.5) * 255
      nimg.data[o + 1] = (dy / len * 0.5 + 0.5) * 255
      nimg.data[o + 2] = (1 / len * 0.5 + 0.5) * 255
      nimg.data[o + 3] = 255
    }
  }
  const nc = document.createElement('canvas')
  nc.width = L.w
  nc.height = L.h
  nc.getContext('2d').putImageData(nimg, 0, 0)
  const tex = (c, srgb) => {
    const t = new THREE.CanvasTexture(c)
    if (srgb) t.colorSpace = THREE.SRGBColorSpace
    t.wrapS = t.wrapT = THREE.RepeatWrapping
    t.anisotropy = 8
    return t
  }
  return { map: tex(L.cc, true), normalMap: tex(nc, false), roughnessMap: tex(L.rc, false) }
}
function wallBase(L, x, y, w, h, r, plaster = true) {
  rect(L, x, y, w, h, '#ffffff', 128, 230, true)
  // tencuială: pete fine (nuanța reală vine din culoarea clădirii)
  const img = L.cg.getImageData(x, y, w, h)
  for (let i = 0; i < img.data.length; i += 4) {
    const n = (r() - 0.5) * (plaster ? 16 : 8)
    img.data[i] += n
    img.data[i + 1] += n
    img.data[i + 2] += n
  }
  L.cg.putImageData(img, x, y)
}
function grime(L, r) {
  // scurgeri sub pervaze și murdărie spre bază
  L.cg.globalCompositeOperation = 'multiply'
  for (let k = 0; k < 40; k++) {
    const x = r() * L.w
    const y = r() * L.h
    const g = L.cg.createLinearGradient(0, y, 0, y + 30 + r() * 60)
    g.addColorStop(0, 'rgba(120,115,105,0.18)')
    g.addColorStop(1, 'rgba(255,255,255,0)')
    L.cg.fillStyle = g
    L.cg.fillRect(x, y, 6 + r() * 14, 30 + r() * 60)
  }
  L.cg.globalCompositeOperation = 'source-over'
}

const CELL = 128 // pixeli pe travee / etaj
export const FACADE = {
  block: { bay: 3.3, floor: 2.8, ground: 3.2 },
  house: { bay: 3.4, floor: 3.0, ground: 3.0 },
  office: { bay: 3.6, floor: 3.6, ground: 4.5 },
  industrial: { bay: 5.0, floor: 4.0, ground: 4.5 },
}

// ─── bloc de locuințe ───
function blockUpper(seed) {
  const r = rng(seed)
  const L = layers(CELL * 8, CELL * 8)
  L.mask = []
  // tipul fiecărei coloane (constant pe verticală, ca la blocurile reale)
  const cols = [0, 1, 1, 0, 2, 0, 1, 0].map((t) => (r() < 0.15 ? 0 : t))
  for (let fy = 0; fy < 8; fy++) {
    for (let bx = 0; bx < 8; bx++) {
      const x = bx * CELL
      const y = fy * CELL
      wallBase(L, x, y, CELL, CELL, r)
      // rosturile panourilor
      rect(L, x, y + CELL - 2, CELL, 2, '#b9b6ae', 90, 230)
      rect(L, x + CELL - 2, y, 2, CELL, '#bdbab2', 90, 230)
      const t = cols[bx]
      if (t === 0) {
        windowFrame(L, x + 28, y + 30, 72, 66, r)
        if (r() < 0.12) rect(L, x + 98, y + 82, 22, 14, '#e8e8e6', 210, 160) // aer condiționat
      } else if (t === 1) {
        // balcon: placa în consolă, parapet, închis cu tâmplărie sau deschis
        const closed = r() < 0.62
        const par = pick(r, ['#f2f0ea', '#e6e1d4', '#d9dde2', '#e8d9c6', '#cfd7d1', '#f0e6d2'])
        rect(L, x + 4, y + CELL - 12, CELL - 8, 8, '#cfcbc2', 245, 220)
        if (closed) {
          const f = pick(r, ['#f6f6f4', '#f6f6f4', '#7a5a40', '#c8ccd0'])
          rect(L, x + 6, y + 18, CELL - 12, 46, f, 230, 120)
          for (let k = 0; k < 3; k++) glass(L, x + 10 + k * 37, y + 22, 33, 38, r, 0)
          rect(L, x + 6, y + 64, CELL - 12, 52, par, 235, 210)
        } else {
          rect(L, x + 6, y + 18, CELL - 12, 50, '#3a3e44', 70, 200)
          windowFrame(L, x + 16, y + 22, 42, 44, r)
          rect(L, x + 66, y + 22, 40, 44, '#4a4036', 60, 200)
          rect(L, x + 6, y + 70, CELL - 12, 46, par, 235, 210)
          if (r() < 0.3) {
            L.cg.fillStyle = pick(r, ['#c23b3b', '#3b6dc2', '#e8e8e8', '#e0b030'])
            L.cg.fillRect(x + 20 + r() * 50, y + 62, 18, 10)
          }
        }
      } else {
        // casa scării: fereastră îngustă, decalată la jumătate de etaj
        wallBase(L, x, y, CELL, CELL, r)
        windowFrame(L, x + 40, y + 70, 48, 50, r, '#f2f2f0')
      }
      if (r() < 0.05) {
        L.cg.fillStyle = '#d8d8d8'
        L.cg.beginPath()
        L.cg.arc(x + 110, y + 26, 9, 0, Math.PI * 2)
        L.cg.fill()
      }
    }
  }
  grime(L, r)
  return finish(L)
}
function blockGround(seed) {
  const r = rng(seed)
  const L = layers(CELL * 8, CELL)
  L.mask = []
  for (let bx = 0; bx < 8; bx++) {
    const x = bx * CELL
    wallBase(L, x, 0, CELL, CELL, r)
    rect(L, x, CELL - 22, CELL, 22, '#8f8c86', 150, 240) // soclul
    if (bx === 4) {
      // intrarea în bloc: ușă metalică cu geam și copertină
      rect(L, x + 30, 18, 68, 8, '#d0ccc4', 250, 200)
      rect(L, x + 38, 30, 52, 76, '#5a5f66', 90, 140)
      glass(L, x + 44, 36, 40, 40, r, 1)
    } else if (r() < 0.22) {
      // spațiu comercial la parter
      rect(L, x + 6, 16, CELL - 12, 92, '#e8e6e0', 120, 120)
      glass(L, x + 10, 20, CELL - 20, 84, r, 0)
    } else {
      windowFrame(L, x + 32, 26, 64, 54, r)
      if (r() < 0.5) rect(L, x + 32, 26, 64, 54, '#e6e2d8', 150, 200) // grilaj / jaluzea
    }
  }
  grime(L, r)
  return finish(L)
}

// ─── casă ───
function houseUpper(seed) {
  const r = rng(seed)
  const L = layers(CELL * 8, CELL * 8)
  L.mask = []
  for (let fy = 0; fy < 8; fy++) {
    for (let bx = 0; bx < 8; bx++) {
      const x = bx * CELL
      const y = fy * CELL
      wallBase(L, x, y, CELL, CELL, r)
      if (r() < 0.78) {
        const w = r() < 0.3 ? 46 : 60
        windowFrame(L, x + (CELL - w) / 2, y + 32, w, 62, r)
        if (r() < 0.18) {
          // obloane
          const sc = pick(r, ['#5a3d2b', '#2f5d3a', '#6c6f73'])
          rect(L, x + (CELL - w) / 2 - 16, y + 30, 14, 66, sc, 150, 200)
          rect(L, x + (CELL + w) / 2 + 2, y + 30, 14, 66, sc, 150, 200)
        }
      }
      // cornișa / streașina la marginea de sus a etajului
      rect(L, x, y, CELL, 4, '#d8d3c8', 170, 220, true)
    }
  }
  grime(L, r)
  return finish(L)
}
function houseGround(seed) {
  const r = rng(seed)
  const L = layers(CELL * 8, CELL)
  L.mask = []
  for (let bx = 0; bx < 8; bx++) {
    const x = bx * CELL
    wallBase(L, x, 0, CELL, CELL, r)
    rect(L, x, CELL - 18, CELL, 18, pick(r, ['#7d776d', '#8c857a', '#6f6a62']), 160, 240) // soclul
    if (bx === 2 || (bx === 6 && r() < 0.5)) {
      rect(L, x + 38, 22, 52, 88, pick(r, ['#5b3b25', '#7a5232', '#e9e7e2', '#4a4f55']), 90, 160)
      glass(L, x + 48, 30, 32, 26, r, 1)
    } else if (r() < 0.8) {
      windowFrame(L, x + 34, 26, 60, 58, r)
      if (r() < 0.25) rect(L, x + 34, 26, 60, 58, '#c9c4b8', 140, 200) // rulou tras
    }
  }
  grime(L, r)
  return finish(L)
}

// ─── birouri / comercial ───
function officeUpper(seed) {
  const r = rng(seed)
  const L = layers(CELL * 8, CELL * 8)
  L.mask = []
  for (let fy = 0; fy < 8; fy++) {
    const y = fy * CELL
    wallBase(L, 0, y, CELL * 8, CELL, r, false)
    glass(L, 0, y + 22, CELL * 8, 78, r, 0)
    for (let x = 0; x < CELL * 8; x += 42) rect(L, x, y + 22, 4, 78, '#c9cdd1', 150, 90)
    rect(L, 0, y + 100, CELL * 8, 28, '#e1e3e5', 170, 160, true)
  }
  return finish(L)
}
function officeGround(seed) {
  const r = rng(seed)
  const L = layers(CELL * 8, CELL)
  L.mask = []
  wallBase(L, 0, 0, CELL * 8, CELL, r, false)
  glass(L, 0, 14, CELL * 8, 104, r, 0)
  for (let x = 0; x < CELL * 8; x += 64) rect(L, x, 14, 5, 104, '#a7adb3', 150, 80)
  rect(L, 0, 0, CELL * 8, 14, '#2f3a46', 180, 150) // banda pentru firmă
  return finish(L)
}

// ─── hală / depozit ───
function industrialUpper(seed) {
  const r = rng(seed)
  const L = layers(CELL * 8, CELL * 8)
  L.mask = []
  wallBase(L, 0, 0, CELL * 8, CELL * 8, r, false)
  for (let x = 0; x < CELL * 8; x += 8) {
    L.hg.fillStyle = 'rgb(150,150,150)'
    L.hg.fillRect(x, 0, 4, CELL * 8)
    L.cg.fillStyle = 'rgba(0,0,0,0.05)'
    L.cg.fillRect(x, 0, 2, CELL * 8)
  }
  for (let bx = 0; bx < 8; bx += 2) glass(L, bx * CELL + 20, 20, CELL * 1.6, 30, r, 0)
  return finish(L)
}
function industrialGround(seed) {
  const r = rng(seed)
  const L = layers(CELL * 8, CELL)
  L.mask = []
  wallBase(L, 0, 0, CELL * 8, CELL, r, false)
  for (let bx = 0; bx < 8; bx++) {
    if (bx % 3 === 1) {
      rect(L, bx * CELL + 12, 20, CELL - 24, 108, '#9aa0a6', 120, 150)
      for (let y = 24; y < 128; y += 9) rect(L, bx * CELL + 12, y, CELL - 24, 2, '#7d838a', 100, 150)
    }
  }
  return finish(L)
}

const MAKERS = {
  block: [blockUpper, blockGround],
  house: [houseUpper, houseGround],
  office: [officeUpper, officeGround],
  industrial: [industrialUpper, industrialGround],
}
export function facadeSet(type, seed = 1) {
  const [up, gr] = MAKERS[type]
  return { upper: up(seed), ground: gr(seed + 7) }
}

// material de fațadă: textura e nuanțată doar pe zona de perete (alfa), geamurile rămân reale
export function facadeMaterial(set) {
  const m = new THREE.MeshStandardMaterial({
    map: set.map, normalMap: set.normalMap, roughnessMap: set.roughnessMap, normalScale: new THREE.Vector2(1.2, 1.2),
    vertexColors: true, roughness: 1, metalness: 0.0, side: THREE.DoubleSide,
  })
  m.onBeforeCompile = (sh) => {
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <map_fragment>', '#include <map_fragment>\nfloat wallMask = step(0.75, sampledDiffuseColor.a);\ndiffuseColor.a = opacity;')
      .replace('#include <color_fragment>', 'diffuseColor.rgb = mix(diffuseColor.rgb, diffuseColor.rgb * vColor.rgb, wallMask);')
  }
  m.customProgramCacheKey = () => 'facade-v2'
  return m
}

// țigla și acoperișul plat
export function roofTileTexture() {
  const c = document.createElement('canvas')
  c.width = c.height = 256
  const g = c.getContext('2d')
  const r = rng(77)
  g.fillStyle = '#ffffff'
  g.fillRect(0, 0, 256, 256)
  for (let y = 0; y < 256; y += 16) {
    const off = (y / 16) % 2 ? 10 : 0
    for (let x = -20; x < 256; x += 20) {
      const v = 200 + r() * 55
      const grd = g.createLinearGradient(0, y, 0, y + 16)
      grd.addColorStop(0, `rgb(${v},${v},${v})`)
      grd.addColorStop(1, `rgb(${v * 0.62},${v * 0.62},${v * 0.62})`)
      g.fillStyle = grd
      g.beginPath()
      g.moveTo(x + off, y)
      g.lineTo(x + off + 20, y)
      g.lineTo(x + off + 19, y + 14)
      g.quadraticCurveTo(x + off + 10, y + 18, x + off + 1, y + 14)
      g.closePath()
      g.fill()
    }
  }
  const t = new THREE.CanvasTexture(c)
  t.colorSpace = THREE.SRGBColorSpace
  t.wrapS = t.wrapT = THREE.RepeatWrapping
  t.anisotropy = 8
  return t
}
export function flatRoofTexture() {
  const c = document.createElement('canvas')
  c.width = c.height = 256
  const g = c.getContext('2d')
  const r = rng(91)
  g.fillStyle = '#7d7f80'
  g.fillRect(0, 0, 256, 256)
  const img = g.getImageData(0, 0, 256, 256)
  for (let i = 0; i < img.data.length; i += 4) {
    const n = (r() - 0.5) * 40
    img.data[i] += n
    img.data[i + 1] += n
    img.data[i + 2] += n
  }
  g.putImageData(img, 0, 0)
  // îmbinările membranei bituminoase
  g.strokeStyle = 'rgba(40,40,40,0.35)'
  g.lineWidth = 2
  for (let y = 0; y < 256; y += 64) {
    g.beginPath()
    g.moveTo(0, y + r() * 4)
    g.lineTo(256, y + r() * 4)
    g.stroke()
  }
  const t = new THREE.CanvasTexture(c)
  t.colorSpace = THREE.SRGBColorSpace
  t.wrapS = t.wrapT = THREE.RepeatWrapping
  t.anisotropy = 8
  return t
}
