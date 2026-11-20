// Cele trei trofee câștigate de Universitatea Craiova (tripla 2025–2026), modelate după fotografii:
// – Superliga (LPF, 2023): cupă cromată din panouri ușor răsucite, toarte unghiulare, talie
//   îngustă și bază conică închisă la culoare, cu inele;
// – Cupa României (trofeul din argint masiv oferit de Ion Țiriac): urnă cu caneluri, toarte în
//   volută cu cap de vultur, stema FRF în față, pe o minge de fotbal și un picior ornamentat;
// – Supercupa României: cupă de argint cu o minge aurie în față, toarte înalte, picior răsucit
//   și soclu negru. Unitatea de măsură: metri (trofeele au 0,58–0,70 m).
import * as THREE from 'three'
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js'

const mats = () => ({
  chrome: new THREE.MeshPhysicalMaterial({ color: 0xffffff, metalness: 1, roughness: 0.06, clearcoat: 1, clearcoatRoughness: 0.05 }),
  silver: new THREE.MeshPhysicalMaterial({ color: 0xe9ebee, metalness: 1, roughness: 0.16, clearcoat: 0.6, clearcoatRoughness: 0.12 }),
  darkChrome: new THREE.MeshPhysicalMaterial({ color: 0x2a2c30, metalness: 1, roughness: 0.12, clearcoat: 1 }),
  gold: new THREE.MeshPhysicalMaterial({ color: 0xffc94a, metalness: 1, roughness: 0.2, clearcoat: 0.8 }),
  goldLine: new THREE.MeshStandardMaterial({ color: 0x8a5a10, metalness: 1, roughness: 0.4 }),
  black: new THREE.MeshPhysicalMaterial({ color: 0x0c0c0e, metalness: 0.2, roughness: 0.25, clearcoat: 1 }),
})

// suprafață de revoluție dintr-un profil [raza, înălțimea], cu deformare opțională (r, θ, y) → r'
function lathe(profile, segs = 96, warp) {
  const pts = profile.map(([r, y]) => new THREE.Vector2(r, y))
  const g = new THREE.LatheGeometry(pts, segs)
  if (warp) {
    const p = g.attributes.position
    for (let i = 0; i < p.count; i++) {
      const x = p.getX(i)
      const z = p.getZ(i)
      const y = p.getY(i)
      const r = Math.hypot(x, z)
      if (r < 1e-6) continue
      const th = Math.atan2(z, x)
      const r2 = warp(r, th, y)
      p.setXYZ(i, (x / r) * r2, y, (z / r) * r2)
    }
    g.computeVertexNormals()
  }
  return g
}
const tube = (pts, r, seg = 64) => new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts.map(([x, y, z = 0]) => new THREE.Vector3(x, y, z)), false, 'catmullrom', 0.4), seg, r, 10, false)
function bar(a, b, w, t) {
  const va = new THREE.Vector3(...a)
  const vb = new THREE.Vector3(...b)
  const len = va.distanceTo(vb)
  const g = new THREE.BoxGeometry(w, len, t)
  g.applyQuaternion(new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), vb.clone().sub(va).normalize()))
  g.translate((va.x + vb.x) / 2, (va.y + vb.y) / 2, (va.z + vb.z) / 2)
  return g
}
// minge: sferă cu cusăturile unui dodecaedru proiectate pe ea
function ball(r, mat, lineMat) {
  const g = new THREE.Group()
  g.add(new THREE.Mesh(new THREE.SphereGeometry(r, 48, 32), mat))
  const edges = new THREE.EdgesGeometry(new THREE.DodecahedronGeometry(r, 0))
  const p = edges.attributes.position
  const seams = []
  for (let i = 0; i < p.count; i += 2) {
    const a = new THREE.Vector3(p.getX(i), p.getY(i), p.getZ(i))
    const b = new THREE.Vector3(p.getX(i + 1), p.getY(i + 1), p.getZ(i + 1))
    const pts = []
    for (let k = 0; k <= 8; k++) pts.push(a.clone().lerp(b, k / 8).setLength(r * 1.004))
    seams.push(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts), 8, r * 0.018, 4, false))
  }
  g.add(new THREE.Mesh(mergeGeometries(seams), lineMat))
  return g
}

