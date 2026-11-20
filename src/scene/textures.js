import * as THREE from 'three'
import { COMPETITION, EVENT } from '../data/stadium-data.js'
import { brand, drawFit } from './brand.js'
import { G } from '../data/layout.js'

function canvas(w, h) {
  const c = document.createElement('canvas')
  c.width = w
  c.height = h
  return [c, c.getContext('2d')]
}

function tex(c, { repeat, srgb = true, aniso = 8 } = {}) {
  const t = new THREE.CanvasTexture(c)
  if (srgb) t.colorSpace = THREE.SRGBColorSpace
  t.anisotropy = aniso
  if (repeat) {
    t.wrapS = t.wrapT = THREE.RepeatWrapping
    t.repeat.set(repeat[0], repeat[1])
  }
  return t
}

// Gazonul cu dungi de tuns și marcajele FIFA (105 × 68 m)
export function pitchTexture() {
  const PX = 12
  const W = G.hx * 2
  const H = G.hz * 2
  const [c, g] = canvas(Math.round(W * PX), Math.round(H * PX))
  const X = (x) => (x + G.hx) * PX
  const Z = (z) => (z + G.hz) * PX
  g.fillStyle = '#3f8a35'
  g.fillRect(0, 0, c.width, c.height)
  const stripe = 105 / 16
  for (let k = 0; k * stripe < H; k++) {
    g.fillStyle = k % 2 ? '#3a8231' : '#46953b'
    g.fillRect(0, Z(-52.5 + k * stripe), c.width, stripe * PX + 1)
  }
  // zgomot fin
  const img = g.getImageData(0, 0, c.width, c.height)
  for (let i = 0; i < img.data.length; i += 4) {
    const n = (Math.random() - 0.5) * 14
    img.data[i] += n
    img.data[i + 1] += n
    img.data[i + 2] += n * 0.6
  }
  g.putImageData(img, 0, 0)

  g.strokeStyle = 'rgba(255,255,255,0.92)'
  g.lineWidth = 0.12 * PX
  const L = 52.5
  const Wh = 34
  const rect = (x0, z0, x1, z1) => g.strokeRect(X(x0), Z(z0), (x1 - x0) * PX, (z1 - z0) * PX)
  rect(-Wh, -L, Wh, L)
  g.beginPath(); g.moveTo(X(-Wh), Z(0)); g.lineTo(X(Wh), Z(0)); g.stroke()
  g.beginPath(); g.arc(X(0), Z(0), 9.15 * PX, 0, Math.PI * 2); g.stroke()
  const dot = (x, z, r = 0.2) => { g.beginPath(); g.arc(X(x), Z(z), r * PX, 0, Math.PI * 2); g.fillStyle = '#fff'; g.fill() }
  dot(0, 0, 0.25)
  for (const s of [-1, 1]) {
    const gl = s * L
    rect(-20.16, Math.min(gl, gl - s * 16.5), 20.16, Math.max(gl, gl - s * 16.5))
    rect(-9.16, Math.min(gl, gl - s * 5.5), 9.16, Math.max(gl, gl - s * 5.5))
    const ps = gl - s * 11
    dot(0, ps)
    // semicercul careului
    const a = Math.acos(5.5 / 9.15)
    g.beginPath()
    if (s < 0) g.arc(X(0), Z(ps), 9.15 * PX, a, Math.PI - a)
    else g.arc(X(0), Z(ps), 9.15 * PX, Math.PI + a, -a)
    g.stroke()
    for (const sx of [-1, 1]) {
      g.beginPath()
      const cx = X(sx * Wh)
      const cz = Z(gl)
      const start = sx < 0 ? (s < 0 ? 0 : -Math.PI / 2) : s < 0 ? Math.PI / 2 : Math.PI
      g.arc(cx, cz, 1 * PX, start, start + Math.PI / 2)
      g.stroke()
    }
  }
  return tex(c, { aniso: 16 })
}

