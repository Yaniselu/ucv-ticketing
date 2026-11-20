// Intro-ul de la deschiderea site-ului, după competiția meciului: fundalul competiției (negru la
// Conference și Europa League, albastrul Champions League, roșu la Superliga și Cupa României),
// logoul în mijloc pe o poartă cu două canaturi care se deschide spre stadion. La competițiile
// interne apar și cele trei trofee ale triplei 2025–2026 (Superliga, Cupa și Supercupa României).
import * as THREE from 'three'
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js'
import { trebleGroup } from './trophies.js'
import { CREST_URL } from '../scene/brand.js'
import './intro.css'

const LOGOS = import.meta.glob('../assets/logos/*.png', { eager: true, query: '?url', import: 'default' })
const logoUrl = (id) => Object.entries(LOGOS).find(([p]) => p.endsWith(`/${id}.png`))?.[1]
const DOMESTIC = new Set(['superliga', 'cupa', 'supercupa'])
const wait = (ms) => new Promise((r) => setTimeout(r, ms))

// stelele discrete de pe fundalul Champions League
function starfield() {
  const c = document.createElement('canvas')
  c.width = 1200
  c.height = 800
  const g = c.getContext('2d')
  let s = 7
  const rnd = () => ((s = (s * 16807) % 2147483647) / 2147483647)
  const star = (x, y, r, a) => {
    g.save()
    g.translate(x, y)
    g.rotate(rnd() * Math.PI)
    g.beginPath()
    for (let k = 0; k < 10; k++) {
      const rr = k % 2 ? r * 0.42 : r
      const t = (k / 10) * Math.PI * 2
      g.lineTo(Math.cos(t) * rr, Math.sin(t) * rr)
    }
    g.closePath()
    g.fillStyle = `rgba(255,255,255,${a})`
    g.fill()
    g.restore()
  }
  for (let k = 0; k < 70; k++) star(rnd() * 1200, rnd() * 800, 4 + rnd() * 16, 0.04 + rnd() * 0.08)
  return c.toDataURL()
}

function trophyStage(canvas) {
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true })
  renderer.setPixelRatio(Math.min(2, window.devicePixelRatio || 1))
  renderer.toneMapping = THREE.ACESFilmicToneMapping
  renderer.toneMappingExposure = 1.15
  renderer.outputColorSpace = THREE.SRGBColorSpace
  const scene = new THREE.Scene()
  const pmrem = new THREE.PMREMGenerator(renderer)
  scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture
  scene.environmentIntensity = 1.6
  const camera = new THREE.PerspectiveCamera(30, 1, 0.05, 20)
  const key = new THREE.SpotLight(0xffffff, 26, 8, 0.5, 0.6)
  key.position.set(0.8, 2.4, 2.2)
  const rimL = new THREE.PointLight(0xffe0b0, 6, 6)
  rimL.position.set(-1.6, 1.0, -0.8)
  const rimR = new THREE.PointLight(0xb0d0ff, 6, 6)
  rimR.position.set(1.6, 1.0, -0.8)
  scene.add(key, rimL, rimR, new THREE.AmbientLight(0xffffff, 0.25))
  const trophies = trebleGroup()
  scene.add(trophies)
  // pata de lumină de sub trofee
  const glowTex = (() => {
    const c = document.createElement('canvas')
    c.width = c.height = 256
    const g = c.getContext('2d')
    const grd = g.createRadialGradient(128, 128, 0, 128, 128, 128)
    grd.addColorStop(0, 'rgba(255,255,255,0.55)')
    grd.addColorStop(1, 'rgba(255,255,255,0)')
    g.fillStyle = grd
    g.fillRect(0, 0, 256, 256)
    return new THREE.CanvasTexture(c)
  })()
  const glow = new THREE.Mesh(new THREE.PlaneGeometry(2.6, 1.1), new THREE.MeshBasicMaterial({ map: glowTex, transparent: true, depthWrite: false }))
  glow.rotation.x = -Math.PI / 2
  glow.position.y = 0.001
  scene.add(glow)
  const resize = () => {
    const w = canvas.clientWidth
    const h = canvas.clientHeight
    renderer.setSize(w, h, false)
    camera.aspect = w / h
    // pe ecrane înguste camera se dă mai în spate, ca să încapă toate trei
    // distanța la care cele trei trofee (≈ 2 m cu toartele) încap pe lățime
    const halfW = 1.0
    const dist = Math.max(2.15, halfW / (Math.tan(THREE.MathUtils.degToRad(camera.fov / 2)) * camera.aspect))
    camera.position.set(0, 0.6, dist)
    camera.lookAt(0, 0.38, 0)
    camera.updateProjectionMatrix()
  }
  resize()
  window.addEventListener('resize', resize)
  let start = performance.now()
  let raf = 0
  const frame = (now) => {
    const t = (now - start) / 1000
    const rise = Math.min(1, t / 1.1)
    const e = 1 - Math.pow(1 - rise, 3)
    trophies.position.y = -0.9 * (1 - e)
    trophies.userData.items.forEach((tr, k) => (tr.rotation.y = Math.sin(t * 0.6 + k) * 0.35 + (k - 1) * 0.15))
    key.position.x = 0.8 + Math.sin(t * 0.8) * 0.6
    renderer.render(scene, camera)
    raf = requestAnimationFrame(frame)
  }
  return {
    start() {
      start = performance.now()
      raf = requestAnimationFrame(frame)
    },
    dispose() {
      cancelAnimationFrame(raf)
      window.removeEventListener('resize', resize)
      renderer.dispose()
      pmrem.dispose()
    },
  }
}

