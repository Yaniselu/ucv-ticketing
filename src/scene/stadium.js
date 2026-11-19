import * as THREE from 'three'
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js'
import {
  G, D1, Y1, D2, Y2, WALK_D, WALK_Y, BACK_D, TOP_Y,
  pathPoint, T_BLOCK_A, T_BLOCK_B,
} from '../data/layout.js'
import { EVENT } from '../data/stadium-data.js'
import * as TX from './textures.js'

export const SHELL_TOP = 50.14 // înălțimea maximă a stadionului (stadiumdb.com)

const FULL = [0, 1, 2, 3, 4, 5, 6, 7].map((p) => [p, 0, 1])
const RING2 = FULL.flatMap(([p]) => (p === 6 ? [[6, 0, T_BLOCK_A], [6, T_BLOCK_B, 1]] : [[p, 0, 1]]))

function rng(seed) {
  let s = seed >>> 0
  return () => {
    s = (s + 0x6d2b79f5) >>> 0
    let t = s
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

class Quads {
  constructor() { this.pos = [] }
  quad(a, b, c, d) { this.pos.push(...a, ...b, ...c, ...a, ...c, ...d) }
  geometry() {
    const g = new THREE.BufferGeometry()
    g.setAttribute('position', new THREE.Float32BufferAttribute(this.pos, 3))
    g.computeVertexNormals()
    return g
  }
}

function samples(p, t0, t1) {
  const seg = p % 2 === 1 ? Math.max(2, Math.ceil(28 * (t1 - t0))) : 1
  const out = []
  for (let k = 0; k <= seg; k++) out.push(t0 + ((t1 - t0) * k) / seg)
  return out
}

const P = (p, t, d, y) => {
  const q = pathPoint(p, t, d)
  return [q.x, y, q.z]
}

// bandă de-a lungul conturului între (d0, y0) și (d1, y1)
function strip(q, ranges, d0, y0, d1, y1) {
  for (const [p, t0, t1] of ranges) {
    const ts = samples(p, t0, t1)
    for (let k = 0; k < ts.length - 1; k++) {
      q.quad(P(p, ts[k], d0, y0), P(p, ts[k], d1, y1), P(p, ts[k + 1], d1, y1), P(p, ts[k + 1], d0, y0))
    }
  }
}

function chairGeometry(w = 0.46) {
  const seat = new THREE.BoxGeometry(w, 0.07, 0.4)
  seat.translate(0, 0.43, 0.05)
  const back = new THREE.BoxGeometry(w, 0.44, 0.06)
  back.rotateX(-0.14)
  back.translate(0, 0.68, -0.15)
  const stem = new THREE.BoxGeometry(0.08, 0.4, 0.1)
  stem.translate(0, 0.2, -0.05)
  return mergeGeometries([seat, back, stem])
}

function armchairGeometry() {
  const seat = new THREE.CylinderGeometry(0.25, 0.25, 0.14, 16, 1)
  seat.scale(1, 1, 1.02)
  seat.translate(0, 0.46, 0.03)
  const back = new THREE.CylinderGeometry(0.27, 0.27, 0.56, 20, 1, true, Math.PI * 0.62, Math.PI * 0.76)
  back.translate(0, 0.74, 0.04)
  const backCap = new THREE.BoxGeometry(0.4, 0.5, 0.06)
  backCap.rotateX(-0.12)
  backCap.translate(0, 0.74, -0.2)
  const base = new THREE.CylinderGeometry(0.05, 0.2, 0.4, 12)
  base.translate(0, 0.2, 0)
  return mergeGeometries([seat, back, backCap, base].map((g) => g.toNonIndexed()))
}

// ─── Profilul „oului” lui Brâncuși: fațada și acoperișul ───────────────
const SHELL_PROFILE = [
  [90, 112, 0], [93, 115, 9], [95, 117, 20], [94.5, 116.5, 31], [91, 113, 40],
  [85, 106, 46.5], [77, 97, SHELL_TOP],
]
const ROOF_PROFILE = [[77, 97, SHELL_TOP], [66, 85, 49.4], [55, 72, 47], [45, 63, 44], [38, 56, 41.5]]

function revolve(profile, segs, samplesN, uvFn) {
  const curve = new THREE.CatmullRomCurve3(profile.map(([ax, az, y]) => new THREE.Vector3(ax, y, az)))
  const pts = curve.getPoints(samplesN)
  const pos = []
  const uv = []
  const idx = []
  for (let i = 0; i < pts.length; i++) {
    for (let j = 0; j <= segs; j++) {
      const t = (j / segs) * Math.PI * 2
      pos.push(pts[i].x * Math.cos(t), pts[i].y, pts[i].z * Math.sin(t))
      uv.push(...uvFn(i / (pts.length - 1), j / segs, pts[i]))
    }
  }
  const W = segs + 1
  for (let i = 0; i < pts.length - 1; i++) {
    for (let j = 0; j < segs; j++) {
      const a = i * W + j
      const b = (i + 1) * W + j
      const c = i * W + j + 1
      const d = (i + 1) * W + j + 1
      idx.push(a, b, c, b, d, c)
    }
  }
  const g = new THREE.BufferGeometry()
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3))
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2))
  g.setIndex(idx)
  g.computeVertexNormals()
  return { geometry: g, points: pts }
}

