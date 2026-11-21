// Statuia lui Ion Oblemenco („Tunarul”) de pe Esplanada Stadionului: figura de bronz a jucătorului
// în echipament, cu piciorul drept pe minge, pe un soclu de granit cu placa cu numele.
// Figura e construită din volume netede (membre conice cu articulații sferice), la 1,3 × mărimea reală.
import * as THREE from 'three'
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js'

const UP = new THREE.Vector3(0, 1, 0)

// segment de membru: trunchi de con între a (raza ra) și b (raza rb), cu sferă la capătul b
function limb(parts, a, b, ra, rb, { joint = true, seg = 14 } = {}) {
  const va = new THREE.Vector3(...a)
  const vb = new THREE.Vector3(...b)
  const dir = vb.clone().sub(va)
  const len = dir.length()
  const g = new THREE.CylinderGeometry(rb, ra, len, seg, 3, true)
  g.applyQuaternion(new THREE.Quaternion().setFromUnitVectors(UP, dir.normalize()))
  g.translate((va.x + vb.x) / 2, (va.y + vb.y) / 2, (va.z + vb.z) / 2)
  parts.push(g.toNonIndexed())
  if (joint) parts.push(new THREE.SphereGeometry(rb, seg, 8).translate(vb.x, vb.y, vb.z).toNonIndexed())
}
function blob(parts, c, r, s = [1, 1, 1], seg = 16) {
  parts.push(new THREE.SphereGeometry(r, seg, Math.max(8, seg * 0.6)).scale(...s).translate(...c).toNonIndexed())
}

function figure() {
  const P = []
  // picioarele: stângul de sprijin, dreptul pe minge
  const hipL = [-0.095, 0.93, 0]
  const kneeL = [-0.115, 0.5, 0.025]
  const ankL = [-0.12, 0.085, 0]
  const hipR = [0.095, 0.93, 0]
  const kneeR = [0.17, 0.63, 0.2]
  const ankR = [0.16, 0.31, 0.29]
  limb(P, hipL, kneeL, 0.098, 0.062)
  limb(P, kneeL, ankL, 0.062, 0.04)
  limb(P, hipR, kneeR, 0.098, 0.062)
  limb(P, kneeR, ankR, 0.062, 0.04)
  // mușchii gambei
  blob(P, [-0.118, 0.36, -0.012], 0.058, [0.95, 1.9, 1.05])
  blob(P, [0.166, 0.5, 0.215], 0.058, [0.95, 1.8, 1.05])
  // jambierele / jambierele cu apărătoare (puțin mai groase pe gambă)
  limb(P, [-0.115, 0.46, 0.03], [-0.12, 0.17, 0.005], 0.054, 0.042, { joint: false })
  limb(P, [0.168, 0.6, 0.205], [0.161, 0.38, 0.275], 0.054, 0.042, { joint: false })
  // ghetele
  blob(P, [-0.12, 0.05, 0.06], 0.06, [0.75, 0.55, 1.75])
  blob(P, [0.16, 0.27, 0.36], 0.06, [0.75, 0.55, 1.75])
  // mingea sub piciorul drept, cu cusăturile marcate de relief
  const ball = new THREE.IcosahedronGeometry(0.11, 3)
  ball.translate(0.16, 0.11, 0.4)
  P.push(ball)
  // șortul: două tuburi evazate + bazinul
  limb(P, [-0.1, 0.99, 0], [-0.118, 0.73, 0.012], 0.112, 0.112, { joint: false })
  limb(P, [0.1, 0.99, 0], [0.14, 0.75, 0.1], 0.112, 0.112, { joint: false })
  blob(P, [0, 0.98, 0], 0.18, [1.02, 0.66, 0.76])
  // trunchiul (strung cu secțiune eliptică): talia, pieptul, umerii
  const prof = [[0.0, 0.9], [0.165, 0.92], [0.17, 1.0], [0.168, 1.1], [0.185, 1.22], [0.205, 1.33], [0.212, 1.41], [0.16, 1.47], [0.075, 1.505], [0.0, 1.515]]
  const torso = new THREE.LatheGeometry(prof.map(([r, y]) => new THREE.Vector2(r, y)), 24)
  torso.scale(1, 1, 0.7)
  P.push(torso.toNonIndexed())
  // umerii rotunjiți
  blob(P, [-0.2, 1.42, 0], 0.075)
  blob(P, [0.2, 1.42, 0], 0.075)
  // brațul stâng relaxat, dreptul cu mâna în șold
  const shL = [-0.21, 1.42, 0]
  const elL = [-0.27, 1.14, -0.02]
  const wrL = [-0.285, 0.9, 0.05]
  const shR = [0.21, 1.42, 0]
  const elR = [0.34, 1.19, -0.07]
  const wrR = [0.2, 1.0, 0.01]
  limb(P, shL, elL, 0.064, 0.048)
  limb(P, elL, wrL, 0.05, 0.036)
  limb(P, shR, elR, 0.064, 0.048)
  limb(P, elR, wrR, 0.05, 0.036)
  // mânecile scurte ale tricoului
  limb(P, [-0.205, 1.43, 0], [-0.24, 1.29, -0.01], 0.085, 0.074, { joint: false })
  limb(P, [0.205, 1.43, 0], [0.27, 1.3, -0.03], 0.085, 0.074, { joint: false })
  // gulerul tricoului
  limb(P, [0, 1.49, 0.0], [0, 1.53, 0.01], 0.07, 0.062, { joint: false })
  // palmele
  blob(P, [-0.29, 0.84, 0.06], 0.045, [0.6, 1.25, 0.9])
  blob(P, [0.18, 0.98, 0.03], 0.045, [0.9, 0.7, 1.1])
  // gâtul și capul (cu păr, nas, urechi, bărbie)
  limb(P, [0, 1.49, 0], [0, 1.6, 0.01], 0.05, 0.046, { joint: false })
  blob(P, [0, 1.69, 0.015], 0.106, [0.88, 1.13, 1.0], 20)
  blob(P, [0, 1.73, -0.012], 0.103, [0.92, 0.95, 1.02], 20) // părul
  blob(P, [0, 1.665, 0.105], 0.018, [0.8, 1.4, 1]) // nasul
  blob(P, [-0.088, 1.68, 0.0], 0.022, [0.5, 1.2, 0.9])
  blob(P, [0.088, 1.68, 0.0], 0.022, [0.5, 1.2, 0.9])
  blob(P, [0, 1.6, 0.07], 0.04, [1.1, 0.7, 0.9]) // bărbia
  // normalele netede ale fiecărei piese rămân (fără recalculare pe fețe)
  return mergeGeometries(P)
}