// Fațada: soclu din beton, structura albă în X sub „val”, placaj de aluminiu deasupra
export function facadeTexture(heightTop) {
  const [c, g] = canvas(4096, 1024)
  const vy = (y) => c.height - (y / heightTop) * c.height
  const edge = (u) => 24 + 7 * Math.sin(Math.PI * 4 * u + 0.3) + 3.5 * Math.sin(Math.PI * 10 * u + 1.1) + 1.6 * Math.sin(Math.PI * 22 * u)
  // aluminiu
  const grd = g.createLinearGradient(0, 0, 0, c.height)
  grd.addColorStop(0, '#f4f6f8')
  grd.addColorStop(1, '#e3e8ee')
  g.fillStyle = grd
  g.fillRect(0, 0, c.width, c.height)
  g.strokeStyle = 'rgba(150,160,172,0.35)'
  g.lineWidth = 1
  for (let x = 0; x < c.width; x += 6) {
    g.beginPath(); g.moveTo(x, 0); g.lineTo(x, c.height); g.stroke()
  }
  // zona structurii, sub val
  g.save()
  g.beginPath()
  g.moveTo(0, c.height)
  for (let x = 0; x <= c.width; x += 8) g.lineTo(x, vy(edge(x / c.width)))
  g.lineTo(c.width, c.height)
  g.closePath()
  g.clip()
  g.fillStyle = '#3a4350'
  g.fillRect(0, 0, c.width, c.height)
  // ferestre interioare
  g.fillStyle = 'rgba(120,160,200,0.35)'
  for (let y = 10; y < 34; y += 4.2) g.fillRect(0, vy(y + 2.6), c.width, (2.2 / heightTop) * c.height)
  // grinzi în X
  g.strokeStyle = '#f2f4f6'
  g.lineWidth = 7
  const step = 64
  for (let x = -step; x < c.width + step; x += step) {
    g.beginPath(); g.moveTo(x, vy(8)); g.lineTo(x + step, vy(36)); g.stroke()
    g.beginPath(); g.moveTo(x + step, vy(8)); g.lineTo(x, vy(36)); g.stroke()
  }
  g.lineWidth = 4
  for (let y = 12; y < 36; y += 8) { g.beginPath(); g.moveTo(0, vy(y)); g.lineTo(c.width, vy(y)); g.stroke() }
  g.restore()
  // lamele care urmează valul
  for (let k = 0; k < 7; k++) {
    g.strokeStyle = k % 2 ? 'rgba(255,255,255,0.95)' : 'rgba(120,130,140,0.55)'
    g.lineWidth = k % 2 ? 6 : 3
    g.beginPath()
    for (let x = 0; x <= c.width; x += 8) {
      const y = vy(edge(x / c.width) + 0.5 + k * 0.85)
      x === 0 ? g.moveTo(x, y) : g.lineTo(x, y)
    }
    g.stroke()
  }
  // soclul din beton cu vitraje
  g.fillStyle = '#d9dcdf'
  g.fillRect(0, vy(8), c.width, c.height - vy(8))
  g.fillStyle = '#4b5a68'
  for (let x = 0; x < c.width; x += 48) g.fillRect(x + 6, vy(6.6), 36, (2.4 / heightTop) * c.height)
  g.fillStyle = '#9aa3ab'
  g.fillRect(0, vy(8.2), c.width, 4)
  return tex(c)
}

// Acoperișul: grilă de grinzi albe din oțel cu panouri de policarbonat
// (așa apare în imaginile satelit: panouri dreptunghiulare pe inele)
export function latticeTexture(opaque = false) {
  // structura spațială albă a cupolei, cu panouri de policarbonat (ca în fotografiile din interior)
  const [c, g] = canvas(256, 256)
  g.fillStyle = opaque ? '#c9ced4' : 'rgba(196,206,216,0.55)'
  g.fillRect(0, 0, 256, 256)
  g.strokeStyle = 'rgba(252,253,254,1)'
  g.lineWidth = 8
  g.strokeRect(0, 0, 256, 256)
  g.lineWidth = 3
  g.beginPath()
  g.moveTo(0, 0); g.lineTo(256, 256); g.moveTo(256, 0); g.lineTo(0, 256)
  g.moveTo(128, 0); g.lineTo(128, 256); g.moveTo(0, 128); g.lineTo(256, 128)
  g.moveTo(128, 0); g.lineTo(256, 128); g.lineTo(128, 256); g.lineTo(0, 128); g.closePath()
  g.stroke()
  const t = tex(c)
  t.wrapS = t.wrapT = THREE.RepeatWrapping
  return t
}

