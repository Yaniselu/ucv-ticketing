// Cele trei trofee ale triplei 2025–2026, modelate după fotografiile din galeria clubului și din
// presă (proporțiile sunt măsurate pe fotografii, la dimensiunile oficiale):
// – Superliga (LPF, Monetăria Statului, 58 cm, 5,2 kg): cupă conică din panouri concave răsucite,
//   toarte plate (bandă) din buză spre picior, gât îngust cu nod, bază conică închisă la culoare
//   cu două inele și sigla LPF, emblema Superligii gravată sub buză;
// – Cupa României (trofeul din argint masiv oferit de Ion Țiriac): urnă cu buza răsfrântă, brâu de
//   perle pe umăr, corp ovoid cu stema FRF în relief, caneluri în evantai sub corp, mingea de
//   fotbal pe picior între două gulere, piciorul cu caneluri și perle, soclu octogonal de lemn;
//   toartele sunt aripi de vultur, cu capul la buză;
// – Supercupa României (FRF, 70 cm, 6 kg, alamă argintată): cupă înaltă cu o fereastră rotundă
//   în față în care stă mingea aurie, toarte din tijă subțire care urcă peste buză și coboară
//   până la picior, picior răsucit, disc argintiu și soclu negru.
import * as THREE from 'three'
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js'

const LOGOS = import.meta.glob('../assets/logos/*.png', { eager: true, query: '?url', import: 'default' })
const logoUrl = (id) => Object.entries(LOGOS).find(([p]) => p.endsWith(`/${id}.png`))?.[1]

// urmele fine de strunjire / lustruire de pe metal (dungi circulare, pe direcția u a strungului):
// rugozitatea variază ușor, iar reflexiile nu mai par „de calculator”
let brushed = null
function brushedMap() {
  if (brushed) return brushed
  const c = document.createElement('canvas')
  c.width = 1024
  c.height = 512
  const g = c.getContext('2d')
  g.fillStyle = 'rgb(150,150,150)'
  g.fillRect(0, 0, 1024, 512)
  let s = 11
  const rnd = () => ((s = (s * 16807) % 2147483647) / 2147483647)
  for (let k = 0; k < 2600; k++) {
    const y = rnd() * 512
    const v = 90 + rnd() * 150
    g.strokeStyle = `rgba(${v},${v},${v},${0.25 + rnd() * 0.4})`
    g.lineWidth = 0.6 + rnd() * 1.2
    const x = rnd() * 1024
    const L = 80 + rnd() * 600
    g.beginPath()
    g.moveTo(x, y)
    g.lineTo(x + L, y + (rnd() - 0.5) * 2)
    g.stroke()
  }
  // câteva zgârieturi fine, în alte direcții
  for (let k = 0; k < 90; k++) {
    const x = rnd() * 1024, y = rnd() * 512, a = rnd() * Math.PI, L = 10 + rnd() * 60
    g.strokeStyle = `rgba(230,230,230,${0.3 + rnd() * 0.3})`
    g.lineWidth = 0.7
    g.beginPath()
    g.moveTo(x, y)
    g.lineTo(x + Math.cos(a) * L, y + Math.sin(a) * L)
    g.stroke()
  }
  brushed = new THREE.CanvasTexture(c)
  brushed.wrapS = brushed.wrapT = THREE.RepeatWrapping
  brushed.repeat.set(3, 2)
  brushed.anisotropy = 8
  return brushed
}

function mats() {
  const loader = new THREE.TextureLoader()
  const rm = brushedMap()
  const silver = new THREE.MeshPhysicalMaterial({ color: 0xf4f5f7, metalness: 1, roughness: 0.16, roughnessMap: rm, clearcoat: 0.7, clearcoatRoughness: 0.08 })
  return {
    silver,
    chrome: new THREE.MeshPhysicalMaterial({ color: 0xffffff, metalness: 1, roughness: 0.075, roughnessMap: rm, clearcoat: 1, clearcoatRoughness: 0.03 }),
    satin: new THREE.MeshPhysicalMaterial({ color: 0xd9dce0, metalness: 1, roughness: 0.32 }),
    engrave: new THREE.MeshStandardMaterial({ color: 0x80868e, metalness: 1, roughness: 0.55 }),
    brass: new THREE.MeshPhysicalMaterial({ color: 0xd8b45a, metalness: 1, roughness: 0.22, roughnessMap: rm, clearcoat: 0.6 }),
    gunmetal: new THREE.MeshPhysicalMaterial({ color: 0x3b3e44, metalness: 1, roughness: 0.14, clearcoat: 1, clearcoatRoughness: 0.05 }),
    gold: new THREE.MeshPhysicalMaterial({ color: 0xffc23a, metalness: 1, roughness: 0.16, clearcoat: 0.9, clearcoatRoughness: 0.08 }),
    goldDark: new THREE.MeshStandardMaterial({ color: 0x7a4f0c, metalness: 1, roughness: 0.35 }),
    blackGloss: new THREE.MeshPhysicalMaterial({ color: 0x0a0a0c, metalness: 0.1, roughness: 0.18, clearcoat: 1, clearcoatRoughness: 0.04 }),
    wood: new THREE.MeshPhysicalMaterial({ color: 0x2a1a12, roughness: 0.35, clearcoat: 0.8, clearcoatRoughness: 0.15 }),
    seam: new THREE.MeshStandardMaterial({ color: 0x8b9096, metalness: 1, roughness: 0.4 }),
    loader,
  }
}