function ellipseShape(ax, az, n = 128) {
  const s = new THREE.Shape()
  for (let k = 0; k <= n; k++) {
    const t = (k / n) * Math.PI * 2
    const x = ax * Math.cos(t)
    const y = az * Math.sin(t)
    k === 0 ? s.moveTo(x, y) : s.lineTo(x, y)
  }
  return s
}

export function buildStadium(scene, layout, { lowSpec = false } = {}) {
  const root = new THREE.Group()
  scene.add(root)
  const out = { root, seatMeshes: new Map(), proxies: [], fadeMats: [], boxRooms: new Map() }

  const concrete = new THREE.MeshStandardMaterial({ color: 0xc4c8cc, roughness: 0.92, side: THREE.DoubleSide })
  const white = new THREE.MeshStandardMaterial({ color: 0xf1f3f5, roughness: 0.7, side: THREE.DoubleSide })
  const darkGlass = new THREE.MeshStandardMaterial({ color: 0x1d2a38, roughness: 0.15, metalness: 0.3 })
  const glass = new THREE.MeshStandardMaterial({
    color: 0x9fc4e6, roughness: 0.05, metalness: 0.1, transparent: true, opacity: 0.22, depthWrite: false, side: THREE.DoubleSide,
  })

  // ─── Terenul ───
  const pitch = new THREE.Mesh(new THREE.PlaneGeometry(G.hx * 2, G.hz * 2), new THREE.MeshStandardMaterial({ map: TX.pitchTexture(), roughness: 0.95 }))
  pitch.rotation.x = -Math.PI / 2
  pitch.receiveShadow = true
  root.add(pitch)

  // porțile
  const postMat = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.4 })
  const netMat = new THREE.MeshBasicMaterial({ color: 0xffffff, wireframe: true, transparent: true, opacity: 0.35 })
  for (const s of [-1, 1]) {
    const goal = new THREE.Group()
    const post = new THREE.CylinderGeometry(0.06, 0.06, 2.44, 10)
    for (const x of [-3.66, 3.66]) {
      const m = new THREE.Mesh(post, postMat)
      m.position.set(x, 1.22, 0)
      goal.add(m)
    }
    const bar = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.06, 7.44, 10), postMat)
    bar.rotation.z = Math.PI / 2
    bar.position.y = 2.44
    goal.add(bar)
    const net = new THREE.Mesh(new THREE.BoxGeometry(7.32, 2.44, 2, 14, 5, 4), netMat)
    net.position.set(0, 1.22, s * 1)
    goal.add(net)
    goal.position.z = s * 52.5
    goal.traverse((o) => (o.castShadow = true))
    root.add(goal)
  }

  // ─── Gradenele ───
  const steps = new Quads()
  const walls = new Quads()
  strip(walls, FULL, 0, 0, 0, Y1(0)) // parapetul de lângă teren
  for (let i = 0; i < G.ring1.rows; i++) {
    if (i > 0) strip(steps, FULL, D1(i), Y1(i - 1), D1(i), Y1(i))
    strip(steps, FULL, D1(i), Y1(i), D1(i + 1), Y1(i))
  }
  strip(steps, FULL, WALK_D, Y1(G.ring1.rows - 1), WALK_D, WALK_Y)
  strip(steps, FULL, WALK_D, WALK_Y, D2(0), WALK_Y)
  strip(walls, RING2, D2(0), WALK_Y, D2(0), Y2(0))
  for (let j = 0; j < G.ring2.rows; j++) {
    if (j > 0) strip(steps, RING2, D2(j), Y2(j - 1), D2(j), Y2(j))
    strip(steps, RING2, D2(j), Y2(j), D2(j + 1), Y2(j))
  }
  strip(walls, RING2, BACK_D, Y2(G.ring2.rows - 1), BACK_D, TOP_Y + 1.4)
  strip(walls, RING2, BACK_D, TOP_Y + 1.4, BACK_D + 0.4, TOP_Y + 1.4)
  const stepsMesh = new THREE.Mesh(steps.geometry(), concrete)
  stepsMesh.receiveShadow = true
  stepsMesh.castShadow = !lowSpec
  root.add(stepsMesh)
  const wallMesh = new THREE.Mesh(walls.geometry(), white)
  wallMesh.receiveShadow = true
  root.add(wallMesh)

  // scările albe dintre sectoare
  const aisleKeys = new Set()
  const aisleMarks = []
  for (const s of layout.sectors) {
    const blocks = s.innerAisles + 1
    const ts = []
    for (let b = 0; b <= blocks; b++) ts.push(s.t0 + ((s.t1 - s.t0) * b) / blocks)
    for (const ring of s.rings) {
      const n = ring === 1 ? G.ring1.rows : G.ring2.rows
      for (let r = 0; r < n; r++) {
        for (const t of ts) {
          const key = `${s.piece}:${t.toFixed(4)}:${ring}:${r}`
          if (aisleKeys.has(key)) continue
          aisleKeys.add(key)
          const front = ring === 1 ? D1(r) : D2(r)
          const y = ring === 1 ? Y1(r) : Y2(r)
          const p = pathPoint(s.piece, t, front + G.depth / 2)
          aisleMarks.push([p.x, y + 0.015, p.z, Math.atan2(-p.nx, -p.nz)])
        }
      }
    }
  }
  const aisleMesh = new THREE.InstancedMesh(new THREE.BoxGeometry(1.05, 0.03, G.depth), white, aisleMarks.length)
  const m4 = new THREE.Matrix4()
  const q4 = new THREE.Quaternion()
  const up = new THREE.Vector3(0, 1, 0)
  const one = new THREE.Vector3(1, 1, 1)
  aisleMarks.forEach(([x, y, z, rot], k) => {
    m4.compose(new THREE.Vector3(x, y, z), q4.setFromAxisAngle(up, rot), one)
    aisleMesh.setMatrixAt(k, m4)
  })
  aisleMesh.receiveShadow = true
  root.add(aisleMesh)

  // ─── Locurile ───
  const seatMat = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.5 })
  const chair = chairGeometry()
  const vipChair = chairGeometry(0.5)
  const tmpPos = new THREE.Vector3()
  const place = (mesh, k, s, scale = 1) => {
    tmpPos.set(s.x, s.y, s.z)
    m4.compose(tmpPos, q4.setFromAxisAngle(up, s.rot), new THREE.Vector3(scale, scale, scale))
    mesh.setMatrixAt(k, m4)
  }
  out.seatRef = new Array(layout.seats.length)
  for (const s of layout.sectors) {
    const mesh = new THREE.InstancedMesh(s.kind === 'vip' ? vipChair : chair, seatMat, s.seatIdx.length)
    s.seatIdx.forEach((i, k) => {
      place(mesh, k, layout.seats[i])
      mesh.setColorAt(k, new THREE.Color(0x2a6fd1))
      out.seatRef[i] = { mesh, k }
    })
    mesh.castShadow = !lowSpec
    mesh.receiveShadow = true
    mesh.userData = { sector: s.id, seatIdx: s.seatIdx }
    mesh.computeBoundingSphere()
    root.add(mesh)
    out.seatMeshes.set(s.id, mesh)
  }

  // locurile pentru persoane cu dizabilități
  const wcIdx = layout.accessibleIdx.filter((i) => layout.seats[i].kind === 'wheelchair')
  const coIdx = layout.accessibleIdx.filter((i) => layout.seats[i].kind === 'companion')
  const wcMesh = new THREE.InstancedMesh(new THREE.BoxGeometry(0.85, 0.03, 1.2), new THREE.MeshStandardMaterial({ color: 0x1f5fbf, roughness: 0.6 }), wcIdx.length)
  wcIdx.forEach((i, k) => {
    const s = layout.seats[i]
    place(wcMesh, k, { ...s, y: s.y + 0.02 })
    out.seatRef[i] = { mesh: wcMesh, k }
  })
  root.add(wcMesh)
  const coMesh = new THREE.InstancedMesh(chair, seatMat, coIdx.length)
  coIdx.forEach((i, k) => {
    place(coMesh, k, layout.seats[i])
    coMesh.setColorAt(k, new THREE.Color(0x2a6fd1))
    out.seatRef[i] = { mesh: coMesh, k }
  })
  root.add(coMesh)
  out.companionMesh = coMesh

  // ─── Tribuna 1: lojele, presa, tunelul ───
  const xFront = -(G.hx + D2(0))
  const bh = G.blockHalf
  const block = new THREE.Group()
  root.add(block)
  const slabGeo = []
  const carpetGeo = []
  for (let level = 0; level <= 2; level++) {
    const g = new THREE.BoxGeometry(6.6, 0.35, bh * 2)
    g.translate(xFront - 3.0, WALK_Y + level * G.boxH - 0.175, 0)
    slabGeo.push(g)
  }
  for (const b of layout.boxes) {
    // pereții despărțitori
    for (const z of [b.z0, b.z1]) {
      const g = new THREE.BoxGeometry(6, G.boxH, 0.12)
      g.translate(xFront - 3, b.floorY + G.boxH / 2, z)
      slabGeo.push(g)
    }
    // treapta pentru rândul 2
    const st = new THREE.BoxGeometry(2.2, 0.35, G.boxW - 0.2)
    st.translate(xFront - 3.2, b.floorY + 0.175, b.zc)
    carpetGeo.push(st)
  }
  const slabs = new THREE.Mesh(mergeGeometries(slabGeo), white)
  slabs.castShadow = true
  slabs.receiveShadow = true
  block.add(slabs)
  // interiorul lojelor: pardoseală caldă, perete din spate, tavan luminos
  const roomFloor = new THREE.Mesh(new THREE.BoxGeometry(6, 0.05, bh * 2), new THREE.MeshStandardMaterial({ color: 0x6b4f3a, roughness: 0.8 }))
  roomFloor.position.set(xFront - 3, WALK_Y + 0.03, 0)
  const floor2 = roomFloor.clone()
  floor2.position.y += G.boxH
  const backWallMat = new THREE.MeshStandardMaterial({ color: 0xd8c7b0, roughness: 0.9 })
  const backWall = new THREE.Mesh(new THREE.BoxGeometry(0.2, G.boxH * 2, bh * 2), backWallMat)
  backWall.position.set(xFront - 6, WALK_Y + G.boxH, 0)
  const ceilMat = new THREE.MeshStandardMaterial({ color: 0xfff6e8, emissive: 0xffe9c7, emissiveIntensity: 0.5 })
  const ceil1 = new THREE.Mesh(new THREE.BoxGeometry(5.6, 0.04, bh * 2), ceilMat)
  ceil1.position.set(xFront - 3, WALK_Y + G.boxH - 0.36, 0)
  const ceil2 = ceil1.clone()
  ceil2.position.y += G.boxH
  block.add(roomFloor, floor2, backWall, ceil1, ceil2)
  block.add(new THREE.Mesh(mergeGeometries(carpetGeo), roomFloor.material))
  // fațada vitrată a lojelor
  const glassFront = new THREE.Mesh(new THREE.PlaneGeometry(bh * 2, G.boxH * 2), glass)
  glassFront.rotation.y = -Math.PI / 2
  glassFront.position.set(xFront - 0.02, WALK_Y + G.boxH, 0)
  block.add(glassFront)
  const mullGeo = []
  for (let z = -bh; z <= bh + 0.01; z += G.boxW / 2) {
    const g = new THREE.BoxGeometry(0.08, G.boxH * 2, 0.06)
    g.translate(xFront, WALK_Y + G.boxH, z)
    mullGeo.push(g)
  }
  for (const y of [WALK_Y + 1.05, WALK_Y + G.boxH + 1.05]) {
    const g = new THREE.BoxGeometry(0.06, 0.06, bh * 2)
    g.translate(xFront + 0.05, y, 0)
    mullGeo.push(g)
  }
  block.add(new THREE.Mesh(mergeGeometries(mullGeo), new THREE.MeshStandardMaterial({ color: 0x9aa4ad, metalness: 0.6, roughness: 0.3 })))

  // fotoliile din loje
  const boxIdx = layout.boxes.flatMap((b) => b.seatIdx)
  const leather = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.35, side: THREE.DoubleSide })
  const boxMesh = new THREE.InstancedMesh(armchairGeometry(), leather, boxIdx.length)
  boxIdx.forEach((i, k) => {
    place(boxMesh, k, layout.seats[i])
    boxMesh.setColorAt(k, new THREE.Color(0x24211f))
    out.seatRef[i] = { mesh: boxMesh, k }
  })
  boxMesh.castShadow = true
  boxMesh.userData = { boxes: true }
  block.add(boxMesh)
  out.boxMesh = boxMesh

  // tribuna presei, pe acoperișul lojelor
  const press = layout.pressIdx.map((i) => layout.seats[i])
  const pressMesh = new THREE.InstancedMesh(chair, new THREE.MeshStandardMaterial({ color: 0x2b2f36, roughness: 0.6 }), press.length)
  press.forEach((s, k) => {
    place(pressMesh, k, s)
    out.seatRef[s.i] = { mesh: pressMesh, k }
  })
  block.add(pressMesh)
  const deskGeo = []
  const rowsY = [...new Set(press.map((s) => s.y))]
  rowsY.forEach((y, r) => {
    const sx = press.find((s) => s.y === y).x
    const g = new THREE.BoxGeometry(0.45, 0.06, 39)
    g.translate(sx + 0.55, y + 0.74, 0)
    deskGeo.push(g)
    const st = new THREE.BoxGeometry(1.0, 0.45 * (r + 1) + 0.3, 40)
    st.translate(sx, y - (0.45 * (r + 1) + 0.3) / 2, 0)
    deskGeo.push(st)
  })
  const deskMesh = new THREE.Mesh(mergeGeometries(deskGeo), white)
  deskMesh.receiveShadow = true
  block.add(deskMesh)
  // centrul media din spatele presei și pereții laterali ai blocului
  const mediaTop = TOP_Y + 1.4
  const mediaX0 = xFront - 6.2
  const mediaX1 = -(G.hx + BACK_D + 0.4)
  const media = new THREE.Mesh(new THREE.BoxGeometry(mediaX0 - mediaX1, mediaTop - WALK_Y - 2 * G.boxH, bh * 2), white)
  media.position.set((mediaX0 + mediaX1) / 2, (mediaTop + WALK_Y + 2 * G.boxH) / 2, 0)
  media.castShadow = true
  block.add(media)
  const mediaGlass = new THREE.Mesh(new THREE.PlaneGeometry(bh * 2 - 2, 2.6), darkGlass)
  mediaGlass.rotation.y = Math.PI / 2
  mediaGlass.position.set(mediaX0 + 0.02, mediaTop - 2.2, 0)
  block.add(mediaGlass)
  for (const s of [-1, 1]) {
    const side = new THREE.Mesh(new THREE.BoxGeometry(BACK_D - D2(0) + 0.4, mediaTop - WALK_Y, 0.3), white)
    side.position.set(xFront - (BACK_D - D2(0) + 0.4) / 2, (mediaTop + WALK_Y) / 2, s * (bh + 0.15))
    side.castShadow = true
    block.add(side)
  }
  // ieșirea jucătorilor (tunelul de sub Tribuna VIP)
  const tunH = Y1(7) + 0.5
  const tunnel = new THREE.Mesh(
    new THREE.BoxGeometry(D1(7) + 0.4, tunH, 6.2),
    [white, white, new THREE.MeshStandardMaterial({ map: TX.tunnelTexture(), roughness: 0.6 }), white, white, white],
  )
  tunnel.position.set(-(G.hx + D1(7) / 2) + 0.2, tunH / 2, 0)
  tunnel.castShadow = true
  root.add(tunnel)
  // băncile de rezerve
  const dugMat = new THREE.MeshStandardMaterial({ color: 0xd9e6f2, transparent: true, opacity: 0.45, side: THREE.DoubleSide, roughness: 0.1 })
  for (const z of [-9.5, 9.5]) {
    const canopy = new THREE.Mesh(new THREE.CylinderGeometry(1.25, 1.25, 11, 20, 1, true, 0, Math.PI), dugMat)
    canopy.rotation.set(Math.PI / 2, 0, -Math.PI / 2)
    canopy.position.set(-39.6, 0.05, z)
    root.add(canopy)
    const bench = new THREE.Mesh(new THREE.BoxGeometry(0.6, 0.5, 10.5), new THREE.MeshStandardMaterial({ color: 0x1b4fa0 }))
    bench.position.set(-40.2, 0.25, z)
    root.add(bench)
  }

  // panouri LED
  const ledTex = TX.ledTexture()
  const ledMat = new THREE.MeshStandardMaterial({ map: ledTex, emissive: 0xffffff, emissiveMap: ledTex, emissiveIntensity: 0.9 })
  const leds = [
    [37.6, 0, 100, -Math.PI / 2], [-37.0, 30, 30, Math.PI / 2], [-37.0, -30, 30, Math.PI / 2],
    [0, 57.4, 62, Math.PI], [0, -57.4, 62, 0],
  ]
  for (const [x, z, len, ry] of leds) {
    const t = ledTex.clone()
    t.repeat.set(len / 30, 1)
    t.needsUpdate = true
    const m = new THREE.Mesh(new THREE.PlaneGeometry(len, 0.9), ledMat.clone())
    m.material.map = t
    m.material.emissiveMap = t
    m.position.set(x, 0.5, z)
    m.rotation.y = ry
    root.add(m)
  }

  // ─── Fațada, acoperișul, ecranele ───
  const facade = revolve(SHELL_PROFILE, 256, 48, (vi, uj, pt) => [uj, pt.y / SHELL_TOP])
  const facadeMat = new THREE.MeshStandardMaterial({ map: TX.facadeTexture(SHELL_TOP), roughness: 0.55, metalness: 0.15 })
  const shell = new THREE.Mesh(facade.geometry, facadeMat)
  shell.castShadow = true
  shell.receiveShadow = true
  root.add(shell)
  out.shell = shell
  const latticeIn = TX.latticeTexture()
  latticeIn.repeat.set(140, 9)
  const shellInMat = new THREE.MeshStandardMaterial({ map: latticeIn, color: 0xffffff, transparent: true, side: THREE.BackSide, roughness: 0.6, depthWrite: false })
  root.add(new THREE.Mesh(facade.geometry, shellInMat))
  const latticeRoof = TX.latticeTexture()
  latticeRoof.repeat.set(140, 6)
  const roofMat = new THREE.MeshStandardMaterial({
    map: latticeRoof, color: 0xffffff, transparent: true, opacity: 0.5, side: THREE.DoubleSide, roughness: 0.5, depthWrite: false,
  })
  const roof = revolve(ROOF_PROFILE, 256, 24, (vi, uj) => [uj, vi])
  const roofMesh = new THREE.Mesh(roof.geometry, roofMat)
  roofMesh.renderOrder = 2
  root.add(roofMesh)
  out.roofMat = roofMat
  out.shellInMat = shellInMat
  // inelul de la marginea acoperișului, cu proiectoarele nocturnei
  const [oax, oaz, oy] = ROOF_PROFILE[ROOF_PROFILE.length - 1]
  const ring = new THREE.CatmullRomCurve3(
    Array.from({ length: 96 }, (_, k) => {
      const t = (k / 96) * Math.PI * 2
      return new THREE.Vector3(oax * Math.cos(t), oy, oaz * Math.sin(t))
    }),
    true,
  )
  const roofParts = new THREE.Group()
  root.add(roofParts)
  out.roofParts = roofParts
  roofParts.add(new THREE.Mesh(new THREE.TubeGeometry(ring, 192, 0.7, 8, true), white))
  const lights = new THREE.InstancedMesh(new THREE.BoxGeometry(1.6, 0.5, 0.9), new THREE.MeshStandardMaterial({ color: 0xffffff, emissive: 0xfff4d6, emissiveIntensity: 1.6 }), 72)
  for (let k = 0; k < 72; k++) {
    const t = (k / 72) * Math.PI * 2
    const p = new THREE.Vector3((oax + 0.4) * Math.cos(t), oy - 0.9, (oaz + 0.4) * Math.sin(t))
    m4.lookAt(p, new THREE.Vector3(0, 0, 0), up)
    m4.setPosition(p)
    lights.setMatrixAt(k, m4)
  }
  roofParts.add(lights)
  // ecranele din colțurile NE și SV
  const screenMat = new THREE.MeshBasicMaterial({ map: TX.screenTexture(EVENT.home, EVENT.away) })
  for (const piece of [1, 5]) {
    const p = pathPoint(piece, 0.5, BACK_D - 3)
    const scr = new THREE.Group()
    const frame = new THREE.Mesh(new THREE.BoxGeometry(14.6, 8.4, 0.6), new THREE.MeshStandardMaterial({ color: 0x15181d }))
    const face = new THREE.Mesh(new THREE.PlaneGeometry(14, 7.9), screenMat)
    face.position.z = 0.31
    scr.add(frame, face)
    scr.position.set(p.x, TOP_Y + 6, p.z)
    scr.lookAt(0, TOP_Y + 2, 0)
    root.add(scr)
  }

  // ─── Împrejurimile ───
  const ground = new THREE.Mesh(new THREE.PlaneGeometry(3200, 3200), new THREE.MeshStandardMaterial({ map: TX.noiseTexture('#6d8a4c', 26, 256, [400, 400]), roughness: 1 }))
  ground.rotation.x = -Math.PI / 2
  ground.position.y = -0.06
  ground.receiveShadow = true
  root.add(ground)
  const pavers = TX.noiseTexture('#cfd1d3', 18, 256, [40, 40], 32)
  const plaza = new THREE.Mesh(new THREE.ShapeGeometry(ellipseShape(150, 175)), new THREE.MeshStandardMaterial({ map: pavers, roughness: 0.95 }))
  plaza.rotation.x = -Math.PI / 2
  plaza.position.y = -0.02
  plaza.receiveShadow = true
  root.add(plaza)
  // promenada înălțată din jurul stadionului
  const promShape = ellipseShape(106, 128)
  promShape.holes.push(ellipseShape(89, 111))
  const prom = new THREE.Mesh(new THREE.ExtrudeGeometry(promShape, { depth: 5, bevelEnabled: false, curveSegments: 64 }), new THREE.MeshStandardMaterial({ color: 0xd3d6d9, roughness: 0.9 }))
  prom.rotation.x = -Math.PI / 2
  prom.castShadow = true
  prom.receiveShadow = true
  root.add(prom)
  // scări spre promenadă
  const stairGeo = []
  for (const [ang, w] of [[0, 30], [Math.PI / 2, 40], [Math.PI, 30], [-Math.PI / 2, 40], [Math.PI / 4, 18], [(3 * Math.PI) / 4, 18], [(-3 * Math.PI) / 4, 18], [-Math.PI / 4, 18]]) {
    for (let k = 0; k < 14; k++) {
      const g = new THREE.BoxGeometry(w, 5 - k * 0.36, 0.7)
      g.translate(0, (5 - k * 0.36) / 2, k * 0.7)
      g.rotateY(-ang + Math.PI / 2)
      const ex = 106 * Math.cos(ang)
      const ez = 128 * Math.sin(ang)
      const n = new THREE.Vector2(Math.cos(ang) / 106, Math.sin(ang) / 128).normalize()
      g.translate(ex - n.x * 0.5, 0, ez - n.y * 0.5)
      stairGeo.push(g)
    }
  }
  const stairs = new THREE.Mesh(mergeGeometries(stairGeo), new THREE.MeshStandardMaterial({ color: 0xbfc3c6, roughness: 0.9 }))
  stairs.receiveShadow = true
  root.add(stairs)

  // drumuri și parcare
  const asphalt = new THREE.MeshStandardMaterial({ color: 0x3e4146, roughness: 0.95 })
  const roads = [[0, -235, 1400, 16, 0], [0, 250, 1400, 14, 0], [215, 0, 14, 1400, 0], [-330, 0, 12, 1400, 0]]
  for (const [x, z, w, d] of roads) {
    const r = new THREE.Mesh(new THREE.PlaneGeometry(w, d), asphalt)
    r.rotation.x = -Math.PI / 2
    r.position.set(x, -0.01, z)
    r.receiveShadow = true
    root.add(r)
  }
  const park = new THREE.Mesh(new THREE.PlaneGeometry(130, 220), new THREE.MeshStandardMaterial({ map: TX.parkingTexture(), roughness: 0.95 }))
  park.material.map.repeat.set(5, 9)
  park.material.map.wrapS = park.material.map.wrapT = THREE.RepeatWrapping
  park.rotation.x = -Math.PI / 2
  park.position.set(-240, 0.0, 0)
  park.receiveShadow = true
  root.add(park)

  // copaci și case (deterministe)
  const rand = rng(1948)
  const trees = []
  const tryTree = (x, z) => {
    const e = (x / 152) ** 2 + (z / 177) ** 2
    if (e < 1.02) return
    if (x > -310 && x < -170 && Math.abs(z) < 115) return
    for (const [rx, rz, rw, rd] of roads) if (Math.abs(x - rx) < rw / 2 + 4 && Math.abs(z - rz) < rd / 2 + 4) return
    trees.push([x, z, 0.8 + rand() * 0.6])
  }
  for (let k = 0; k < 260; k++) {
    const t = rand() * Math.PI * 2
    const r = 1.04 + rand() * 0.35
    tryTree(150 * r * Math.cos(t), 175 * r * Math.sin(t))
  }
  for (let k = -680; k < 680; k += 14) {
    tryTree(k + rand() * 4, -247 + rand() * 2)
    tryTree(k + rand() * 4, 262 + rand() * 2)
    tryTree(203 + rand() * 2, k + rand() * 4)
    tryTree(227 + rand() * 2, k + rand() * 4)
  }
  const trunk = new THREE.CylinderGeometry(0.35, 0.5, 4, 6)
  trunk.translate(0, 2, 0)
  const crown = new THREE.IcosahedronGeometry(3.6, 1)
  crown.translate(0, 6.5, 0)
  const trunkMesh = new THREE.InstancedMesh(trunk, new THREE.MeshStandardMaterial({ color: 0x5a4532 }), trees.length)
  const crownMesh = new THREE.InstancedMesh(crown, new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.9, flatShading: true }), trees.length)
  trees.forEach(([x, z, s], k) => {
    m4.compose(new THREE.Vector3(x, 0, z), q4.setFromAxisAngle(up, rand() * 6), new THREE.Vector3(s, s, s))
    trunkMesh.setMatrixAt(k, m4)
    crownMesh.setMatrixAt(k, m4)
    crownMesh.setColorAt(k, new THREE.Color().setHSL(0.24 + rand() * 0.07, 0.42, 0.27 + rand() * 0.1))
  })
  crownMesh.castShadow = !lowSpec
  root.add(trunkMesh, crownMesh)

  const houses = []
  for (let x = -900; x <= 900; x += 26) {
    for (let z = -900; z <= 900; z += 26) {
      const jx = x + (rand() - 0.5) * 8
      const jz = z + (rand() - 0.5) * 8
      if ((jx / 175) ** 2 + (jz / 200) ** 2 < 1.6) continue
      if (jx > -340 && jx < 230 && jz > -255 && jz < 270) continue
      if (rand() < 0.22) continue
      let onRoad = false
      for (const [rx, rz, rw, rd] of roads) if (Math.abs(jx - rx) < rw / 2 + 10 && Math.abs(jz - rz) < rd / 2 + 10) onRoad = true
      if (onRoad) continue
      const tall = rand() < 0.08
      houses.push([jx, jz, 8 + rand() * 6, 8 + rand() * 6, tall ? 18 + rand() * 20 : 4 + rand() * 3, rand() * 0.4, tall])
    }
  }
  const houseMesh = new THREE.InstancedMesh(new THREE.BoxGeometry(1, 1, 1).translate(0, 0.5, 0), new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.9 }), houses.length)
  const roofGeo = new THREE.ConeGeometry(0.75, 1, 4, 1).rotateY(Math.PI / 4).translate(0, 0.5, 0)
  const houseRoof = new THREE.InstancedMesh(roofGeo, new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.85 }), houses.length)
  houses.forEach(([x, z, w, d, h, rot, tall], k) => {
    m4.compose(new THREE.Vector3(x, 0, z), q4.setFromAxisAngle(up, rot), new THREE.Vector3(w, h, d))
    houseMesh.setMatrixAt(k, m4)
    houseMesh.setColorAt(k, new THREE.Color().setHSL(0.1, 0.12, tall ? 0.78 : 0.82 + rand() * 0.1))
    m4.compose(new THREE.Vector3(x, h, z), q4.setFromAxisAngle(up, rot), new THREE.Vector3(w * 1.33, tall ? 0.01 : 3.2, d * 1.33))
    houseRoof.setMatrixAt(k, m4)
    houseRoof.setColorAt(k, tall ? new THREE.Color(0x9aa0a6) : new THREE.Color().setHSL(0.03 + rand() * 0.03, 0.55, 0.38 + rand() * 0.1))
  })
  root.add(houseMesh, houseRoof)

  // ─── Zonele de selecție (invizibile) ───
  const proxyMat = new THREE.MeshBasicMaterial({ visible: false, side: THREE.DoubleSide })
  for (const s of layout.sectors) {
    const q = new Quads()
    for (const ring of s.rings) {
      const n = ring === 1 ? G.ring1.rows : G.ring2.rows
      const f = ring === 1 ? D1(0) : D2(0)
      const b = ring === 1 ? D1(n) : D2(n)
      const y0 = (ring === 1 ? Y1(0) : Y2(0)) + 0.9
      const y1 = (ring === 1 ? Y1(n - 1) : Y2(n - 1)) + 1.1
      strip(q, [[s.piece, s.t0, s.t1]], f, y0, b, y1)
    }
    const mesh = new THREE.Mesh(q.geometry(), proxyMat)
    mesh.userData = { sector: s.id }
    root.add(mesh)
    out.proxies.push(mesh)
  }
  for (const b of layout.boxes) {
    const mesh = new THREE.Mesh(new THREE.PlaneGeometry(G.boxW - 0.1, G.boxH - 0.1), proxyMat)
    mesh.rotation.y = -Math.PI / 2
    mesh.position.set(xFront - 0.05, b.floorY + G.boxH / 2, b.zc)
    mesh.userData = { box: b.id }
    root.add(mesh)
    out.proxies.push(mesh)
  }
  return out
}
