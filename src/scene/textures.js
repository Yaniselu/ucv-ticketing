import * as THREE from 'three'
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

// Acoperișul: grinzi albe din oțel și panouri translucide
export function latticeTexture() {
  const [c, g] = canvas(256, 256)
  g.fillStyle = 'rgba(236,240,244,0.32)'
  g.fillRect(0, 0, 256, 256)
  g.strokeStyle = 'rgba(255,255,255,1)'
  g.lineWidth = 9
  g.strokeRect(0, 0, 256, 256)
  g.lineWidth = 3.5
  g.beginPath(); g.moveTo(0, 0); g.lineTo(256, 256); g.moveTo(256, 0); g.lineTo(0, 256); g.stroke()
  g.lineWidth = 2
  g.beginPath(); g.moveTo(128, 0); g.lineTo(128, 256); g.moveTo(0, 128); g.lineTo(256, 128); g.stroke()
  const t = tex(c)
  t.wrapS = t.wrapT = THREE.RepeatWrapping
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
  const [c, g] = canvas(2048, 64)
  g.fillStyle = '#0a2a66'
  g.fillRect(0, 0, 2048, 64)
  g.font = '700 40px "Barlow Condensed", Arial Narrow, sans-serif'
  g.textBaseline = 'middle'
  const items = ['UNIVERSITATEA CRAIOVA', 'UEFA CONFERENCE LEAGUE', 'ȘTIINȚA', 'ION OBLEMENCO']
  let x = 20
  let k = 0
  while (x < 2048) {
    const t = items[k % items.length]
    g.fillStyle = k % 2 ? '#ffffff' : '#7fb6ff'
    g.fillText(t, x, 34)
    x += g.measureText(t).width + 70
    k++
  }
  const t = tex(c)
  t.wrapS = THREE.RepeatWrapping
  return t
}

export function screenTexture(home, away) {
  const [c, g] = canvas(1024, 576)
  const grd = g.createLinearGradient(0, 0, 0, 576)
  grd.addColorStop(0, '#0b3d91')
  grd.addColorStop(1, '#06193d')
  g.fillStyle = grd
  g.fillRect(0, 0, 1024, 576)
  g.fillStyle = '#ffffff'
  g.textAlign = 'center'
  g.font = '800 64px "Barlow Condensed", Arial Narrow, sans-serif'
  g.fillText(home.toUpperCase(), 512, 170)
  g.font = '800 150px "Barlow Condensed", Arial Narrow, sans-serif'
  g.fillText('0 – 0', 512, 345)
  g.font = '800 64px "Barlow Condensed", Arial Narrow, sans-serif'
  g.fillText(away.toUpperCase(), 512, 450)
  g.fillStyle = '#7fb6ff'
  g.font = '600 34px "Barlow Condensed", Arial Narrow, sans-serif'
  g.fillText('UEFA CONFERENCE LEAGUE', 512, 520)
  return tex(c)
}

export function tunnelTexture() {
  const [c, g] = canvas(512, 256)
  g.fillStyle = '#f4f6f8'
  g.fillRect(0, 0, 512, 256)
  g.fillStyle = '#0b4aa2'
  g.beginPath()
  g.ellipse(256, 128, 220, 92, 0, 0, Math.PI * 2)
  g.fill()
  g.fillStyle = '#fff'
  g.textAlign = 'center'
  g.font = '800 44px "Barlow Condensed", Arial Narrow, sans-serif'
  g.fillText('UNIVERSITATEA', 256, 118)
  g.fillText('CRAIOVA', 256, 166)
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
