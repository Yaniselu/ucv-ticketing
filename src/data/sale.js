// Configurația de vânzare a unui meci, comună pentru browser și server: ce sectoare sunt la
// vânzare, la ce preț, care sunt ale oaspeților. Serverul o folosește ca să valideze și să
// calculeze prețul fiecărui loc (prețul nu vine niciodată din browser).
import { PRICES, STANDS } from './stadium-data.js'

export const FREE = 0
export const TAKEN = 1
export const BLOCKED = 2 // nu se vinde online

// cheia stabilă a unui loc (aceeași în browser, pe server și în baza de date)
export const seatKey = (s) => (s.kind === 'wheelchair' ? `WC${s.zone}|${s.num}` : s.kind === 'press' ? `H|${s.row}|${s.num}` : `${s.sector}|${s.row}|${s.num}`)

// grupurile de sectoare care pot fi date oaspeților (numerele de pe planul stadionului)
export const AWAY_GROUPS = ['1', '2', '3', '4', '5', '6', '7', '8', '9', '10', '11', '12', '13', '14', '15', '16', '17', '18', '19']

export function defaultConfig(layout) {
  const sectors = {}
  for (const s of layout.sectors) sectors[s.id] = { onSale: true, price: s.basePrice ?? s.price }
  return {
    sectors,
    boxes: { onSale: true, price: PRICES.BOX },
    away: { groups: ['18'], half19: true, online: false },
    wheelchairOnline: false,
    maxPerOrder: 6,
    maxPerUser: 10,
  }
}

const int = (v, lo, hi, d) => {
  const n = Math.round(Number(v))
  return Number.isFinite(n) ? Math.min(hi, Math.max(lo, n)) : d
}

// curăță o configurație venită din panoul de administrare (doar câmpuri și valori cunoscute)
export function normalizeConfig(input, layout) {
  const base = defaultConfig(layout)
  const c = input && typeof input === 'object' ? input : {}
  const out = { ...base, sectors: {} }
  for (const s of layout.sectors) {
    const v = c.sectors?.[s.id] || {}
    const d = base.sectors[s.id]
    out.sectors[s.id] = { onSale: v.onSale === undefined ? d.onSale : !!v.onSale, price: int(v.price, 0, 100000, d.price) }
  }
  out.boxes = { onSale: c.boxes?.onSale === undefined ? true : !!c.boxes.onSale, price: int(c.boxes?.price, 0, 100000, base.boxes.price) }
  const groups = Array.isArray(c.away?.groups) ? c.away.groups.map(String).filter((g) => AWAY_GROUPS.includes(g)) : base.away.groups
  out.away = { groups: [...new Set(groups)], half19: c.away?.half19 === undefined ? base.away.half19 : !!c.away.half19, online: !!c.away?.online }
  out.wheelchairOnline = !!c.wheelchairOnline
  out.maxPerOrder = int(c.maxPerOrder, 1, 20, base.maxPerOrder)
  out.maxPerUser = int(c.maxPerUser, 1, 50, base.maxPerUser)
  return out
}

// aplică configurația pe layout (prețuri, oaspeți, titluri, porți) și întoarce starea de bază a
// fiecărui loc, înainte de locurile vândute / rezervate
export function applyConfig(layout, cfg) {
  const away = new Set(cfg.away.groups)
  for (const s of layout.sectors) {
    const c = cfg.sectors[s.id] || { onSale: true, price: s.basePrice }
    s.onSale = c.onSale
    s.price = c.price
    s.away = s.num != null && away.has(String(s.group))
    s.title = s.away ? `Sector ${s.num} · Oaspeți` : s.baseTitle
    s.gate = s.away ? 'Acces oaspeți' : s.baseGate
  }
  const sec = new Map(layout.sectors.map((s) => [s.id, s]))
  layout.boxPrice = cfg.boxes.price
  layout.boxesOnSale = cfg.boxes.onSale
  layout.awayOnline = cfg.away.online
  const status = new Uint8Array(layout.seats.length)
  for (const seat of layout.seats) {
    let st = FREE
    if (seat.kind === 'box') {
      seat.price = cfg.boxes.price
      if (!cfg.boxes.onSale) st = BLOCKED
    } else if (seat.kind === 'press') {
      st = BLOCKED
    } else {
      const s = sec.get(seat.sector)
      seat.price = s.price
      seat.away = s.away || (cfg.away.half19 && !!seat.awayHalf)
      if (!s.onSale) st = BLOCKED
      if (seat.away && !cfg.away.online) st = BLOCKED
      if (seat.kind === 'wheelchair' && !cfg.wheelchairOnline) st = BLOCKED
    }
    status[seat.i] = st
  }
  return status
}

export const seatGate = (layout, seat) => {
  if (seat.kind === 'box') return STANDS.VIP.gate
  if (seat.away) return 'Acces oaspeți'
  return layout.sectors.find((s) => s.id === seat.sector)?.gate || ''
}

// mulțimi de locuri ca șir de biți în base64 (≈ 4 KB pentru tot stadionul)
export function encodeBits(n, indices) {
  const b = new Uint8Array(Math.ceil(n / 8))
  for (const i of indices) b[i >> 3] |= 1 << (i & 7)
  let s = ''
  for (let k = 0; k < b.length; k += 0x8000) s += String.fromCharCode.apply(null, b.subarray(k, k + 0x8000))
  return btoa(s)
}
export function decodeBits(str, n) {
  const raw = atob(str || '')
  const out = []
  for (let i = 0; i < Math.min(n, raw.length * 8); i++) if (raw.charCodeAt(i >> 3) & (1 << (i & 7))) out.push(i)
  return out
}