export function superligaTrophy(M = mats()) {
  const g = new THREE.Group()
  // baza conică închisă la culoare, cu două inele cromate
  g.add(new THREE.Mesh(lathe([[0, 0], [0.128, 0], [0.13, 0.012], [0.112, 0.06], [0.07, 0.14], [0.045, 0.165], [0, 0.165]]), M.darkChrome))
  for (const [y, r] of [[0.03, 0.124], [0.1, 0.092]]) {
    const ring = new THREE.Mesh(new THREE.TorusGeometry(r, 0.003, 8, 96), M.chrome)
    ring.rotation.x = Math.PI / 2
    ring.position.y = y
    g.add(ring)
  }
  // talia
  g.add(new THREE.Mesh(lathe([[0, 0.16], [0.042, 0.165], [0.026, 0.185], [0.034, 0.2], [0.024, 0.215], [0.03, 0.235], [0, 0.235]]), M.chrome))
  // cupa: panouri verticale ușor răsucite (muchii ascuțite), deschisă sus
  const N = 9
  const bowl = lathe(
    [[0, 0.23], [0.03, 0.235], [0.05, 0.3], [0.075, 0.4], [0.1, 0.49], [0.122, 0.555], [0.13, 0.58], [0.124, 0.58], [0.116, 0.556], [0, 0.4]],
    N * 24,
    (r, th, y) => {
      const twist = (y - 0.23) * 2.2
      const f = ((((th + twist) * N) / (Math.PI * 2)) % 1 + 1) % 1
      return r * (1 + 0.075 * (1 - Math.abs(f - 0.5) * 2) - 0.03)
    },
  )
  g.add(new THREE.Mesh(bowl, M.chrome))
  // toartele: bare plate în triunghi, de la buză în afară și apoi în jos spre talie
  const hg = []
  for (const s of [-1, 1]) {
    hg.push(bar([s * 0.115, 0.555, 0], [s * 0.245, 0.555, 0], 0.014, 0.03))
    hg.push(bar([s * 0.245, 0.562, 0], [s * 0.05, 0.27, 0], 0.014, 0.03))
    hg.push(bar([s * 0.06, 0.29, 0], [s * 0.05, 0.25, 0], 0.014, 0.03))
  }
  g.add(new THREE.Mesh(mergeGeometries(hg.map((x) => x.toNonIndexed())), M.chrome))
  g.userData.height = 0.58
  return g
}

export function cupaRomanieiTrophy(M = mats()) {
  const g = new THREE.Group()
  // piciorul ornamentat
  g.add(new THREE.Mesh(lathe([[0, 0], [0.118, 0], [0.12, 0.012], [0.112, 0.022], [0.115, 0.03], [0.09, 0.045], [0.07, 0.07], [0.06, 0.085], [0.045, 0.092], [0, 0.092]], 96, (r, th, y) => (y > 0.03 && y < 0.07 ? r * (1 + 0.035 * Math.max(0, Math.cos(th * 24))) : r)), M.silver))
  // mingea de fotbal din argint
  const b = ball(0.052, M.silver, new THREE.MeshStandardMaterial({ color: 0x7a7f86, metalness: 1, roughness: 0.35 }))
  b.position.y = 0.142
  g.add(b)
  // tija cu nod
  g.add(new THREE.Mesh(lathe([[0, 0.185], [0.03, 0.188], [0.022, 0.205], [0.036, 0.22], [0.024, 0.236], [0.03, 0.245], [0, 0.245]]), M.silver))
  // urna: partea de jos cu caneluri, corpul bombat, umărul, gâtul și buza răsfrântă
  const urn = lathe(
    [[0, 0.24], [0.035, 0.245], [0.08, 0.29], [0.12, 0.36], [0.142, 0.43], [0.145, 0.48], [0.136, 0.54], [0.112, 0.6], [0.094, 0.635], [0.09, 0.655], [0.104, 0.68], [0.112, 0.695], [0.106, 0.698], [0.085, 0.66], [0, 0.6]],
    128,
    (r, th, y) => (y < 0.37 ? r * (1 + 0.05 * Math.pow(Math.abs(Math.cos(th * 12)), 0.6) * Math.min(1, (0.37 - y) / 0.04)) : r),
  )
  g.add(new THREE.Mesh(urn, M.silver))
  // brâie decorative
  for (const [y, r] of [[0.37, 0.126], [0.6, 0.113], [0.655, 0.092]]) {
    const ring = new THREE.Mesh(new THREE.TorusGeometry(r, 0.004, 8, 128), M.silver)
    ring.rotation.x = Math.PI / 2
    ring.position.y = y
    g.add(ring)
  }
  // stema FRF (scut în relief) pe față
  const shield = new THREE.Shape()
  shield.moveTo(-0.04, 0.045)
  shield.lineTo(0.04, 0.045)
  shield.lineTo(0.04, -0.005)
  shield.quadraticCurveTo(0.035, -0.035, 0, -0.05)
  shield.quadraticCurveTo(-0.035, -0.035, -0.04, -0.005)
  shield.closePath()
  const sh = new THREE.Mesh(new THREE.ExtrudeGeometry(shield, { depth: 0.006, bevelEnabled: true, bevelSize: 0.002, bevelThickness: 0.002, bevelSegments: 2 }), M.silver)
  sh.position.set(0, 0.47, 0.138)
  g.add(sh)
  // toartele în volută, cu cap de vultur sus
  for (const s of [-1, 1]) {
    const pts = [[0.088, 0.672], [0.13, 0.72], [0.17, 0.74], [0.205, 0.715], [0.215, 0.66], [0.2, 0.58], [0.175, 0.51], [0.15, 0.46]].map(([x, y]) => [s * x, y, 0])
    g.add(new THREE.Mesh(tube(pts, 0.011, 96), M.silver))
    const head = new THREE.Mesh(new THREE.SphereGeometry(0.02, 20, 14), M.silver)
    head.scale.set(1.2, 0.9, 0.8)
    head.position.set(s * 0.17, 0.75, 0)
    g.add(head)
    const beak = new THREE.Mesh(new THREE.ConeGeometry(0.009, 0.03, 10), M.silver)
    beak.rotation.z = s * 1.9
    beak.position.set(s * 0.145, 0.742, 0)
    g.add(beak)
  }
  g.userData.height = 0.76
  return g
}

