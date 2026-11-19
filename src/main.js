import './style.css'
import * as THREE from 'three'
import { OrbitControls } from 'three/addons/controls/OrbitControls.js'
import { Sky } from 'three/addons/objects/Sky.js'
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js'
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js'
import { GTAOPass } from 'three/addons/postprocessing/GTAOPass.js'
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js'
import { buildLayout, G, D2 } from './data/layout.js'
import { EVENT, STANDS, MAX_TICKETS, HOLD_SECONDS } from './data/stadium-data.js'
import { computeAvailability, FREE, TAKEN, BLOCKED } from './data/availability.js'
import { buildStadium } from './scene/stadium.js'
import { buildCrowd } from './scene/crowd.js'
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js'
import { ShaderPass } from 'three/addons/postprocessing/ShaderPass.js'
import { buildWorld } from './scene/world.js'
import { addGoogleTiles, GOOGLE_KEY } from './scene/google.js'
import { createUI } from './ui/ui.js'

const isTouch = matchMedia('(pointer: coarse)').matches
const params = new URLSearchParams(location.search)
const lowSpec = params.has('lite') || isTouch || (navigator.hardwareConcurrency || 8) <= 4
const useAO = !lowSpec && !params.has('noao')

// ─── Date ───────────────────────────────────────────────────────────
const layout = buildLayout()
const seats = layout.seats
const status = computeAvailability(layout, EVENT.id)
const sectorById = new Map(layout.sectors.map((s) => [s.id, s]))
const boxById = new Map(layout.boxes.map((b) => [b.id, b]))

function freeCount(idxList) {
  let n = 0
  for (const i of idxList) if (status[i] === FREE && !cart.has(i)) n++
  return n
}
function standSectors(id) {
  return layout.sectors.filter((s) => s.stand === id)
}
function standStats(id) {
  const secs = standSectors(id)
  let free = 0
  let total = 0
  let min = Infinity
  for (const s of secs) {
    if (s.away) continue
    total += s.capacity
    const f = freeCount(s.seatIdx)
    free += f
    if (f > 0) min = Math.min(min, s.price)
  }
  if (id === 'VIP') {
    for (const b of layout.boxes) {
      total += b.seatIdx.length
      free += freeCount(b.seatIdx)
    }
  }
  return { free, total, min: min === Infinity ? null : min }
}

// ─── Scena ──────────────────────────────────────────────────────────
const canvas = document.getElementById('scene')
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance', preserveDrawingBuffer: false })
renderer.setPixelRatio(Math.min(window.devicePixelRatio, lowSpec ? 1.5 : 2))
renderer.outputColorSpace = THREE.SRGBColorSpace
renderer.toneMapping = THREE.ACESFilmicToneMapping
renderer.toneMappingExposure = 0.64
renderer.shadowMap.enabled = true
renderer.shadowMap.type = THREE.PCFShadowMap

const scene = new THREE.Scene()
// Soarele are aceeași poziție ca în imaginea satelit (dinspre SSE, umbrele spre NNV),
// ca umbrele reale din imagine să se potrivească cu cele randate.
const SUN_DIR = new THREE.Vector3(0.173, 0.819, 0.548).normalize()
function makeSky(scale) {
  const s = new Sky()
  s.scale.setScalar(scale)
  const u = s.material.uniforms
  u.turbidity.value = 4.5
  u.rayleigh.value = 1.25
  u.mieCoefficient.value = 0.004
  u.mieDirectionalG.value = 0.82
  u.sunPosition.value.copy(SUN_DIR)
  return s
}
scene.add(makeSky(4500))
scene.fog = new THREE.Fog(0xc9d6e2, 1500, 5600)
const pmrem = new THREE.PMREMGenerator(renderer)
const envScene = new THREE.Scene()
envScene.add(makeSky(1000))
scene.environment = pmrem.fromScene(envScene).texture
scene.environmentIntensity = 0.16

const camera = new THREE.PerspectiveCamera(40, 1, 2, 6500)
// intrarea: de sus, perpendicular pe stadion (ca o hartă), apoi coborâm
camera.position.set(0, 820, 0.5)
const controls = new OrbitControls(camera, canvas)
controls.enableDamping = true
controls.dampingFactor = 0.08
controls.enablePan = false
controls.maxPolarAngle = 1.32
controls.minDistance = 60
controls.maxDistance = 620
controls.autoRotateSpeed = 0.35

