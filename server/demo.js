// Date demo pentru panoul de administrare: meciuri în toate stările (la vânzare, vânzarea începe
// curând, ciornă, meci jucat cu spectatori intrați), cumpărători cu comenzi plătite, bilete scanate
// la poartă, o comandă anulată, locuri blocate și coșuri în lucru.
//
// Comenzile se scriu în aceleași tabele și cu aceleași reguli ca vânzarea reală: locul trebuie să
// fie la vânzare și liber, prețul vine din configurația meciului, iar baza de date refuză orice
// loc vândut de două ori (cheia primară a seat_locks + indexul unic al biletelor active).
// Totul e marcat ca demo (meciuri „demo-…”, conturi „@demo.test”), deci se poate șterge oricând.
import crypto from 'node:crypto'
import { query, tx } from './db.js'
import { fail } from './http.js'
import { audit, hashPassword } from './security.js'
import { venue, evaluate, seatInfo } from './venue.js'
import { defaultConfig, seatKey, FREE } from '../src/data/sale.js'
import { paymentMode, hold, HOLD_MINUTES } from './sales.js'
import { cancelOrder, blockSeats } from './admin.js'
import { orderCode } from './qr.js'

export const DEMO_EMAIL = '@demo.test' // domeniu rezervat (RFC 2606): niciun email nu pleacă nicăieri
const DAY = 86400000

const FIRST = ['Andrei', 'Maria', 'Ion', 'Elena', 'Mihai', 'Ioana', 'Alexandru', 'Ana', 'Cristian', 'Gabriela', 'Florin', 'Raluca', 'Bogdan', 'Daniela', 'Marius', 'Alina', 'Ștefan', 'Irina', 'Radu', 'Cristina', 'Vlad', 'Simona', 'Costel', 'Mirela', 'Dorin', 'Adriana', 'Sorin', 'Larisa', 'Ciprian', 'Diana']
const LAST = ['Popescu', 'Ionescu', 'Dumitrescu', 'Stan', 'Stoica', 'Gheorghe', 'Rusu', 'Munteanu', 'Matei', 'Constantin', 'Bălan', 'Oprea', 'Marin', 'Tudor', 'Ene', 'Dinu', 'Mitrea', 'Neagu', 'Preda', 'Văduva', 'Ciobanu', 'Pîrvu', 'Badea', 'Lungu', 'Barbu']

// generator determinist (aceleași date la fiecare rulare)
function rng(seed) {
  let s = seed >>> 0
  return () => ((s = (s * 1664525 + 1013904223) >>> 0) / 4294967296)
}
const ascii = (s) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase()

// meciurile demo, relativ la „acum”
function demoEvents(now) {
  const at = (days, h = 19, m = 0) => {
    const d = new Date(now + days * DAY)
    d.setUTCHours(h - 2, m, 0, 0) // ora României (iarna, UTC+2)
    return d
  }
  return [
    { id: 'demo-ucv-fcsb', away: 'FCSB', comp: 'superliga', phase: 'Etapa 19', kickoff: at(9, 20, 30), status: 'published', saleStart: new Date(now - 6 * DAY), buyers: 1800, tweak: 'open' },
    { id: 'demo-ucv-rapid', away: 'Rapid București', comp: 'cupa', phase: 'Sferturi de finală', kickoff: at(23, 18), status: 'published', saleStart: new Date(now + 3 * DAY), buyers: 0, tweak: 'soon' },
    { id: 'demo-ucv-cfr', away: 'CFR Cluj', comp: 'superliga', phase: 'Etapa 18', kickoff: at(-4, 20), status: 'published', saleStart: new Date(now - 18 * DAY), buyers: 1150, tweak: 'played' },
    { id: 'demo-ucv-lazio', away: 'SS Lazio', comp: 'europa', phase: 'Play-off · tur', kickoff: at(44, 22), status: 'draft', saleStart: null, buyers: 0, tweak: 'draft' },
  ]
}

export async function clearDemo(actor) {
  const r = await tx(async (q) => {
    const t = await q(`DELETE FROM tickets WHERE event_id LIKE 'demo-%' RETURNING id`)
    await q(`DELETE FROM seat_locks WHERE event_id LIKE 'demo-%'`)
    const o = await q(`DELETE FROM orders WHERE event_id LIKE 'demo-%' RETURNING id`)
    const e = await q(`DELETE FROM events WHERE id LIKE 'demo-%' RETURNING id`)
    // conturile demo (nu și administratorii, nici conturile care au comenzi reale)
    const u = await q(
      `DELETE FROM users WHERE email LIKE '%' || $1 AND role <> 'admin' AND NOT EXISTS (SELECT 1 FROM orders o WHERE o.user_id = users.id) RETURNING id`,
      [DEMO_EMAIL],
    )
    return { events: e.length, orders: o.length, tickets: t.length, users: u.length }
  })
  if (actor) await audit(actor.id, 'demo.clear', r)
  return r
}

