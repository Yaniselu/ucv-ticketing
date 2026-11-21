// Incinta stadionului (podiumul, esplanada, curțile de lumină, scările, statuia) din OpenStreetMap,
// în coordonatele scenei → src/data/precinct.js (date mici, încărcate odată cu stadionul).
//
//   node scripts/build-precinct.mjs
//
// Date © OpenStreetMap contributors, licență ODbL.
import fs from 'node:fs'
import path from 'node:path'
import { fetchTiles, parse, ring } from './build-osm.mjs'

const ROOT = path.dirname(path.dirname(new URL(import.meta.url).pathname))
const OUT = path.join(ROOT, 'src', 'data', 'precinct.js')
const FOOT = { ax: 97, az: 108.5 } // baza carcasei stadionului (SHELL_PROFILE la y = 0)

const r1 = (v) => Math.round(v * 10) / 10
const flat = (pts) => pts.flatMap(([x, z]) => [r1(x), r1(z)])
const open = (pts) => (pts[0][0] === pts.at(-1)[0] && pts[0][1] === pts.at(-1)[1] ? pts.slice(0, -1) : pts)

// distanța unui punct în afara elipsei bazei (pe direcția normalei, aproximativ)
function offsetOf(x, z) {
  let lo = -40
  let hi = 80
  for (let k = 0; k < 50; k++) {
    const m = (lo + hi) / 2
    if ((x / (FOOT.ax + m)) ** 2 + (z / (FOOT.az + m)) ** 2 > 1) lo = m
    else hi = m
  }
  return lo
}

// intersecția razei din centru (prin punctul elipsei de la unghiul t) cu un poligon
function rayHit(poly, t) {
  const dx = FOOT.ax * Math.cos(t)
  const dz = FOOT.az * Math.sin(t)
  let best = null
  for (let i = 0; i < poly.length; i++) {
    const [ax, az] = poly[i]
    const [bx, bz] = poly[(i + 1) % poly.length]
    const ex = bx - ax
    const ez = bz - az
    const den = dx * ez - dz * ex
    if (Math.abs(den) < 1e-9) continue
    const s = (ax * ez - az * ex) / den
    const u = (ax * dz - az * dx) / den
    if (s > 0 && u >= 0 && u <= 1 && (!best || s > best)) best = s
  }
  return best ? [dx * best, dz * best] : null
}

const osm = parse(await fetchTiles())
const way = (id) => open(ring(osm, String(id)))

// conturul clădirii (marginea podiumului): distanța față de baza carcasei, la 72 de unghiuri
const outline = way(239542656)
const OUTLINE_D = []
for (let k = 0; k < 72; k++) {
  const t = (k / 72) * Math.PI * 2
  const p = rayHit(outline, t)
  OUTLINE_D.push(r1(p ? offsetOf(p[0], p[1]) : 6))
}

const esplanade = way(717755464)
const grass = {
  west: way(717755452), // fâșia de gazon de la vest de esplanadă
  eastA: way(717755434), // panta de gazon dinspre aleea auto (est)
  eastB: way(717755435), // gazonul dintre podium și rampa pietonală
  wellB: way(717755436), // curtea de lumină din mijloc (gazon)
  wellC: way(717755437), // curtea de lumină de vest (gazon)
}
// curtea de lumină de est (cu mașinile parcării de sub peluză): golul din conturul esplanadei
const wellA = [[17.4, 117.1], [36.9, 113.4], [36.4, 122.3], [18.4, 126.5]]

const steps = [736846133, 717755456, 717755457].map((id) => {
  const w = osm.ways.get(String(id))
  const pts = ring(osm, String(id))
  // incline=down: în sensul căii, scara coboară
  return { from: pts[0].map(r1), to: pts.at(-1).map(r1), down: w.tags.incline === 'down' }
})

const node = (id) => {
  const n = osm.nodes.get(String(id))
  return n
}
const statueNode = node(6340761996)
const { toLocal } = await import('./build-osm.mjs')
const statue = statueNode ? toLocal(statueNode.lat, statueNode.lon).map(r1) : [49.6, 161.9]

const round = way(717755441)
const rc = round.reduce((a, p) => [a[0] + p[0] / round.length, a[1] + p[1] / round.length], [0, 0])
const rr = round.reduce((a, p) => a + Math.hypot(p[0] - rc[0], p[1] - rc[1]), 0) / round.length

const treeRows = [717755448, 717755449, 717755450].map((id) => flat(ring(osm, String(id))))

const js = `// Generat de scripts/build-precinct.mjs din OpenStreetMap (© OpenStreetMap contributors, ODbL).
// Incinta Stadionului „Ion Oblemenco”, în coordonatele scenei (metri, x = est, z = sud).

// marginea clădirii (podiumul) față de baza carcasei (elipsa ${FOOT.ax} × ${FOOT.az} m), la 72 de unghiuri
export const OUTLINE_D = ${JSON.stringify(OUTLINE_D)}
// Esplanada Stadion (zona pietonală dinspre Bd. Ilie Balaci)
export const ESPLANADE = ${JSON.stringify(flat(esplanade))}
// spațiile verzi ale esplanadei
export const GRASS = ${JSON.stringify(Object.fromEntries(Object.entries(grass).map(([k, v]) => [k, flat(v)])))}
// curțile de lumină din marginea de sud (deschideri spre parterul de sub peluză)
export const WELLS = ${JSON.stringify({ A: flat(wellA), B: flat(grass.wellB), C: flat(grass.wellC) })}
// scările dintre teren și podium: de la \`from\` la \`to\` (down: coboară în sensul ăsta)
export const STEPS = ${JSON.stringify(steps)}
// statuia lui Ion Oblemenco
export const STATUE = ${JSON.stringify(statue)}
// sensul giratoriu de la sud-vest (cu heliportul pe insula de gazon)
export const ROUNDABOUT = ${JSON.stringify({ c: rc.map(r1), r: r1(rr) })}
// aliniamentele de copaci din parcarea Sălii Polivalente
export const TREE_ROWS = ${JSON.stringify(treeRows)}
`
fs.writeFileSync(OUT, js)
console.log(`→ ${path.relative(ROOT, OUT)} (${(js.length / 1024).toFixed(1)} KB)`)
console.log('OUTLINE_D', OUTLINE_D.join(' '))