scene.add(new THREE.HemisphereLight(0xd6e6ff, 0x6b6a58, 0.55))
const sun = new THREE.DirectionalLight(0xfff1dc, 3.0)
sun.position.copy(SUN_DIR).multiplyScalar(420)
sun.castShadow = true
sun.shadow.mapSize.set(lowSpec ? 2048 : 4096, lowSpec ? 2048 : 4096)
Object.assign(sun.shadow.camera, { left: -150, right: 150, top: 150, bottom: -150, near: 150, far: 800 })
sun.shadow.bias = -0.0004
sun.shadow.normalBias = 0.4
scene.add(sun)
// panourile acoperișului (stratul 2) lasă să treacă ~jumătate din lumină:
// soarele e împărțit în două lumini; doar a doua „vede” panourile când calculează umbrele
camera.layers.enable(2)
let sun2 = null
if (!lowSpec) {
  sun.intensity = 1.55
  sun2 = sun.clone()
  sun2.shadow = sun.shadow.clone()
  sun2.shadow.mapSize.set(2048, 2048)
  Object.assign(sun2.shadow.camera, { left: -130, right: 130, top: 130, bottom: -130, near: 150, far: 800 })
  sun2.shadow.camera.updateProjectionMatrix()
  sun2.shadow.camera.layers.enable(2)
  sun2.intensity = 1.45
  scene.add(sun2)
}

const stadium = buildStadium(scene, layout, { lowSpec })
const crowd = buildCrowd(layout, status, { lowSpec })
scene.add(crowd)

// împrejurimile reale (satelit + OpenStreetMap), încărcate în fundal
let streetLabelData = []
let googleTiles = null
buildWorld(scene, { lowSpec })
  .then((w) => {
    streetLabelData = w.labels
    // cu cheie Google: orașul fotorealist înlocuiește împrejurimile construite din OSM
    if (GOOGLE_KEY) {
      try {
        googleTiles = addGoogleTiles(scene, camera, renderer, {
          origin: w.data.origin,
          onReady: () => {
            w.group.visible = false
            const cr = document.querySelector('.credits')
            if (cr) cr.textContent = 'Model 3D: Google · Imagini: Google, Airbus, Maxar · Hartă: © OpenStreetMap contributors'
          },
        })
      } catch (e) {
        console.warn('Google 3D Tiles indisponibil', e)
      }
    }
    if (state.mode === 'overview') buildLabels()
    return w.ready
  })
  .catch((e) => console.warn('Împrejurimile nu s-au putut încărca', e))

// post-procesare: ocluzie ambientală pentru umbrele de contact dintre rânduri
let composer = null
if (useAO) {
  composer = new EffectComposer(renderer, new THREE.WebGLRenderTarget(1, 1, { type: THREE.HalfFloatType, samples: 4 }))
  composer.addPass(new RenderPass(scene, camera))
  const ao = new GTAOPass(scene, camera, 1, 1)
  ao.output = GTAOPass.OUTPUT.Default
  ao.blendIntensity = 0.9
  ao.updateGtaoMaterial({ radius: 0.9, distanceExponent: 1.4, thickness: 1.5, scale: 1.1, samples: 12, distanceFallOff: 1.0, screenSpaceRadius: false })
  ao.updatePdMaterial({ lumaPhi: 10, depthPhi: 2, normalPhi: 3, radius: 5, radiusExponent: 1, rings: 2, samples: 16 })
  composer.addPass(ao)
  composer.addPass(new UnrealBloomPass(new THREE.Vector2(256, 256), 0.16, 0.45, 0.93))
  composer.addPass(new OutputPass())
  // gradare de culoare discretă (contrast, saturație, vignetă), ca la o fotografie
  composer.addPass(new ShaderPass({
    uniforms: { tDiffuse: { value: null } },
    vertexShader: 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }',
    fragmentShader: `uniform sampler2D tDiffuse; varying vec2 vUv;
      void main(){
        vec4 c = texture2D(tDiffuse, vUv);
        float l = dot(c.rgb, vec3(0.299, 0.587, 0.114));
        c.rgb = mix(vec3(l), c.rgb, 1.07);
        c.rgb = (c.rgb - 0.5) * 1.05 + 0.5;
        float v = smoothstep(1.15, 0.35, length(vUv - 0.5) * 1.35);
        c.rgb *= mix(0.86, 1.0, v);
        gl_FragColor = c;
      }`,
  }))
}