// pavele gri dreptunghiulare în rânduri decalate (ca pe platoul din fața stadionului)
export function pavingTexture() {
  const [c, g] = canvas(512, 512)
  g.fillStyle = '#a9abaa'
  g.fillRect(0, 0, 512, 512)
  let seed = 9
  const r = () => ((seed = (seed * 16807) % 2147483647) / 2147483647)
  const bw = 64
  const bh = 32
  for (let y = 0; y < 512; y += bh) {
    const off = (y / bh) % 2 ? bw / 2 : 0
    for (let x = -bw; x < 512 + bw; x += bw) {
      const v = 160 + Math.floor(r() * 36)
      g.fillStyle = `rgb(${v},${v + 1},${v})`
      g.fillRect(x + off + 1.5, y + 1.5, bw - 3, bh - 3)
    }
  }
  const t = tex(c)
  t.wrapS = t.wrapT = THREE.RepeatWrapping
  return t
}

export function graniteTexture() {
  const [c, g] = canvas(256, 256)
  g.fillStyle = '#7f8285'
  g.fillRect(0, 0, 256, 256)
  const img = g.getImageData(0, 0, 256, 256)
  for (let i = 0; i < img.data.length; i += 4) {
    const n = (Math.random() - 0.5) * 70
    img.data[i] += n; img.data[i + 1] += n; img.data[i + 2] += n
  }
  g.putImageData(img, 0, 0)
  const t = tex(c)
  t.wrapS = t.wrapT = THREE.RepeatWrapping
  t.repeat.set(6, 1)
  return t
}

export function noiseTexture(base, vary, size = 256, repeat = [1, 1], speck = 0) {
  const [c, g] = canvas(size, size)
  g.fillStyle = base
  g.fillRect(0, 0, size, size)
  const img = g.getImageData(0, 0, size, size)
  for (let i = 0; i < img.data.length; i += 4) {
    const n = (Math.random() - 0.5) * vary
    img.data[i] += n
    img.data[i + 1] += n
    img.data[i + 2] += n
  }
  g.putImageData(img, 0, 0)
  if (speck) {
    g.strokeStyle = 'rgba(0,0,0,0.08)'
    for (let x = 0; x < size; x += speck) { g.beginPath(); g.moveTo(x, 0); g.lineTo(x, size); g.stroke() }
    for (let y = 0; y < size; y += speck / 2) { g.beginPath(); g.moveTo(0, y); g.lineTo(size, y); g.stroke() }
  }
  return tex(c, { repeat })
}

export function parkingTexture() {
  const [c, g] = canvas(512, 512)
  g.fillStyle = '#6a6e74'
  g.fillRect(0, 0, 512, 512)
  g.strokeStyle = 'rgba(255,255,255,0.55)'
  g.lineWidth = 2
  for (let x = 0; x <= 512; x += 32) {
    g.beginPath(); g.moveTo(x, 0); g.lineTo(x, 200); g.moveTo(x, 312); g.lineTo(x, 512); g.stroke()
  }
  return tex(c, { repeat: [1, 1] })
}

