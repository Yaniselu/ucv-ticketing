// Emblema competiției pictată pe gazon: câte una în fiecare jumătate, între cercul central și
// semicercul careului, orientată spre tribuna principală (Tribuna 1, unde e camera TV principală).
// Dacă există fișierul oficial src/assets/logos/<id>.png (sau .svg / .webp), e pictat acela;
// altfel se desenează o emblemă generică cu numele competiției.
import * as THREE from 'three'
import { mowStripes } from './turf.js'

const OFFICIAL = import.meta.glob('../assets/logos/*.{png,svg,webp}', { eager: true, query: '?url', import: 'default' })
const officialUrl = (id) => Object.entries(OFFICIAL).find(([p]) => p.split('/').pop().split('.')[0] === id)?.[1]

const LOGO_W = 16 // m, pe lungimea terenului
const LOGO_H = 6.4 // m, pe lățimea terenului
const PPM = 72 // pixeli pe metru în textură
const FONT = (px) => `800 ${px}px "Barlow Condensed", "Arial Narrow", "Roboto Condensed", sans-serif`

// mingea: cerc, pentagon central și cusături
function ball(g, cx, cy, r, lw) {
  g.lineWidth = lw
  g.beginPath()
  g.arc(cx, cy, r, 0, Math.PI * 2)
  g.stroke()
  const pent = (x, y, rr, rot) => {
    g.beginPath()
    for (let k = 0; k < 5; k++) {
      const a = rot + (k * Math.PI * 2) / 5
      k ? g.lineTo(x + rr * Math.cos(a), y + rr * Math.sin(a)) : g.moveTo(x + rr * Math.cos(a), y + rr * Math.sin(a))
    }
    g.closePath()
    g.fill()
  }
  const r0 = r * 0.34
  pent(cx, cy, r0, -Math.PI / 2)
  g.lineWidth = lw * 0.8
  for (let k = 0; k < 5; k++) {
    const a = -Math.PI / 2 + (k * Math.PI * 2) / 5
    g.beginPath()
    g.moveTo(cx + r0 * Math.cos(a), cy + r0 * Math.sin(a))
    g.lineTo(cx + r * 0.78 * Math.cos(a), cy + r * 0.78 * Math.sin(a))
    g.stroke()
    // jumătățile de pentagon de pe margine
    g.save()
    g.beginPath()
    g.arc(cx, cy, r - lw / 2, 0, Math.PI * 2)
    g.clip()
    pent(cx + r * 1.02 * Math.cos(a), cy + r * 1.02 * Math.sin(a), r * 0.3, a + Math.PI)
    g.restore()
  }
}

// cupa: cupă, toarte, picior și soclu
function cup(g, cx, cy, h) {
  const w = h * 0.62
  const top = cy - h / 2
  g.beginPath()
  g.moveTo(cx - w / 2, top)
  g.lineTo(cx + w / 2, top)
  g.bezierCurveTo(cx + w / 2, top + h * 0.42, cx + w * 0.18, top + h * 0.52, cx + w * 0.08, top + h * 0.58)
  g.lineTo(cx + w * 0.08, top + h * 0.76)
  g.lineTo(cx + w * 0.3, top + h * 0.84)
  g.lineTo(cx + w * 0.3, top + h)
  g.lineTo(cx - w * 0.3, top + h)
  g.lineTo(cx - w * 0.3, top + h * 0.84)
  g.lineTo(cx - w * 0.08, top + h * 0.76)
  g.lineTo(cx - w * 0.08, top + h * 0.58)
  g.bezierCurveTo(cx - w * 0.18, top + h * 0.52, cx - w / 2, top + h * 0.42, cx - w / 2, top)
  g.closePath()
  g.fill()
  g.lineWidth = h * 0.06
  for (const s of [-1, 1]) {
    g.beginPath()
    g.ellipse(cx + s * w * 0.5, top + h * 0.2, w * 0.2, h * 0.14, 0, s < 0 ? Math.PI * 0.5 : -Math.PI * 0.5, s < 0 ? Math.PI * 1.5 : Math.PI * 0.5)
    g.stroke()
  }
}

