// Disponibilitate simulată, deterministă pentru un eveniment dat.
// Într-o integrare reală, aceste stări vin din sistemul de ticketing.
import { DEMAND, SOLD_OUT } from './stadium-data.js'

export const FREE = 0
export const TAKEN = 1
export const BLOCKED = 2 // nu se vinde online (presă, oaspeți, locuri pentru dizabilități)

function hash(str) {
  let h = 2166136261
  for (let i = 0; i < str.length; i++) h = Math.imul(h ^ str.charCodeAt(i), 16777619)
  return h >>> 0
}
function rng(seed) {
  let s = seed >>> 0
  return () => {
    s = (s + 0x6d2b79f5) >>> 0
    let t = s
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

export function computeAvailability(layout, eventId) {
  const rand = rng(hash(eventId))
  const status = new Uint8Array(layout.seats.length)
  for (const s of layout.sectors) {
    if (s.away) { for (const i of s.seatIdx) status[i] = BLOCKED; continue }
    if (SOLD_OUT.has(s.id)) { for (const i of s.seatIdx) status[i] = TAKEN; continue }
    const p = DEMAND[s.demand]
    const maxRow = layout.seats[s.seatIdx[s.seatIdx.length - 1]].row
    let k = 0
    while (k < s.seatIdx.length) {
      const seat = layout.seats[s.seatIdx[k]]
      // rândurile din mijloc sunt mai căutate
      const f = seat.row / maxRow
      const pr = Math.min(0.97, p + 0.12 * (1 - Math.abs(f - 0.4) * 2.2))
      const group = 1 + Math.floor(rand() * 5)
      const taken = rand() < pr
      for (let g = 0; g < group && k < s.seatIdx.length; g++, k++) {
        const j = s.seatIdx[k]
        if (layout.seats[j].row !== seat.row) break
        status[j] = taken ? TAKEN : FREE
      }
    }
  }
  for (const b of layout.boxes) {
    const full = rand() < 0.4
    for (const i of b.seatIdx) status[i] = full || rand() < DEMAND.BOX * 0.6 ? TAKEN : FREE
  }
  for (const i of layout.pressIdx) status[i] = BLOCKED
  for (const i of layout.accessibleIdx) status[i] = BLOCKED
  return status
}