// ─── Culorile locurilor ─────────────────────────────────────────────
const C = {
  blue: new THREE.Color(0x2b67b3),
  white: new THREE.Color(0xdde4ec),
  vip: new THREE.Color(0x163c86),
  leather: new THREE.Color(0x24211f),
  free: new THREE.Color(0x22c55e),
  freeHot: new THREE.Color(0xa7f3c0),
  sel: new THREE.Color(0xf59e0b),
  hot: new THREE.Color(0xff8a1f),
  takenTint: new THREE.Color(0x7a8494),
  dim: new THREE.Color(0xb8c0ca),
  na: new THREE.Color(0xc7ccd3),
}
// toate scaunele stadionului sunt albastre (ca în fotografiile din interior), cu mici variații
const natural = seats.map((s, i) => {
  if (s.kind === 'vip') return C.vip
  if (s.kind === 'box') return C.leather
  if (s.kind === 'wheelchair' || s.kind === 'press') return C.blue
  const h = Math.sin(i * 12.9898) * 43758.5453
  const r = h - Math.floor(h)
  return C.blue.clone().multiplyScalar(0.93 + r * 0.12)
})
const TAKEN_C = new THREE.Color(0x46536a)
const takenCol = natural.map((c) => (c === C.leather ? c : TAKEN_C))
const dimCol = natural.map((c) => c.clone().lerp(C.dim, 0.55))

const state = {
  mode: 'overview',
  stand: null,
  sector: null,
  box: null,
  hoverStand: null,
  hoverSector: null,
  hoverBox: null,
  hoverSeat: null,
  focusSeat: null,
  povSeat: null,
}
const cart = new Set()
let holdUntil = 0

const tmpC = new THREE.Color()
function seatColor(i) {
  const s = seats[i]
  if (cart.has(i)) return C.sel
  const st = status[i]
  const m = state.mode
  if (m === 'overview') {
    if (state.hoverStand && s.stand === state.hoverStand) return C.hot
    return natural[i]
  }
  if (m === 'stand') {
    if (s.stand !== state.stand) return dimCol[i]
    if (s.kind === 'box') {
      if (state.hoverBox && s.sector === state.hoverBox) return C.hot
      return st === FREE ? C.free : natural[i]
    }
    if (state.hoverSector === s.sector || (state.hoverStand === s.stand && !state.hoverSector && false)) return C.hot
    if (st === BLOCKED) return C.na
    return st === FREE ? C.free : takenCol[i]
  }
  if (m === 'box') {
    if (s.sector !== state.box) return s.kind === 'box' ? natural[i] : dimCol[i]
    if (i === state.hoverSeat) return st === FREE ? C.freeHot : natural[i]
    return st === FREE ? C.free : natural[i]
  }
  if (m === 'pov') return natural[i]
  // sector
  const active = s.sector === state.sector
  if (st === BLOCKED) return active ? C.na : dimCol[i]
  if (active) {
    if (i === state.hoverSeat) return st === FREE ? C.freeHot : takenCol[i]
    return st === FREE ? C.free : takenCol[i]
  }
  if (s.stand === state.stand) {
    if (state.hoverSector === s.sector) return st === FREE ? C.freeHot : C.hot
    return st === FREE ? tmpC.copy(C.free).lerp(C.dim, 0.35) : takenCol[i]
  }
  return dimCol[i]
}

const paintMeshes = new Set()
function paint() {
  for (let i = 0; i < seats.length; i++) {
    const ref = stadium.seatRef[i]
    if (!ref || !ref.mesh.instanceColor) continue
    const c = seatColor(i)
    const a = ref.mesh.instanceColor.array
    a[ref.k * 3] = c.r
    a[ref.k * 3 + 1] = c.g
    a[ref.k * 3 + 2] = c.b
    paintMeshes.add(ref.mesh)
  }
  for (const m of paintMeshes) m.instanceColor.needsUpdate = true
  paintMeshes.clear()
}

// ─── Camera ─────────────────────────────────────────────────────────
let flight = null
const ease = (t) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2)
function flyTo(pos, target, dur = 1.5, onDone, lift = true) {
  const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches
  flight = {
    p0: camera.position.clone(), t0: controls.target.clone(),
    p1: new THREE.Vector3(...pos), t1: new THREE.Vector3(...target),
    start: performance.now(), dur: reduce ? 1 : dur * 1000, onDone,
  }
  // arc ușor în sus pentru zborurile lungi
  flight.lift = lift ? Math.min(60, flight.p0.distanceTo(flight.p1) * 0.18) : 0
}
function stepFlight(now) {
  if (!flight) return
  const k = Math.min(1, (now - flight.start) / flight.dur)
  const e = ease(k)
  camera.position.lerpVectors(flight.p0, flight.p1, e)
  camera.position.y += Math.sin(Math.PI * e) * flight.lift
  controls.target.lerpVectors(flight.t0, flight.t1, e)
  if (k >= 1) {
    const cb = flight.onDone
    flight = null
    cb && cb()
  }
}

const OVERVIEW_BASE = { pos: [188, 182, 246], target: [0, 4, 0] }
// pe ecrane înguste camera se dă mai în spate ca să încapă stadionul
const boost = () => (camera.aspect < 1 ? Math.min(1.9, 0.66 / camera.aspect) : 1)
const OVERVIEW = {
  get pos() { return OVERVIEW_BASE.pos.map((v) => v * boost()) },
  target: OVERVIEW_BASE.target,
}

