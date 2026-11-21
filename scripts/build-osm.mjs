// Descarcă din OpenStreetMap clădirile, străzile și zonele verzi din jurul
// Stadionului „Ion Oblemenco” și le transformă în coordonatele scenei 3D.
//
//   node scripts/build-osm.mjs            → public/data/craiova.json
//
// Sistemul scenei: originea în centrul terenului (OSM way 220474447),
// axa lungă a terenului pe z (nord = −z), metri. Terenul real e rotit
// cu 12,4° spre vest față de nordul geografic.
// Date © OpenStreetMap contributors, licență ODbL.

import fs from 'node:fs'
import path from 'node:path'

const ROOT = path.dirname(path.dirname(new URL(import.meta.url).pathname))
const CACHE = path.join(ROOT, 'scripts', '.cache')
const OUT = path.join(ROOT, 'public', 'data', 'craiova.json')

export const ORIGIN = { lat: 44.31402445, lon: 23.78428645, rotationDeg: -12.4 }
const BBOX = { s: 44.304, w: 23.77, n: 44.324, e: 23.799 }
const RADIUS_BUILDINGS = 1050
const RADIUS_ROADS = 1250

export async function fetchTiles() {
  fs.mkdirSync(CACHE, { recursive: true })
  const files = []
  let k = 0
  for (const lat of [BBOX.s, (BBOX.s + BBOX.n) / 2]) {
    for (const lon of [BBOX.w, (BBOX.w + BBOX.e) / 2]) {
      k++
      const f = path.join(CACHE, `q${k}.osm`)
      if (!fs.existsSync(f)) {
        const bb = [lon, lat, lon + (BBOX.e - BBOX.w) / 2, lat + (BBOX.n - BBOX.s) / 2].map((v) => v.toFixed(5)).join(',')
        const url = `https://api.openstreetmap.org/api/0.6/map?bbox=${bb}`
        console.log('↓', url)
        const res = await fetch(url, { headers: { 'User-Agent': 'ucv-ticketing-prototype/1.0' } })
        if (!res.ok) throw new Error(`${res.status} ${url}`)
        fs.writeFileSync(f, await res.text())
      }
      files.push(f)
    }
  }
  return files
}

export function parse(files) {
  const nodes = new Map()
  const ways = new Map()
  const rels = new Map()
  const attr = (s, k) => {
    const m = s.match(new RegExp(`\\s${k}="([^"]*)"`))
    return m ? m[1] : null
  }
  const unesc = (s) => s.replace(/&quot;/g, '"').replace(/&apos;/g, "'").replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&amp;/g, '&')
  const tagsOf = (body) => {
    const t = {}
    for (const m of body.matchAll(/<tag k="([^"]*)" v="([^"]*)"\/>/g)) t[unesc(m[1])] = unesc(m[2])
    return t
  }
  for (const f of files) {
    const xml = fs.readFileSync(f, 'utf8')
    for (const m of xml.matchAll(/<node ([^>]*?)(\/>|>([\s\S]*?)<\/node>)/g)) {
      nodes.set(attr(' ' + m[1], 'id'), { lat: +attr(' ' + m[1], 'lat'), lon: +attr(' ' + m[1], 'lon'), tags: m[3] ? tagsOf(m[3]) : {} })
    }
    for (const m of xml.matchAll(/<way ([^>]*?)>([\s\S]*?)<\/way>/g)) {
      const nd = [...m[2].matchAll(/<nd ref="(\d+)"\/>/g)].map((x) => x[1])
      ways.set(attr(' ' + m[1], 'id'), { nd, tags: tagsOf(m[2]) })
    }
    for (const m of xml.matchAll(/<relation ([^>]*?)>([\s\S]*?)<\/relation>/g)) {
      const mem = [...m[2].matchAll(/<member type="(\w+)" ref="(\d+)" role="([^"]*)"\/>/g)].map((x) => ({ type: x[1], ref: x[2], role: x[3] }))
      rels.set(attr(' ' + m[1], 'id'), { mem, tags: tagsOf(m[2]) })
    }
  }
  return { nodes, ways, rels }
}

const KX = Math.cos((ORIGIN.lat * Math.PI) / 180) * 111320
const KZ = 110540
const TH = (ORIGIN.rotationDeg * Math.PI) / 180
export function toLocal(lat, lon) {
  const x = (lon - ORIGIN.lon) * KX
  const z = -(lat - ORIGIN.lat) * KZ
  return [x * Math.cos(TH) + z * Math.sin(TH), -x * Math.sin(TH) + z * Math.cos(TH)]
}