// ─── geometrie ───────────────────────────────────────────────────────
// suprafață de revoluție dintr-un profil [r, y]; warp(r, θ, y, t) → r' pentru caneluri, panouri, răsucire
function lathe(profile, segs = 128, warp, rows = 0) {
  // profilul e eșantionat des (rows) ca deformările să fie netede pe verticală
  let pts = profile.map(([r, y]) => new THREE.Vector2(r, y))
  if (rows) {
    const c = new THREE.SplineCurve(pts)
    pts = c.getSpacedPoints(rows)
  }
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
  }
  g.computeVertexNormals()
  return g
}
const ring = (r, tube, y, mat, seg = 160) => {
  const m = new THREE.Mesh(new THREE.TorusGeometry(r, tube, 12, seg), mat)
  m.rotation.x = Math.PI / 2
  m.position.y = y
  return m
}
// șir de perle (sfere mici) pe un cerc
function beads(r, y, n, size, mat) {
  const g = new THREE.SphereGeometry(size, 12, 9)
  const m = new THREE.InstancedMesh(g, mat, n)
  const m4 = new THREE.Matrix4()
  for (let k = 0; k < n; k++) {
    const a = (k / n) * Math.PI * 2
    m4.makeTranslation(r * Math.cos(a), y, r * Math.sin(a))
    m.setMatrixAt(k, m4)
  }
  return m
}
// tub cu secțiune eliptică variabilă de-a lungul unei curbe din planul XY:
// w(t) = lățimea în plan (perpendicular pe curbă), d(t) = grosimea pe Z
function sweep(points, w, d, seg = 120, radial = 14) {
  const curve = new THREE.CatmullRomCurve3(points.map(([x, y, z = 0]) => new THREE.Vector3(x, y, z)), false, 'centripetal')
  const pos = []
  const uv = []
  const idx = []
  const Z = new THREE.Vector3(0, 0, 1)
  for (let i = 0; i <= seg; i++) {
    const t = i / seg
    const p = curve.getPointAt(t)
    const tan = curve.getTangentAt(t)
    const nrm = new THREE.Vector3().crossVectors(Z, tan).normalize() // în plan, perpendicular pe curbă
    const ww = w(t) / 2
    const dd = d(t) / 2
    for (let j = 0; j <= radial; j++) {
      const a = (j / radial) * Math.PI * 2
      const v = p.clone().addScaledVector(nrm, Math.cos(a) * ww).addScaledVector(Z, Math.sin(a) * dd)
      pos.push(v.x, v.y, v.z)
      uv.push(t, j / radial)
    }
  }
  for (let i = 0; i < seg; i++) {
    for (let j = 0; j < radial; j++) {
      const a = i * (radial + 1) + j
      const b = a + radial + 1
      idx.push(a, b, a + 1, b, b + 1, a + 1)
    }
  }
  const g = new THREE.BufferGeometry()
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3))
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2))
  g.setIndex(idx)
  g.computeVertexNormals()
  return g
}
// minge de fotbal: sferă cu cusăturile unui icosaedru trunchiat (pentagoane + hexagoane) în relief
function football(r, mat, seamMat, { pentMat = null } = {}) {
  const g = new THREE.Group()
  g.add(new THREE.Mesh(new THREE.SphereGeometry(r, 64, 48), mat))
  // vârfurile icosaedrului = centrele pentagoanelor; cusăturile = laturile icosaedrului trunchiat
  const ico = new THREE.IcosahedronGeometry(1, 0)
  const p = ico.attributes.position
  const verts = []
  for (let i = 0; i < p.count; i++) {
    const v = new THREE.Vector3().fromBufferAttribute(p, i)
    if (!verts.some((u) => u.distanceTo(v) < 1e-4)) verts.push(v.normalize())
  }
  const edges = []
  for (let i = 0; i < verts.length; i++) for (let j = i + 1; j < verts.length; j++) if (verts[i].distanceTo(verts[j]) < 1.1) edges.push([i, j])
  const seams = []
  const arc = (a, b) => {
    const pts = []
    for (let k = 0; k <= 10; k++) pts.push(a.clone().lerp(b, k / 10).normalize().multiplyScalar(r * 1.003))
    seams.push(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts), 10, r * 0.012, 5, false))
  }
  // fiecare latură a icosaedrului e tăiată în trei; treimile de lângă vârfuri închid pentagoanele,
  // iar segmentele dintre treimile a două laturi vecine formează hexagoanele
  const third = (i, j) => verts[i].clone().lerp(verts[j], 1 / 3).normalize()
  for (const [i, j] of edges) {
    arc(third(i, j), third(j, i))
  }
  for (let i = 0; i < verts.length; i++) {
    const nb = edges.filter(([a, b]) => a === i || b === i).map(([a, b]) => (a === i ? b : a))
    // vecinii în ordine în jurul vârfului
    const n = verts[i]
    const ref = new THREE.Vector3().subVectors(verts[nb[0]], n).projectOnPlane(n).normalize()
    const ang = (k) => {
      const v = new THREE.Vector3().subVectors(verts[k], n).projectOnPlane(n).normalize()
      return Math.atan2(new THREE.Vector3().crossVectors(ref, v).dot(n), ref.dot(v))
    }
    nb.sort((a, b) => ang(a) - ang(b))
    for (let k = 0; k < nb.length; k++) arc(third(i, nb[k]), third(i, nb[(k + 1) % nb.length]))
    if (pentMat) {
      const shape = nb.map((k) => third(i, k).multiplyScalar(r * 1.001))
      const geo = new THREE.BufferGeometry().setFromPoints([n.clone().multiplyScalar(r * 1.002), ...shape, shape[0]])
      const index = []
      for (let k = 1; k <= shape.length; k++) index.push(0, k, k + 1)
      geo.setIndex(index)
      geo.computeVertexNormals()
      g.add(new THREE.Mesh(geo, pentMat))
    }
  }
  g.add(new THREE.Mesh(mergeGeometries(seams), seamMat))
  return g
}
// decal: o bucată din suprafața unui con / cilindru, cu o textură (sigla), pusă în fața trofeului
function conicDecal(tex, { y0, y1, r0, r1, arc, lift = 0.0015, center = Math.PI / 2 }, mat) {
  const g = new THREE.BufferGeometry()
  const pos = []
  const uv = []
  const idx = []
  const NX = 24
  const NY = 12
  for (let j = 0; j <= NY; j++) {
    const v = j / NY
    const y = y0 + (y1 - y0) * v
    const r = r0 + (r1 - r0) * v + lift
    for (let i = 0; i <= NX; i++) {
      const u = i / NX
      const a = center + (u - 0.5) * arc
      pos.push(r * Math.cos(a) * -1, y, r * Math.sin(a))
      uv.push(u, v)
    }
  }
  for (let j = 0; j < NY; j++) for (let i = 0; i < NX; i++) {
    const a = j * (NX + 1) + i
    idx.push(a, a + 1, a + NX + 1, a + 1, a + NX + 2, a + NX + 1)
  }
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3))
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2))
  g.setIndex(idx)
  g.computeVertexNormals()
  const m = mat.clone()
  m.alphaMap = tex
  m.transparent = true
  m.depthWrite = false
  m.polygonOffset = true
  m.polygonOffsetFactor = -2
  return new THREE.Mesh(g, m)
}
// inscripție gravată de jur împrejurul unei benzi cilindrice / conice (literele = alphaMap)
function textBand(text, { y0, y1, r0, r1, mat, font = '700', reps = 1, lift = 0.0008, size = 2048 }) {
  const tex = canvasTex(size, 96, (c, w, h) => {
    c.fillStyle = '#000'
    c.fillRect(0, 0, w, h)
    c.fillStyle = '#fff'
    c.textAlign = 'center'
    c.textBaseline = 'middle'
    c.font = `${font} 62px "Barlow Condensed", "Arial Narrow", Arial, sans-serif`
    for (let k = 0; k < reps; k++) c.fillText(text, ((k + 0.5) * w) / reps, h / 2 + 3)
  })
  const g = new THREE.CylinderGeometry(r1 + lift, r0 + lift, y1 - y0, 192, 1, true)
  g.translate(0, (y0 + y1) / 2, 0)
  const m = mat.clone()
  m.alphaMap = tex
  m.transparent = true
  m.depthWrite = false
  m.polygonOffset = true
  m.polygonOffsetFactor = -2
  return new THREE.Mesh(g, m)
}
// plăcuță metalică cu text gravat (pe soclu)
function plaque(lines, w, h, mat, { bg = '#c9ccd0', ink = '#2a2c30', frame = true } = {}) {
  const tex = canvasTex(512, Math.round((512 * h) / w), (c, W, H) => {
    c.fillStyle = bg
    c.fillRect(0, 0, W, H)
    if (frame) {
      c.strokeStyle = ink
      c.lineWidth = Math.max(2, H * 0.04)
      c.strokeRect(H * 0.08, H * 0.08, W - H * 0.16, H - H * 0.16)
    }
    c.fillStyle = ink
    c.textAlign = 'center'
    c.textBaseline = 'middle'
    const n = lines.length
    lines.forEach((t, k) => {
      const fs = (H / (n + 0.8)) * (k === 0 ? 0.78 : 0.62)
      c.font = `${k === 0 ? 800 : 600} ${fs}px "Barlow Condensed", "Arial Narrow", Arial, sans-serif`
      let f = fs
      while (c.measureText(t).width > W * 0.88 && f > 6) {
        f -= 1
        c.font = `${k === 0 ? 800 : 600} ${f}px "Barlow Condensed", "Arial Narrow", Arial, sans-serif`
      }
      c.fillText(t, W / 2, (H * (k + 0.9)) / (n + 0.8))
    })
  })
  tex.colorSpace = THREE.SRGBColorSpace
  const m = mat.clone()
  m.map = tex
  m.bumpMap = tex
  m.bumpScale = -0.6
  m.color = new THREE.Color(0xffffff)
  // textul trebuie să se citească: plăcuța e mai puțin oglindă decât trofeul
  m.metalness = 0.55
  m.roughness = 0.32
  m.roughnessMap = null
  if ('clearcoat' in m) m.clearcoat = 0.4
  return new THREE.Mesh(new THREE.BoxGeometry(w, h, 0.0016), m)
}
function canvasTex(w, h, draw) {
  const c = document.createElement('canvas')
  c.width = w
  c.height = h
  draw(c.getContext('2d'), w, h)
  const t = new THREE.CanvasTexture(c)
  t.anisotropy = 8
  return t
}