function plaqueTexture() {
  const c = document.createElement('canvas')
  c.width = 512
  c.height = 384
  const g = c.getContext('2d')
  g.fillStyle = '#2a2b2d'
  g.fillRect(0, 0, 512, 384)
  // granit lustruit, cu granulație
  for (let k = 0; k < 9000; k++) {
    g.fillStyle = `rgba(${Math.random() < 0.5 ? '255,255,255' : '0,0,0'},${Math.random() * 0.18})`
    g.fillRect(Math.random() * 512, Math.random() * 384, 1.5, 1.5)
  }
  g.strokeStyle = '#b89a5a'
  g.lineWidth = 4
  g.strokeRect(22, 22, 468, 340)
  g.fillStyle = '#d2b26b'
  g.textAlign = 'center'
  g.font = '700 70px "Barlow Condensed", "Arial Narrow", serif'
  g.fillText('ION OBLEMENCO', 256, 140)
  g.font = '600 44px "Barlow Condensed", "Arial Narrow", serif'
  g.fillText('1945 – 1996', 256, 210)
  g.font = 'italic 600 40px "Barlow Condensed", "Arial Narrow", serif'
  g.fillText('„Tunarul”', 256, 290)
  const t = new THREE.CanvasTexture(c)
  t.colorSpace = THREE.SRGBColorSpace
  t.anisotropy = 8
  return t
}

export function buildStatue() {
  const g = new THREE.Group()
  g.name = 'statuia-oblemenco'
  const granite = new THREE.MeshStandardMaterial({ color: 0xbdbbb6, roughness: 0.55, metalness: 0.05 })
  const dark = new THREE.MeshStandardMaterial({ color: 0x3a3b3d, roughness: 0.3, metalness: 0.1 })
  // soclul: treaptă, corp, cornișă
  const base = new THREE.Mesh(new THREE.BoxGeometry(2.6, 0.35, 2.6).translate(0, 0.175, 0), granite)
  const base2 = new THREE.Mesh(new THREE.BoxGeometry(2.0, 0.3, 2.0).translate(0, 0.5, 0), granite)
  const body = new THREE.Mesh(new THREE.BoxGeometry(1.45, 2.3, 1.45).translate(0, 0.65 + 1.15, 0), granite)
  const cap = new THREE.Mesh(new THREE.BoxGeometry(1.7, 0.22, 1.7).translate(0, 2.95 + 0.11, 0), granite)
  for (const m of [base, base2, body, cap]) {
    m.castShadow = true
    m.receiveShadow = true
    g.add(m)
  }
  // placa din față (spre bulevard)
  const plaque = new THREE.Mesh(new THREE.PlaneGeometry(1.1, 0.82), new THREE.MeshStandardMaterial({ map: plaqueTexture(), roughness: 0.25, metalness: 0.2 }))
  plaque.position.set(0, 1.85, 0.738)
  g.add(plaque)
  const plaqueFrame = new THREE.Mesh(new THREE.BoxGeometry(1.16, 0.88, 0.02).translate(0, 1.85, 0.722), dark)
  g.add(plaqueFrame)
  // statuia de bronz, cu patină
  const bronze = new THREE.MeshStandardMaterial({ color: 0x6a4c2b, metalness: 0.9, roughness: 0.4 })
  bronze.onBeforeCompile = (sh) => {
    sh.vertexShader = sh.vertexShader.replace('#include <common>', '#include <common>\nvarying vec3 vObjN;').replace('#include <beginnormal_vertex>', '#include <beginnormal_vertex>\nvObjN = normal;')
    sh.fragmentShader = sh.fragmentShader.replace('#include <common>', '#include <common>\nvarying vec3 vObjN;').replace(
      '#include <color_fragment>',
      `#include <color_fragment>
      // patina verzuie în adâncituri și pe fețele orientate în jos, bronz lustruit pe muchii
      float down = clamp(-vObjN.y, 0.0, 1.0);
      diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.28, 0.36, 0.3), down * 0.45);`,
    )
  }
  bronze.customProgramCacheKey = () => 'bronze-patina-v1'
  const fig = new THREE.Mesh(figure(), bronze)
  fig.scale.setScalar(1.3)
  fig.position.y = 3.06
  fig.castShadow = true
  g.add(fig)
  return g
}