export function supercupaTrophy(M = mats()) {
  const g = new THREE.Group()
  // soclul negru cu bandă argintie
  g.add(new THREE.Mesh(lathe([[0, 0], [0.11, 0], [0.112, 0.008], [0.108, 0.07], [0.1, 0.075], [0, 0.075]], 96), M.black))
  const band = new THREE.Mesh(new THREE.TorusGeometry(0.109, 0.004, 8, 96), M.silver)
  band.rotation.x = Math.PI / 2
  band.position.y = 0.06
  g.add(band)
  // piciorul răsucit
  g.add(new THREE.Mesh(lathe([[0, 0.075], [0.06, 0.075], [0.05, 0.1], [0.036, 0.16], [0.03, 0.24], [0.036, 0.29], [0.05, 0.31], [0, 0.31]], 96, (r, th, y) => r * (1 + 0.12 * Math.max(0, Math.cos(th * 6 + y * 18)))), M.silver))
  // cupa largă
  g.add(new THREE.Mesh(lathe([[0, 0.3], [0.05, 0.305], [0.11, 0.34], [0.15, 0.4], [0.168, 0.47], [0.168, 0.54], [0.175, 0.6], [0.168, 0.6], [0.16, 0.54], [0.0, 0.5]], 128), M.silver))
  // mingea aurie, încastrată în fața cupei, cu un inel de argint
  const b = ball(0.07, M.gold, M.goldLine)
  b.position.set(0, 0.47, 0.12)
  g.add(b)
  const ring = new THREE.Mesh(new THREE.TorusGeometry(0.078, 0.008, 12, 64), M.silver)
  ring.position.set(0, 0.47, 0.15)
  g.add(ring)
  // toartele înalte, subțiri
  for (const s of [-1, 1]) {
    const pts = [[0.07, 0.33], [0.16, 0.37], [0.215, 0.47], [0.225, 0.58], [0.205, 0.66], [0.17, 0.66], [0.165, 0.6]].map(([x, y]) => [s * x, y, 0])
    g.add(new THREE.Mesh(tube(pts, 0.008, 96), M.silver))
  }
  g.userData.height = 0.68
  return g
}

export function trebleGroup() {
  const M = mats()
  const group = new THREE.Group()
  const items = [
    [cupaRomanieiTrophy(M), -0.62, 0.0],
    [superligaTrophy(M), 0, 0.12],
    [supercupaTrophy(M), 0.62, 0.0],
  ]
  for (const [t, x, z] of items) {
    t.position.set(x, 0, z)
    group.add(t)
  }
  group.userData.items = items.map(([t]) => t)
  return group
}