// ─── Superliga ───────────────────────────────────────────────────────
export function superligaTrophy(M = mats()) {
  const g = new THREE.Group()
  // baza: disc cu muchie teșită, apoi con concav până la gât (crom închis), două inele argintii
  g.add(new THREE.Mesh(lathe([[0, 0], [0.108, 0], [0.111, 0.004], [0.111, 0.024], [0.106, 0.029], [0.09, 0.046], [0.066, 0.072], [0.045, 0.1], [0.032, 0.122], [0.025, 0.136], [0.023, 0.142], [0, 0.142]], 160, null, 0), M.gunmetal))
  g.add(ring(0.1115, 0.0016, 0.011, M.chrome), ring(0.1115, 0.0016, 0.02, M.chrome), ring(0.0665, 0.0012, 0.072, M.chrome))
  // sigla LPF pe bază (plăcuță)
  const lpf = canvasTex(256, 256, (c) => {
    c.fillStyle = '#000'
    c.fillRect(0, 0, 256, 256)
    c.strokeStyle = '#fff'
    c.lineWidth = 14
    c.strokeRect(30, 30, 196, 196)
    c.fillStyle = '#fff'
    c.font = '800 92px Arial'
    c.textAlign = 'center'
    c.textBaseline = 'middle'
    c.fillText('LPF', 128, 150)
    c.beginPath()
    c.arc(128, 74, 22, 0, Math.PI * 2)
    c.fill()
  })
  g.add(conicDecal(lpf, { y0: 0.03, y1: 0.062, r0: 0.092, r1: 0.07, arc: 0.44 }, M.chrome))
  // inscripția gravată pe muchia bazei și dedicația câștigătoarei pe spatele conului
  g.add(textBand('SUPERLIGA  ·  CAMPIONATUL ROMÂNIEI  ·  LIGA PROFESIONISTĂ DE FOTBAL  ·  ', { y0: 0.0105, y1: 0.0195, r0: 0.111, r1: 0.111, mat: M.chrome, reps: 2 }))
  const ded = canvasTex(512, 256, (c) => {
    c.fillStyle = '#000'
    c.fillRect(0, 0, 512, 256)
    c.fillStyle = '#fff'
    c.textAlign = 'center'
    c.font = '800 70px "Barlow Condensed", Arial'
    c.fillText('UNIVERSITATEA', 256, 80)
    c.fillText('CRAIOVA', 256, 150)
    c.font = '600 48px "Barlow Condensed", Arial'
    c.fillText('CAMPIOANĂ 2025 – 2026', 256, 222)
  })
  g.add(conicDecal(ded, { y0: 0.032, y1: 0.064, r0: 0.091, r1: 0.069, arc: 0.6, center: -Math.PI / 2 }, M.chrome))
  // gâtul cu nod
  g.add(new THREE.Mesh(lathe([[0, 0.14], [0.024, 0.141], [0.019, 0.15], [0.017, 0.16], [0.026, 0.168], [0.028, 0.174], [0.02, 0.182], [0.019, 0.19], [0, 0.19]], 96, null, 40), M.chrome))
  // cupa: panouri concave răsucite cu muchii ascuțite, deschisă sus, perete subțire
  const N = 6
  const twist = (y) => (y - 0.19) * 2.6
  const panel = (r, th, y) => {
    const f = ((((th + twist(y)) * N) / (Math.PI * 2)) % 1 + 1) % 1
    const k = Math.min(1, Math.max(0, (y - 0.2) / 0.06))
    return r * (1 - 0.13 * k * Math.sin(Math.PI * f) ** 0.7)
  }
  const outer = [[0.019, 0.19], [0.03, 0.21], [0.042, 0.26], [0.058, 0.32], [0.074, 0.38], [0.089, 0.44], [0.102, 0.5], [0.112, 0.55], [0.117, 0.575], [0.118, 0.58]]
  g.add(new THREE.Mesh(lathe(outer, N * 84, panel, 180), M.chrome))
  const inner = [[0.1165, 0.58], [0.111, 0.56], [0.1, 0.51], [0.06, 0.41], [0, 0.37]]
  const inMesh = new THREE.Mesh(lathe(inner, N * 36, panel, 40), M.chrome)
  inMesh.material = M.chrome.clone()
  inMesh.material.side = THREE.BackSide
  g.add(inMesh)
  g.add(ring(0.1172, 0.0022, 0.58, M.chrome, 220))
  // muchiile vii dintre panourile răsucite: linii lucioase care prind lumina (ca pe trofeul real)
  {
    const rOut = (y) => {
      for (let k = 0; k < outer.length - 1; k++) {
        const [ra, ya] = outer[k]
        const [rb, yb] = outer[k + 1]
        if (y >= ya && y <= yb) return ra + ((rb - ra) * (y - ya)) / (yb - ya)
      }
      return outer[outer.length - 1][0]
    }
    const tubes = []
    for (let k = 0; k < N; k++) {
      const pts = []
      for (let i = 0; i <= 90; i++) {
        const y = 0.215 + (0.575 - 0.215) * (i / 90)
        const th = (k * Math.PI * 2) / N - twist(y)
        const r = rOut(y) + 0.0004
        pts.push(new THREE.Vector3(r * Math.cos(th), y, r * Math.sin(th)))
      }
      tubes.push(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts), 180, 0.0011, 6, false))
    }
    g.add(new THREE.Mesh(mergeGeometries(tubes), M.chrome))
  }
  // emblema Superligii gravată sub buză (decal întunecat, ca o gravură)
  const url = logoUrl('superliga')
  if (url) {
    // masca gravurii = canalul alfa al siglei (pixelii transparenți ai PNG-ului sunt tot albi)
    const tex = new THREE.CanvasTexture(document.createElement('canvas'))
    const img = new Image()
    img.onload = () => {
      // pe trofeu e gravat doar simbolul (cupa), fără textul de dedesubt: partea de sus a siglei
      const c = tex.image
      const hh = Math.round(img.height * 0.56)
      c.width = Math.round(hh * 1.0)
      c.height = hh
      const cx = c.getContext('2d')
      cx.drawImage(img, (c.width - img.width) / 2, 0)
      const d = cx.getImageData(0, 0, c.width, c.height)
      for (let i = 0; i < d.data.length; i += 4) d.data[i] = d.data[i + 1] = d.data[i + 2] = d.data[i + 3]
      for (let i = 3; i < d.data.length; i += 4) d.data[i] = 255
      cx.putImageData(d, 0, 0)
      tex.needsUpdate = true
    }
    img.src = url
    const engr = new THREE.MeshStandardMaterial({ color: 0x5e636b, metalness: 1, roughness: 0.55 })
    // decal care urmează exact suprafața cupei (profil + panouri răsucite), la 0,6 mm deasupra ei
    const rAt = (y) => {
      for (let k = 0; k < outer.length - 1; k++) {
        const [ra, ya] = outer[k]
        const [rb, yb] = outer[k + 1]
        if (y >= ya && y <= yb) return ra + ((rb - ra) * (y - ya)) / (yb - ya)
      }
      return outer[outer.length - 1][0]
    }
    const dg = new THREE.BufferGeometry()
    const dp = []
    const du = []
    const di = []
    const NX = 40
    const NY = 20
    const y0 = 0.5
    const y1 = 0.548
    const arc = 0.5
    for (let j = 0; j <= NY; j++) {
      const y = y0 + ((y1 - y0) * j) / NY
      for (let i = 0; i <= NX; i++) {
        const th = Math.PI / 2 + (i / NX - 0.5) * arc
        const r = panel(rAt(y), th, y) + 0.0006
        dp.push(r * Math.cos(th), y, r * Math.sin(th))
        du.push(1 - i / NX, j / NY)
      }
    }
    for (let j = 0; j < NY; j++) for (let i = 0; i < NX; i++) {
      const a = j * (NX + 1) + i
      di.push(a, a + NX + 1, a + 1, a + 1, a + NX + 1, a + NX + 2)
    }
    dg.setAttribute('position', new THREE.Float32BufferAttribute(dp, 3))
    dg.setAttribute('uv', new THREE.Float32BufferAttribute(du, 2))
    dg.setIndex(di)
    dg.computeVertexNormals()
    const em = engr.clone()
    em.alphaMap = tex
    em.transparent = true
    em.depthWrite = false
    g.add(new THREE.Mesh(dg, em))
  }
  // toartele: bandă plată, de la buză orizontal în afară, apoi în arc până jos lângă picior
  for (const s of [-1, 1]) {
    // în fotografii: bara de sus e orizontală, iar latura exterioară coboară aproape drept spre gât
    const pts = [[0.104, 0.548], [0.15, 0.552], [0.2, 0.552], [0.226, 0.548], [0.229, 0.53], [0.2, 0.46], [0.16, 0.38], [0.115, 0.3], [0.07, 0.235], [0.04, 0.205]].map(([x, y]) => [s * x, y, 0])
    g.add(new THREE.Mesh(sweep(pts, (t) => 0.013 - 0.003 * t, () => 0.024, 200, 12), M.chrome))
    // nervura din mijlocul toartei
    g.add(new THREE.Mesh(sweep(pts, () => 0.0034, () => 0.0272, 200, 8), M.chrome))
  }
  g.userData.height = 0.58
  return g
}

