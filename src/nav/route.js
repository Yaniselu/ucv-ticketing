// Traseul spre loc: de la stația de autobuz, stația de taxi sau parcare, pe străzile reale
// (OpenStreetMap), pe scările / esplanada / liftul podiumului, pe promenadă până la turnichetele
// potrivite locului, apoi prin interior la vomitor, pe culoarul dintre inele, pe scară până la rând
// și de-a lungul rândului până la scaun.
import { pointU, D1, D2, Y2, WALK_D, WALK_Y, G, wrap8, lenPerU, backRowsAt, ring1Y, ring1Kind } from '../data/layout.js'
import { DECK_Y, gatePoints, precinctAccess, deckPoint, angleOfPoint, inPrecinct } from '../scene/precinct.js'

const SPEED = 1.25 // m/s, mers obișnuit (~4,5 km/h)
const RING_N = 360 // nodurile promenadei de pe podium (din grad în grad)
const RING_D = 2.2 // promenada: la 2,2 m în fața stâlpilor fațadei
const IN_D = -8 // coridorul din interior, în spatele fațadei vitrate
const STAND_GATE = { PN: 'POARTA 6', T2: 'POARTA 8', PS: 'PELUZA SUD', T1: 'TRIBUNA 1', VIP: 'VIP / LOJE' }

class Heap {
  constructor() {
    this.a = []
  }
  push(d, n) {
    const a = this.a
    a.push([d, n])
    let i = a.length - 1
    while (i > 0) {
      const p = (i - 1) >> 1
      if (a[p][0] <= a[i][0]) break
      ;[a[p], a[i]] = [a[i], a[p]]
      i = p
    }
  }
  pop() {
    const a = this.a
    const top = a[0]
    const last = a.pop()
    if (a.length) {
      a[0] = last
      let i = 0
      for (;;) {
        const l = 2 * i + 1
        const r = l + 1
        let m = i
        if (l < a.length && a[l][0] < a[m][0]) m = l
        if (r < a.length && a[r][0] < a[m][0]) m = r
        if (m === i) break
        ;[a[m], a[i]] = [a[i], a[m]]
        i = m
      }
    }
    return top
  }
  get size() {
    return this.a.length
  }
}

const angDiff = (a, b) => Math.abs(((a - b + Math.PI * 3) % (Math.PI * 2)) - Math.PI)
const P = (u, d, y) => {
  const q = pointU(u, d)
  return [q.x, y, q.z]
}
const dist3 = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2])
const lenOf = (pts) => pts.reduce((s, p, k) => (k ? s + dist3(pts[k - 1], p) : 0), 0)
const fmtM = (m) => (m < 950 ? `${Math.max(10, Math.round(m / 10) * 10)} m` : `${(m / 1000).toFixed(1).replace('.', ',')} km`)
export const minutes = (m) => Math.max(1, Math.round(m / SPEED / 60))
const nth = (k) => (k <= 1 ? 'primul' : `al ${k}-lea`)

