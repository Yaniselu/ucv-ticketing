// Intro-ul de la deschiderea site-ului, după competiția meciului: fundalul competiției (negru la
// Conference și Europa League, albastrul Champions League, roșu la Superliga și Cupa României),
// logoul în mijloc pe o poartă cu două canaturi care se deschide spre stadion. La competițiile
// interne apar și cele trei trofee ale triplei 2025–2026 (Superliga, Cupa și Supercupa României).
import * as THREE from 'three'
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

// studioul foto pentru reflexii: cameră întunecată cu softbox-uri (benzi și panouri luminoase),
// ca la fotografiile de produs — argintul lustruit capătă reflexii lungi, curate, cu contrast
function studioEnvironment() {
  const scene = new THREE.Scene()
  scene.background = new THREE.Color(0x3a3e46)
  const panel = (w, h, pos, intensity, color = 0xffffff) => {
    const m = new THREE.Mesh(new THREE.PlaneGeometry(w, h), new THREE.MeshBasicMaterial({ color: new THREE.Color(color).multiplyScalar(intensity), side: THREE.DoubleSide }))
    m.position.set(...pos)
    m.lookAt(0, 0.4, 0)
    scene.add(m)
  }
  panel(4.5, 2.2, [0, 3.4, 2.2], 6) // softbox mare, sus în față
  panel(1.1, 4.2, [-3.0, 1.4, 1.0], 5) // benzi verticale laterale
  panel(1.1, 4.2, [3.0, 1.4, 1.0], 5)
  panel(3.6, 1.0, [0, 0.7, 3.6], 2.2) // lumina de umplere din spatele aparatului
  panel(0.6, 3.6, [-2.0, 1.2, -2.6], 3.6, 0xffe2b8) // contre-jour cald
  panel(0.6, 3.6, [2.0, 1.2, -2.6], 3.6, 0xc8dcff) // contre-jour rece
  panel(4.5, 4.5, [0, 4.8, 0], 2.6) // plafonul
  // podeaua de studio, gri mediu
  const floor = new THREE.Mesh(new THREE.PlaneGeometry(20, 20), new THREE.MeshBasicMaterial({ color: 0x6b6f77 }))
  floor.rotation.x = -Math.PI / 2
  floor.position.y = -0.4
  scene.add(floor)
  return scene
}

function trophyStage(canvas) {
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true })
  renderer.setPixelRatio(Math.min(2, window.devicePixelRatio || 1))
  renderer.toneMapping = THREE.ACESFilmicToneMapping
  renderer.toneMappingExposure = 1.15
  renderer.outputColorSpace = THREE.SRGBColorSpace
  const scene = new THREE.Scene()
  const pmrem = new THREE.PMREMGenerator(renderer)
  scene.environment = pmrem.fromScene(studioEnvironment(), 0.03).texture
  scene.environmentIntensity = 1.3
  // umbre moi pe masă (trofeele „stau” pe ceva, nu plutesc)
  renderer.shadowMap.enabled = true
  renderer.shadowMap.type = THREE.PCFSoftShadowMap
  const camera = new THREE.PerspectiveCamera(30, 1, 0.05, 20)
  const key = new THREE.SpotLight(0xffffff, 26, 8, 0.5, 0.6)
  key.position.set(0.6, 3.0, 1.7)
  key.castShadow = true
  key.shadow.mapSize.set(2048, 2048)
  key.shadow.radius = 6
  key.shadow.bias = -0.0004
  const rimL = new THREE.PointLight(0xffe0b0, 6, 6)
  rimL.position.set(-1.6, 1.0, -0.8)
  const rimR = new THREE.PointLight(0xb0d0ff, 6, 6)
  rimR.position.set(1.6, 1.0, -0.8)
  scene.add(key, rimL, rimR, new THREE.AmbientLight(0xffffff, 0.25))
  const trophies = trebleGroup()
  trophies.traverse((o) => {
    if (o.isMesh) o.castShadow = true
  })
  scene.add(trophies)
  // umbra se stinge spre margini (fără chenarul planului)
  const shadowMat = new THREE.ShadowMaterial({ opacity: 0.34 })
  shadowMat.onBeforeCompile = (sh) => {
    sh.vertexShader = sh.vertexShader.replace('#include <common>', '#include <common>\nvarying vec2 vPl;').replace('#include <begin_vertex>', '#include <begin_vertex>\nvPl = position.xy;')
    sh.fragmentShader = sh.fragmentShader.replace('#include <common>', '#include <common>\nvarying vec2 vPl;').replace('#include <fog_fragment>', '#include <fog_fragment>\ngl_FragColor.a *= 1.0 - smoothstep(0.35, 1.0, length(vPl / vec2(1.6, 0.75)));')
  }
  const catcher = new THREE.Mesh(new THREE.PlaneGeometry(4, 2), shadowMat)
  catcher.rotation.x = -Math.PI / 2
  catcher.receiveShadow = true
  trophies.add(catcher)
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
