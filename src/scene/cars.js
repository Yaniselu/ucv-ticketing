// Mașinile parcate (în parcări, pe străzi și în parcarea de sub stadion): caroserie cu profil real
// (capotă, parbriz, plafon, hayon), geamuri închise la culoare, roți și faruri / stopuri.
// Toate sunt instanțiate: o mașină costă câteva sute de triunghiuri, oricâte ar fi.
import * as THREE from 'three'
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js'

export const CAR_COLORS = ['#f2f2f2', '#e8e8e8', '#1c1c1e', '#2a2d33', '#8d9196', '#b8bcc1', '#6f747a', '#1f3b6e', '#7a1f1f', '#3b4a3a', '#c9c3b5', '#24425f', '#9a9fa5', '#5c1a1a', '#d8d4c8']

// profilul lateral (x = lungimea, y = înălțimea), două variante: hatchback și sedan / break
const PROFILES = [
  [[-2.1, 0.34], [-2.16, 0.62], [-2.12, 0.92], [-1.96, 1.02], [-1.72, 1.4], [-1.45, 1.47], [0.12, 1.47], [0.42, 1.42], [1.02, 1.02], [1.86, 0.9], [2.1, 0.78], [2.16, 0.52], [2.08, 0.34]],
  [[-2.32, 0.36], [-2.38, 0.66], [-2.3, 0.94], [-1.82, 1.0], [-1.38, 1.4], [-1.05, 1.46], [0.32, 1.46], [0.64, 1.4], [1.22, 1.0], [2.08, 0.88], [2.34, 0.76], [2.4, 0.52], [2.3, 0.36]],
]
// geamurile: partea de sus a profilului, puțin mai jos de plafon
const GLASS = [
  [[-1.86, 1.03], [-1.66, 1.37], [-1.43, 1.43], [0.1, 1.43], [0.38, 1.38], [0.98, 1.03]],
  [[-1.76, 1.01], [-1.36, 1.37], [-1.05, 1.43], [0.3, 1.43], [0.6, 1.37], [1.18, 1.01]],
]
const WIDTH = 1.78

function bodyGeometry(v) {
  const sh = new THREE.Shape(PROFILES[v].map(([x, y]) => new THREE.Vector2(x, y)))
  const g = new THREE.ExtrudeGeometry(sh, { depth: WIDTH - 0.16, bevelEnabled: true, bevelThickness: 0.08, bevelSize: 0.06, bevelSegments: 1, curveSegments: 1 })
  g.translate(0, 0, -(WIDTH - 0.16) / 2)
  g.rotateY(-Math.PI / 2) // lungimea pe axa z (fața spre +z)
  return g.index ? g.toNonIndexed() : g
}

function glassGeometry(v) {
  const pts = GLASS[v]
  const sh = new THREE.Shape([...pts.map(([x, y]) => new THREE.Vector2(x, y))])
  const g = new THREE.ExtrudeGeometry(sh, { depth: WIDTH - 0.12, bevelEnabled: false })
  g.translate(0, 0, -(WIDTH - 0.12) / 2)
  // geamurile laterale se îngustează spre plafon (pavilionul e mai îngust decât caroseria)
  const p = g.attributes.position
  for (let i = 0; i < p.count; i++) {
    const y = p.getY(i)
    const k = 1 - Math.max(0, y - 1.03) * 0.28
    p.setZ(i, p.getZ(i) * k)
  }
  g.rotateY(-Math.PI / 2)
  g.computeVertexNormals()
  return g.index ? g.toNonIndexed() : g
}

function wheelGeometry(v) {
  const L = v ? 1.42 : 1.3
  const parts = []
  for (const sx of [-1, 1]) {
    for (const sz of [-L, L * 1.02]) {
      const w = new THREE.CylinderGeometry(0.32, 0.32, 0.22, 8, 1, true)
      w.rotateZ(Math.PI / 2)
      w.translate(sx * 0.76, 0.32, sz)
      parts.push(w.toNonIndexed())
    }
  }
  return mergeGeometries(parts)
}