function boundsOf(idxList) {
  const b = new THREE.Box3()
  const v = new THREE.Vector3()
  for (const i of idxList) b.expandByPoint(v.set(seats[i].x, seats[i].y, seats[i].z))
  return b
}

function standView(id) {
  const secs = standSectors(id)
  const idx = secs.flatMap((s) => s.seatIdx)
  if (id === 'VIP') for (const b of layout.boxes) idx.push(...b.seatIdx)
  const b = boundsOf(idx)
  const c = b.getCenter(new THREE.Vector3())
  let nx = 0
  let nz = 0
  for (const s of secs) {
    nx += s.normal.x * s.capacity
    nz += s.normal.z * s.capacity
  }
  const nl = Math.hypot(nx, nz) || 1
  nx /= nl
  nz /= nl
  const size = b.getSize(new THREE.Vector3())
  const span = Math.max(Math.abs(nz) > 0.5 ? size.x : size.z, 40)
  const dist = Math.min(200, span * 0.72 + 40) * boost()
  return { pos: [c.x - nx * dist, c.y + dist * 0.62, c.z - nz * dist], target: [c.x - nx * 6, c.y - 2, c.z - nz * 6] }
}

function sectorView(s) {
  const b = boundsOf(s.seatIdx)
  const c = b.getCenter(new THREE.Vector3())
  const size = b.getSize(new THREE.Vector3())
  const span = Math.max(size.x, size.z)
  const dist = Math.min(84, span * 0.92 + 16) * Math.min(1.7, boost())
  const n = s.normal
  return { pos: [c.x - n.x * dist, c.y + dist * 0.42 + 2, c.z - n.z * dist], target: [c.x, c.y + 0.5, c.z] }
}

function boxView(b) {
  const x = -(G.hx + D2(0))
  return { pos: [x - 5.6, b.floorY + 2.55, b.zc], target: [x - 0.6, b.floorY + 0.7, b.zc] }
}

// vederea din scaun: poziția ochilor și direcția spre teren
function povPose(i) {
  const s = seats[i]
  const eye = new THREE.Vector3(s.x - s.nx * 0.05, s.y + 1.2, s.z - s.nz * 0.05)
  const look = new THREE.Vector3(s.x * 0.15, 0, s.z * 0.15)
  return { eye, look }
}

// ─── Moduri ─────────────────────────────────────────────────────────
function setRoofFor(mode) {
  stadium.roofParts.visible = mode === 'overview' || mode === 'pov' || mode === 'box'
  crowd.visible = mode === 'pov' || mode === 'box'
  fovTarget = { box: 66, pov: 64 }[mode] || baseFov()
  const roof = { overview: 0.55, stand: 0.22, sector: 0.12, box: 0.6, pov: 0.7 }[mode]
  const inner = { overview: 0.9, stand: 0.45, sector: 0.3, box: 0.8, pov: 0.9 }[mode]
  roofTarget = roof
  innerTarget = inner
}
let roofTarget = 0.55
const baseFov = () => (canvas.clientWidth < 820 ? 52 : 40)
let fovTarget = 40
let innerTarget = 0.9

function applyControls(mode) {
  // planul apropiat: mare când suntem departe (precizie pentru sol), mic în loje / din scaun
  camera.near = { overview: 2, stand: 1, sector: 0.4, box: 0.08, pov: 0.08 }[mode]
  camera.updateProjectionMatrix()
  controls.enabled = mode !== 'pov'
  controls.autoRotate = false
  if (mode === 'overview') Object.assign(controls, { minDistance: 120, maxDistance: 620 * boost(), maxPolarAngle: 1.3 })
  if (mode === 'stand') Object.assign(controls, { minDistance: 40, maxDistance: 300 * boost(), maxPolarAngle: 1.42 })
  if (mode === 'sector') Object.assign(controls, { minDistance: 6, maxDistance: 140, maxPolarAngle: 1.5 })
  if (mode === 'box') Object.assign(controls, { minDistance: 2, maxDistance: 5.6, maxPolarAngle: 1.75 })
}