const r1 = (v) => Math.round(v * 10) / 10
export function ring(osm, wayId) {
  const w = osm.ways.get(wayId)
  if (!w) return null
  const pts = []
  for (const id of w.nd) {
    const n = osm.nodes.get(id)
    if (!n) return null
    pts.push(toLocal(n.lat, n.lon))
  }
  return pts
}
const area = (p) => {
  let a = 0
  for (let i = 0; i < p.length - 1; i++) a += p[i][0] * p[i + 1][1] - p[i + 1][0] * p[i][1]
  return a / 2
}
const centroid = (p) => {
  let x = 0, z = 0
  const n = p.length - 1
  for (let i = 0; i < n; i++) { x += p[i][0]; z += p[i][1] }
  return [x / n, z / n]
}
const flat = (p) => p.slice(0, -1).flatMap(([x, z]) => [r1(x), r1(z)])
const flatLine = (p) => p.flatMap(([x, z]) => [r1(x), r1(z)])

// stadionul însuși (îl desenăm noi, la detaliu)
const insideStadium = ([x, z]) => (x / 108) ** 2 + (z / 120) ** 2 < 1

function buildingHeight(t, a) {
  const lv = parseFloat(t['building:levels'])
  const h = parseFloat(t.height)
  const b = t.building
  if (!Number.isNaN(h)) return h
  if (!Number.isNaN(lv)) return lv * 3 + (b === 'house' ? 1 : 0.6)
  switch (b) {
    case 'house': case 'detached': case 'semidetached_house': return a > 220 ? 7.5 : 6
    case 'apartments': case 'residential': return a > 600 ? 31 : 15.5
    case 'dormitory': return 15
    case 'school': case 'kindergarten': case 'hospital': return 11
    case 'church': return 13
    case 'garage': case 'garages': case 'shed': case 'roof': case 'kiosk': return 3
    case 'commercial': case 'retail': case 'industrial': case 'warehouse': case 'office': return 8
    case 'grandstand': return 9
    default:
      if (a < 45) return 3
      if (a < 260) return 6
      if (a < 900) return 9
      return 12
  }
}
// 0 casă (acoperiș în patru ape), 1 bloc, 2 altele, 3 biserică, 4 anexă, 5 sport
function buildingKind(t, a) {
  const b = t.building
  if (t.leisure === 'sports_centre' || b === 'sports_hall' || b === 'grandstand') return 5
  if (b === 'church' || t.amenity === 'place_of_worship') return 3
  if (['garage', 'garages', 'shed', 'roof', 'kiosk'].includes(b) || a < 45) return 4
  if (['apartments', 'residential', 'dormitory'].includes(b)) return 1
  if (b === 'house' || b === 'detached' || b === 'semidetached_house' || (b === 'yes' && a < 260 && !t['building:levels'])) return 0
  return 2
}

function roadClass(t) {
  const h = t.highway
  if (['primary', 'primary_link', 'trunk'].includes(h)) return [0, 16]
  if (['secondary', 'secondary_link'].includes(h)) return [1, 13]
  if (['tertiary', 'tertiary_link'].includes(h)) return [2, 9.5]
  if (['residential', 'living_street', 'unclassified'].includes(h)) return [3, 6.5]
  if (h === 'service') return [4, 4]
  if (['footway', 'pedestrian', 'path', 'steps', 'cycleway'].includes(h)) return [5, 2.5]
  return null
}

