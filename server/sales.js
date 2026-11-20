// Vânzarea: meciuri, disponibilitate, rezervarea temporară a locurilor, plata, biletele.
// Toate verificările se fac pe server: locul există, e la vânzare, e liber, prețul vine din
// configurația meciului, limita de bilete pe comandă și pe cont.
import crypto from 'node:crypto'
import { query, tx } from './db.js'
import { fail } from './http.js'
import { venue, evaluate, seatInfo } from './venue.js'
import { defaultConfig, normalizeConfig, encodeBits, FREE } from '../src/data/sale.js'
import { EVENT as DEFAULT_EVENT } from '../src/data/stadium-data.js'
import { qrCode, ticketNumber, orderCode } from './qr.js'

export const HOLD_MINUTES = 10
export const paymentMode = () => (process.env.PAYMENT_MODE || 'test').toLowerCase()

// ─── Meciuri ──────────────────────────────────────────────────────────
export async function ensureSeed() {
  const rows = await query('SELECT count(*)::int AS n FROM events')
  if (rows[0].n) return
  const cfg = defaultConfig(venue().layout)
  await query(
    `INSERT INTO events (id, home, away, competition_id, phase, kickoff, status, sale_start, sale_end, config)
     VALUES ($1, $2, $3, $4, $5, $6, 'published', now(), $6, $7) ON CONFLICT (id) DO NOTHING`,
    [DEFAULT_EVENT.id, DEFAULT_EVENT.home, DEFAULT_EVENT.away, DEFAULT_EVENT.competitionId, DEFAULT_EVENT.phase, DEFAULT_EVENT.kickoff, JSON.stringify(cfg)],
  )
}

export function saleState(ev, now = Date.now()) {
  if (ev.status !== 'published') return 'closed'
  const k = new Date(ev.kickoff).getTime()
  const st = ev.sale_start ? new Date(ev.sale_start).getTime() : 0
  const en = Math.min(ev.sale_end ? new Date(ev.sale_end).getTime() : k, k)
  if (now < st) return 'soon'
  if (now >= en) return 'closed'
  return 'open'
}

export const eventConfig = (ev) => normalizeConfig(typeof ev.config === 'string' ? JSON.parse(ev.config) : ev.config, venue().layout)

export function eventView(ev) {
  return {
    id: ev.id, home: ev.home, away: ev.away, competitionId: ev.competition_id, phase: ev.phase,
    kickoff: new Date(ev.kickoff).toISOString(), status: ev.status,
    saleStart: ev.sale_start ? new Date(ev.sale_start).toISOString() : null,
    saleEnd: ev.sale_end ? new Date(ev.sale_end).toISOString() : null,
    saleState: saleState(ev), config: eventConfig(ev),
  }
}

export async function getEvent(id, { admin = false } = {}) {
  if (typeof id !== 'string' || id.length > 80) fail(404, 'Meciul nu există.')
  const rows = await query('SELECT * FROM events WHERE id = $1', [id])
  const ev = rows[0]
  if (!ev || (!admin && ev.status !== 'published')) fail(404, 'Meciul nu există.')
  return ev
}

export async function listEvents() {
  const rows = await query(`SELECT * FROM events WHERE status = 'published' ORDER BY kickoff ASC`)
  return rows.map(eventView)
}

// ─── Disponibilitate (pentru harta 3D) ────────────────────────────────
export async function availability(eventId, user) {
  const ev = await getEvent(eventId)
  const { layout, keyToIdx, signature } = venue()
  const locks = await query(
    `SELECT l.seat_key, l.kind, l.order_id, o.user_id FROM seat_locks l LEFT JOIN orders o ON o.id = l.order_id
     WHERE l.event_id = $1 AND (l.kind <> 'hold' OR l.expires_at > now())`,
    [ev.id],
  )
  const taken = []
  const blocked = []
  let mine = null
  for (const l of locks) {
    const i = keyToIdx.get(l.seat_key)
    if (i == null) continue
    if (l.kind === 'blocked') blocked.push(i)
    else if (l.kind === 'hold' && user && l.user_id === user.id) (mine = mine || { orderId: l.order_id, seats: [] }).seats.push(i)
    else taken.push(i)
  }
  if (mine) {
    const o = await query('SELECT code, expires_at, total FROM orders WHERE id = $1', [mine.orderId])
    Object.assign(mine, { code: o[0].code, total: o[0].total, expiresAt: new Date(o[0].expires_at).toISOString() })
  }
  return {
    event: eventView(ev), signature, seats: layout.seats.length,
    taken: encodeBits(layout.seats.length, taken), blocked: encodeBits(layout.seats.length, blocked),
    mine, serverTime: new Date().toISOString(), payment: paymentMode(), holdMinutes: HOLD_MINUTES,
  }
}