function goOverview() {
  Object.assign(state, { mode: 'overview', stand: null, sector: null, box: null, hoverSector: null, hoverBox: null, hoverSeat: null, focusSeat: null, povSeat: null })
  applyControls('overview')
  setRoofFor('overview')
  flyTo(OVERVIEW.pos, OVERVIEW.target, 1.6)
  refresh()
}
function goStand(id) {
  Object.assign(state, { mode: 'stand', stand: id, sector: null, box: null, hoverStand: null, hoverSector: null, hoverBox: null, hoverSeat: null, focusSeat: null, povSeat: null })
  applyControls('stand')
  setRoofFor('stand')
  const v = standView(id)
  flyTo(v.pos, v.target, 1.6)
  refresh()
}
function goSector(id) {
  const s = sectorById.get(id)
  if (!s) return
  Object.assign(state, { mode: 'sector', stand: s.stand, sector: id, box: null, hoverStand: null, hoverSector: null, hoverBox: null, hoverSeat: null, povSeat: null })
  if (state.focusSeat != null && seats[state.focusSeat].sector !== id) state.focusSeat = null
  applyControls('sector')
  setRoofFor('sector')
  const v = sectorView(s)
  flyTo(v.pos, v.target, 1.5)
  refresh()
}
function goBox(id) {
  const b = boxById.get(id)
  Object.assign(state, { mode: 'box', stand: 'VIP', box: id, sector: null, hoverStand: null, hoverSector: null, hoverBox: null, hoverSeat: null, povSeat: null })
  if (state.focusSeat != null && seats[state.focusSeat].sector !== id) state.focusSeat = null
  applyControls('box')
  setRoofFor('box')
  const v = boxView(b)
  flyTo(v.pos, v.target, 1.8)
  refresh()
}
let povPrev = null
let look = { yaw: 0, pitch: 0, baseYaw: 0, basePitch: 0 }
function goPov(i) {
  povPrev = { mode: state.mode, pos: camera.position.clone(), target: controls.target.clone() }
  state.povSeat = i
  state.mode = 'pov'
  applyControls('pov')
  setRoofFor('pov')
  const { eye, look: at } = povPose(i)
  const dir = at.clone().sub(eye).normalize()
  look = { yaw: 0, pitch: 0, baseYaw: Math.atan2(dir.x, dir.z), basePitch: Math.asin(dir.y) }
  flyTo(eye.toArray(), eye.clone().add(dir.multiplyScalar(0.01)).toArray(), 1.6, () => {
    controls.target.copy(eye).add(dirFromLook())
  })
  refresh()
}
function dirFromLook() {
  const yaw = look.baseYaw + look.yaw
  const pitch = Math.max(-1.2, Math.min(0.9, look.basePitch + look.pitch))
  return new THREE.Vector3(Math.sin(yaw) * Math.cos(pitch), Math.sin(pitch), Math.cos(yaw) * Math.cos(pitch))
}
function exitPov() {
  const s = seats[state.povSeat]
  state.povSeat = null
  const back = s.kind === 'box' ? 'box' : 'sector'
  state.mode = back
  applyControls(back)
  setRoofFor(back)
  if (povPrev) flyTo(povPrev.pos.toArray(), povPrev.target.toArray(), 1.4)
  refresh()
}
function back() {
  if (modalOpen()) return ui.closeModal()
  if (state.mode === 'pov') return exitPov()
  if (state.mode === 'sector' || state.mode === 'box') return goStand(state.stand)
  if (state.mode === 'stand') return goOverview()
}

// ─── Coș ────────────────────────────────────────────────────────────
function toggleSeat(i) {
  if (status[i] !== FREE) return false
  if (cart.has(i)) {
    cart.delete(i)
    if (state.focusSeat === i) state.focusSeat = null
  } else {
    if (cart.size >= MAX_TICKETS) {
      ui.flash(`Poți cumpăra maximum ${MAX_TICKETS} bilete pentru un meci.`)
      return false
    }
    cart.add(i)
    state.focusSeat = i
    if (cart.size === 1) holdUntil = Date.now() + HOLD_SECONDS * 1000
    renderThumb(i)
  }
  if (!cart.size) holdUntil = 0
  refresh()
  return true
}
function removeSeat(i) {
  cart.delete(i)
  if (state.focusSeat === i) state.focusSeat = null
  if (!cart.size) holdUntil = 0
  refresh()
}
// alege automat cele mai bune locuri alăturate dintr-un sector
function autoPick(sectorId, qty) {
  const s = sectorById.get(sectorId)
  const rows = new Map()
  for (const i of s.seatIdx) {
    const r = seats[i].row
    if (!rows.has(r)) rows.set(r, [])
    rows.get(r).push(i)
  }
  const maxRow = Math.max(...rows.keys())
  const idealRow = Math.max(1, Math.round(maxRow * 0.38))
  let best = null
  for (const [r, list] of rows) {
    for (let k = 0; k + qty <= list.length; k++) {
      const run = list.slice(k, k + qty)
      if (!run.every((i) => status[i] === FREE && !cart.has(i))) continue
      if (seats[run[0]].block !== seats[run[run.length - 1]].block) continue
      const mid = (k + qty / 2) / list.length
      const score = Math.abs(r - idealRow) * 1.0 + Math.abs(mid - 0.5) * 18
      if (!best || score < best.score) best = { score, run }
    }
  }
  if (!best) {
    ui.flash(`Nu mai sunt ${qty} locuri alăturate libere în acest sector.`)
    return
  }
  const room = MAX_TICKETS - cart.size
  if (room < qty) {
    ui.flash(`Mai poți adăuga ${room} ${room === 1 ? 'loc' : 'locuri'} (maximum ${MAX_TICKETS}).`)
    return
  }
  if (!cart.size) holdUntil = Date.now() + HOLD_SECONDS * 1000
  for (const i of best.run) cart.add(i)
  state.focusSeat = best.run[0]
  renderThumb(best.run[0])
  refresh()
}