export function ledTexture() {
  // panourile LED de pe marginea terenului: stema clubului, numele competiției, mesajele clubului
  const [c, g] = canvas(4096, 128)
  const grd = g.createLinearGradient(0, 0, 0, 128)
  grd.addColorStop(0, '#0a3b8f')
  grd.addColorStop(1, '#062a6b')
  g.fillStyle = grd
  g.fillRect(0, 0, 4096, 128)
  g.textBaseline = 'middle'
  const items = [['crest', 'UNIVERSITATEA CRAIOVA'], ['logo', COMPETITION.board], [null, 'ȘTIINȚA'], ['crest', 'ION OBLEMENCO'], [null, 'HAI ȘTIINȚA!']]
  let x = 40
  let k = 0
  while (x < 4096) {
    const [ico, t] = items[k % items.length]
    if (ico === 'crest' && brand.crest) {
      drawFit(g, brand.crest, x, 10, 84, 108)
      x += 104
    } else if (ico === 'logo' && brand.compLogo) {
      drawFit(g, brand.compLogo, x, 8, 110, 112)
      x += 126
    }
    g.font = '800 72px "Barlow Condensed", Arial Narrow, sans-serif'
    g.fillStyle = k % 2 ? '#ffffff' : '#9cc7ff'
    g.fillText(t, x, 68)
    x += g.measureText(t).width + 120
    k++
  }
  // pixelii LED
  g.fillStyle = 'rgba(0,0,0,0.28)'
  for (let y = 0; y < 128; y += 3) g.fillRect(0, y, 4096, 1)
  const t = tex(c)
  t.wrapS = THREE.RepeatWrapping
  return t
}

export function screenTexture(home, away) {
  // tabela video, ca la transmisiile de meci: logoul competiției, stemele, scorul și cronometrul
  const [c, g] = canvas(1600, 900)
  const bg = g.createRadialGradient(800, 470, 80, 800, 470, 980)
  bg.addColorStop(0, '#0c1c3c')
  bg.addColorStop(1, '#03060c')
  g.fillStyle = bg
  g.fillRect(0, 0, 1600, 900)
  g.textAlign = 'center'
  g.textBaseline = 'middle'
  const F = (w, px) => `${w} ${px}px "Barlow Condensed", Arial Narrow, sans-serif`
  // bara de sus: competiția
  const bar = g.createLinearGradient(0, 0, 1600, 0)
  bar.addColorStop(0, '#0b3d91')
  bar.addColorStop(1, '#06265e')
  g.fillStyle = bar
  g.fillRect(0, 0, 1600, 150)
  g.fillStyle = '#ffd400'
  g.fillRect(0, 150, 1600, 6)
  if (brand.compLogo) drawFit(g, brand.compLogo, 30, 10, 170, 130)
  g.fillStyle = '#ffffff'
  g.textAlign = 'left'
  g.font = F(800, 74)
  g.fillText(COMPETITION.board, 225, 62)
  g.font = F(600, 40)
  g.fillStyle = '#b9d2ff'
  g.fillText((EVENT.phase || 'STADIONUL ION OBLEMENCO').toUpperCase(), 228, 116)
  g.textAlign = 'center'
  // stemele
  if (brand.crest) drawFit(g, brand.crest, 120, 205, 330, 400)
  const awayCrest = (cx, cy, h) => {
    const w = h * 0.8
    g.save()
    g.translate(cx, cy)
    g.beginPath()
    g.moveTo(-w / 2, -h / 2)
    g.lineTo(w / 2, -h / 2)
    g.lineTo(w / 2, h * 0.05)
    g.quadraticCurveTo(w / 2, h * 0.38, 0, h / 2)
    g.quadraticCurveTo(-w / 2, h * 0.38, -w / 2, h * 0.05)
    g.closePath()
    g.fillStyle = '#ffffff'
    g.fill()
    g.lineWidth = 12
    g.strokeStyle = '#c8102e'
    g.stroke()
    g.fillStyle = '#c8102e'
    g.font = F(800, h * 0.32)
    const ini = away.replace(/^(FC|CS|AFC|SC|CFR|FCSB)\s+/i, '').split(/\s+/).map((w) => w[0]).join('').slice(0, 3).toUpperCase()
    g.fillText(ini || 'OAS', 0, h * 0.02)
    g.restore()
  }
  awayCrest(1315, 405, 360)
  g.fillStyle = '#ffffff'
  g.font = F(800, 68)
  const short = (n) => n.replace(/^Universitatea /i, 'U ').replace(/^FC /i, '').toUpperCase()
  g.fillText(short(home), 285, 660)
  g.fillText(short(away), 1315, 660)
  // scorul
  g.font = F(800, 330)
  g.fillText('0', 640, 420)
  g.fillText('0', 960, 420)
  g.fillStyle = '#7f93b8'
  g.fillRect(770, 410, 60, 24)
  // cronometrul
  g.fillStyle = '#0d1a33'
  g.fillRect(620, 720, 360, 130)
  g.strokeStyle = '#ffd400'
  g.lineWidth = 4
  g.strokeRect(620, 720, 360, 130)
  g.fillStyle = '#ffd400'
  g.font = F(800, 120)
  g.fillText('00:00', 800, 790)
  // grila de pixeli LED și o ușoară neuniformitate a modulelor
  g.fillStyle = 'rgba(0,0,0,0.42)'
  for (let x = 0; x < 1600; x += 4) g.fillRect(x, 0, 1, 900)
  for (let y = 0; y < 900; y += 4) g.fillRect(0, y, 1600, 1)
  for (let mx = 0; mx < 1600; mx += 200) {
    for (let my = 0; my < 900; my += 150) {
      g.fillStyle = `rgba(${Math.random() < 0.5 ? '255,255,255' : '0,0,0'},${0.012 + Math.random() * 0.02})`
      g.fillRect(mx, my, 200, 150)
    }
  }
  g.fillStyle = 'rgba(0,0,0,0.5)'
  for (let mx = 0; mx <= 1600; mx += 200) g.fillRect(mx - 1, 0, 2, 900)
  for (let my = 0; my <= 900; my += 150) g.fillRect(0, my - 1, 1600, 2)
  return tex(c, { aniso: 16 })
}

