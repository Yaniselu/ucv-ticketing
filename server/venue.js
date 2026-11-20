// Stadionul pe server: același generator de locuri ca harta 3D (src/data/layout.js), deci
// fiecare loc are aceeași cheie, același sector și același preț ca în browser.
import crypto from 'node:crypto'
import { buildLayout } from '../src/data/layout.js'
import { applyConfig, seatKey, seatGate } from '../src/data/sale.js'
import { STANDS, COMPETITIONS } from '../src/data/stadium-data.js'

let V = null
export function venue() {
  if (V) return V
  const layout = buildLayout()
  const keyToIdx = new Map()
  layout.seats.forEach((s, i) => keyToIdx.set(seatKey(s), i))
  const sectorById = new Map(layout.sectors.map((s) => [s.id, s]))
  const boxById = new Map(layout.boxes.map((b) => [b.id, b]))
  // semnătura layout-ului: browserul verifică dacă are aceeași numerotare a locurilor
  const signature = crypto.createHash('sha1').update(layout.seats.map(seatKey).join(',')).digest('hex').slice(0, 12)
  V = { layout, keyToIdx, sectorById, boxById, signature }
  return V
}

// starea de bază, prețul și „oaspeți” pentru fiecare loc, după configurația meciului
// (calculate sincron, imediat după aplicare, ca două cereri să nu se amestece)
export function evaluate(cfg) {
  const { layout } = venue()
  const status = applyConfig(layout, cfg)
  const price = Int32Array.from(layout.seats, (s) => s.price || 0)
  const away = Uint8Array.from(layout.seats, (s) => (s.away ? 1 : 0))
  const gate = layout.seats.map((s) => seatGate(layout, s))
  const title = new Map(layout.sectors.map((s) => [s.id, s.title]))
  return { status, price, away, gate, title }
}

// datele locului tipărite pe bilet
export function seatInfo(i, ev, ctx) {
  const { layout, sectorById, boxById } = venue()
  const s = layout.seats[i]
  const comp = COMPETITIONS[ev.competition_id] || COMPETITIONS.superliga
  const base = {
    eventId: ev.id, home: ev.home, away: ev.away, competitionId: ev.competition_id, competition: comp.name,
    phase: ev.phase, kickoff: new Date(ev.kickoff).toISOString(), venue: 'Stadionul „Ion Oblemenco”, Craiova',
    kind: s.kind, row: s.row, seat: s.num, gate: ctx.gate[i], awayFans: !!ctx.away[i],
  }
  if (s.kind === 'box') {
    const b = boxById.get(s.sector)
    return { ...base, stand: STANDS.VIP.name, sector: `Loja ${b.num}`, sectorShort: String(b.num), level: b.level, ring: null }
  }
  const sec = sectorById.get(s.sector)
  return {
    ...base, stand: STANDS[sec.stand].name, sector: ctx.title.get(sec.id), sectorShort: String(sec.num ?? sec.letter ?? sec.id),
    ring: s.kind === 'seat' && sec.letter == null ? s.ring : null,
  }
}