// ─── Miniatura „Vederea ta” ─────────────────────────────────────────
const thumbs = new Map()
const thumbRT = new THREE.WebGLRenderTarget(480, 300, { colorSpace: THREE.SRGBColorSpace, samples: 4 })
const thumbCam = new THREE.PerspectiveCamera(62, 480 / 300, 0.2, 3000)
thumbCam.layers.enable(2)
function renderThumb(i) {
  if (thumbs.has(i)) return thumbs.get(i)
  const { eye, look: at } = povPose(i)
  thumbCam.position.copy(eye)
  thumbCam.lookAt(at)
  const roofOp = stadium.roofMat.opacity
  const crowdVis = crowd.visible
  const partsVis = stadium.roofParts.visible
  crowd.visible = true
  stadium.roofParts.visible = true
  stadium.roofMat.opacity = 0.62
  renderer.setRenderTarget(thumbRT)
  renderer.render(scene, thumbCam)
  renderer.setRenderTarget(null)
  stadium.roofMat.opacity = roofOp
  crowd.visible = crowdVis
  stadium.roofParts.visible = partsVis
  const px = new Uint8Array(480 * 300 * 4)
  renderer.readRenderTargetPixels(thumbRT, 0, 0, 480, 300, px)
  const c = document.createElement('canvas')
  c.width = 480
  c.height = 300
  const g = c.getContext('2d')
  const img = g.createImageData(480, 300)
  for (let y = 0; y < 300; y++) img.data.set(px.subarray((299 - y) * 480 * 4, (300 - y) * 480 * 4), y * 480 * 4)
  g.putImageData(img, 0, 0)
  const url = c.toDataURL('image/jpeg', 0.82)
  thumbs.set(i, url)
  return url
}

// ─── Interfața ──────────────────────────────────────────────────────
const ui = createUI({
  layout, seats, status, cart, state, sectorById, boxById,
  freeCount, standSectors, standStats,
  actions: {
    goOverview, goStand, goSector, goBox, goPov, exitPov, back, toggleSeat, removeSeat, autoPick,
    hoverSector: (id) => { state.hoverSector = id; paint() },
    hoverBox: (id) => { state.hoverBox = id; paint() },
    hoverStand: (id) => { state.hoverStand = id; paint() },
    focusSeat: (i) => { state.focusSeat = i; refresh() },
    thumb: (i) => renderThumb(i),
    holdLeft: () => Math.max(0, Math.round((holdUntil - Date.now()) / 1000)),
    clearCart: () => { cart.clear(); holdUntil = 0; state.focusSeat = null; refresh() },
  },
})
const modalOpen = () => document.getElementById('modal').classList.contains('on')

function refresh() {
  paint()
  ui.render()
  buildLabels()
}

// ─── Etichete HTML proiectate ───────────────────────────────────────
const labelsEl = document.getElementById('labels')
let labels = []
function buildLabels() {
  labelsEl.innerHTML = ''
  labels = []
  const add = (pos, html, cls) => {
    const el = document.createElement('div')
    el.className = `lbl ${cls || ''}`
    el.innerHTML = html
    labelsEl.appendChild(el)
    labels.push({ el, pos: new THREE.Vector3(...pos) })
  }
  if (state.mode === 'overview') {
    for (const st of streetLabelData) add([st.x, 3, st.z], st.name, 'street')
    for (const id of ['PN', 'T2', 'PS', 'T1']) {
      const v = standLabelPos(id)
      const st = standStats(id)
      add(v, `${STANDS[id].short}<small>${st.min ? `de la ${st.min} lei` : 'Epuizat'}</small>`)
    }
  } else if (state.mode === 'stand') {
    for (const s of standSectors(state.stand)) {
      const f = freeCount(s.seatIdx)
      const name = s.letter || (s.num != null ? `${s.num}${s.ringLabel ? `<sup>${s.ringLabel}</sup>` : ''}` : s.away ? 'OAS' : s.title.replace('Tribuna ', 'T').replace(' · ', ' '))
      const sub = s.away ? 'oaspeți' : f ? `${f} libere` : 'epuizat'
      const y = s.center.y + (s.ringLabel === 1 ? 0 : 2)
      add([s.center.x - s.normal.x * 2, y + 2.5, s.center.z - s.normal.z * 2], `${name}<small>${sub}</small>`, `sec ${f || s.away ? '' : 'sold'}`)
    }
    if (state.stand === 'VIP') add([-(G.hx + D2(0)) + 1, 16.6, 0], `Loje VIP<small>${layout.boxes.filter((b) => freeCount(b.seatIdx)).length} cu locuri libere</small>`, 'sec')
  }
  positionLabels()
}
function standLabelPos(id) {
  const secs = standSectors(id)
  let x = 0, y = 0, z = 0, w = 0
  for (const s of secs) {
    x += s.center.x * s.capacity; y += s.center.y * s.capacity; z += s.center.z * s.capacity; w += s.capacity
  }
  return [x / w, y / w + 22, z / w]
}
const proj = new THREE.Vector3()
function positionLabels() {
  const w = canvas.clientWidth
  const h = canvas.clientHeight
  for (const l of labels) {
    proj.copy(l.pos).project(camera)
    const vis = proj.z < 1 && Math.abs(proj.x) < 1.1 && Math.abs(proj.y) < 1.1
    l.el.style.opacity = vis ? (flight ? '0' : '1') : '0'
    l.el.style.left = `${((proj.x + 1) / 2) * w}px`
    l.el.style.top = `${((1 - proj.y) / 2) * h}px`
  }
}