export function createRouter({ data, layout }) {
  const seats = layout.seats
  const sectorById = new Map(layout.sectors.map((s) => [s.id, s]))
  const gates = gatePoints()
  const access = precinctAccess()

  // ─── Graful: străzile și aleile din OSM (fără cele de pe podium), promenada și intrările ───
  const X = []
  const Z = []
  const adj = []
  const kind = [] // 0 stradă, 1 promenadă, 2 intrare jos, 3 intrare sus
  const byKey = new Map()
  const addNode = (x, z, k) => {
    X.push(x)
    Z.push(z)
    adj.push([])
    kind.push(k)
    return X.length - 1
  }
  const roadNode = (x, z) => {
    const key = `${x},${z}`
    let i = byKey.get(key)
    if (i === undefined) {
      i = addNode(x, z, 0)
      byKey.set(key, i)
    }
    return i
  }
  // tip muchie: 0 mers, 1 scări, 2 lift, 3 esplanadă
  const link = (a, b, w, name = -1, type = 0) => {
    adj[a].push([b, w, name, type])
    adj[b].push([a, w, name, type])
  }
  for (const [, , ni, pts] of data.roads) {
    let prev = -1
    for (let k = 0; k < pts.length; k += 2) {
      const x = pts[k]
      const z = pts[k + 1]
      const i = inPrecinct(x, z, -1) ? -1 : roadNode(x, z)
      if (prev >= 0 && i >= 0) link(prev, i, Math.hypot(X[i] - X[prev], Z[i] - Z[prev]), ni)
      prev = i
    }
  }
  const roadCount = X.length
  const nearestRoad = (x, z, max = Infinity) => {
    let best = -1
    let bd = max
    for (let i = 0; i < roadCount; i++) {
      if (!adj[i].length) continue
      const d = Math.hypot(X[i] - x, Z[i] - z)
      if (d < bd) {
        bd = d
        best = i
      }
    }
    return [best, bd]
  }
  // promenada de pe podium
  const ring0 = X.length
  for (let k = 0; k < RING_N; k++) {
    const [x, z] = deckPoint((k / RING_N) * Math.PI * 2, RING_D)
    addNode(x, z, 1)
  }
  for (let k = 0; k < RING_N; k++) {
    const a = ring0 + k
    const b = ring0 + ((k + 1) % RING_N)
    link(a, b, Math.hypot(X[b] - X[a], Z[b] - Z[a]))
  }
  const ringNodeAt = (t) => ring0 + (Math.round((((t / (Math.PI * 2)) % 1) + 1) % 1 * RING_N) % RING_N)
  const entries = []
  const addEntry = (bottom, top, label, type) => {
    const b = addNode(bottom[0], bottom[1], 2)
    const t = addNode(top[0], top[1], 3)
    const L = Math.hypot(top[0] - bottom[0], top[1] - bottom[1])
    link(b, t, type === 1 ? L * 1.3 : type === 2 ? L + 25 : L, -1, type)
    const r = ringNodeAt(angleOfPoint(top[0], top[1]))
    link(t, r, Math.hypot(X[r] - top[0], Z[r] - top[1]))
    // de la baza intrării la cele mai apropiate străzi (peste trotuar / parcare)
    const near = []
    for (let i = 0; i < roadCount; i++) {
      if (!adj[i].length) continue
      const d = Math.hypot(X[i] - bottom[0], Z[i] - bottom[1])
      if (d < 90) near.push([d, i])
    }
    near.sort((p, q) => p[0] - q[0])
    for (const [d, i] of near.slice(0, 3)) link(b, i, d)
    entries.push({ b, t, label, type })
  }
  if (access) {
    for (const s of access.stairs) addEntry(s.bottom, s.top, s.w > 10 ? 'scările mari din fața Tribunei 1' : 'scările podiumului', 1)
    for (const l of access.lifts) addEntry(l.bottom, l.top, 'liftul podiumului', 2)
    for (const e of access.esplanade) addEntry(e.bottom, e.top, 'esplanada dinspre Bulevardul Ilie Balaci', 3)
  }
  const entryOf = new Map()
  for (const e of entries) {
    entryOf.set(e.b, e)
    entryOf.set(e.t, e)
  }

  // ─── Dijkstra de la promenada din fața porții spre tot orașul ───
  function dijkstra(src, accessible) {
    const n = X.length
    const dist = new Float64Array(n).fill(Infinity)
    const prev = new Int32Array(n).fill(-1)
    const prevName = new Int32Array(n).fill(-1)
    const prevType = new Int8Array(n).fill(0)
    dist[src] = 0
    const h = new Heap()
    h.push(0, src)
    while (h.size) {
      const [d, i] = h.pop()
      if (d > dist[i]) continue
      for (const [j, w, name, type] of adj[i]) {
        if (accessible && (type === 1 || type === 3)) continue
        const nd = d + w
        if (nd < dist[j]) {
          dist[j] = nd
          prev[j] = i
          prevName[j] = name
          prevType[j] = type
          h.push(nd, j)
        }
      }
    }
    return { dist, prev, prevName, prevType }
  }

  // punctele de plecare: stațiile RAT (după nume), stațiile de taxi, parcările
  const pois = data.pois || { stops: [], taxi: [], parking: [] }
  const starts = []
  for (const [name, x, z, mode, lines] of pois.stops) {
    const [node, snap] = nearestRoad(x, z, 120)
    if (node >= 0) starts.push({ type: mode, name, lines, x, z, node, snap })
  }
  for (const [x, z] of pois.taxi) {
    const [node, snap] = nearestRoad(x, z, 120)
    if (node >= 0) starts.push({ type: 'taxi', name: 'Stația de taxi', lines: [], x, z, node, snap })
  }
  for (const [x, z, name, cap, park] of pois.parking) {
    const [node, snap] = nearestRoad(x, z, 120)
    if (node >= 0) starts.push({ type: 'car', name: name || (park === 'lane' || park === 'street_side' ? 'Locurile de parcare de pe stradă' : 'Parcarea'), cap, x, z, node, snap })
  }

  // ─── Poarta potrivită locului ───
  function gateFor(seat) {
    const sec = sectorById.get(seat.sector)
    let want = 'public'
    let title = STAND_GATE[sec?.stand] || null
    if (seat.kind === 'box' || seat.kind === 'press' || seat.kind === 'vip') {
      want = 'vip'
      title = null
    } else if (seat.away) {
      want = 'oaspeti'
      title = null
    } else if (seat.kind === 'wheelchair') {
      want = 'handicap'
      title = null
    }
    const t = angleOfPoint(seat.x, seat.z)
    let list = gates.filter((g) => g.kind === want && (!title || g.title === title))
    if (!list.length) list = gates.filter((g) => g.kind === want)
    if (!list.length) list = gates.filter((g) => g.kind === 'public')
    return list.reduce((a, g) => (angDiff(g.t, t) < angDiff(a.t, t) ? g : a))
  }
  // sectorul din dreptul unei porți (pentru descriere)
  const publicSectors = layout.sectors.filter((s) => s.stand !== 'VIP')
  const sectorNear = (t) => publicSectors.reduce((a, s) => (angDiff(angleOfPoint(s.center.x, s.center.z), t) < angDiff(angleOfPoint(a.center.x, a.center.z), t) ? s : a))
  const sectorName = (s) => (s.num != null ? `sectorului ${s.num}` : `sectorului ${s.letter || s.id}`)

  // locurile fiecărui rând (pentru numărarea scaunelor de la scară)
  const rowSeats = new Map()
  for (const s of seats) {
    if (s.u == null || !s.ring || s.kind === 'wheelchair') continue
    const k = `${s.ring}:${s.ringRow}`
    if (!rowSeats.has(k)) rowSeats.set(k, [])
    rowSeats.get(k).push(wrap8(s.u))
  }
  for (const l of rowSeats.values()) l.sort((a, b) => a - b)
  const seatsBetween = (ring, ringRow, ua, ub) => {
    const l = rowSeats.get(`${ring}:${ringRow}`) || []
    const [a, b] = [Math.min(wrap8(ua), wrap8(ub)), Math.max(wrap8(ua), wrap8(ub))]
    return l.filter((u) => u > a - 1e-6 && u < b + 1e-6).length
  }
  // stânga / dreapta pentru cineva care stă în punctul (u, d) și privește spre teren
  const sideOf = (u, d, to) => {
    const q = pointU(u, d)
    return (to[0] - q.x) * q.nz + (to[2] - q.z) * -q.nx > 0 ? 'dreapta' : 'stânga'
  }

  // cea mai apropiată scară de pe rândul locului
  function aisleFor(seat) {
    const r = seat.ringRow - 1
    const k = lenPerU(seat.u, seat.ring === 1 ? 10 : 30)
    let best = null
    let bd = Infinity
    for (const a of layout.aisles) {
      if (a.ring !== seat.ring) continue
      const dr = Math.abs(a.r - r)
      if (dr > 1) continue
      const du = Math.abs(wrap8(a.u - seat.u + 4) - 4) * k + dr * 6
      if (du < bd) {
        bd = du
        best = a
      }
    }
    return best
  }
  // vomitorul folosit: al sectorului (aceeași cifră) sau cel mai apropiat
  function vomFor(seat) {
    const sec = sectorById.get(seat.sector)
    const own = layout.voms.filter((v) => v.sectorObj?.num != null && v.sectorObj.num === sec?.num)
    const list = own.length ? own : layout.voms
    return list.reduce((a, v) => (Math.abs(wrap8(v.u - seat.u + 4) - 4) < Math.abs(wrap8(a.u - seat.u + 4) - 4) ? v : a))
  }

  // drumul prin interior: de la turnichet pe coridor până la unghiul t, apoi urcă la înălțimea y
  function corridor(gate, t, y) {
    const pts = [[...deckPoint(gate.t, IN_D), DECK_Y]].map(([x, z, yy]) => [x, yy, z])
    let d = t - gate.t
    d = ((d + Math.PI * 3) % (Math.PI * 2)) - Math.PI
    const n = Math.max(1, Math.ceil(Math.abs(d) / (4 * (Math.PI / 180))))
    for (let k = 1; k <= n; k++) {
      const [x, z] = deckPoint(gate.t + (d * k) / n, IN_D)
      pts.push([x, DECK_Y, z])
    }
    const [x, z] = deckPoint(t, IN_D - 4)
    pts.push([x, y, z])
    return pts
  }

  // ─── Traseul de la poartă la loc ───
  function inside(seat, gate) {
    const pts = []
    const steps = []
    const sec = sectorById.get(seat.sector)
    const add = (...p) => pts.push(...p)
    const rowText = `rândul ${seat.row}`
    if (seat.kind === 'box') {
      const b = layout.boxes.find((x) => x.num === seat.box)
      const t = angleOfPoint(seat.x, seat.z)
      add(...corridor(gate, t, b.floorY + 0.1))
      add([seat.x - 4, b.floorY + 0.1, seat.z], [seat.x, seat.y + 0.4, seat.z])
      steps.push({ text: `În interior, urcă la nivelul ${b.level} al lojelor (liftul sau scara VIP) și intră în loja ${b.num}. Fotoliul ${seat.num} e pe rândul ${seat.row} din fața geamului.`, at: pts[pts.length - 1] })
      return { pts, steps }
    }
    if (seat.kind === 'wheelchair') {
      const t = angleOfPoint(seat.x, seat.z)
      add(...corridor(gate, t, Y2(0)))
      const q = pointU(seat.u, D1(2) + 0.6)
      add([q.x, seat.y + 0.3, q.z], [seat.x, seat.y + 0.3, seat.z])
      steps.push({ text: `Personalul stadionului de la accesul pentru persoane cu dizabilități te însoțește până la platforma din fața Tribunei 2 (zona ${seat.zone}, locul ${seat.num}).`, at: pts[pts.length - 1] })
      return { pts, steps }
    }
    const ring = seat.ring
    const r = seat.ringRow - 1
    const aisle = aisleFor(seat)
    const seatPt = [seat.x, seat.y + 0.45, seat.z]
    // pe sus: locurile de sus din Tribuna 1 (G, presa, I), colțurile fără vomitor și sectorul
    // oaspeților (separat de vomitoarele gazdelor): din spatele tribunei, pe scara cea mai apropiată
    const topEntry = seat.away || (ring === 2 && (seat.kind === 'press' || ['G', 'I', '2', '7', '13', '18'].includes(sec?.id)))
    if (topEntry) {
      const a2 = ring === 2 && aisle ? aisle : aisleNearU(2, seat.u)
      if (a2) {
        const n = backRowsAt(a2.u)
        const yTop = Y2(n - 1)
        const back = pointU(a2.u, D2(n))
        add(...corridor(gate, angleOfPoint(back.x, back.z), yTop + 0.1))
        add(P(a2.u, D2(n) + 0.6, yTop + 0.1))
        const r2 = ring === 2 ? r : 0
        for (let j = n - 1; j >= r2; j--) add(P(a2.u, D2(j) + a2.depth / 2, Y2(j) + 0.1))
        const where = seat.kind === 'press' ? 'tribuna presei' : seat.away ? 'sectorul oaspeților' : `partea de sus a ${sectorName(sec)}`
        steps.push({ text: `În interior, urcă pe scări până în spatele tribunei (${where}).`, at: P(a2.u, D2(n) + 0.6, yTop + 0.1) })
        if (ring === 2) {
          add(P(seat.u, D2(r) + 0.15, Y2(r) + 0.1), seatPt)
          const k = seatsBetween(2, seat.ringRow, a2.u, seat.u)
          steps.push({ text: `Coboară pe scară până la ${rowText}. Locul ${seat.num} e ${nth(k)} scaun de la scară, spre ${sideOf(a2.u, D2(r), seatPt)} (privind spre teren).`, at: seatPt })
          return { pts, steps }
        }
        // inelul de jos: tot pe scară până la culoarul dintre inele, apoi mai departe în jos
        add(P(a2.u, WALK_D + 1.3, WALK_Y + 0.1))
        steps.push({ text: 'Coboară pe scară până la culoarul dintre inele.', at: P(a2.u, WALK_D + 1.3, WALK_Y + 0.1) })
        return finishRing1(seat, aisle, a2.u, pts, steps, seatPt, rowText)
      }
    }
    // VIP: din lounge-ul Tribunei 1 direct pe culoar; ceilalți: prin vomitorul sectorului
    let walkStart
    if (seat.kind === 'vip') {
      const t = angleOfPoint(seat.x, seat.z)
      add(...corridor(gate, t, WALK_Y + 0.1))
      walkStart = P(seat.u, WALK_D + 1.3, WALK_Y + 0.1)
      add(P(seat.u, D2(0) + 1.5, WALK_Y + 0.1), walkStart)
      steps.push({ text: 'În interior, treci prin lounge-ul VIP și ieși pe culoarul din fața lui.', at: walkStart })
    } else {
      const v = vomFor(seat)
      const mouth = P(v.u, D2(v.j1 + 1), WALK_Y + 0.1)
      const t = angleOfPoint(mouth[0], mouth[2])
      add(...corridor(gate, t, WALK_Y + 0.1))
      add(P(v.u, D2(v.j1 + 1) + 5, WALK_Y + 0.1), mouth)
      walkStart = P(v.u, WALK_D + 1.3, WALK_Y + 0.1)
      add(P(v.u, D2(0) + 0.3, WALK_Y + 0.1), walkStart)
      const lbl = v.sectorObj?.num != null ? v.sectorObj.num : v.sectorObj?.letter
      steps.push({ text: `În interior, mergi la vomitorul cu numărul ${lbl} și ieși pe culoarul dintre inele.`, at: mouth })
    }
    if (ring === 1) return finishRing1(seat, aisle, seat.kind === 'vip' ? seat.u : vomFor(seat).u, pts, steps, seatPt, rowText)
    if (!aisle) {
      add(seatPt)
      return { pts, steps }
    }
    const uFrom = vomFor(seat).u
    const walkLen = walkAlong(pts, uFrom, aisle.u)
    const aisleTop = pts[pts.length - 1]
    for (let j = 0; j <= r; j++) add(P(aisle.u, D2(j) + aisle.depth / 2, Y2(j) + 0.1))
    add(P(seat.u, D2(r) + 0.15, Y2(r) + 0.1), seatPt)
    const k = seatsBetween(2, seat.ringRow, aisle.u, seat.u)
    steps.push({ text: `${toAisleText(walkLen, uFrom, aisleTop)}, apoi urcă pe scară până la ${rowText}.`, at: aisleTop })
    steps.push({ text: `Locul ${seat.num} e ${nth(k)} scaun de la scară, spre ${sideOf(aisle.u, D2(r), seatPt)} (privind spre teren).`, at: seatPt })
    return { pts, steps }
  }

  // pe culoarul dintre inele, de la uFrom la uTo; întoarce lungimea mersului
  function walkAlong(pts, uFrom, uTo) {
    const du = wrap8(uTo - uFrom + 4) - 4
    const k = lenPerU(uFrom, 20)
    const nW = Math.max(1, Math.ceil((Math.abs(du) * k) / 3))
    for (let j = 1; j <= nW; j++) pts.push(P(uFrom + (du * j) / nW, WALK_D + 1.3, WALK_Y + 0.1))
    return Math.abs(du) * k
  }
  const toAisleText = (walkLen, uFrom, aisleTop) => (walkLen < 2
    ? 'Scara e chiar lângă tine'
    : `Mergi ${fmtM(walkLen)} pe culoar spre ${sideOf(uFrom, WALK_D, aisleTop)} (privind spre teren) până la scară`)
  // inelul de jos: de pe culoar, pe scara din dreptul rândului, în jos până la rând și apoi la loc
  function finishRing1(seat, aisle, uFrom, pts, steps, seatPt, rowText) {
    const r = seat.ringRow - 1
    if (!aisle) {
      pts.push(seatPt)
      return { pts, steps }
    }
    const walkLen = walkAlong(pts, uFrom, aisle.u)
    const aisleTop = pts[pts.length - 1]
    const kindAt = ring1Kind(aisle.u)
    const top = kindAt === 'P' ? G.ring1.rowsP : G.ring1.rows
    for (let j = top - 1; j >= r; j--) pts.push(P(aisle.u, D1(j) + aisle.depth / 2, ring1Y(j, kindAt) + 0.1))
    pts.push(P(seat.u, D1(r) + 0.15, ring1Y(r, ring1Kind(seat.u)) + 0.1), seatPt)
    const k = seatsBetween(1, seat.ringRow, aisle.u, seat.u)
    steps.push({ text: `${toAisleText(walkLen, uFrom, aisleTop)}, apoi coboară pe scară până la ${rowText} (inelul de jos).`, at: aisleTop })
    steps.push({ text: `Locul ${seat.num} e ${nth(k)} scaun de la scară, spre ${sideOf(aisle.u, D1(r), seatPt)} (privind spre teren).`, at: seatPt })
    return { pts, steps }
  }
  // cea mai apropiată scară a unui inel, după poziția pe contur (oricare rând)
  function aisleNearU(ring, u) {
    let best = null
    let bd = Infinity
    for (const a of layout.aisles) {
      if (a.ring !== ring) continue
      const du = Math.abs(wrap8(a.u - u + 4) - 4) + a.r * 1e-4
      if (du < bd) {
        bd = du
        best = a
      }
    }
    return best
  }

  // ─── Traseul complet ───
  function plan(seatIdx, startKey) {
    const seat = seats[seatIdx]
    const gate = gateFor(seat)
    const accessible = seat.kind === 'wheelchair'
    const ringNode = ringNodeAt(gate.t)
    const { dist, prev, prevName, prevType } = dijkstra(ringNode, accessible)
    // variantele de plecare, cele mai apropiate întâi (o stație = un nume)
    const opts = starts
      .map((s) => ({ ...s, key: `${s.type}:${s.name}:${s.x}`, total: dist[s.node] + s.snap }))
      .filter((s) => Number.isFinite(s.total))
      .sort((a, b) => a.total - b.total)
    const options = []
    const seen = new Set()
    for (const o of opts) {
      const id = o.type === 'bus' || o.type === 'tram' ? `${o.type}:${o.name}:${o.lines.join(',')}` : o.type
      if (seen.has(id)) continue
      seen.add(id)
      options.push(o)
    }
    const shown = [...options.filter((o) => o.type === 'bus' || o.type === 'tram').slice(0, 3), ...options.filter((o) => o.type === 'car').slice(0, 1), ...options.filter((o) => o.type === 'taxi').slice(0, 1)]
    const start = shown.find((o) => o.key === startKey) || shown[0]

    // drumul de afară: de la start la promenada din fața porții
    const out = []
    const names = []
    let entry = null
    if (start) {
      out.push([start.x, start.z])
      let i = start.node
      while (i >= 0) {
        out.push([X[i], Z[i]])
        if (entryOf.has(i) && !entry) entry = entryOf.get(i)
        const nm = prevName[i]
        if (nm >= 0 && data.names[nm] && names[names.length - 1] !== data.names[nm]) names.push(data.names[nm])
        if (i === ringNode) break
        i = prev[i]
      }
    }
    // pe promenadă până în fața turnichetelor, apoi prin ele
    const [gx0, gz0] = deckPoint(gate.t, RING_D)
    const [gx1, gz1] = deckPoint(gate.t, -0.6)
    out.push([gx0, gz0], [gx1, gz1], [gate.x, gate.z])
    const outLen = out.reduce((s, p, k) => (k ? s + Math.hypot(p[0] - out[k - 1][0], p[1] - out[k - 1][1]) : 0), 0)

    const inn = inside(seat, gate)
    const [ix, iz] = deckPoint(gate.t, IN_D)
    const indoor = [[gate.x, DECK_Y + 0.1, gate.z], [ix, DECK_Y + 0.1, iz], ...inn.pts]
    const inLen = lenOf(indoor)

    const near = sectorNear(gate.t)
    const steps = []
    if (start) {
      const lead = start.type === 'bus' || start.type === 'tram'
        ? `Coboară la stația „${start.name}” (${start.type === 'tram' ? 'tramvai' : 'autobuz'} ${start.lines.join(', ')}).`
        : start.type === 'taxi'
          ? 'Coboară la stația de taxi din apropiere.'
          : `Lasă mașina: ${start.name.toLowerCase()}.`
      steps.push({ text: lead, at: [start.x, 1, start.z] })
      const via = names.slice(0, 3)
      const entryText = entry ? entry.label : 'podiumul stadionului'
      steps.push({
        text: `Mergi pe jos ${fmtM(outLen)} (≈ ${minutes(outLen)} min)${via.length ? ` pe ${via.join(', apoi pe ')}` : ''}, urcă pe ${entryText} și apoi pe promenada de pe podium.`,
        at: entry ? [X[entry.t], DECK_Y, Z[entry.t]] : [gx0, DECK_Y, gz0],
      })
    }
    const gateWhere = gate.kind === 'vip' ? 'la intrarea VIP din centrul Tribunei 1' : `în dreptul ${sectorName(near)}`
    steps.push({
      text: gate.n
        ? `Intră pe la turnichetele „${gate.title}” ${gateWhere} și scanează codul QR de pe bilet.`
        : `Intră pe la poarta pentru persoane cu dizabilități (♿) ${gateWhere} și arată codul QR de pe bilet.`,
      at: [gate.x, DECK_Y + 1, gate.z],
    })
    steps.push(...inn.steps)
    return {
      seatIdx, seat, gate, start, options: shown, entry, steps,
      outdoor: out, indoor,
      outLen, inLen, minutes: minutes(outLen + inLen * 1.4),
    }
  }

  return { plan, gateFor }
}