export function playIntro(compId, { onOpen } = {}) {
  const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches
  const params = new URLSearchParams(location.search)
  if (reduce || params.has('nointro')) {
    onOpen?.()
    return Promise.resolve()
  }
  const domestic = DOMESTIC.has(compId)
  // pentru verificare: ?introhold=logo|treble oprește intro-ul în faza respectivă
  const hold = params.get('introhold')
  const never = new Promise(() => {})
  const logo = logoUrl(compId)
  const el = document.createElement('div')
  el.className = `intro intro-${compId}`
  el.setAttribute('role', 'presentation')
  const face = `<div class="intro-face">${compId === 'champions' ? `<div class="intro-stars" style="background-image:url(${starfield()})"></div>` : ''}
    <div class="intro-logo">${logo ? `<img src="${logo}" alt="" /><i class="intro-shine" style="-webkit-mask-image:url(${logo});mask-image:url(${logo})"></i>` : `<span class="intro-logo-text">${compId === 'supercupa' ? 'SUPERCUPA ROMÂNIEI' : ''}</span>`}</div></div>`
  el.innerHTML = `
    <div class="intro-door left">${face}</div>
    <div class="intro-door right">${face}</div>
    <div class="intro-seam"></div>
    ${domestic ? `<div class="intro-treble">
        <div class="intro-club"><img src="${CREST_URL}" alt="" /><span>Universitatea Craiova</span></div>
        <canvas class="intro-trophies"></canvas>
        <div class="intro-labels"><span>Cupa României<small>2025–26</small></span><span>Campioana României<small>Superliga 2025–26</small></span><span>Supercupa României<small>2026</small></span></div>
        <div class="intro-title">Tripla istorică</div>
      </div>` : ''}
    <button class="intro-skip" type="button">Sari peste</button>`
  document.getElementById('app').appendChild(el)
  let stage = null
  let opened = false
  let finished = false
  let resolveDone
  const done = new Promise((r) => (resolveDone = r))
  const open = async () => {
    if (opened) return
    opened = true
    el.classList.add('opening')
    onOpen?.()
    await wait(1500)
    el.classList.add('gone')
    await wait(500)
    finish()
  }
  const finish = () => {
    if (finished) return
    finished = true
    stage?.dispose()
    el.remove()
    resolveDone()
  }
  el.querySelector('.intro-skip').onclick = () => open()
  el.addEventListener('click', (e) => { if (!e.target.closest('.intro-skip')) open() })
  ;(async () => {
    await wait(60)
    el.classList.add('logo-in')
    if (hold === 'logo') await never
    if (domestic) {
      await wait(1300)
      if (opened) return
      el.classList.add('treble')
      stage = trophyStage(el.querySelector('.intro-trophies'))
      stage.start()
      if (hold === 'treble') await never
      await wait(3100)
      if (opened) return
      el.classList.add('treble-out')
      await wait(450)
    } else {
      await wait(2100)
    }
    if (opened) return
    el.classList.add('seam-on')
    await wait(380)
    open()
  })()
  return done
}
