// Desenul traseului spre loc: o bandă luminoasă cu săgeți care curg în sensul de mers (afară, pe
// străzi și pe podium, mai lată; înăuntru, mai subțire), o copie „prin pereți” mai ștearsă pentru
// porțiunile ascunse (coridoarele din interior, tunelul vomitorului), repere numerotate pentru
// fiecare pas și un punct care parcurge traseul.
import * as THREE from 'three'
import { precinctSurface } from './precinct.js'

const COLOR = 0x13c8ff

function arrowTexture() {
  const c = document.createElement('canvas')
  c.width = 128
  c.height = 32
  const g = c.getContext('2d')
  g.fillStyle = '#13c8ff'
  g.fillRect(0, 0, 128, 32)
  g.strokeStyle = '#ffffff'
  g.lineWidth = 7
  g.lineJoin = 'round'
  for (const x0 of [22, 86]) {
    g.beginPath()
    g.moveTo(x0, 4)
    g.lineTo(x0 + 18, 16)
    g.lineTo(x0, 28)
    g.stroke()
  }
  const t = new THREE.CanvasTexture(c)
  t.colorSpace = THREE.SRGBColorSpace
  t.wrapS = t.wrapT = THREE.RepeatWrapping
  t.anisotropy = 4
  return t
}

function pinTexture(label) {
  const c = document.createElement('canvas')
  c.width = c.height = 96
  const g = c.getContext('2d')
  g.fillStyle = 'rgba(8,24,52,0.35)'
  g.beginPath()
  g.arc(48, 50, 40, 0, Math.PI * 2)
  g.fill()
  g.fillStyle = '#13c8ff'
  g.strokeStyle = '#ffffff'
  g.lineWidth = 7
  g.beginPath()
  g.arc(48, 46, 36, 0, Math.PI * 2)
  g.fill()
  g.stroke()
  g.fillStyle = '#ffffff'
  g.font = '800 44px Inter, Arial, sans-serif'
  g.textAlign = 'center'
  g.textBaseline = 'middle'
  g.fillText(label, 48, 48)
  const t = new THREE.CanvasTexture(c)
  t.colorSpace = THREE.SRGBColorSpace
  return t
}

// linia frântă → tub de-a lungul ei (UV.x = metri / 3, pentru săgeți)
function tube(points, radius) {
  const path = new THREE.CurvePath()
  let len = 0
  for (let k = 1; k < points.length; k++) {
    const a = points[k - 1]
    const b = points[k]
    if (a.distanceTo(b) < 0.05) continue
    path.add(new THREE.LineCurve3(a, b))
    len += a.distanceTo(b)
  }
  if (!path.curves.length) return { geo: null, len: 0 }
  const geo = new THREE.TubeGeometry(path, Math.min(4000, Math.max(8, Math.ceil(len / 0.8))), radius, 6, false)
  const uv = geo.attributes.uv
  for (let i = 0; i < uv.count; i++) uv.setX(i, (uv.getX(i) * len) / 3)
  return { geo, len, path }
}

export function createRouteView(scene) {
  const group = new THREE.Group()
  group.name = 'route'
  group.visible = false
  scene.add(group)
  const map = arrowTexture()
  const solid = new THREE.MeshBasicMaterial({ map, toneMapped: false })
  const ghost = new THREE.MeshBasicMaterial({ color: COLOR, transparent: true, opacity: 0.32, depthTest: false, depthWrite: false, toneMapped: false })
  const walker = new THREE.Mesh(new THREE.SphereGeometry(0.55, 16, 12), new THREE.MeshBasicMaterial({ color: 0xffffff, toneMapped: false }))
  walker.renderOrder = 1001
  walker.material.depthTest = false
  let paths = []
  let total = 0
  let pins = []

  // punctele de afară primesc înălțimea suprafeței (stradă, scări, esplanadă, podium)
  function outdoorPoints(flat) {
    const out = []
    for (let k = 0; k < flat.length; k++) {
      const [x, z] = flat[k]
      if (k) {
        const [x0, z0] = flat[k - 1]
        const n = Math.ceil(Math.hypot(x - x0, z - z0) / 1.2)
        for (let s = 1; s < n; s++) {
          const xx = x0 + ((x - x0) * s) / n
          const zz = z0 + ((z - z0) * s) / n
          out.push(new THREE.Vector3(xx, (precinctSurface(xx, zz)?.y ?? 0) + 0.35, zz))
        }
      }
      out.push(new THREE.Vector3(x, (precinctSurface(x, z)?.y ?? 0) + 0.35, z))
    }
    return out
  }

  function clear() {
    for (const o of [...group.children]) {
      group.remove(o)
      if (o.geometry && o !== walker) o.geometry.dispose()
      if (o.material?.map && pins.includes(o)) {
        o.material.map.dispose()
        o.material.dispose()
      }
    }
    paths = []
    pins = []
    total = 0
  }

  function show(plan) {
    clear()
    const outPts = outdoorPoints(plan.outdoor)
    const inPts = plan.indoor.map(([x, y, z]) => new THREE.Vector3(x, y, z))
    for (const [pts, r] of [[outPts, 0.5], [inPts, 0.2]]) {
      const { geo, len, path } = tube(pts, r)
      if (!geo) continue
      const m = new THREE.Mesh(geo, solid)
      m.renderOrder = 5
      const g = new THREE.Mesh(geo, ghost)
      g.renderOrder = 1000
      group.add(m, g)
      paths.push({ path, len })
      total += len
    }
    plan.steps.forEach((s, k) => {
      const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: pinTexture(String(k + 1)), depthTest: false, depthWrite: false, sizeAttenuation: false, toneMapped: false }))
      sp.scale.set(0.036, 0.036, 1)
      sp.center.set(0.5, 0.15)
      sp.position.set(s.at[0], s.at[1] + 0.6, s.at[2])
      sp.renderOrder = 1002
      group.add(sp)
      pins.push(sp)
    })
    group.add(walker)
    group.visible = true
  }

  function hide() {
    group.visible = false
    clear()
  }

  // animația: săgețile curg, punctul alb parcurge traseul (≈ 18 m/s, ca să se vadă tot drumul)
  function update(dt, now) {
    if (!group.visible || !total) return false
    map.offset.x -= dt * 0.9
    const s = ((now / 1000) * 18) % total
    let acc = 0
    for (const p of paths) {
      if (s <= acc + p.len) {
        walker.position.copy(p.path.getPointAt(Math.min(1, (s - acc) / p.len)))
        break
      }
      acc += p.len
    }
    return true
  }

  // încadrarea camerei pe o porțiune a traseului
  function bounds(which, plan) {
    const b = new THREE.Box3()
    const pts = which === 'out' ? outdoorPoints(plan.outdoor) : plan.indoor.map(([x, y, z]) => new THREE.Vector3(x, y, z))
    for (const p of pts) b.expandByPoint(p)
    return b
  }

  return { show, hide, update, bounds, get visible() { return group.visible } }
}