// ─── Rezervarea temporară ─────────────────────────────────────────────
export async function hold(user, body) {
  const ev = await getEvent(body.eventId)
  if (saleState(ev) !== 'open') fail(409, saleState(ev) === 'soon' ? 'Vânzarea pentru acest meci nu a început încă.' : 'Vânzarea pentru acest meci s-a încheiat.')
  const cfg = eventConfig(ev)
  const keys = Array.isArray(body.seats) ? [...new Set(body.seats.map(String))] : []
  if (!keys.length) fail(400, 'Alege cel puțin un loc.')
  if (keys.length > cfg.maxPerOrder) fail(400, `Poți cumpăra cel mult ${cfg.maxPerOrder} bilete într-o comandă.`)
  const { keyToIdx, layout } = venue()
  const ctx = evaluate(cfg)
  const items = keys.map((k) => {
    const i = keyToIdx.get(k)
    if (i == null) fail(400, 'Un loc ales nu există.')
    if (ctx.status[i] !== FREE) fail(409, 'Un loc ales nu se vinde online.', { taken: [k] })
    return { key: k, sector: layout.seats[i].sector, price: ctx.price[i] }
  })
  const total = items.reduce((a, it) => a + it.price, 0)
  return tx(async (q) => {
    // o singură comandă în lucru pe cont și meci; cererile aceluiași cont se execută pe rând
    await q('SELECT id FROM users WHERE id = $1 FOR UPDATE', [user.id])
    const old = await q(`UPDATE orders SET status = 'expired' WHERE user_id = $1 AND event_id = $2 AND status = 'pending' RETURNING id`, [user.id, ev.id])
    if (old.length) await q(`DELETE FROM seat_locks WHERE order_id = ANY($1::uuid[]) AND kind = 'hold'`, [old.map((o) => o.id)])
    const have = await q(
      `SELECT count(*)::int AS n FROM tickets t JOIN orders o ON o.id = t.order_id
       WHERE o.user_id = $1 AND t.event_id = $2 AND t.status <> 'cancelled'`,
      [user.id, ev.id],
    )
    if (have[0].n + keys.length > cfg.maxPerUser) {
      const left = Math.max(0, cfg.maxPerUser - have[0].n)
      fail(409, left ? `Mai poți cumpăra ${left} ${left === 1 ? 'bilet' : 'bilete'} pentru acest meci (maximum ${cfg.maxPerUser} pe cont).` : `Ai deja numărul maxim de bilete pentru acest meci (${cfg.maxPerUser}).`)
    }
    await q(`DELETE FROM seat_locks WHERE event_id = $1 AND seat_key = ANY($2::text[]) AND kind = 'hold' AND expires_at < now()`, [ev.id, keys])
    const expires = new Date(Date.now() + HOLD_MINUTES * 60000)
    const [order] = await q(
      `INSERT INTO orders (code, user_id, event_id, status, total, expires_at) VALUES ($1, $2, $3, 'pending', $4, $5) RETURNING id, code`,
      [orderCode(), user.id, ev.id, total, expires],
    )
    await q(
      `INSERT INTO order_items (order_id, seat_key, sector_id, price)
       SELECT $1, k, s, p FROM unnest($2::text[], $3::text[], $4::int[]) AS t(k, s, p)`,
      [order.id, items.map((i) => i.key), items.map((i) => i.sector), items.map((i) => i.price)],
    )
    const got = await q(
      `INSERT INTO seat_locks (event_id, seat_key, kind, order_id, expires_at)
       SELECT $1, k, 'hold', $2, $3 FROM unnest($4::text[]) AS t(k) ON CONFLICT DO NOTHING RETURNING seat_key`,
      [ev.id, order.id, expires, keys],
    )
    if (got.length !== keys.length) {
      const ok = new Set(got.map((g) => g.seat_key))
      fail(409, 'Unele locuri tocmai au fost luate de altcineva. Alege alte locuri.', { taken: keys.filter((k) => !ok.has(k)) })
    }
    return { order: { id: order.id, code: order.code, total, expiresAt: expires.toISOString(), seats: keys } }
  })
}

export async function release(user, body) {
  const id = String(body.orderId || '')
  if (!/^[0-9a-f-]{36}$/.test(id)) fail(400, 'Comandă invalidă.')
  await tx(async (q) => {
    const o = await q(`UPDATE orders SET status = 'cancelled', cancelled_at = now() WHERE id = $1 AND user_id = $2 AND status = 'pending' RETURNING id`, [id, user.id])
    if (o.length) await q(`DELETE FROM seat_locks WHERE order_id = $1 AND kind = 'hold'`, [id])
  })
  return { ok: true }
}

