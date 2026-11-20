// Spectatorii de pe locurile deja vândute (afișați în vederea din scaun și în loje),
// ca imaginea să arate ca o fotografie reală din tribună în ziua meciului.
import * as THREE from 'three'
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js'
import { TAKEN, BLOCKED } from '../data/availability.js'

function personGeometry() {
  const parts = []
  const box = (w, h, d, x, y, z, rx = 0) => {
    const g = new THREE.BoxGeometry(w, h, d)
    if (rx) g.rotateX(rx)
    g.translate(x, y, z)
    parts.push(g.toNonIndexed())
  }
  box(0.4, 0.5, 0.24, 0, 0.78, -0.08, -0.08) // trunchi
  box(0.42, 0.14, 0.26, 0, 1.02, -0.1) // umeri
  box(0.36, 0.13, 0.42, 0, 0.52, 0.12) // coapse
  box(0.34, 0.46, 0.12, 0, 0.24, 0.33) // gambe
  box(0.09, 0.36, 0.1, -0.24, 0.74, 0.02, 0.5) // brațe
  box(0.09, 0.36, 0.1, 0.24, 0.74, 0.02, 0.5)
  return mergeGeometries(parts)
}

const SHIRTS_HOME = ['#1d4fb5', '#1d4fb5', '#2a62c9', '#f2f2f2', '#e9edf2', '#1b2440', '#232323', '#3a3f46', '#7b8088', '#0f3a8a', '#c9d3e0']
const SHIRTS_AWAY = ['#f4f4f4', '#ffffff', '#1d3e8a', '#232323', '#e6e6e6']
const SKIN = ['#e3b896', '#cf9f7c', '#f0cba9', '#b07d5c', '#d9ab88']
const HAIR = ['#2b2018', '#3b2a1d', '#151515', '#6b5137', '#8d8d8d', '#c9a46a']

export function buildCrowd(layout, status, { lowSpec = false, awaySector = layout.sectors.find((s) => s.away)?.id } = {}) {
  const list = []
  let seed = 77
  const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647)
  for (const s of layout.seats) {
    if (!['seat', 'vip', 'box', 'press'].includes(s.kind)) continue
    const st = status[s.i]
    const away = s.sector === awaySector
    let sit = st === TAKEN || (away && st === BLOCKED && rnd() < 0.78) || (s.kind === 'press' && rnd() < 0.35)
    if (!sit) continue
    if (lowSpec && rnd() < 0.5) continue
    list.push([s, away])
  }
  const body = new THREE.InstancedMesh(personGeometry(), new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.85 }), list.length)
  const head = new THREE.InstancedMesh(new THREE.SphereGeometry(0.105, 10, 8).translate(0, 1.2, -0.06), new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.7 }), list.length)
  const hair = new THREE.InstancedMesh(new THREE.SphereGeometry(0.11, 10, 6, 0, Math.PI * 2, 0, Math.PI * 0.55).translate(0, 1.215, -0.075), new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.9 }), list.length)
  const m4 = new THREE.Matrix4()
  const q = new THREE.Quaternion()
  const up = new THREE.Vector3(0, 1, 0)
  const c = new THREE.Color()
  list.forEach(([s, away], k) => {
    const sc = 0.92 + rnd() * 0.16
    const seatH = s.kind === 'box' ? 0.08 : 0
    m4.compose(new THREE.Vector3(s.x, s.y + seatH, s.z), q.setFromAxisAngle(up, s.rot + (rnd() - 0.5) * 0.25), new THREE.Vector3(sc, sc, sc))
    body.setMatrixAt(k, m4)
    head.setMatrixAt(k, m4)
    hair.setMatrixAt(k, m4)
    const pal = away ? SHIRTS_AWAY : s.kind === 'box' || s.kind === 'vip' || s.kind === 'press' ? ['#1f2430', '#2b3140', '#3d4350', '#f0f0f0', '#5a4636'] : SHIRTS_HOME
    body.setColorAt(k, c.set(pal[Math.floor(rnd() * pal.length)]))
    head.setColorAt(k, c.set(SKIN[Math.floor(rnd() * SKIN.length)]))
    hair.setColorAt(k, c.set(HAIR[Math.floor(rnd() * HAIR.length)]))
  })
  const g = new THREE.Group()
  g.add(body, head, hair)
  g.visible = false
  return g
}
