import * as THREE from 'three'
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js'
import {
  G, D1, Y1, D2, Y2, WALK_D, WALK_Y, sectorBlocks, uRanges, pointU, PRESS_Y, PRESS_J, PRESS_ROWS, boxFloorY, boxFrontD, UPPER_Y0,
  T1_HALF, T1_ROWS,
} from '../data/layout.js'
import * as TX from './textures.js'
import { Quads, strip } from './geom.js'
import { buildStructure } from './structure.js'
import { createTurf } from './turf.js'
import { createPitchLogos } from './pitch-logo.js'
import { COMPETITION, COMPETITION_ID } from '../data/stadium-data.js'



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

// scaunul simplificat pentru vederea de ansamblu (de la sute de metri): șezut și spătar, 4 triunghiuri
function chairLowGeometry(w = 0.46) {
  const g = new THREE.BufferGeometry()
  const h = w / 2
  const p = [
    -h, 0.44, -0.12, h, 0.44, -0.12, h, 0.46, 0.25, -h, 0.44, -0.12, h, 0.46, 0.25, -h, 0.46, 0.25,
    -h, 0.46, -0.14, h, 0.46, -0.14, h, 0.9, -0.2, -h, 0.46, -0.14, h, 0.9, -0.2, -h, 0.9, -0.2,
  ]
  g.setAttribute('position', new THREE.Float32BufferAttribute(p, 3))
  g.computeVertexNormals()
  return g
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
  // emblema competiției pictată pe gazon
  root.add(createPitchLogos(COMPETITION_ID, COMPETITION, { lowSpec }))

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
  const chairLow = chairLowGeometry()
  const vipChairLow = chairLowGeometry(0.5)
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
    mesh.userData = { sector: s.id, seatIdx: s.seatIdx, hi: mesh.geometry, lo: s.kind === 'vip' ? vipChairLow : chairLow }
    mesh.computeBoundingSphere()
    root.add(mesh)
    out.seatMeshes.set(s.id, mesh)
  }
  // detaliul scaunelor după vedere (de aproape: scaunul modelat; de departe: simplificat)
  out.setSeatDetail = (high) => {
    for (const m of out.seatMeshes.values()) m.geometry = high ? m.userData.hi : m.userData.lo
  }

  // ─── Zonele pentru persoane în scaun rulant (planul stadionului: 2 × 31, în fața Tribunei 2) ───
  {
    const pq = new Quads()
    const gq = new Quads()
    const top = Y1(1) + 0.02
    for (const z of layout.zones) {
      const rg = uRanges(z[0], z[1]).map((r) => r.slice(0, 3))
      strip(pq, rg, 0, top, D1(2), top)
      strip(pq, rg, -0.01, Y1(0), -0.01, top)
      strip(gq, rg, 0.06, top, 0.06, top + 1.05)
      for (const u of z) {
        const a = pointU(u, 0)
        const b = pointU(u, D1(2))
        pq.quad([a.x, Y1(0), a.z], [a.x, top, a.z], [b.x, top, b.z], [b.x, Y1(0), b.z])
      }
    }
    const plat = new THREE.Mesh(pq.geometry(), new THREE.MeshStandardMaterial({ color: 0xc9cccc, roughness: 0.85, side: THREE.DoubleSide }))
    plat.receiveShadow = true
    root.add(plat)
    root.add(new THREE.Mesh(gq.geometry(), glass))
    const wcIdx = layout.accessibleIdx
    const pad = new THREE.InstancedMesh(new THREE.PlaneGeometry(0.85, 1.2).rotateX(-Math.PI / 2), new THREE.MeshStandardMaterial({ map: TX.wheelchairTexture(), roughness: 0.7 }), wcIdx.length)
    wcIdx.forEach((i, k) => {
      const s = layout.seats[i]
      m4.compose(new THREE.Vector3(s.x, top + 0.01, s.z), q4.setFromAxisAngle(up, s.rot), new THREE.Vector3(1, 1, 1))
      pad.setMatrixAt(k, m4)
    })
    root.add(pad)
  }

  // ─── Tribuna 1: lounge-ul, lojele, presa ───
  // După fotografie: lounge-ul vitrat (cel mai lung), lojele nivel 1 și nivel 2, fiecare mai scurt
  // decât cel de dedesubt; rândurile sectoarelor 19 și 1 coboară pe lângă capete. Deasupra
  // nivelului 2 e un parapet alb, apoi G, presa și I pe aceeași pantă cu restul inelului de sus.
  const X = (d) => -(G.hx + d)
  const block = new THREE.Group()
  root.add(block)
  const slabGeo = []
  const carpetGeo = []
  const fasciaGeo = []
  const roofGeo = []
  const L0 = WALK_Y
  const L1 = boxFloorY(1)
  const L2 = boxFloorY(2)
  const LT = UPPER_Y0
  const [H0, H1, H2] = T1_HALF
  const BACK = 6.4 // adâncimea camerelor din spatele geamului
  const box = (w, h, d, x, y, z, list) => {
    const g = new THREE.BoxGeometry(w, h, d)
    g.translate(x, y, z)
    list.push(g)
  }
  const loungeD = D2(0) + 0.35
  const glass1 = boxFrontD(1) + 3.05
  const glass2 = boxFrontD(2) + 3.05
  // plăcile: acoperișul lounge-ului (podeaua lojelor 1), al lojelor 1 (podeaua lojelor 2) și al lojelor 2;
  // fiecare se termină în spate acolo unde începe primul rând de deasupra lui
  const slabs = [
    [L1, D2(0), D2(T1_ROWS[0]), H0],
    [L2, boxFrontD(2), D2(T1_ROWS[1]), H1],
    [LT, boxFrontD(2), D2(T1_ROWS[2]), H2],
  ]
  for (const [y, d0, d1, h] of slabs) {
    box(d1 - d0, 0.4, h * 2, X((d0 + d1) / 2), y - 0.2, 0, slabGeo)
    box(0.3, 0.55, h * 2, X(d0) - 0.15, y - 0.27, 0, fasciaGeo)
    // suprafața de beton a acoperișului (vizibilă de sus, între parapet și primul rând)
    box(d1 - d0 - 0.3, 0.03, h * 2 - 0.1, X((d0 + d1) / 2 + 0.15), y + 0.015, 0, roofGeo)
  }
  // sub nivelurile superioare, plăcile continuă până la gradenele din spate (camerele lojelor)
  box(D2(T1_ROWS[1]) - D2(T1_ROWS[0]), 0.4, H1 * 2, X((D2(T1_ROWS[0]) + D2(T1_ROWS[1])) / 2), L1 - 0.2, 0, slabGeo)
  box(D2(T1_ROWS[2]) - D2(T1_ROWS[1]), 0.4, H2 * 2, X((D2(T1_ROWS[1]) + D2(T1_ROWS[2])) / 2), L2 - 0.2, 0, slabGeo)
  // parapetul alb de deasupra lojelor de la nivelul 2 (în fotografie, linia albă sub scaunele de sus)
  box(0.3, 1.05, H2 * 2, X(boxFrontD(2)) - 0.15, LT + 0.52, 0, fasciaGeo)
  box(0.5, 0.08, H2 * 2, X(boxFrontD(2)) - 0.25, LT + 1.09, 0, fasciaGeo)
  // podeaua lounge-ului și pereții din spatele camerelor
  const warm = new THREE.MeshStandardMaterial({ color: 0x5f4a3a, roughness: 0.8 })
  const loungeFloor = new THREE.Mesh(new THREE.BoxGeometry(BACK, 0.05, H0 * 2), warm)
  loungeFloor.position.set(X(loungeD) - BACK / 2, L0 + 0.03, 0)
  block.add(loungeFloor)
  const inner = new THREE.MeshStandardMaterial({ color: 0xd9cfc2, roughness: 0.9 })
  for (const [y0, y1, d, h] of [[L0, L1, loungeD + BACK, H0], [L1, L2, glass1 + BACK - 2, H1], [L2, LT, glass2 + BACK - 2, H2]]) {
    const w = new THREE.Mesh(new THREE.BoxGeometry(0.2, y1 - y0, h * 2), inner)
    w.position.set(X(d), (y0 + y1) / 2, 0)
    block.add(w)
  }
  // tavane luminoase în lounge și în loje
  const ceilMat = new THREE.MeshStandardMaterial({ color: 0xfff6e8, emissive: 0xffe9c7, emissiveIntensity: 0.45 })
  for (const [y, d, h] of [[L1 - 0.42, loungeD, H0], [L2 - 0.42, glass1, H1], [LT - 0.42, glass2, H2]]) {
    const c = new THREE.Mesh(new THREE.BoxGeometry(BACK - 0.6, 0.04, h * 2 - 0.4), ceilMat)
    c.position.set(X(d) - BACK / 2, y, 0)
    block.add(c)
  }
  // lojele: pereți între loje, despărțitoare joase pe balcon, treapta pentru rândul 2
  for (const b of layout.boxes) {
    const glassD = b.frontD + 3.05
    for (const z of [b.z0, b.z1]) {
      box(BACK - 2, G.boxH - 0.4, 0.12, X(glassD) - (BACK - 2) / 2, b.floorY + (G.boxH - 0.4) / 2, z, slabGeo)
      box(3, 1.05, 0.06, X(b.frontD) - 1.5, b.floorY + 0.52, z, slabGeo)
    }
    box(1.3, 0.35, b.z1 - b.z0 - 0.2, X(b.frontD) - 2.45, b.floorY + 0.175, b.zc, carpetGeo)
    const fl = new THREE.Mesh(new THREE.BoxGeometry(BACK - 2, 0.05, b.z1 - b.z0), warm)
    fl.position.set(X(glassD) - (BACK - 2) / 2, b.floorY + 0.03, b.zc)
    block.add(fl)
  }
  // capetele în trepte ale nivelurilor: pereți albi care coboară până la gradenele vecine
  const rakeY = (d) => Y2(Math.max(0, Math.min(G.ring2.rows - 1, Math.floor((d - D2(0)) / G.depth + 1e-6))))
  const ends = [
    [H0, D2(0), D2(T1_ROWS[0]), () => L0, L1],
    [H1, D2(0), D2(T1_ROWS[1]), (d) => (d < D2(T1_ROWS[0]) ? L1 : rakeY(d)), L2],
    [H2, boxFrontD(2), D2(T1_ROWS[2]), (d) => (d < D2(T1_ROWS[1]) ? L2 : rakeY(d)), LT],
  ]
  for (const [h, d0, d1, botF, top] of ends) {
    // jos: treptele rândurilor care se opresc în perete (sau acoperișul nivelului de dedesubt)
    const bot = (d) => Math.max(botF(d), d >= D2(0) && h === H0 ? rakeY(d) : -1)
    const sh = new THREE.Shape()
    const pts = []
    for (let d = d0; d <= d1 + 1e-6; d += 0.1) pts.push([d, Math.min(top, bot(d))])
    pts.forEach(([d, y], k) => (k ? sh.lineTo(d, y) : sh.moveTo(d, y)))
    sh.lineTo(d1, top)
    sh.lineTo(d0, top)
    sh.closePath()
    for (const sd of [-1, 1]) {
      const g = new THREE.ShapeGeometry(sh)
      const p = g.attributes.position
      for (let i = 0; i < p.count; i++) p.setXYZ(i, X(p.getX(i)), p.getY(i), sd * (h + 0.02))
      g.computeVertexNormals()
      const end = new THREE.Mesh(g, new THREE.MeshStandardMaterial({ color: 0xf2f2ef, roughness: 0.7, side: THREE.DoubleSide }))
      end.castShadow = true
      end.receiveShadow = true
      block.add(end)
    }
  }
  const slabMesh = new THREE.Mesh(mergeGeometries(slabGeo), white)
  slabMesh.castShadow = true
  slabMesh.receiveShadow = true
  block.add(slabMesh)
  const fascia = new THREE.Mesh(mergeGeometries(fasciaGeo), new THREE.MeshStandardMaterial({ color: 0xe9eae7, roughness: 0.8 }))
  fascia.castShadow = true
  fascia.receiveShadow = true
  block.add(fascia)
  const roofMesh = new THREE.Mesh(mergeGeometries(roofGeo), new THREE.MeshStandardMaterial({ color: 0xb9bcbc, roughness: 0.95 }))
  roofMesh.receiveShadow = true
  block.add(roofMesh)
  block.add(new THREE.Mesh(mergeGeometries(carpetGeo), new THREE.MeshStandardMaterial({ color: 0x8e9499, roughness: 0.8 })))
  // fațadele vitrate: lounge, loje nivel 1, loje nivel 2 (cu montanți la 1,2 m)
  const mullGeo = []
  for (const [y0, y1, d, h] of [[L0, L1 - 0.4, loungeD, H0], [L1, L2 - 0.4, glass1, H1], [L2, LT - 0.4, glass2, H2]]) {
    const gp = new THREE.Mesh(new THREE.PlaneGeometry(h * 2, y1 - y0), glass)
    gp.rotation.y = -Math.PI / 2
    gp.position.set(X(d), (y0 + y1) / 2, 0)
    block.add(gp)
    for (let z = -h; z <= h + 0.01; z += 1.2) box(0.07, y1 - y0, 0.07, X(d), (y0 + y1) / 2, z, mullGeo)
    box(0.07, 0.07, h * 2, X(d), y0 + 0.05, 0, mullGeo)
    box(0.07, 0.07, h * 2, X(d), y1 - 0.05, 0, mullGeo)
  }
  // balustradele de sticlă ale balcoanelor (lojele 1 pe acoperișul lounge-ului, lojele 2 pe al lojelor 1)
  for (const [y, d, h] of [[L1, boxFrontD(1), H0], [L2, boxFrontD(2), H1]]) {
    const rail = new THREE.Mesh(new THREE.PlaneGeometry(h * 2, 1.0), glass)
    rail.rotation.y = -Math.PI / 2
    rail.position.set(X(d) - 0.08, y + 0.5, 0)
    block.add(rail)
    box(0.06, 0.06, h * 2, X(d) - 0.08, y + 1.02, 0, mullGeo)
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

  // tribuna presei (H): pe aceeași pantă, scaune din două în două rânduri, cu pupitre în față
  const press = layout.pressIdx.map((i) => layout.seats[i])
  const pressMesh = new THREE.InstancedMesh(chair, new THREE.MeshStandardMaterial({ color: 0x2b2f36, roughness: 0.6 }), press.length)
  press.forEach((s, k) => {
    place(pressMesh, k, s)
    out.seatRef[s.i] = { mesh: pressMesh, k }
  })
  block.add(pressMesh)
  const deskGeo = []
  const legGeo = []
  const [pz0, pz1] = layout.pressSpan
  const pw = pz1 - pz0 - 0.8
  for (let r = 0; r < PRESS_ROWS; r++) {
    const j = PRESS_J(r)
    const dRiser = D2(j)
    const yLow = Y2(j - 1)
    const top = PRESS_Y(r) + 0.74
    // blatul pupitrului cu o fâșie îngustă în față, pe rândul din fața scaunelor, și picioarele lui
    box(0.55, 0.05, pw, X(dRiser - 0.3), top, (pz0 + pz1) / 2, deskGeo)
    box(0.04, 0.22, pw, X(dRiser - 0.56), top - 0.09, (pz0 + pz1) / 2, deskGeo)
    for (let z = pz0 + 0.6; z < pz1 - 0.5; z += 2.4) box(0.06, top - yLow, 0.06, X(dRiser - 0.45), (top + yLow) / 2, z, legGeo)
  }
  block.add(new THREE.Mesh(mergeGeometries(legGeo), new THREE.MeshStandardMaterial({ color: 0x8d949b, metalness: 0.6, roughness: 0.35 })))
  const deskMesh = new THREE.Mesh(mergeGeometries(deskGeo), new THREE.MeshStandardMaterial({ color: 0x4a4f56, roughness: 0.55 }))
  deskMesh.receiveShadow = true
  deskMesh.castShadow = true
  block.add(deskMesh)
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
      const n = ring === 1 ? G.ring1.rows : r2
      const m = ring === 1 ? 0 : s.minRow || 0
      const f = ring === 1 ? D1(0) : D2(m)
      const b = ring === 1 ? D1(n) : D2(n)
      const y0 = (ring === 1 ? Y1(0) : Y2(m)) + 0.9
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
    mesh.position.set(X(b.frontD) - 0.05, b.floorY + G.boxH / 2, b.zc)
    mesh.userData = { box: b.id }
    root.add(mesh)
    out.proxies.push(mesh)
  }
  return out
}