// farurile (alb) și stopurile (roșu), cu culoarea în vârfuri
function lightGeometry(v) {
  const front = v ? 2.38 : 2.14
  const back = v ? -2.36 : -2.14
  const parts = []
  const col = (g, c) => {
    const n = g.attributes.position.count
    const a = new Float32Array(n * 3)
    for (let i = 0; i < n; i++) a.set(c, i * 3)
    g.setAttribute('color', new THREE.BufferAttribute(a, 3))
    return g
  }
  // fețe plane (2 triunghiuri fiecare), puțin în fața caroseriei
  const plane = (w, h, x, y, z, back) => {
    const g = new THREE.PlaneGeometry(w, h)
    if (back) g.rotateY(Math.PI)
    return g.translate(x, y, z).toNonIndexed()
  }
  for (const sx of [-1, 1]) {
    parts.push(col(plane(0.42, 0.13, sx * 0.6, 0.76, front + 0.02, false), [1, 0.97, 0.9]))
    parts.push(col(plane(0.36, 0.13, sx * 0.62, 0.86, back - 0.02, true), [0.75, 0.04, 0.03]))
  }
  // plăcuțele de înmatriculare
  parts.push(col(plane(0.52, 0.11, 0, 0.5, front + 0.025, false), [0.92, 0.92, 0.9]))
  parts.push(col(plane(0.52, 0.11, 0, 0.62, back - 0.025, true), [0.92, 0.92, 0.9]))
  return mergeGeometries(parts)
}

let shared = null
function sharedParts() {
  if (shared) return shared
  shared = {
    body: [bodyGeometry(0), bodyGeometry(1)],
    glass: [glassGeometry(0), glassGeometry(1)],
    wheel: [wheelGeometry(0), wheelGeometry(1)],
    light: [lightGeometry(0), lightGeometry(1)],
    bodyMat: new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.28, metalness: 0.55 }),
    glassMat: new THREE.MeshStandardMaterial({ color: 0x141b24, roughness: 0.06, metalness: 0.7 }),
    wheelMat: new THREE.MeshStandardMaterial({ color: 0x18191b, roughness: 0.85 }),
    lightMat: new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.3, emissive: 0x111111 }),
  }
  return shared
}

// cars: [x, y, z, unghi (rotație în jurul lui y; fața mașinii spre +z la 0)]
export function carMeshes(cars, { seed = 1, shadows = true } = {}) {
  const g = new THREE.Group()
  if (!cars.length) return g
  const S = sharedParts()
  let s = seed >>> 0 || 1
  const rnd = () => ((s = (s * 16807) % 2147483647) / 2147483647)
  const lists = [[], []]
  for (const c of cars) lists[rnd() < 0.55 ? 0 : 1].push(c)
  const m4 = new THREE.Matrix4()
  const q = new THREE.Quaternion()
  const up = new THREE.Vector3(0, 1, 0)
  const one = new THREE.Vector3(1, 1, 1)
  const col = new THREE.Color()
  lists.forEach((list, v) => {
    if (!list.length) return
    const meshes = [
      new THREE.InstancedMesh(S.body[v], S.bodyMat, list.length),
      new THREE.InstancedMesh(S.glass[v], S.glassMat, list.length),
      new THREE.InstancedMesh(S.wheel[v], S.wheelMat, list.length),
      new THREE.InstancedMesh(S.light[v], S.lightMat, list.length),
    ]
    list.forEach(([x, y, z, a], k) => {
      m4.compose(new THREE.Vector3(x, y, z), q.setFromAxisAngle(up, a), one)
      for (const m of meshes) m.setMatrixAt(k, m4)
      meshes[0].setColorAt(k, col.set(CAR_COLORS[Math.floor(rnd() * CAR_COLORS.length)]))
    })
    meshes[0].castShadow = shadows
    for (const m of meshes) {
      m.computeBoundingSphere()
      m.receiveShadow = false
      g.add(m)
    }
  })
  return g
}
