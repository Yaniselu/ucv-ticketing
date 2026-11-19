// Gazon realist: culoare cu variații la mai multe scări, uzură în careuri,
// marcaje FIFA, microrelief (normal map) și dungile de tuns care se schimbă
// cu unghiul de privire, ca pe un gazon real.
import * as THREE from 'three'
import { G } from '../data/layout.js'

function rand(seed) {
  let s = seed >>> 0
  return () => ((s = (s * 1664525 + 1013904223) >>> 0) / 4294967296)
}

function noiseCanvas(w, h, seed, amp = 1) {
  const c = document.createElement('canvas')
  c.width = w
  c.height = h
  const g = c.getContext('2d')
  const img = g.createImageData(w, h)
  const r = rand(seed)
  for (let i = 0; i < img.data.length; i += 4) {
    const v = 128 + (r() - 0.5) * 255 * amp
    img.data[i] = img.data[i + 1] = img.data[i + 2] = v
    img.data[i + 3] = 255
  }
  g.putImageData(img, 0, 0)
  return c
}

export function createTurf({ lowSpec = false } = {}) {
  const PX = lowSpec ? 12 : 20
  const W = G.hx * 2
  const H = G.hz * 2
  const c = document.createElement('canvas')
  c.width = Math.round(W * PX)
  c.height = Math.round(H * PX)
  const g = c.getContext('2d')
  const X = (x) => (x + G.hx) * PX
  const Z = (z) => (z + G.hz) * PX

  // culoarea de bază + pete mari și medii (variația naturală a ierbii)
  g.fillStyle = '#3d7d31'
  g.fillRect(0, 0, c.width, c.height)
  g.imageSmoothingEnabled = true
  for (const [n, alpha, mode] of [[10, 0.22, 'overlay'], [36, 0.16, 'overlay'], [140, 0.12, 'soft-light']]) {
    const nc = noiseCanvas(n, Math.round((n * H) / W), n * 7)
    g.globalCompositeOperation = mode
    g.globalAlpha = alpha
    g.drawImage(nc, 0, 0, c.width, c.height)
  }
  g.globalCompositeOperation = 'source-over'
  g.globalAlpha = 1
  // dungi foarte subtile coapte în textură (efectul principal e în shader)
  const stripe = 105 / 16
  for (let k = 0; k * stripe < H; k++) {
    g.fillStyle = k % 2 ? 'rgba(0,0,0,0.035)' : 'rgba(255,255,255,0.03)'
    g.fillRect(0, Z(-52.5 + k * stripe), c.width, stripe * PX + 1)
  }
  // uzura din careuri și din centrul terenului
  const wear = (x, z, rx, rz, a) => {
    const grd = g.createRadialGradient(X(x), Z(z), 0, X(x), Z(z), Math.max(rx, rz) * PX)
    grd.addColorStop(0, `rgba(150,140,80,${a})`)
    grd.addColorStop(1, 'rgba(150,140,80,0)')
    g.save()
    g.translate(X(x), Z(z))
    g.scale(rx / Math.max(rx, rz), rz / Math.max(rx, rz))
    g.translate(-X(x), -Z(z))
    g.fillStyle = grd
    g.fillRect(X(x) - rx * PX * 2, Z(z) - rz * PX * 2, rx * PX * 4, rz * PX * 4)
    g.restore()
  }
  for (const s of [-1, 1]) {
    wear(0, s * 51.5, 5, 2.6, 0.32)
    wear(0, s * 41.5, 3.5, 3.5, 0.18)
    wear(-34, s * 46, 2, 8, 0.12)
    wear(34, s * 46, 2, 8, 0.12)
  }
  wear(0, 0, 6, 6, 0.12)
  wear(-35.5, 0, 1.6, 30, 0.14)
  // granulația fină a firelor de iarbă
  const img = g.getImageData(0, 0, c.width, c.height)
  const r = rand(91)
  for (let i = 0; i < img.data.length; i += 4) {
    const n = (r() - 0.5) * 22
    img.data[i] += n * 0.8
    img.data[i + 1] += n
    img.data[i + 2] += n * 0.5
  }
  g.putImageData(img, 0, 0)

  // marcajele (vopsea albă, ușor transparentă)
  g.strokeStyle = 'rgba(250,250,246,0.93)'
  g.lineWidth = 0.12 * PX
  const L = 52.5
  const Wh = 34
  const rect = (x0, z0, x1, z1) => g.strokeRect(X(x0), Z(z0), (x1 - x0) * PX, (z1 - z0) * PX)
  rect(-Wh, -L, Wh, L)
  g.beginPath(); g.moveTo(X(-Wh), Z(0)); g.lineTo(X(Wh), Z(0)); g.stroke()
  g.beginPath(); g.arc(X(0), Z(0), 9.15 * PX, 0, Math.PI * 2); g.stroke()
  const dot = (x, z, rr = 0.2) => { g.beginPath(); g.arc(X(x), Z(z), rr * PX, 0, Math.PI * 2); g.fillStyle = 'rgba(250,250,246,0.95)'; g.fill() }
  dot(0, 0, 0.25)
  for (const s of [-1, 1]) {
    const gl = s * L
    rect(-20.16, Math.min(gl, gl - s * 16.5), 20.16, Math.max(gl, gl - s * 16.5))
    rect(-9.16, Math.min(gl, gl - s * 5.5), 9.16, Math.max(gl, gl - s * 5.5))
    const ps = gl - s * 11
    dot(0, ps)
    const a = Math.acos(5.5 / 9.15)
    g.beginPath()
    if (s < 0) g.arc(X(0), Z(ps), 9.15 * PX, a, Math.PI - a)
    else g.arc(X(0), Z(ps), 9.15 * PX, Math.PI + a, -a)
    g.stroke()
    for (const sx of [-1, 1]) {
      g.beginPath()
      const start = sx < 0 ? (s < 0 ? 0 : -Math.PI / 2) : s < 0 ? Math.PI / 2 : Math.PI
      g.arc(X(sx * Wh), Z(gl), 1 * PX, start, start + Math.PI / 2)
      g.stroke()
    }
  }
  const map = new THREE.CanvasTexture(c)
  map.colorSpace = THREE.SRGBColorSpace
  map.anisotropy = 16

  // microrelieful firelor de iarbă (normal map care se repetă)
  const NS = 256
  const hc = noiseCanvas(NS, NS, 5, 1)
  const hd = hc.getContext('2d').getImageData(0, 0, NS, NS).data
  const nc = document.createElement('canvas')
  nc.width = nc.height = NS
  const ng = nc.getContext('2d')
  const nimg = ng.createImageData(NS, NS)
  const hgt = (x, y) => hd[(((y + NS) % NS) * NS + ((x + NS) % NS)) * 4] / 255
  for (let y = 0; y < NS; y++) for (let x = 0; x < NS; x++) {
    const dx = (hgt(x + 1, y) - hgt(x - 1, y)) * 1.6
    const dy = (hgt(x, y + 1) - hgt(x, y - 1)) * 1.6
    const len = Math.hypot(dx, dy, 1)
    const o = (y * NS + x) * 4
    nimg.data[o] = (-dx / len * 0.5 + 0.5) * 255
    nimg.data[o + 1] = (-dy / len * 0.5 + 0.5) * 255
    nimg.data[o + 2] = (1 / len * 0.5 + 0.5) * 255
    nimg.data[o + 3] = 255
  }
  ng.putImageData(nimg, 0, 0)
  const normalMap = new THREE.CanvasTexture(nc)
  normalMap.wrapS = normalMap.wrapT = THREE.RepeatWrapping
  normalMap.repeat.set(W / 1.4, H / 1.4)
  normalMap.anisotropy = 8

  const mat = new THREE.MeshStandardMaterial({ map, normalMap, normalScale: new THREE.Vector2(0.35, 0.35), roughness: 0.9, metalness: 0 })
  // dungile de tuns: iarba culcată într-o parte reflectă diferit după direcția din care privești
  mat.onBeforeCompile = (sh) => {
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', '#include <common>\nvarying vec3 vTurfPos;')
      .replace('#include <project_vertex>', '#include <project_vertex>\nvTurfPos = (modelMatrix * vec4(transformed, 1.0)).xyz;')
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <common>', '#include <common>\nvarying vec3 vTurfPos;')
      .replace(
        '#include <map_fragment>',
        `#include <map_fragment>
        float turfBand = mod(floor((vTurfPos.z + 52.5) / ${stripe.toFixed(4)}), 2.0) * 2.0 - 1.0;
        vec3 turfView = normalize(cameraPosition - vTurfPos);
        float turfK = turfBand * turfView.z / max(0.25, length(turfView.xz));
        diffuseColor.rgb *= 1.0 + 0.12 * clamp(turfK, -1.0, 1.0);`,
      )
  }
  const mesh = new THREE.Mesh(new THREE.PlaneGeometry(W, H), mat)
  mesh.rotation.x = -Math.PI / 2
  mesh.receiveShadow = true
  return mesh
}