// ─── Cupa României ───────────────────────────────────────────────────
export function cupaRomanieiTrophy(M = mats()) {
  const g = new THREE.Group()
  // soclul octogonal din lemn lăcuit, cu o treaptă
  const oct = (r, h, y, mat) => {
    const m = new THREE.Mesh(new THREE.CylinderGeometry(r, r * 1.02, h, 8, 1), mat)
    m.rotation.y = Math.PI / 8
    m.position.y = y + h / 2
    return m
  }
  g.add(oct(0.2, 0.05, 0, M.wood), oct(0.175, 0.035, 0.05, M.wood))
  // plăcuțele cu câștigătoarele pe fețele soclului; în față, plăcuța de alamă cu numele trofeului
  {
    const winners = [
      ['2014 – 2015', 'STEAUA BUCUREȘTI'], ['2015 – 2016', 'CFR CLUJ'], ['2016 – 2017', 'FC VOLUNTARI'],
      ['2017 – 2018', 'UNIVERSITATEA CRAIOVA'], ['2018 – 2019', 'VIITORUL CONSTANȚA'], ['2019 – 2020', 'FCSB'],
      ['2020 – 2021', 'UNIVERSITATEA CRAIOVA'], ['2021 – 2022', 'SEPSI OSK'], ['2022 – 2023', 'SEPSI OSK'],
      ['2023 – 2024', 'CORVINUL HUNEDOARA'], ['2024 – 2025', 'CFR CLUJ'], ['2025 – 2026', 'UNIVERSITATEA CRAIOVA'],
    ]
    let wi = 0
    for (let f = 0; f < 8; f++) {
      const a = Math.PI / 2 + (f * Math.PI) / 4 // fața 0 = spre privitor (+z)
      const front = f === 0
      const rows = front ? [[0.2, 0.025, 0.012, 0.16]] : [[0.2, 0.025, 0.01, 0.13], [0.175, 0.0675, 0.012, 0.11]]
      for (const [r, y, hgt, wdt] of rows) {
        const ap = r * Math.cos(Math.PI / 8) + 0.0012
        let p
        if (front && r === 0.2) {
          p = plaque(['CUPA ROMÂNIEI', 'UNIVERSITATEA CRAIOVA · 2025 – 2026'], 0.13, 0.034, M.brass, { bg: '#c8a24c', ink: '#3a2a0a' })
          p.position.y = 0.025
        } else {
          const [yr, team] = winners[wi++ % winners.length]
          p = plaque([team, yr], wdt * 0.82, hgt * 2.2 * (r === 0.2 ? 1.1 : 0.85), M.silver, { frame: false })
          p.position.y = y
        }
        p.position.x = ap * Math.cos(a)
        p.position.z = ap * Math.sin(a)
        p.rotation.y = Math.PI / 2 - a
        g.add(p)
      }
    }
  }
  const base = new THREE.Group()
  base.position.y = 0.085
  g.add(base)
  // piciorul: inel, cupolă cu caneluri (lobi), guler canelat, nod, gât sub minge
  const lobes = (n, amp, y0, y1) => (r, th, y) => (y > y0 && y < y1 ? r * (1 + amp * Math.abs(Math.cos((th * n) / 2)) ** 0.7 * Math.sin((Math.PI * (y - y0)) / (y1 - y0))) : r)
  base.add(new THREE.Mesh(lathe([[0, 0], [0.12, 0], [0.122, 0.004], [0.121, 0.014], [0.116, 0.018], [0.112, 0.024], [0.103, 0.036], [0.085, 0.05], [0.066, 0.058], [0.052, 0.062], [0, 0.062]], 192, lobes(32, 0.05, 0.016, 0.058), 60), M.silver))
  base.add(beads(0.1175, 0.016, 64, 0.0036, M.silver))
  base.add(new THREE.Mesh(lathe([[0, 0.06], [0.05, 0.062], [0.046, 0.072], [0.05, 0.085], [0.056, 0.1], [0.058, 0.112], [0.05, 0.12], [0.036, 0.126], [0.033, 0.13], [0, 0.13]], 160, lobes(24, 0.08, 0.07, 0.118), 60), M.silver))
  base.add(beads(0.0575, 0.106, 40, 0.003, M.silver))
  // mingea de argint
  const ball = football(0.054, M.silver, M.seam)
  ball.position.y = 0.183
  base.add(ball)
  // gulerul de deasupra mingii
  base.add(new THREE.Mesh(lathe([[0, 0.232], [0.034, 0.234], [0.046, 0.24], [0.05, 0.246], [0.044, 0.252], [0, 0.252]], 128), M.silver))
  base.add(beads(0.049, 0.246, 30, 0.0032, M.silver))
  // caneluri în evantai sub corp, corpul ovoid, umărul, gâtul și buza răsfrântă
  const fan = (r, th, y) => (y > 0.25 && y < 0.33 ? r * (1 + 0.055 * Math.abs(Math.cos(th * 16)) ** 0.5 * Math.sin((Math.PI * (y - 0.25)) / 0.08)) : r)
  const urn = [[0.04, 0.25], [0.06, 0.262], [0.085, 0.282], [0.108, 0.305], [0.122, 0.33], [0.131, 0.37], [0.134, 0.41], [0.13, 0.455], [0.118, 0.495], [0.103, 0.522], [0.099, 0.535], [0.092, 0.55], [0.085, 0.575], [0.084, 0.6], [0.088, 0.625], [0.097, 0.645], [0.104, 0.656]]
  // brâul cizelat (volute și frunze de acant) de pe pântecul urnei, în relief (bump map)
  const chased = canvasTex(2048, 1024, (c, W, H) => {
    c.fillStyle = '#808080'
    c.fillRect(0, 0, W, H)
    const v0 = H * (1 - 0.56)
    const v1 = H * (1 - 0.3)
    c.strokeStyle = '#d8d8d8'
    c.lineCap = 'round'
    // chenarele brâului
    c.lineWidth = 7
    for (const y of [v0, v1]) { c.beginPath(); c.moveTo(0, y); c.lineTo(W, y); c.stroke() }
    const reps = 12
    const bw = W / reps
    const mid = (v0 + v1) / 2
    const hh = (v1 - v0) / 2
    for (let k = 0; k < reps; k++) {
      const x0 = k * bw
      // volută dublă
      for (const sd of [-1, 1]) {
        c.lineWidth = 6
        c.beginPath()
        for (let t = 0; t <= 1; t += 0.02) {
          const a = t * Math.PI * 2.6
          const rr = hh * 0.75 * (1 - t * 0.8)
          const x = x0 + bw / 2 + sd * (bw * 0.18 + Math.cos(a) * rr * 0.9)
          const y = mid + Math.sin(a) * rr * sd
          t ? c.lineTo(x, y) : c.moveTo(x, y)
        }
        c.stroke()
        // frunza de acant
        c.fillStyle = '#c4c4c4'
        c.beginPath()
        c.moveTo(x0 + bw / 2, mid + hh * 0.85)
        c.quadraticCurveTo(x0 + bw / 2 + sd * bw * 0.32, mid, x0 + bw / 2 + sd * bw * 0.08, mid - hh * 0.8)
        c.quadraticCurveTo(x0 + bw / 2 + sd * bw * 0.12, mid, x0 + bw / 2, mid + hh * 0.85)
        c.fill()
      }
      // floarea din mijloc
      c.fillStyle = '#e6e6e6'
      for (let p = 0; p < 6; p++) {
        const a = (p / 6) * Math.PI * 2
        c.beginPath()
        c.ellipse(x0 + bw / 2 + Math.cos(a) * 14, mid + Math.sin(a) * 14, 12, 6, a, 0, Math.PI * 2)
        c.fill()
      }
      // perle mici între motive
      c.fillStyle = '#dcdcdc'
      c.beginPath()
      c.arc(x0, mid, 9, 0, Math.PI * 2)
      c.fill()
    }
  })
  const urnMat = M.silver.clone()
  urnMat.bumpMap = chased
  urnMat.bumpScale = 2.2
  base.add(new THREE.Mesh(lathe(urn, 224, fan, 160), urnMat))
  // interiorul gurii
  const inside = new THREE.Mesh(lathe([[0.102, 0.656], [0.082, 0.62], [0.076, 0.58], [0.0, 0.54]], 96), M.silver.clone())
  inside.material.side = THREE.BackSide
  base.add(inside)
  base.add(ring(0.1035, 0.003, 0.656, M.silver, 200))
  // brâul de perle de pe umăr și inelele de lângă el
  base.add(beads(0.1075, 0.52, 54, 0.0072, M.silver))
  base.add(ring(0.1035, 0.0022, 0.509, M.silver), ring(0.1, 0.0022, 0.531, M.silver))
  base.add(ring(0.1225, 0.0026, 0.33, M.silver, 200))
  // stema FRF în relief pe corp: scut cu creastă sus și vârf jos, bandă cu „FRF”, câmp cu romburi
  {
    const shield = (k) => {
      const sh = new THREE.Shape()
      const w = 0.05 * k
      const t = 0.052 * k
      sh.moveTo(-w, t - 0.012 * k)
      sh.lineTo(-0.014 * k, t - 0.012 * k)
      sh.lineTo(0, t)
      sh.lineTo(0.014 * k, t - 0.012 * k)
      sh.lineTo(w, t - 0.012 * k)
      sh.lineTo(w, -0.004 * k)
      sh.lineTo(0, -0.058 * k)
      sh.lineTo(-w, -0.004 * k)
      sh.closePath()
      return sh
    }
    const K = 1.22 // în fotografii stema are ≈ 12 cm lățime (aproape jumătate din corp)
    const outer = shield(K)
    outer.holes.push(new THREE.Path(shield(0.86 * K).getPoints()))
    const frame = new THREE.Mesh(new THREE.ExtrudeGeometry(outer, { depth: 0.005, bevelEnabled: true, bevelSize: 0.0014, bevelThickness: 0.0014, bevelSegments: 2, curveSegments: 4 }), M.silver)
    // câmpul interior: textură cu banda „FRF” și romburile (relief prin normal map + rugozitate)
    const field = canvasTex(512, 512, (c) => {
      c.fillStyle = '#545454'
      c.fillRect(0, 0, 512, 512)
      c.fillStyle = '#f4f4f4'
      c.fillRect(40, 150, 432, 110)
      c.fillStyle = '#161616'
      c.font = '800 104px Arial'
      c.textAlign = 'center'
      c.textBaseline = 'middle'
      c.fillText('FRF', 256, 210)
      c.strokeStyle = '#e0e0e0'
      c.lineWidth = 16
      for (let k = -4; k < 8; k++) {
        c.beginPath(); c.moveTo(k * 80, 512); c.lineTo(k * 80 + 260, 260); c.stroke()
        c.beginPath(); c.moveTo(k * 80, 260); c.lineTo(k * 80 + 260, 512); c.stroke()
      }
    })
    const plateGeo = new THREE.ShapeGeometry(shield(0.86 * K), 8)
    const pp = plateGeo.attributes.position
    const uvs = []
    for (let i = 0; i < pp.count; i++) uvs.push((pp.getX(i) / K + 0.05) / 0.1, (pp.getY(i) / K + 0.06) / 0.115)
    plateGeo.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2))
    field.colorSpace = THREE.SRGBColorSpace
    const plateMat = new THREE.MeshPhysicalMaterial({ color: 0xffffff, metalness: 0.85, roughness: 0.3, map: field, bumpMap: field, bumpScale: 1.5 })
    const plate = new THREE.Mesh(plateGeo, plateMat)
    plate.position.z = 0.003
    // stema urmează curbura corpului (raza ≈ 13,4 cm în dreptul ei)
    const R = 0.1345
    for (const m of [frame, plate]) {
      const gp = m.geometry.attributes.position
      for (let i = 0; i < gp.count; i++) {
        const x = gp.getX(i)
        gp.setZ(i, gp.getZ(i) + m.position.z + Math.sqrt(Math.max(0, R * R - x * x)) - R)
      }
      m.position.z = 0
      m.geometry.computeVertexNormals()
    }
    // banda cu „FRF” (relief lucios pe fond mat), în treimea de sus a scutului
    const word = canvasTex(512, 160, (c) => {
      c.fillStyle = '#000'
      c.fillRect(0, 0, 512, 160)
      c.fillStyle = '#fff'
      c.font = '900 132px Arial'
      c.textAlign = 'center'
      c.textBaseline = 'middle'
      c.fillText('FRF', 256, 88)
    })
    const bandGeo = new THREE.PlaneGeometry(0.072 * K, 0.024 * K, 16, 2)
    const bandMat = new THREE.MeshPhysicalMaterial({ color: 0x2b2d31, metalness: 1, roughness: 0.5 })
    const band = new THREE.Mesh(bandGeo, bandMat)
    const letters = new THREE.Mesh(bandGeo.clone(), new THREE.MeshPhysicalMaterial({ color: 0xffffff, metalness: 1, roughness: 0.06, alphaMap: word, transparent: true }))
    band.position.set(0, 0.016 * K, 0.0045)
    letters.position.set(0, 0.016 * K, 0.0052)
    for (const m of [band, letters]) {
      const gp = m.geometry.attributes.position
      for (let i = 0; i < gp.count; i++) {
        const x = gp.getX(i)
        gp.setZ(i, m.position.z + Math.sqrt(Math.max(0, R * R - x * x)) - R)
      }
      m.position.z = 0
      m.geometry.computeVertexNormals()
    }
    const emb = new THREE.Group()
    emb.add(frame, plate, band, letters)
    emb.position.set(0, 0.418, R - 0.001)
    base.add(emb)
  }
  // toartele: aripi de vultur — pornesc de la buză, cu capul vulturului deasupra, se umflă în
  // afară și coboară până pe corp; secțiunea e lată sus (aripa) și se subțiază jos
  for (const sd of [-1, 1]) {
    const pts = [[0.1, 0.65], [0.118, 0.682], [0.142, 0.7], [0.17, 0.698], [0.196, 0.672], [0.212, 0.625], [0.21, 0.56], [0.196, 0.49], [0.172, 0.425], [0.148, 0.385]].map(([x, y]) => [sd * x, y, 0])
    // aripa: lată sus (~5 cm, penele), îngustă jos unde se prinde de corp
    const wing = sweep(pts, (t) => 0.05 * Math.sin(Math.PI * Math.min(1, t * 1.4 + 0.18)) ** 0.8 * (1 - 0.65 * t) + 0.009, (t) => 0.019 - 0.01 * t, 200, 18)
    // penele: striații pe lungimea aripii (normal map)
    const feathers = canvasTex(512, 64, (c) => {
      c.fillStyle = 'rgb(128,128,255)'
      c.fillRect(0, 0, 512, 64)
      for (let x = 0; x < 512; x += 9) {
        const grd = c.createLinearGradient(x, 0, x + 9, 0)
        grd.addColorStop(0, 'rgb(90,128,230)')
        grd.addColorStop(1, 'rgb(170,128,230)')
        c.fillStyle = grd
        c.fillRect(x, 0, 9, 64)
      }
    })
    feathers.wrapS = feathers.wrapT = THREE.RepeatWrapping
    const wm = M.silver.clone()
    wm.normalMap = feathers
    wm.normalScale = new THREE.Vector2(0.8, 0.8)
    base.add(new THREE.Mesh(wing, wm))
    // penele în relief: solzi alungiți, în rânduri, pe ambele fețe ale aripii
    {
      const curve = new THREE.CatmullRomCurve3(pts.map(([x, y, z]) => new THREE.Vector3(x, y, z)), false, 'centripetal')
      const fGeo = new THREE.SphereGeometry(1, 10, 6)
      const list = []
      for (let i = 0; i < 26; i++) {
        const t = 0.04 + (i / 26) * 0.74
        const p = curve.getPointAt(t)
        const tan = curve.getTangentAt(t)
        const nrm = new THREE.Vector3(-tan.y, tan.x, 0)
        const width = 0.05 * Math.sin(Math.PI * Math.min(1, t * 1.4 + 0.18)) ** 0.8 * (1 - 0.65 * t) + 0.009
        const depth = 0.019 - 0.01 * t
        const rowsN = width > 0.03 ? 3 : 2
        for (let rr = 0; rr < rowsN; rr++) {
          const off = (rr / (rowsN - 1) - 0.5) * width * 0.7
          for (const face of [-1, 1]) list.push({ p: p.clone().addScaledVector(nrm, off).add(new THREE.Vector3(0, 0, face * depth * 0.46)), tan, face, s: 0.011 + width * 0.12 })
        }
      }
      const im = new THREE.InstancedMesh(fGeo, M.silver, list.length)
      const m4 = new THREE.Matrix4()
      const q = new THREE.Quaternion()
      list.forEach(({ p, tan, s }, k) => {
        q.setFromUnitVectors(new THREE.Vector3(0, 1, 0), tan.clone().negate())
        m4.compose(p, q, new THREE.Vector3(s * 0.45, s * 1.25, 0.0026))
        im.setMatrixAt(k, m4)
      })
      base.add(im)
    }
    // capul vulturului, cu ciocul spre exterior
    const head = new THREE.Group()
    const skull = new THREE.Mesh(new THREE.SphereGeometry(0.019, 28, 20), M.silver)
    skull.scale.set(1.3, 0.95, 0.85)
    const beak = new THREE.Mesh(new THREE.ConeGeometry(0.009, 0.036, 18), M.silver)
    beak.rotation.z = Math.PI / 2 + 0.45
    beak.position.set(0.03, -0.008, 0)
    const hook = new THREE.Mesh(new THREE.SphereGeometry(0.006, 12, 10), M.silver)
    hook.position.set(0.045, -0.018, 0)
    const neck = new THREE.Mesh(new THREE.CylinderGeometry(0.013, 0.02, 0.04, 18), M.silver)
    neck.rotation.z = -0.8
    neck.position.set(-0.02, -0.02, 0)
    // ochii și arcadele
    for (const ez of [-1, 1]) {
      const eye = new THREE.Mesh(new THREE.SphereGeometry(0.0034, 12, 8), M.chrome)
      eye.position.set(0.012, 0.005, ez * 0.0145)
      const brow = new THREE.Mesh(new THREE.SphereGeometry(0.006, 12, 8), M.silver)
      brow.scale.set(1.6, 0.55, 0.8)
      brow.position.set(0.011, 0.01, ez * 0.0125)
      head.add(eye, brow)
    }
    head.add(skull, beak, hook, neck)
    head.position.set(sd * 0.13, 0.72, 0)
    head.rotation.y = sd > 0 ? 0 : Math.PI
    base.add(head)
  }
  g.userData.height = 0.085 + 0.74
  return g
}