async function main() {
  const osm = parse(await fetchTiles())
  console.log(`OSM: ${osm.nodes.size} noduri, ${osm.ways.size} căi, ${osm.rels.size} relații`)
  const out = { origin: ORIGIN, attribution: '© OpenStreetMap contributors (ODbL)', buildings: [], roads: [], names: [], areas: [], crossings: [] }
  const nameIdx = new Map()
  const seenBuilding = new Set()

  const addBuilding = (pts, t) => {
    if (!pts || pts.length < 4) return
    if (area(pts) > 0) pts = pts.slice().reverse() // orientare constantă
    const a = Math.abs(area(pts))
    const c = centroid(pts)
    if (Math.hypot(...c) > RADIUS_BUILDINGS || insideStadium(c)) return
    const h = buildingHeight(t, a)
    const kind = buildingKind(t, a)
    let name = t.name || ''
    if (/Polivalent/i.test(name)) name = 'Sala Polivalentă'
    const height = /Polivalent/i.test(name) ? 21 : h
    out.buildings.push([r1(height), kind, flat(pts), name])
  }
  for (const [id, w] of osm.ways) {
    if (!w.tags.building || w.tags.building === 'no') continue
    seenBuilding.add(id)
    addBuilding(ring(osm, id), w.tags)
  }
  for (const [, r] of osm.rels) {
    if (!r.tags.building) continue
    for (const m of r.mem) if (m.type === 'way' && m.role === 'outer' && !seenBuilding.has(m.ref)) addBuilding(ring(osm, m.ref), r.tags)
  }

  for (const [id, w] of osm.ways) {
    const t = w.tags
    // zonele pietonale (piețe) sunt poligoane, nu străzi
    const closed = w.nd.length > 3 && w.nd[0] === w.nd[w.nd.length - 1]
    const plaza = t.highway === 'pedestrian' && (t.area === 'yes' || closed)
    if (t.highway && !plaza) {
      const rc = roadClass(t)
      if (!rc) continue
      const pts = ring(osm, id)
      if (!pts) continue
      const mid = pts[Math.floor(pts.length / 2)]
      if (Math.hypot(...mid) > RADIUS_ROADS) continue
      let ni = -1
      if (t.name && rc[0] <= 3) {
        if (!nameIdx.has(t.name)) { nameIdx.set(t.name, out.names.length); out.names.push(t.name) }
        ni = nameIdx.get(t.name)
      }
      const width = parseFloat(t.width) || rc[1]
      // suprafața: 0 asfalt, 1 pavele / piatră cubică, 2 neasfaltat
      const sf = t.surface || ''
      const surf = /paving_stones|sett|cobblestone|unhewn|concrete:plates|bricks/.test(sf) ? 1 : /gravel|dirt|ground|unpaved|grass|compacted|earth|fine_gravel/.test(sf) ? 2 : 0
      // trotuarele: 0 niciunul, 1 stânga, 2 dreapta, 3 ambele, 4 implicit (după clasă)
      const sw = t.sidewalk || t['sidewalk:both'] || ''
      const side = sw === 'both' ? 3 : sw === 'left' ? 1 : sw === 'right' ? 2 : sw === 'no' || sw === 'none' || sw === 'separate' ? 0 : 4
      // pentru alei: 1 trotuar desenat separat, 2 trecere; pentru drumurile de serviciu: 3 culoar de parcare
      const kind = t.footway === 'sidewalk' ? 1 : t.footway === 'crossing' ? 2 : t.service === 'parking_aisle' ? 3 : 0
      out.roads.push([rc[0], r1(width), ni, flatLine(pts), surf, side, kind])
      continue
    }
    // zone verzi (pentru copaci) și parcări
    let kind = -1
    if (['park', 'garden'].includes(t.leisure) || ['grass', 'forest', 'meadow', 'recreation_ground', 'village_green', 'cemetery'].includes(t.landuse) || ['wood', 'scrub'].includes(t.natural)) kind = 0
    else if (t.amenity === 'parking') kind = 1
    else if (t.leisure === 'pitch') kind = 2
    else if (t.highway === 'pedestrian' || t['area:highway'] === 'pedestrian' || t['area:highway'] === 'footway' || t.place === 'square') kind = 4
    if (kind < 0) continue
    const pts = ring(osm, id)
    if (!pts || pts.length < 4 || pts[0][0] !== pts[pts.length - 1][0]) continue
    const c = centroid(pts)
    if (Math.hypot(...c) > RADIUS_ROADS || insideStadium(c)) continue
    out.areas.push([kind, flat(pts)])
  }
  // pistele și terenurile mapate ca multipoligon (ex. pista de atletism de lângă stadion)
  for (const [, r] of osm.rels) {
    if (!['track', 'pitch'].includes(r.tags.leisure)) continue
    for (const m of r.mem) {
      if (m.type !== 'way' || m.role !== 'outer') continue
      const pts = ring(osm, m.ref)
      if (!pts || pts.length < 4 || pts[0][0] !== pts[pts.length - 1][0]) continue
      const c = centroid(pts)
      if (Math.hypot(...c) > RADIUS_ROADS || insideStadium(c)) continue
      out.areas.push([2, flat(pts)])
    }
  }
  for (const [, n] of osm.nodes) {
    if (n.tags.natural === 'tree') out.areas.push([3, toLocal(n.lat, n.lon).map(r1)])
    // trecerile de pietoni (zebra), pe străzi
    if (n.tags.highway === 'crossing' && n.tags.crossing !== 'unmarked') {
      const c = toLocal(n.lat, n.lon)
      if (Math.hypot(...c) < RADIUS_ROADS) out.crossings.push(c.map(r1))
    }
  }

  fs.mkdirSync(path.dirname(OUT), { recursive: true })
  fs.writeFileSync(OUT, JSON.stringify(out))
  const kb = (fs.statSync(OUT).size / 1024).toFixed(0)
  console.log(`→ ${path.relative(ROOT, OUT)}: ${out.buildings.length} clădiri, ${out.roads.length} străzi, ${out.names.length} nume, ${out.areas.length} zone (${kb} KB)`)
}

if (process.argv[1] && process.argv[1].endsWith('build-osm.mjs')) main()