// ─── Selecția cu mouse-ul / degetul ─────────────────────────────────
const ray = new THREE.Raycaster()
const ndc = new THREE.Vector2()
let pointer = null
let pointerDirty = false
let down = null
canvas.addEventListener('pointermove', (e) => {
  pointer = { x: e.clientX, y: e.clientY }
  pointerDirty = true
  if (down && state.mode === 'pov') {
    look.yaw -= (e.clientX - down.lx) * 0.004
    look.pitch += (e.clientY - down.ly) * 0.004
    down.lx = e.clientX
    down.ly = e.clientY
  }
  if (down && Math.hypot(e.clientX - down.x, e.clientY - down.y) > 6) down.moved = true
})
canvas.addEventListener('pointerdown', (e) => {
  down = { x: e.clientX, y: e.clientY, lx: e.clientX, ly: e.clientY, moved: false }
  controls.autoRotate = false
  idleSince = performance.now()
})
canvas.addEventListener('pointerup', (e) => {
  const wasClick = down && !down.moved
  down = null
  if (!wasClick || flight) return
  pointer = { x: e.clientX, y: e.clientY }
  const hit = pick()
  onClick(hit)
})
canvas.addEventListener('pointerleave', () => {
  pointer = null
  setHover(null)
})
window.addEventListener('keydown', (e) => {
  if (e.key === 'Escape') back()
})

function pick() {
  if (!pointer) return null
  const r = canvas.getBoundingClientRect()
  ndc.set(((pointer.x - r.left) / r.width) * 2 - 1, -((pointer.y - r.top) / r.height) * 2 + 1)
  ray.setFromCamera(ndc, camera)
  const m = state.mode
  if (m === 'pov') return null
  if (m === 'sector') {
    const seat = nearestSeat(sectorById.get(state.sector).seatIdx, 0.44)
    if (seat != null) return { seat }
    const ph = ray.intersectObjects(stadium.proxies.filter((p) => p.userData.sector && sectorById.get(p.userData.sector).stand === state.stand), false)
    if (ph.length && ph[0].object.userData.sector !== state.sector) return { sector: ph[0].object.userData.sector }
    return null
  }
  if (m === 'box') {
    const seat = nearestSeat(boxById.get(state.box).seatIdx, 0.4, 0.55)
    return seat != null ? { seat } : null
  }
  const candidates = m === 'overview'
    ? stadium.proxies
    : stadium.proxies.filter((p) => (p.userData.box ? state.stand === 'VIP' : sectorById.get(p.userData.sector).stand === state.stand))
  const hits = ray.intersectObjects(candidates, false)
  if (!hits.length) return null
  const u = hits[0].object.userData
  if (u.box) return m === 'overview' ? { stand: 'VIP' } : { box: u.box }
  const sec = sectorById.get(u.sector)
  return m === 'overview' ? { stand: sec.stand } : { sector: u.sector }
}

// cel mai apropiat loc de raza mouse-ului (mai iertător decât lovirea exactă a scaunului)
const seatPt = new THREE.Vector3()
function nearestSeat(idxList, maxDist, lift = 0.5) {
  let best = null
  let bestCam = Infinity
  const md2 = maxDist * maxDist
  for (const i of idxList) {
    const s = seats[i]
    seatPt.set(s.x, s.y + lift, s.z)
    if (ray.ray.distanceSqToPoint(seatPt) > md2) continue
    const dc = seatPt.distanceToSquared(camera.position)
    if (dc < bestCam) {
      bestCam = dc
      best = i
    }
  }
  return best
}