export function tunnelTexture() {
  // prelata tunelului jucătorilor: stema și numele clubului
  const [c, g] = canvas(1024, 512)
  const grd = g.createLinearGradient(0, 0, 0, 512)
  grd.addColorStop(0, '#fbfcfd')
  grd.addColorStop(1, '#e3e8ee')
  g.fillStyle = grd
  g.fillRect(0, 0, 1024, 512)
  g.fillStyle = '#0b4aa2'
  g.fillRect(0, 0, 1024, 40)
  g.fillRect(0, 472, 1024, 40)
  if (brand.crest) drawFit(g, brand.crest, 60, 70, 300, 372)
  g.fillStyle = '#0b4aa2'
  g.textAlign = 'center'
  g.textBaseline = 'middle'
  fitText(g, 'UNIVERSITATEA', 660, 210, 560, 130)
  fitText(g, 'CRAIOVA', 660, 330, 560, 130)
  return tex(c)
}

// text centrat, micșorat cât să încapă în lățimea dată (fontul condensat poate lipsi la prima desenare)
function fitText(g, text, x, y, maxW, size) {
  let px = size
  do {
    g.font = `800 ${px}px "Barlow Condensed", Arial Narrow, sans-serif`
    px -= 2
  } while (g.measureText(text).width > maxW && px > 8)
  g.fillText(text, x, y)
}

// prelata albă a tunelului de acces din colțuri: „UNIVERSITATEA CRAIOVA” pe toată lungimea
export function coverTexture() {
  const [c, g] = canvas(2048, 512)
  const grd = g.createLinearGradient(0, 0, 0, 512)
  grd.addColorStop(0, '#fbfcfd')
  grd.addColorStop(1, '#e3e7ec')
  g.fillStyle = grd
  g.fillRect(0, 0, 2048, 512)
  g.fillStyle = '#0b4aa2'
  g.fillRect(0, 0, 2048, 46)
  g.fillRect(0, 470, 2048, 42)
  g.fillStyle = '#ffffff'
  g.fillRect(0, 46, 2048, 6)
  if (brand.crest) {
    drawFit(g, brand.crest, 40, 70, 300, 380)
    drawFit(g, brand.crest, 1708, 70, 300, 380)
  }
  g.fillStyle = '#0b4aa2'
  g.textAlign = 'center'
  g.textBaseline = 'middle'
  fitText(g, 'UNIVERSITATEA CRAIOVA', 1024, 262, brand.crest ? 1300 : 1880, 188)
  // cusăturile prelatei
  g.fillStyle = 'rgba(120,130,145,0.25)'
  for (let x = 256; x < 2048; x += 512) g.fillRect(x, 52, 3, 418)
  return tex(c)
}