export async function seedDemo(actor) {
  if (paymentMode() !== 'test') fail(403, 'Datele demo se pot genera doar când plățile sunt în modul de test.')
  await clearDemo(null)
  const now = Date.now()
  const R = rng(1948)
  const pick = (a) => a[Math.floor(R() * a.length)]
  const { layout } = venue()
  // un singur hash pentru toate conturile demo: parola e aleatoare și nu e salvată nicăieri,
  // deci în conturile demo nu se poate intra
  const pwHash = await hashPassword(crypto.randomBytes(24).toString('base64url'))

  // ─── cumpărătorii ───
  const NB = 3000
  const buyers = []
  for (let k = 0; k < NB; k++) {
    const first = pick(FIRST)
    const last = pick(LAST)
    buyers.push({
      id: crypto.randomUUID(), name: `${first} ${last}`,
      email: `${ascii(first)}.${ascii(last)}.${String(k + 1).padStart(3, '0')}${DEMO_EMAIL}`,
      phone: `+4072${String(Math.floor(R() * 1e7)).padStart(7, '0')}`,
      created: new Date(now - (2 + R() * 40) * DAY),
    })
  }
  const scanner = { id: crypto.randomUUID(), name: 'Steward Poarta 8', email: `steward.poarta8${DEMO_EMAIL}`, phone: '+40720000008', created: new Date(now - 60 * DAY) }
  await query(
    `INSERT INTO users (id, email, name, phone, password_hash, role, created_at)
     SELECT id, e, n, p, $5, r, c FROM unnest($1::uuid[], $2::text[], $3::text[], $4::text[], $6::text[], $7::timestamptz[]) AS t(id, e, n, p, r, c)`,
    [
      [...buyers, scanner].map((b) => b.id), [...buyers, scanner].map((b) => b.email), [...buyers, scanner].map((b) => b.name),
      [...buyers, scanner].map((b) => b.phone), pwHash, [...buyers.map(() => 'user'), 'scanner'], [...buyers, scanner].map((b) => b.created),
    ],
  )

  // sectoarele căutate (galeria în Peluza Nord, apoi Tribuna 2 la centru, Peluza Sud, Tribuna 1)
  const weights = { PN: 5, T2: 4, PS: 3, T1: 2, VIP: 1 }
  const summary = { events: 0, orders: 0, tickets: 0, scanned: 0, cancelled: 0, blocked: 0, holds: 0 }
  let buyerAt = 0
  for (const E of demoEvents(now)) {
    const cfg = defaultConfig(layout)
    if (E.comp === 'superliga') {
      // prețuri de campionat, mai mici decât în cupele europene
      for (const [id, s] of Object.entries(cfg.sectors)) s.price = Math.max(25, Math.round((s.price * 0.6) / 5) * 5)
      cfg.boxes.price = 450
    }
    if (E.tweak === 'open') cfg.sectors['12-1'].onSale = false // rezervat unei școli de fotbal
    cfg.maxPerUser = 6
    const saleEnd = null
    const kickoff = E.tweak === 'played' ? new Date(now + 2 * DAY) : E.kickoff // meciul jucat: vândut înainte, mutat apoi în trecut
    await query(
      `INSERT INTO events (id, home, away, competition_id, phase, kickoff, status, sale_start, sale_end, config, created_at, updated_at)
       VALUES ($1, 'Universitatea Craiova', $2, $3, $4, $5, $6, $7, $8, $9, $10, $10)`,
      [E.id, E.away, E.comp, E.phase, kickoff, E.status, E.saleStart, saleEnd, JSON.stringify(cfg), new Date(now - 25 * DAY)],
    )
    summary.events++
    if (!E.buyers) continue
    const [ev] = await query('SELECT * FROM events WHERE id = $1', [E.id])
    const ctx = evaluate(cfg)

    // locurile cumpărate: câte 1–4 locuri alăturate pe același rând, într-un sector ales după cerere
    const taken = new Uint8Array(layout.seats.length)
    const bySector = new Map()
    layout.seats.forEach((s, i) => {
      if (s.kind === 'wheelchair' || s.kind === 'press' || ctx.status[i] !== FREE) return
      const k = s.kind === 'box' ? 'VIP' : layout.sectors.find((x) => x.id === s.sector)?.stand
      if (!bySector.has(s.sector)) bySector.set(s.sector, { stand: k, seats: [] })
      bySector.get(s.sector).seats.push(i)
    })
    const sectors = [...bySector.entries()]
    const pool = sectors.flatMap(([id, v]) => Array(weights[v.stand] || 1).fill(id))
    const orders = []
    const saleFrom = ev.sale_start ? new Date(ev.sale_start).getTime() : now - 10 * DAY
    for (let b = 0; b < E.buyers; b++) {
      const buyer = buyers[buyerAt++ % NB]
      const sec = bySector.get(pick(pool))
      const want = 1 + Math.floor(R() * 4)
      // un loc de pornire liber, apoi vecinii lui de pe același rând
      for (let tries = 0; tries < 12; tries++) {
        const i0 = sec.seats[Math.floor(R() * sec.seats.length)]
        if (taken[i0]) continue
        const s0 = layout.seats[i0]
        const row = sec.seats.filter((i) => layout.seats[i].row === s0.row && !taken[i]).sort((a, b2) => layout.seats[a].num - layout.seats[b2].num)
        const at = row.indexOf(i0)
        const run = row.slice(at, at + want)
        if (!run.length) continue
        run.forEach((i) => (taken[i] = 1))
        const paid = new Date(saleFrom + R() * (now - saleFrom - 60000))
        orders.push({ id: crypto.randomUUID(), code: orderCode(), buyer, seats: run, paid })
        break
      }
    }
    // totul într-o singură tranzacție: comenzi, rânduri, locuri vândute, bilete
    const items = orders.flatMap((o) => o.seats.map((i, k) => ({ o, i, holder: k === 0 ? o.buyer.name : `${pick(FIRST)} ${o.buyer.name.split(' ').slice(-1)[0]}` })))
    await tx(async (q) => {
      await q(
        `INSERT INTO orders (id, code, user_id, event_id, status, total, payment_ref, created_at, paid_at)
         SELECT id, c, u, $1, 'paid', t, 'TEST-DEMO-' || substr(md5(id::text), 1, 10), p - interval '3 minutes', p
         FROM unnest($2::uuid[], $3::text[], $4::uuid[], $5::int[], $6::timestamptz[]) AS x(id, c, u, t, p)`,
        [E.id, orders.map((o) => o.id), orders.map((o) => o.code), orders.map((o) => o.buyer.id), orders.map((o) => o.seats.reduce((a, i) => a + ctx.price[i], 0)), orders.map((o) => o.paid)],
      )
      await q(
        `INSERT INTO order_items (order_id, seat_key, sector_id, price) SELECT * FROM unnest($1::uuid[], $2::text[], $3::text[], $4::int[])`,
        [items.map((x) => x.o.id), items.map((x) => seatKey(layout.seats[x.i])), items.map((x) => layout.seats[x.i].sector), items.map((x) => ctx.price[x.i])],
      )
      // cheia primară (meci, loc) face imposibilă a doua vânzare a aceluiași loc
      await q(
        `INSERT INTO seat_locks (event_id, seat_key, kind, order_id, created_at) SELECT $1, k, 'sold', o, c FROM unnest($2::text[], $3::uuid[], $4::timestamptz[]) AS x(k, o, c)`,
        [E.id, items.map((x) => seatKey(layout.seats[x.i])), items.map((x) => x.o.id), items.map((x) => x.o.paid)],
      )
      await q(
        `INSERT INTO tickets (order_id, event_id, seat_key, holder_name, price, info, created_at)
         SELECT o, $1, k, h, p, i::jsonb, c FROM unnest($2::uuid[], $3::text[], $4::text[], $5::int[], $6::text[], $7::timestamptz[]) AS x(o, k, h, p, i, c)`,
        [
          E.id, items.map((x) => x.o.id), items.map((x) => seatKey(layout.seats[x.i])), items.map((x) => x.holder),
          items.map((x) => ctx.price[x.i]), items.map((x) => JSON.stringify(seatInfo(x.i, ev, ctx))), items.map((x) => x.o.paid),
        ],
      )
    })
    summary.orders += orders.length
    summary.tickets += items.length

    if (E.tweak === 'open') {
      // platforma camerei TV: rândurile 30–32 din 10-2 blocate (locurile deja vândute rămân vândute)
      summary.blocked += (await blockSeats(actor, E.id, { sector: '10-2', rowFrom: 30, rowTo: 32 })).changed
      // o comandă anulată de administrator (biletele nu mai intră la poartă, locurile revin la vânzare)
      await cancelOrder(actor, orders[3].id)
      summary.cancelled++
      // coșuri în lucru: rezervări de 10 minute, prin aceeași funcție ca pe site
      const free = layout.seats.filter((s, i) => s.sector === '9-2' && s.row === 12 && !taken[i] && ctx.status[i] === FREE).slice(0, 9)
      for (let k = 0; k < 3; k++) {
        const u = buyers[NB - 1 - k]
        await hold(u, { eventId: E.id, seats: free.slice(k * 3, k * 3 + 3).map(seatKey) })
        summary.holds++
      }
    }
    if (E.tweak === 'played') {
      // meciul s-a jucat: îl mutăm în trecut și marcăm intrările la poartă (~86% dintre bilete)
      await query(`UPDATE events SET kickoff = $2, sale_end = $2 WHERE id = $1`, [E.id, E.kickoff])
      const used = await query(
        `UPDATE tickets SET status = 'used', used_by = $2, used_at = $3::timestamptz - (random() * interval '95 minutes')
         WHERE event_id = $1 AND status = 'valid' AND random() < 0.86 RETURNING id`,
        [E.id, scanner.id, E.kickoff],
      )
      summary.scanned += used.length
    }
  }
  summary.buyers = NB
  summary.holdMinutes = HOLD_MINUTES
  if (actor) await audit(actor.id, 'demo.seed', summary)
  return summary
}