function drawGeneric(g, comp) {
  const m = PPM
  const D = LOGO_H * 0.96 * m // diametrul semnului
  g.fillStyle = '#fff'
  g.strokeStyle = '#fff'
  g.textBaseline = 'alphabetic'
  g.textAlign = 'left'
  // rândurile de text, fiecare cu înălțimea literelor dată în metri
  const gap = 0.32 * m
  const rows = comp.lines.map(([t, h]) => {
    const px = (h * m) / 0.72
    g.font = FONT(px)
    return { t, px, h: h * m, w: g.measureText(t).width }
  })
  const textH = rows.reduce((a, r) => a + r.h, 0) + gap * (rows.length - 1)
  const textW = Math.max(...rows.map((r) => r.w))
  const totalW = D + 0.7 * m + textW
  const sc = Math.min(1, (LOGO_W * m * 0.98) / totalW)
  g.save()
  g.translate((LOGO_W * m - totalW * sc) / 2, (LOGO_H * m - D * sc) / 2)
  g.scale(sc, sc)
  const cx = D / 2
  const cy = D / 2
  if (comp.mark === 'ring') {
    g.lineWidth = 0.3 * m
    g.beginPath()
    g.arc(cx, cy, D / 2 - 0.15 * m, 0, Math.PI * 2)
    g.stroke()
    g.lineWidth = 0.1 * m
    g.beginPath()
    g.arc(cx, cy, D / 2 - 0.55 * m, 0, Math.PI * 2)
    g.stroke()
    ball(g, cx, cy, D * 0.3, 0.16 * m)
  } else if (comp.mark === 'cup') {
    g.lineWidth = 0.26 * m
    g.beginPath()
    g.arc(cx, cy, D / 2 - 0.13 * m, 0, Math.PI * 2)
    g.stroke()
    cup(g, cx, cy, D * 0.6)
  } else {
    ball(g, cx, cy, D / 2 - 0.15 * m, 0.3 * m)
  }
  let y = (D - textH) / 2
  for (const r of rows) {
    y += r.h
    g.font = FONT(r.px)
    g.fillText(r.t, D + 0.7 * m, y)
    y += gap
  }
  g.restore()
}

// vopseaua pe iarbă: acoperire neuniformă, se vede firul ierbii prin ea
function paintGrain(c) {
  const g = c.getContext('2d')
  const img = g.getImageData(0, 0, c.width, c.height)
  let s = 17
  for (let i = 3; i < img.data.length; i += 4) {
    s = (s * 1664525 + 1013904223) >>> 0
    img.data[i] *= 0.78 + 0.22 * (s / 4294967296)
  }
  g.putImageData(img, 0, 0)
}

// pe teren: cel mult 16 m pe lungime (între cercul central și semicercul careului) și 11 m pe lățime
const MAX_W = 16
const MAX_H = 11

export function createPitchLogos(compId, comp, { lowSpec = false } = {}) {
  const group = new THREE.Group()
  const q = lowSpec ? 0.6 : 1
  // w × h în metri; draw(g, W, H) desenează în pixeli
  const build = (w, h, draw) => {
    const c = document.createElement('canvas')
    c.width = Math.round(w * PPM * q)
    c.height = Math.round(h * PPM * q)
    const g = c.getContext('2d')
    const tex = new THREE.CanvasTexture(c)
    tex.colorSpace = THREE.SRGBColorSpace
    tex.anisotropy = 16
    const paint = () => {
      g.setTransform(1, 0, 0, 1, 0, 0)
      g.clearRect(0, 0, c.width, c.height)
      draw(g, c.width, c.height)
      paintGrain(c)
      tex.needsUpdate = true
    }
    paint()
    // pentru firele de iarbă 3D (grass.js): emblema e pictată și pe ele
    group.userData.logo = { tex, w, h }
    const mat = new THREE.MeshStandardMaterial({
      map: tex, transparent: true, opacity: 0.92, depthWrite: false, roughness: 0.85,
      polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2,
    })
    mowStripes(mat)
    const geo = new THREE.PlaneGeometry(w, h)
    // textul curge spre sud (+z), cu partea de sus spre est: se citește din Tribuna 1 (vest)
    geo.rotateX(-Math.PI / 2)
    geo.rotateY(-Math.PI / 2)
    // între cercul central (9,15 m) și semicercul careului (32,35 m de la centru)
    for (const z of [-20.75, 20.75]) {
      const m = new THREE.Mesh(geo, mat)
      m.position.set(0, 0.012, z)
      m.receiveShadow = true
      m.renderOrder = 1
      group.add(m)
    }
    return paint
  }
  const generic = () => {
    const repaint = build(LOGO_W, LOGO_H, (g, W, H) => {
      g.scale(W / (LOGO_W * PPM), H / (LOGO_H * PPM))
      drawGeneric(g, comp)
    })
    // fontul condensat se încarcă după pornire: emblema se redesenează cu el
    document.fonts?.ready.then(repaint)
  }
  const url = officialUrl(compId)
  if (!url) {
    generic()
    return group
  }
  // logoul oficial, la proporțiile lui
  const img = new Image()
  img.onload = () => {
    const k = Math.min(MAX_W / img.width, MAX_H / img.height)
    build(img.width * k, img.height * k, (g, W, H) => g.drawImage(img, 0, 0, W, H))
  }
  img.onerror = generic
  img.src = url
  return group
}
