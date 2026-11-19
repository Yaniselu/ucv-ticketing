// Utilitare de geometrie comune pentru stadion
import * as THREE from 'three'
import { pathPoint } from '../data/layout.js'

export class Quads {
  constructor() { this.pos = [] }
  quad(a, b, c, d) { this.pos.push(...a, ...b, ...c, ...a, ...c, ...d) }
  geometry() {
    const g = new THREE.BufferGeometry()
    g.setAttribute('position', new THREE.Float32BufferAttribute(this.pos, 3))
    g.computeVertexNormals()
    return g
  }
}

export function samples(p, t0, t1) {
  const seg = p % 2 === 1 ? Math.max(2, Math.ceil(28 * (t1 - t0))) : 1
  const out = []
  for (let k = 0; k <= seg; k++) out.push(t0 + ((t1 - t0) * k) / seg)
  return out
}

export const P = (p, t, d, y) => {
  const q = pathPoint(p, t, d)
  return [q.x, y, q.z]
}

// bandă de-a lungul conturului între (d0, y0) și (d1, y1)
export function strip(q, ranges, d0, y0, d1, y1) {
  for (const [p, t0, t1] of ranges) {
    const ts = samples(p, t0, t1)
    for (let k = 0; k < ts.length - 1; k++) {
      q.quad(P(p, ts[k], d0, y0), P(p, ts[k], d1, y1), P(p, ts[k + 1], d1, y1), P(p, ts[k + 1], d0, y0))
    }
  }
}

// bandă verticală pe o elipsă (ax, az) între y0 și y1
export function ellipseBand(q, ax, az, y0, y1, n = 160) {
  for (let k = 0; k < n; k++) {
    const a = (k / n) * Math.PI * 2
    const b = ((k + 1) / n) * Math.PI * 2
    q.quad([ax * Math.cos(a), y0, az * Math.sin(a)], [ax * Math.cos(a), y1, az * Math.sin(a)], [ax * Math.cos(b), y1, az * Math.sin(b)], [ax * Math.cos(b), y0, az * Math.sin(b)])
  }
}

// inel orizontal între două elipse, la înălțimea y
export function ellipseRing(q, ax0, az0, ax1, az1, y, n = 160) {
  for (let k = 0; k < n; k++) {
    const a = (k / n) * Math.PI * 2
    const b = ((k + 1) / n) * Math.PI * 2
    q.quad([ax0 * Math.cos(a), y, az0 * Math.sin(a)], [ax1 * Math.cos(a), y, az1 * Math.sin(a)], [ax1 * Math.cos(b), y, az1 * Math.sin(b)], [ax0 * Math.cos(b), y, az0 * Math.sin(b)])
  }
}

// bară cilindrică între două puncte
const UP = new THREE.Vector3(0, 1, 0)
export function beam(a, b, r, radial = 6) {
  const va = new THREE.Vector3(...a)
  const vb = new THREE.Vector3(...b)
  const dir = vb.clone().sub(va)
  const len = dir.length()
  const g = new THREE.CylinderGeometry(r, r, len, radial, 1, true)
  g.applyQuaternion(new THREE.Quaternion().setFromUnitVectors(UP, dir.normalize()))
  g.translate((va.x + vb.x) / 2, (va.y + vb.y) / 2, (va.z + vb.z) / 2)
  return g.toNonIndexed()
}

export function ellipseCurve(ax, az, y, n = 128) {
  return new THREE.CatmullRomCurve3(
    Array.from({ length: n }, (_, k) => {
      const t = (k / n) * Math.PI * 2
      return new THREE.Vector3(ax * Math.cos(t), y, az * Math.sin(t))
    }),
    true,
  )
}
