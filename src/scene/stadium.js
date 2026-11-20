import * as THREE from 'three'
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js'
import {
  G, D1, Y1, D2, Y2, WALK_D, WALK_Y, TOP_Y, sectorBlocks, uRanges, PRESS_D, PRESS_Y, PRESS_ROWS, PRESS_HALF,
} from '../data/layout.js'
import * as TX from './textures.js'
import { Quads, strip } from './geom.js'
import { buildStructure } from './structure.js'
import { createTurf } from './turf.js'



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

// scaun de stadion turnat din plastic: șezut, spătar curbat și picior
function chairGeometry(w = 0.46) {
  const seat = new THREE.BoxGeometry(w, 0.06, 0.38)
  seat.translate(0, 0.44, 0.06)
  const back = new THREE.CylinderGeometry(w * 0.62, w * 0.62, 0.42, 7, 1, true, Math.PI * 0.72, Math.PI * 0.56)
  back.scale(1, 1, 0.45)
  back.rotateX(-0.12)
  back.translate(0, 0.7, 0.02)
  const lip = new THREE.BoxGeometry(w * 0.96, 0.05, 0.05)
  lip.translate(0, 0.91, -0.13)
  const stem = new THREE.BoxGeometry(0.08, 0.42, 0.1)
  stem.translate(0, 0.21, -0.05)
  return mergeGeometries([seat, back, lip, stem].map((g) => g.toNonIndexed()))
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

  const concrete = new THREE.MeshStandardMaterial({ color: 0xa9adae, roughness: 0.92, side: THREE.DoubleSide })
  // beton turnat: variații fine și pete, calculate din poziție (geometria treptelor nu are UV)
  concrete.onBeforeCompile = (sh) => {
    sh.vertexShader = sh.vertexShader.replace('#include <common>', '#include <common>\nvarying vec3 vCw;').replace('#include <project_vertex>', '#include <project_vertex>\nvCw = (modelMatrix * vec4(transformed, 1.0)).xyz;')
    sh.fragmentShader = sh.fragmentShader.replace('#include <common>', `#include <common>
      varying vec3 vCw;
      float h3(vec3 p){ return fract(sin(dot(p, vec3(12.9898, 78.233, 37.719))) * 43758.5453); }
      float vn(vec3 p){ vec3 i = floor(p); vec3 f = fract(p); f = f*f*(3.0-2.0*f);
        return mix(mix(mix(h3(i), h3(i+vec3(1,0,0)), f.x), mix(h3(i+vec3(0,1,0)), h3(i+vec3(1,1,0)), f.x), f.y),
                   mix(mix(h3(i+vec3(0,0,1)), h3(i+vec3(1,0,1)), f.x), mix(h3(i+vec3(0,1,1)), h3(i+vec3(1,1,1)), f.x), f.y), f.z); }`)
      .replace('#include <map_fragment>', '#include <map_fragment>\n diffuseColor.rgb *= 0.86 + 0.1 * vn(vCw * 0.7) + 0.08 * vn(vCw * 6.0);')
  }
  const white = new THREE.MeshStandardMaterial({ color: 0xf1f3f5, roughness: 0.7, side: THREE.DoubleSide })
  const darkGlass = new THREE.MeshStandardMaterial({ color: 0x1d2a38, roughness: 0.15, metalness: 0.3 })
  const glass = new THREE.MeshStandardMaterial({
    color: 0x9fc4e6, roughness: 0.05, metalness: 0.1, transparent: true, opacity: 0.22, depthWrite: false, side: THREE.DoubleSide,
  })

  // ─── Terenul ───
  const pitch = createTurf({ lowSpec })
  root.add(pitch)

  // steagurile de corner
  for (const [x, z] of [[-34, -52.5], [34, -52.5], [-34, 52.5], [34, 52.5]]) {
    const stick = new THREE.Mesh(new THREE.CylinderGeometry(0.025, 0.025, 1.5, 6), new THREE.MeshStandardMaterial({ color: 0xffffff }))
    stick.position.set(x, 0.75, z)
    const flag = new THREE.Mesh(new THREE.PlaneGeometry(0.45, 0.32), new THREE.MeshStandardMaterial({ color: 0x0b57d0, side: THREE.DoubleSide }))
    flag.position.set(x + 0.22, 1.34, z)
    root.add(stick, flag)
  }

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

  // ─── Gradenele, acoperișul, fațada (vezi structure.js) ───
  const m4 = new THREE.Matrix4()
  const q4 = new THREE.Quaternion()
  const up = new THREE.Vector3(0, 1, 0)
  const structure = buildStructure(root, layout, { concrete, white, glass }, { lowSpec })
  Object.assign(out, { roofMat: structure.roofMat, shellInMat: structure.shellInMat, roofParts: structure.roofParts, shell: structure.shell })

  // ─── Locurile ───
  const seatMat = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.45, side: THREE.DoubleSide })
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
      // perete între loje în interior, separator jos pe terasă
      const g = new THREE.BoxGeometry(3, G.boxH, 0.12)
      g.translate(xFront - 4.5, b.floorY + G.boxH / 2, z)
      slabGeo.push(g)
      const lo = new THREE.BoxGeometry(3, 1.05, 0.06)
      lo.translate(xFront - 1.5, b.floorY + 0.52, z)
      slabGeo.push(lo)
    }
    // treapta pentru rândul 2
    const st = new THREE.BoxGeometry(2.2, 0.35, b.z1 - b.z0 - 0.2)
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
  glassFront.position.set(xFront - 3.05, WALK_Y + G.boxH, 0)
  block.add(glassFront)
  for (const lvl of [0, 1]) {
    const rail = new THREE.Mesh(new THREE.PlaneGeometry(bh * 2, 1.05), glass)
    rail.rotation.y = -Math.PI / 2
    rail.position.set(xFront - 0.05, WALK_Y + lvl * G.boxH + 0.52, 0)
    block.add(rail)
  }
  const mullGeo = []
  for (let z = -bh; z <= bh + 0.01; z += G.boxW / 2) {
    const g = new THREE.BoxGeometry(0.08, G.boxH * 2, 0.06)
    g.translate(xFront - 3.05, WALK_Y + G.boxH, z)
    mullGeo.push(g)
  }
  for (const y of [WALK_Y + 1.05, WALK_Y + G.boxH + 1.05]) {
    const g = new THREE.BoxGeometry(0.06, 0.06, bh * 2)
    g.translate(xFront - 3.0, y, 0)
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
    const g = new THREE.BoxGeometry(0.45, 0.06, 2 * PRESS_HALF - 0.4)
    g.translate(sx + 0.55, y + 0.74, 0)
    deskGeo.push(g)
    const st = new THREE.BoxGeometry(1.0, 0.45 * (r + 1) + 0.3, 2 * bh)
    st.translate(sx, y - (0.45 * (r + 1) + 0.3) / 2, 0)
    deskGeo.push(st)
  })
  const deskMesh = new THREE.Mesh(mergeGeometries(deskGeo), white)
  deskMesh.receiveShadow = true
  block.add(deskMesh)
  // centrul media din spatele presei și pereții laterali ai blocului
  const mediaTop = TOP_Y + 1.4
  const mediaX0 = xFront - (PRESS_D(PRESS_ROWS - 1) - D2(0)) - 1.6
  // blocul media urmează elipsa din spatele tribunelor
  const ellX = (z) => -(G.bowlBack.ax * Math.sqrt(Math.max(0, 1 - (z / G.bowlBack.az) ** 2)) + 0.3)
  const mShape = new THREE.Shape()
  mShape.moveTo(mediaX0, bh)
  mShape.lineTo(mediaX0, -bh)
  for (let k = 0; k <= 24; k++) {
    const z = -bh + (2 * bh * k) / 24
    mShape.lineTo(ellX(z), -z)
  }
  mShape.closePath()
  const mediaH = mediaTop - WALK_Y - 2 * G.boxH
  const mGeo = new THREE.ExtrudeGeometry(mShape, { depth: mediaH, bevelEnabled: false })
  mGeo.rotateX(-Math.PI / 2)
  mGeo.translate(0, WALK_Y + 2 * G.boxH, 0)
  const media = new THREE.Mesh(mGeo, white)
  media.castShadow = true
  block.add(media)
  // fațada vitrată a nivelurilor de hospitality și presă de deasupra lojelor
  const mediaTex = TX.glazingTexture()
  mediaTex.repeat.set((bh * 2) / 5, mediaH / 3.8)
  const mediaGlass = new THREE.Mesh(new THREE.PlaneGeometry(bh * 2 - 0.6, mediaH - 0.6), new THREE.MeshStandardMaterial({ map: mediaTex, roughness: 0.2, metalness: 0.4 }))
  mediaGlass.rotation.y = Math.PI / 2
  mediaGlass.position.set(mediaX0 + 0.03, WALK_Y + 2 * G.boxH + mediaH / 2, 0)
  block.add(mediaGlass)
  for (const s of [-1, 1]) {
    const len = -ellX(bh) - (G.hx + D2(0)) + 0.4
    const side = new THREE.Mesh(new THREE.BoxGeometry(len, mediaTop - WALK_Y, 0.3), white)
    side.position.set(xFront - len / 2, (mediaTop + WALK_Y) / 2, s * (bh + 0.15))
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
    canopy.position.set(-37.3, 0.05, z)
    root.add(canopy)
    const bench = new THREE.Mesh(new THREE.BoxGeometry(0.6, 0.5, 10.5), new THREE.MeshStandardMaterial({ color: 0x1b4fa0 }))
    bench.position.set(-37.9, 0.25, z)
    root.add(bench)
  }

  // panouri LED
  const ledTex = TX.ledTexture()
  const ledMat = new THREE.MeshStandardMaterial({ map: ledTex, emissive: 0xffffff, emissiveMap: ledTex, emissiveIntensity: 0.9 })
  const leds = [
    [37.4, 0, 96, -Math.PI / 2], [-36.6, 30, 28, Math.PI / 2], [-36.6, -30, 28, Math.PI / 2],
    [0, 55.6, 62, Math.PI], [0, -55.6, 62, 0],
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

  // ─── Zonele de selecție (invizibile) ───
  const proxyMat = new THREE.MeshBasicMaterial({ visible: false, side: THREE.DoubleSide })
  for (const s of layout.sectors) {
    const q = new Quads()
    const r2 = Math.max(...sectorBlocks(s).map((bl) => bl.rows))
    for (const ring of s.rings) {
      if (ring === 3) {
        strip(q, uRanges(s.u0, s.u1).map((r) => r.slice(0, 3)), PRESS_D(0) - 0.4, PRESS_Y(0) + 0.9, PRESS_D(PRESS_ROWS - 1) + 0.6, PRESS_Y(PRESS_ROWS - 1) + 1.1)
        continue
      }
      const n = ring === 1 ? G.ring1.rows : r2
      const f = ring === 1 ? D1(0) : D2(0)
      const b = ring === 1 ? D1(n) : D2(n)
      const y0 = (ring === 1 ? Y1(0) : Y2(0)) + 0.9
      const y1 = (ring === 1 ? Y1(n - 1) : Y2(n - 1)) + 1.1
      strip(q, uRanges(s.u0, s.u1).map((r) => r.slice(0, 3)), f, y0, b, y1)
    }
    const mesh = new THREE.Mesh(q.geometry(), proxyMat)
    mesh.userData = { sector: s.id }
    root.add(mesh)
    out.proxies.push(mesh)
  }
  for (const b of layout.boxes) {
    const mesh = new THREE.Mesh(new THREE.PlaneGeometry(b.z1 - b.z0 - 0.1, G.boxH - 0.1), proxyMat)
    mesh.rotation.y = -Math.PI / 2
    mesh.position.set(xFront - 0.05, b.floorY + G.boxH / 2, b.zc)
    mesh.userData = { box: b.id }
    root.add(mesh)
    out.proxies.push(mesh)
  }
  return out
}