// ─── Supercupa României ──────────────────────────────────────────────
export function supercupaTrophy(M = mats()) {
  const g = new THREE.Group()
  // soclul negru lucios și discul argintiu
  g.add(new THREE.Mesh(lathe([[0, 0], [0.106, 0], [0.108, 0.004], [0.108, 0.072], [0.104, 0.076], [0, 0.076]], 160), M.blackGloss))
  g.add(new THREE.Mesh(lathe([[0, 0.076], [0.104, 0.076], [0.106, 0.08], [0.106, 0.092], [0.1, 0.098], [0, 0.098]], 160), M.chrome))
  // piciorul răsucit (fațete spiralate), larg jos, îngust la mijloc, lărgit sub cupă
  const N = 6
  const twistStem = (r, th, y) => {
    const f = ((((th + (y - 0.1) * 9) * N) / (Math.PI * 2)) % 1 + 1) % 1
    return r * (1 + 0.16 * (0.5 - Math.abs(f - 0.5)))
  }
  g.add(new THREE.Mesh(lathe([[0, 0.096], [0.066, 0.098], [0.06, 0.12], [0.048, 0.16], [0.039, 0.2], [0.036, 0.24], [0.038, 0.27], [0.043, 0.29], [0, 0.29]], N * 30, twistStem, 80), M.chrome))
  // cupa: fund rotunjit, pereți aproape drepți, ușor evazați spre buză
  const bowl = [[0.036, 0.288], [0.042, 0.31], [0.05, 0.35], [0.064, 0.39], [0.082, 0.43], [0.1, 0.47], [0.112, 0.51], [0.119, 0.55], [0.121, 0.59], [0.122, 0.615], [0.123, 0.63]]
  // fereastra rotundă din față (pentru minge) — pereții sunt împinși ușor înăuntru în jurul ei
  const win = new THREE.Vector3(0, 0.483, 1)
  const dent = (r, th, y) => {
    const dx = Math.atan2(Math.sin(th - Math.PI / 2), Math.cos(th - Math.PI / 2)) * r
    const d = Math.hypot(dx, y - win.y)
    return d < 0.085 ? r - 0.008 * Math.cos((d / 0.085) * (Math.PI / 2)) ** 2 : r
  }
  g.add(new THREE.Mesh(lathe(bowl, 220, dent, 140), M.chrome))
  const insideBowl = new THREE.Mesh(lathe([[0.121, 0.63], [0.117, 0.56], [0.1, 0.48], [0.0, 0.42]], 128), M.chrome.clone())
  insideBowl.material.side = THREE.BackSide
  g.add(insideBowl)
  g.add(ring(0.1225, 0.0026, 0.63, M.chrome, 220))
  // inscripția gravată sub buză și placa de pe soclu
  g.add(textBand('SUPERCUPA ROMÂNIEI  ★  FEDERAȚIA ROMÂNĂ DE FOTBAL  ★  ', { y0: 0.6, y1: 0.61, r0: 0.1216, r1: 0.122, mat: M.engrave, reps: 2, font: '600' }))
  {
    const p = plaque(['SUPERCUPA ROMÂNIEI', 'UNIVERSITATEA CRAIOVA · 2026'], 0.12, 0.036, M.chrome, { bg: '#d7dadd' })
    // pe fața cilindrului negru: o curbăm ușor pe rază
    const gp = p.geometry.attributes.position
    for (let i = 0; i < gp.count; i++) {
      const x = gp.getX(i)
      gp.setZ(i, gp.getZ(i) + Math.sqrt(Math.max(0, 0.1095 ** 2 - x * x)) - 0.1095)
    }
    p.geometry.computeVertexNormals()
    p.position.set(0, 0.038, 0.1095)
    g.add(p)
  }
  // mingea aurie în fereastră, cu rama argintie
  const ball = football(0.07, M.gold, M.goldDark)
  ball.position.set(0, 0.49, 0.062)
  ball.rotation.set(0.4, 0.3, 0)
  g.add(ball)
  const frame = new THREE.Mesh(new THREE.TorusGeometry(0.079, 0.0065, 18, 96), M.chrome)
  frame.position.set(0, 0.49, 0.1)
  g.add(frame)
  // toartele: tijă subțire care urcă de pe buză peste ea, se întoarce în afară și coboară până la picior
  for (const s of [-1, 1]) {
    const pts = [[0.118, 0.628], [0.138, 0.668], [0.166, 0.692], [0.192, 0.684], [0.2, 0.648], [0.192, 0.58], [0.172, 0.51], [0.14, 0.44], [0.104, 0.38], [0.068, 0.33], [0.04, 0.3]].map(([x, y]) => [s * x, y, 0])
    g.add(new THREE.Mesh(sweep(pts, () => 0.0095, () => 0.0095, 180, 12), M.chrome))
  }
  g.userData.height = 0.7
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