function setHover(hit) {
  const prev = `${state.hoverStand}|${state.hoverSector}|${state.hoverBox}|${state.hoverSeat}`
  state.hoverStand = hit?.stand || null
  state.hoverSector = hit?.sector || null
  state.hoverBox = hit?.box || null
  state.hoverSeat = hit?.seat ?? null
  const now = `${state.hoverStand}|${state.hoverSector}|${state.hoverBox}|${state.hoverSeat}`
  if (prev !== now) {
    paint()
    ui.highlight()
  }
  canvas.className = hit ? 'point' : 'grab'
  ui.tooltip(hit, pointer)
}

function onClick(hit) {
  if (!hit) return
  if (hit.stand) goStand(hit.stand)
  else if (hit.sector) goSector(hit.sector)
  else if (hit.box) goBox(hit.box)
  else if (hit.seat != null) {
    const i = hit.seat
    if (status[i] === FREE) toggleSeat(i)
    else ui.flash(status[i] === BLOCKED ? 'Acest loc nu se vinde online.' : 'Locul este deja ocupat. Alege un loc verde.')
    setHover(pick())
  }
}

// ─── Bucla de randare ───────────────────────────────────────────────
function resize() {
  const w = canvas.clientWidth
  const h = canvas.clientHeight
  renderer.setSize(w, h, false)
  camera.aspect = w / h
  // centrează scena în zona liberă de lângă panou (desktop)
  // desktop: panoul e în dreapta; telefon: panoul e jos
  if (w >= 820) camera.setViewOffset(w, h, 206, 0, w, h)
  else camera.setViewOffset(w, h, 0, Math.round(h * 0.19), w, h)
  if (!['box', 'pov'].includes(state.mode)) fovTarget = baseFov()
  camera.fov = fovTarget
  camera.updateProjectionMatrix()
  if (composer) {
    composer.setPixelRatio(renderer.getPixelRatio())
    composer.setSize(w, h)
  }
}
window.addEventListener('resize', resize)
resize()

let idleSince = performance.now()
let last = performance.now()
function frame(now) {
  const dt = Math.min(0.05, (now - last) / 1000)
  last = now
  stepFlight(now)
  if (state.mode === 'pov' && !flight) {
    camera.position.copy(povPose(state.povSeat).eye)
    camera.lookAt(camera.position.clone().add(dirFromLook()))
  } else if (!flight) {
    if (state.mode === 'overview' && now - idleSince > 6000) controls.autoRotate = true
    controls.update(dt)
  } else {
    camera.lookAt(controls.target)
  }
  if (Math.abs(camera.fov - fovTarget) > 0.05) {
    camera.fov += (fovTarget - camera.fov) * Math.min(1, dt * 3)
    camera.updateProjectionMatrix()
  }
  stadium.roofMat.opacity += (roofTarget - stadium.roofMat.opacity) * Math.min(1, dt * 4)
  stadium.shellInMat.opacity += (innerTarget - stadium.shellInMat.opacity) * Math.min(1, dt * 4)
  if (pointerDirty && !flight && !down) {
    pointerDirty = false
    setHover(pick())
  } else if (pointer && !flight && state.hoverSeat == null && !down) {
    ui.tooltip(currentHit(), pointer)
  }
  positionLabels()
  ui.tick()
  googleTiles?.update()
  if (composer) composer.render(dt)
  else renderer.render(scene, camera)
  requestAnimationFrame(frame)
}
function currentHit() {
  if (state.hoverSeat != null) return { seat: state.hoverSeat }
  if (state.hoverBox) return { box: state.hoverBox }
  if (state.hoverSector) return { sector: state.hoverSector }
  if (state.hoverStand) return { stand: state.hoverStand }
  return null
}

// pornire: zbor de la distanță spre vederea de ansamblu
applyControls('overview')
controls.target.set(0, 4, 0)
refresh()
renderer.compile(scene, camera)
requestAnimationFrame((t) => {
  last = t
  frame(t)
  document.getElementById('loader').classList.add('done')
  // o clipă de sus, ca pe hartă, apoi coborâm și ne înclinăm spre stadion
  controls.maxDistance = 2000
  setTimeout(() => flyTo(OVERVIEW.pos, OVERVIEW.target, 4.2, () => {
    applyControls('overview')
    idleSince = performance.now()
  }, false), 1400)
})

// acces pentru testare din consolă
window.__ucv = { layout, status, state, goStand, goSector, goBox, goPov, goOverview, toggleSeat, cart, pickAt: (x, y) => { pointer = { x, y }; return pick() } }