// ─── Plata ────────────────────────────────────────────────────────────
const cleanName = (s) => String(s || '').replace(/[\u0000-\u001f<>]/g, '').replace(/\s+/g, ' ').trim().slice(0, 80)

export async function pay(user, body) {
  if (paymentMode() !== 'test') fail(501, 'Plata cu cardul nu este încă configurată.')
  const id = String(body.orderId || '')
  if (!/^[0-9a-f-]{36}$/.test(id)) fail(400, 'Comandă invalidă.')
  const holders = body.holders && typeof body.holders === 'object' ? body.holders : {}
  const orderId = await tx(async (q) => {
    const [o] = await q('SELECT * FROM orders WHERE id = $1 AND user_id = $2 FOR UPDATE', [id, user.id])
    if (!o) fail(404, 'Comanda nu există.')
    if (o.status === 'paid') return o.id
    if (o.status !== 'pending') fail(410, 'Rezervarea a expirat. Alege din nou locurile.')
    if (new Date(o.expires_at) < new Date()) {
      await q(`UPDATE orders SET status = 'expired' WHERE id = $1`, [o.id])
      await q(`DELETE FROM seat_locks WHERE order_id = $1 AND kind = 'hold'`, [o.id])
      return null
    }
    const items = await q('SELECT seat_key, price FROM order_items WHERE order_id = $1', [o.id])
    const sold = await q(`UPDATE seat_locks SET kind = 'sold', expires_at = NULL WHERE order_id = $1 AND kind = 'hold' RETURNING seat_key`, [o.id])
    if (sold.length !== items.length) fail(409, 'Rezervarea nu mai este validă. Alege din nou locurile.')
    const [ev] = await q('SELECT * FROM events WHERE id = $1', [o.event_id])
    const ctx = evaluate(eventConfig(ev))
    const { keyToIdx } = venue()
    for (const it of items) {
      const info = seatInfo(keyToIdx.get(it.seat_key), ev, ctx)
      await q(
        `INSERT INTO tickets (order_id, event_id, seat_key, holder_name, price, info) VALUES ($1, $2, $3, $4, $5, $6)`,
        [o.id, o.event_id, it.seat_key, cleanName(holders[it.seat_key]) || user.name, it.price, JSON.stringify(info)],
      )
    }
    await q(`UPDATE orders SET status = 'paid', paid_at = now(), expires_at = NULL, payment_ref = $2 WHERE id = $1`, [o.id, `TEST-${crypto.randomBytes(6).toString('hex').toUpperCase()}`])
    return o.id
  })
  if (!orderId) fail(410, 'Rezervarea a expirat. Alege din nou locurile.')
  return orderId
}

// ─── Comenzi și bilete ────────────────────────────────────────────────
export function ticketView(t) {
  return {
    id: t.id, number: ticketNumber(t.id), qr: t.status === 'cancelled' ? null : qrCode(t.id), status: t.status,
    seatKey: t.seat_key, holder: t.holder_name, price: t.price, info: typeof t.info === 'string' ? JSON.parse(t.info) : t.info,
    usedAt: t.used_at ? new Date(t.used_at).toISOString() : null,
  }
}
export async function orderView(o) {
  const tickets = await query('SELECT * FROM tickets WHERE order_id = $1 ORDER BY seat_key', [o.id])
  return {
    id: o.id, code: o.code, status: o.status, total: o.total, eventId: o.event_id,
    createdAt: new Date(o.created_at).toISOString(), paidAt: o.paid_at ? new Date(o.paid_at).toISOString() : null,
    paymentRef: o.payment_ref, emailSentAt: o.email_sent_at ? new Date(o.email_sent_at).toISOString() : null,
    tickets: tickets.map(ticketView),
  }
}
export async function myOrders(user) {
  const rows = await query(`SELECT * FROM orders WHERE user_id = $1 AND status IN ('paid', 'cancelled') ORDER BY created_at DESC LIMIT 50`, [user.id])
  return Promise.all(rows.map(orderView))
}
export async function loadOrderFor(user, id, { admin = false } = {}) {
  if (!/^[0-9a-f-]{36}$/.test(String(id))) fail(404, 'Comanda nu există.')
  const rows = await query('SELECT * FROM orders WHERE id = $1', [id])
  const o = rows[0]
  if (!o || (!admin && o.user_id !== user.id)) fail(404, 'Comanda nu există.')
  return o
}