// acoperișul tunelului de acces: textul merge pe lungime (v), pe fâșia de sus a prelatei
export function coverRoofTexture() {
  const [c, g] = canvas(512, 2048)
  g.fillStyle = '#f4f6f8'
  g.fillRect(0, 0, 512, 2048)
  g.fillStyle = '#0b4aa2'
  g.fillRect(0, 0, 40, 2048)
  g.fillRect(472, 0, 40, 2048)
  g.save()
  g.translate(256, 1024)
  g.rotate(-Math.PI / 2)
  g.textAlign = 'center'
  g.textBaseline = 'middle'
  fitText(g, 'UNIVERSITATEA CRAIOVA', 0, 0, 1800, 150)
  g.restore()
  return tex(c)
}

// capătul tunelului de acces dinspre teren: gura întunecată, rama albă și banda albastră cu numele
export function coverFrontTexture() {
  const [c, g] = canvas(512, 384)
  g.fillStyle = '#f4f6f8'
  g.fillRect(0, 0, 512, 384)
  g.fillStyle = '#0b4aa2'
  g.fillRect(0, 0, 512, 78)
  g.fillStyle = '#ffffff'
  g.textAlign = 'center'
  g.textBaseline = 'middle'
  if (brand.crest) {
    drawFit(g, brand.crest, 8, 6, 52, 66)
    drawFit(g, brand.crest, 452, 6, 52, 66)
  }
  fitText(g, 'UNIVERSITATEA CRAIOVA', 256, 42, brand.crest ? 370 : 470, 50)
  const grd = g.createLinearGradient(0, 96, 0, 384)
  grd.addColorStop(0, '#0d1116')
  grd.addColorStop(1, '#2a3038')
  g.fillStyle = grd
  g.fillRect(28, 96, 456, 288)
  return tex(c)
}

export function skyTexture() {
  const [c, g] = canvas(16, 512)
  const grd = g.createLinearGradient(0, 0, 0, 512)
  grd.addColorStop(0, '#2f6fd0')
  grd.addColorStop(0.45, '#7fb0ea')
  grd.addColorStop(0.62, '#cfe2f5')
  grd.addColorStop(1, '#e9eef2')
  g.fillStyle = grd
  g.fillRect(0, 0, 16, 512)
  return tex(c)
}

// Placajul de aluminiu alb al „oului”: nervuri verticale fine și îmbinări de panou
export function claddingTexture() {
  const [c, g] = canvas(1024, 512)
  const grd = g.createLinearGradient(0, 0, 0, 512)
  grd.addColorStop(0, '#f7f8f9')
  grd.addColorStop(1, '#e6eaee')
  g.fillStyle = grd
  g.fillRect(0, 0, 1024, 512)
  for (let x = 0; x < 1024; x += 8) {
    g.fillStyle = 'rgba(140,150,162,0.28)'
    g.fillRect(x, 0, 1, 512)
    g.fillStyle = 'rgba(255,255,255,0.7)'
    g.fillRect(x + 1, 0, 1, 512)
  }
  g.fillStyle = 'rgba(150,158,168,0.35)'
  for (let y = 0; y < 512; y += 64) g.fillRect(0, y, 1024, 2)
  const t = tex(c)
  t.wrapS = t.wrapT = THREE.RepeatWrapping
  return t
}

// Soclul de beton de la nivelul promenadei, cu porți și vitrine
export function plinthTexture() {
  const [c, g] = canvas(1024, 128)
  const grd = g.createLinearGradient(0, 0, 0, 128)
  grd.addColorStop(0, '#55646f')
  grd.addColorStop(1, '#2c3740')
  g.fillStyle = grd
  g.fillRect(0, 0, 1024, 128)
  g.fillStyle = 'rgba(255,255,255,0.08)'
  g.fillRect(0, 8, 1024, 40)
  // montanți și traverse
  g.fillStyle = '#9aa3aa'
  for (let x = 0; x < 1024; x += 32) g.fillRect(x, 0, 3, 128)
  g.fillRect(0, 60, 1024, 3)
  g.fillRect(0, 0, 1024, 6)
  // porți cu turnicheți (gri metalic)
  for (let x = 96; x < 1024; x += 256) {
    g.fillStyle = '#6d757b'
    g.fillRect(x, 54, 96, 74)
    g.fillStyle = '#3a4248'
    for (let k = 0; k < 6; k++) g.fillRect(x + 6 + k * 15, 62, 8, 66)
  }
  // soclul de beton
  g.fillStyle = '#b9bbba'
  g.fillRect(0, 118, 1024, 10)
  const t = tex(c)
  t.wrapS = THREE.RepeatWrapping
  return t
}

// Clădirea vitrată din spatele structurii în X (concourse pe mai multe niveluri)
export function glazingTexture() {
  const [c, g] = canvas(256, 256)
  const grd = g.createLinearGradient(0, 0, 0, 256)
  grd.addColorStop(0, '#5d7387')
  grd.addColorStop(1, '#3a4b5c')
  g.fillStyle = grd
  g.fillRect(0, 0, 256, 256)
  g.fillStyle = 'rgba(255,255,255,0.10)'
  g.fillRect(0, 30, 256, 60)
  g.fillStyle = '#eef0f2'
  g.fillRect(0, 0, 256, 34)
  g.fillStyle = 'rgba(210,220,228,0.9)'
  for (let x = 0; x < 256; x += 64) g.fillRect(x, 34, 4, 222)
  const t = tex(c)
  t.wrapS = t.wrapT = THREE.RepeatWrapping
  return t
}

// normal map pentru nervurile verticale ale tablei fălțuite (o nervură la 8 pixeli)
export function ribNormalTexture() {
  const [c, g] = canvas(1024, 8)
  const img = g.createImageData(1024, 8)
  for (let x = 0; x < 1024; x++) {
    const ph = (x % 8) / 8
    const sx = ph < 0.25 ? Math.sin(ph * Math.PI * 4) * 0.9 : 0.05 * Math.sin(ph * Math.PI * 2)
    const len = Math.hypot(sx, 1)
    for (let y = 0; y < 8; y++) {
      const o = (y * 1024 + x) * 4
      img.data[o] = (sx / len * 0.5 + 0.5) * 255
      img.data[o + 1] = 128
      img.data[o + 2] = (1 / len * 0.5 + 0.5) * 255
      img.data[o + 3] = 255
    }
  }
  g.putImageData(img, 0, 0)
  const t = new THREE.CanvasTexture(c)
  t.wrapS = t.wrapT = THREE.RepeatWrapping
  t.anisotropy = 16
  return t
}

// marcajul unui loc pentru scaun rulant (simbolul internațional, alb pe albastru)
export function wheelchairTexture() {
  const [c, g] = canvas(128, 180)
  g.fillStyle = '#d4d7d7'
  g.fillRect(0, 0, 128, 180)
  g.fillStyle = '#1f5fbf'
  g.fillRect(14, 30, 100, 100)
  g.strokeStyle = '#fff'
  g.fillStyle = '#fff'
  g.lineWidth = 8
  g.beginPath(); g.arc(58, 96, 22, 0.4, Math.PI * 2 - 0.2); g.stroke()
  g.beginPath(); g.arc(62, 46, 8, 0, Math.PI * 2); g.fill()
  g.beginPath(); g.moveTo(60, 58); g.lineTo(62, 86); g.lineTo(84, 86); g.lineTo(94, 108); g.stroke()
  g.beginPath(); g.moveTo(60, 70); g.lineTo(80, 70); g.stroke()
  return tex(c)
}
