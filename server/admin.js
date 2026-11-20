// Administrare: meciuri, perioada de vânzare, sectoare la vânzare / prețuri / oaspeți, locuri
// blocate, comenzi (căutare, anulare, retrimitere), utilizatori și roluri, scanarea la poartă.
import { query, tx } from './db.js'
import { fail } from './http.js'
import { audit } from './security.js'
import { venue, evaluate } from './venue.js'
import { defaultConfig, normalizeConfig, BLOCKED, seatKey } from '../src/data/sale.js'
import { COMPETITIONS } from '../src/data/stadium-data.js'
import { eventView, eventConfig, getEvent, orderView, ticketView, saleState } from './sales.js'
import { verifyQr } from './qr.js'
import { cleanText } from './auth.js'

const date = (v, field, { required = false } = {}) => {
  if (v == null || v === '') {
    if (required) fail(400, `Completează ${field}.`)
    return null
  }
  const d = new Date(v)
  if (Number.isNaN(d.getTime())) fail(400, `Data pentru ${field} nu este validă.`)
  return d
}
const slug = (s) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 40)

export async function adminEvents() {
  const rows = await query(`SELECT * FROM events ORDER BY kickoff DESC`)
  const stats = await query(
    `SELECT event_id, count(*) FILTER (WHERE status <> 'cancelled')::int AS sold, coalesce(sum(price) FILTER (WHERE status <> 'cancelled'), 0)::int AS revenue,
            count(*) FILTER (WHERE status = 'used')::int AS used
     FROM tickets GROUP BY event_id`,
  )
  const by = new Map(stats.map((s) => [s.event_id, s]))
  return { events: rows.map((e) => ({ ...eventView(e), stats: by.get(e.id) || { sold: 0, revenue: 0, used: 0 } })), competitions: Object.entries(COMPETITIONS).map(([id, c]) => ({ id, name: c.name })) }
}

function eventFields(body, current) {
  const home = cleanText(body.home ?? current?.home ?? 'Universitatea Craiova', 60)
  const away = cleanText(body.away ?? current?.away, 60)
  if (home.length < 2 || away.length < 2) fail(400, 'Completează echipele.')
  const competitionId = String(body.competitionId ?? current?.competition_id ?? '')
  if (!COMPETITIONS[competitionId]) fail(400, 'Alege competiția.')
  const kickoff = date(body.kickoff ?? current?.kickoff, 'data meciului', { required: true })
  const saleStart = body.saleStart !== undefined ? date(body.saleStart, 'începutul vânzării') : current?.sale_start ?? null
  const saleEnd = body.saleEnd !== undefined ? date(body.saleEnd, 'sfârșitul vânzării') : current?.sale_end ?? null
  if (saleStart && saleEnd && saleEnd <= saleStart) fail(400, 'Vânzarea trebuie să se încheie după ce începe.')
  const status = String(body.status ?? current?.status ?? 'draft')
  if (!['draft', 'published', 'archived'].includes(status)) fail(400, 'Stare invalidă.')
  return { home, away, competitionId, phase: cleanText(body.phase ?? current?.phase ?? '', 80), kickoff, saleStart, saleEnd, status }
}

export async function createEvent(user, body) {
  const f = eventFields(body)
  const base = `${slug(f.home).split('-')[0]}-${slug(f.away)}-${f.kickoff.toISOString().slice(0, 10)}`
  let id = base
  for (let k = 2; (await query('SELECT 1 FROM events WHERE id = $1', [id])).length; k++) id = `${base}-${k}`
  const cfg = body.config ? normalizeConfig(body.config, venue().layout) : defaultConfig(venue().layout)
  await query(
    `INSERT INTO events (id, home, away, competition_id, phase, kickoff, status, sale_start, sale_end, config) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)`,
    [id, f.home, f.away, f.competitionId, f.phase, f.kickoff, f.status, f.saleStart, f.saleEnd, JSON.stringify(cfg)],
  )
  await audit(user.id, 'event.create', { id })
  return { event: eventView((await query('SELECT * FROM events WHERE id = $1', [id]))[0]) }
}

export async function updateEvent(user, id, body) {
  const cur = await getEvent(id, { admin: true })
  const f = eventFields(body, cur)
  const cfg = body.config !== undefined ? normalizeConfig(body.config, venue().layout) : eventConfig(cur)
  const rows = await query(
    `UPDATE events SET home=$2, away=$3, competition_id=$4, phase=$5, kickoff=$6, status=$7, sale_start=$8, sale_end=$9, config=$10, updated_at=now()
     WHERE id = $1 RETURNING *`,
    [id, f.home, f.away, f.competitionId, f.phase, f.kickoff, f.status, f.saleStart, f.saleEnd, JSON.stringify(cfg)],
  )
  await audit(user.id, 'event.update', { id, fields: Object.keys(body) })
  return { event: eventView(rows[0]) }
}

// locuri pe sector: capacitate, vândute, rezervate acum, blocate, încasări
export async function eventStats(id) {
  const ev = await getEvent(id, { admin: true })
  const { layout, keyToIdx } = venue()
  const ctx = evaluate(eventConfig(ev))
  const groupOf = (seat) => (seat.kind === 'box' ? 'LOJE' : seat.sector)
  const S = new Map()
  const get = (g) => S.get(g) || S.set(g, { id: g, capacity: 0, online: 0, sold: 0, held: 0, blocked: 0, used: 0, revenue: 0 }).get(g)
  layout.seats.forEach((seat, i) => {
    if (seat.kind === 'press' || seat.kind === 'wheelchair') return
    const r = get(groupOf(seat))
    r.capacity++
    if (ctx.status[i] !== BLOCKED) r.online++
  })
  const locks = await query(`SELECT seat_key, kind FROM seat_locks WHERE event_id = $1 AND (kind <> 'hold' OR expires_at > now())`, [ev.id])
  for (const l of locks) {
    const i = keyToIdx.get(l.seat_key)
    if (i == null) continue
    const seat = layout.seats[i]
    if (seat.kind === 'press' || seat.kind === 'wheelchair') continue
    const r = get(groupOf(seat))
    if (l.kind === 'hold') r.held++
    if (l.kind === 'blocked') r.blocked++
  }
  const tickets = await query(`SELECT seat_key, price, status FROM tickets WHERE event_id = $1 AND status <> 'cancelled'`, [ev.id])
  for (const t of tickets) {
    const i = keyToIdx.get(t.seat_key)
    if (i == null) continue
    const r = get(groupOf(layout.seats[i]))
    r.sold++
    r.revenue += t.price
    if (t.status === 'used') r.used++
  }
  const rows = [...S.values()]
  const total = rows.reduce((a, r) => ({ capacity: a.capacity + r.capacity, sold: a.sold + r.sold, held: a.held + r.held, blocked: a.blocked + r.blocked, used: a.used + r.used, revenue: a.revenue + r.revenue }), { capacity: 0, sold: 0, held: 0, blocked: 0, used: 0, revenue: 0 })
  return { event: eventView(ev), sectors: rows, total, saleState: saleState(ev) }
}

// blochează / deblochează locuri: un sector întreg, un interval de rânduri sau locuri anume
export async function blockSeats(user, id, body) {
  const ev = await getEvent(id, { admin: true })
  const { layout, keyToIdx } = venue()
  const action = body.action === 'unblock' ? 'unblock' : 'block'
  let keys = []
  if (Array.isArray(body.seats)) keys = body.seats.map(String).filter((k) => keyToIdx.has(k))
  else {
    const sector = String(body.sector || '')
    const r0 = Number(body.rowFrom) || 1
    const r1 = Number(body.rowTo) || 999
    const n0 = Number(body.seatFrom) || 1
    const n1 = Number(body.seatTo) || 9999
    keys = layout.seats
      .filter((s) => s.sector === sector && s.row >= r0 && s.row <= r1 && s.num >= n0 && s.num <= n1 && s.kind !== 'press')
      .map(seatKey)
  }
  if (!keys.length) fail(400, 'Nu am găsit locuri pentru selecția dată.')
  if (keys.length > 6000) fail(400, 'Selecția e prea mare (maximum 6.000 de locuri odată).')
  let n = 0
  if (action === 'block') {
    const r = await query(
      `INSERT INTO seat_locks (event_id, seat_key, kind) SELECT $1, k, 'blocked' FROM unnest($2::text[]) AS t(k) ON CONFLICT DO NOTHING RETURNING seat_key`,
      [ev.id, keys],
    )
    n = r.length
  } else {
    const r = await query(`DELETE FROM seat_locks WHERE event_id = $1 AND kind = 'blocked' AND seat_key = ANY($2::text[]) RETURNING seat_key`, [ev.id, keys])
    n = r.length
  }
  await audit(user.id, `seats.${action}`, { event: ev.id, count: n, selection: body.seats ? `${keys.length} locuri` : `${body.sector} r${body.rowFrom || 1}-${body.rowTo || '∞'}` })
  return { changed: n, requested: keys.length }
}

export async function searchOrders(params) {
  const q = cleanText(params.get('q') || '', 80)
  const ev = params.get('event') || null
  const args = []
  let where = `o.status IN ('paid', 'cancelled')`
  if (ev) {
    args.push(ev)
    where += ` AND o.event_id = $${args.length}`
  }
  if (q) {
    args.push(`%${q.toLowerCase()}%`)
    const p = `$${args.length}`
    args.push(q.replace(/-/g, '').toLowerCase())
    const t = `$${args.length}`
    where += ` AND (lower(o.code) LIKE ${p} OR lower(u.email) LIKE ${p} OR lower(u.name) LIKE ${p} OR u.phone LIKE ${p}
      OR EXISTS (SELECT 1 FROM tickets t WHERE t.order_id = o.id AND (replace(t.id::text, '-', '') LIKE ${t} || '%' OR lower(t.holder_name) LIKE ${p})))`
  }
  const rows = await query(
    `SELECT o.*, u.name AS user_name, u.email AS user_email, u.phone AS user_phone FROM orders o JOIN users u ON u.id = o.user_id
     WHERE ${where} ORDER BY o.created_at DESC LIMIT 100`,
    args,
  )
  const out = []
  for (const o of rows) out.push({ ...(await orderView(o)), user: { name: o.user_name, email: o.user_email, phone: o.user_phone } })
  return { orders: out }
}

export async function cancelOrder(user, id) {
  const r = await tx(async (q) => {
    const [o] = await q(`SELECT * FROM orders WHERE id = $1 FOR UPDATE`, [id])
    if (!o) fail(404, 'Comanda nu există.')
    if (o.status !== 'paid') fail(409, 'Doar comenzile plătite pot fi anulate.')
    await q(`UPDATE tickets SET status = 'cancelled' WHERE order_id = $1 AND status <> 'cancelled'`, [id])
    await q(`DELETE FROM seat_locks WHERE order_id = $1`, [id])
    await q(`UPDATE orders SET status = 'cancelled', cancelled_at = now() WHERE id = $1`, [id])
    return o
  })
  await audit(user.id, 'order.cancel', { id, code: r.code })
  return { ok: true }
}

export async function listUsers(params) {
  const q = cleanText(params.get('q') || '', 80).toLowerCase()
  const rows = await query(
    `SELECT u.id, u.name, u.email, u.phone, u.role, u.created_at,
       (SELECT count(*)::int FROM tickets t JOIN orders o ON o.id = t.order_id WHERE o.user_id = u.id AND t.status <> 'cancelled') AS tickets
     FROM users u WHERE $1 = '' OR lower(u.email) LIKE '%' || $1 || '%' OR lower(u.name) LIKE '%' || $1 || '%' OR u.phone LIKE '%' || $1 || '%'
     ORDER BY u.created_at DESC LIMIT 100`,
    [q],
  )
  return { users: rows.map((u) => ({ ...u, created_at: new Date(u.created_at).toISOString() })) }
}

export async function setRole(user, id, body) {
  const role = String(body.role || '')
  if (!['user', 'scanner', 'admin'].includes(role)) fail(400, 'Rol invalid.')
  if (id === user.id && role !== 'admin') fail(400, 'Nu îți poți scoate singur drepturile de administrator.')
  const r = await query(`UPDATE users SET role = $2 WHERE id = $1 RETURNING id`, [id, role])
  if (!r.length) fail(404, 'Utilizatorul nu există.')
  await audit(user.id, 'user.role', { id, role })
  return { ok: true }
}

export async function auditLog() {
  const rows = await query(
    `SELECT a.action, a.details, a.created_at, u.name, u.email FROM audit_log a LEFT JOIN users u ON u.id = a.user_id ORDER BY a.id DESC LIMIT 100`,
  )
  return { entries: rows.map((r) => ({ ...r, created_at: new Date(r.created_at).toISOString() })) }
}

// scanarea la poartă: verifică semnătura codului, apoi starea biletului; „enter” îl marchează folosit
export async function scan(user, body) {
  const id = verifyQr(body.code)
  if (!id) return { result: 'invalid', message: 'Cod QR invalid sau falsificat.' }
  const mode = body.mode === 'check' ? 'check' : 'enter'
  return tx(async (q) => {
    const [t] = await q(`SELECT t.*, o.code AS order_code FROM tickets t JOIN orders o ON o.id = t.order_id WHERE t.id = $1 FOR UPDATE OF t`, [id])
    if (!t) return { result: 'invalid', message: 'Biletul nu există.' }
    const view = { ...ticketView(t), orderCode: t.order_code }
    if (body.eventId && t.event_id !== body.eventId) return { result: 'wrong_event', message: 'Bilet pentru alt meci.', ticket: view }
    if (t.status === 'cancelled') return { result: 'cancelled', message: 'Bilet anulat.', ticket: view }
    if (t.status === 'used') return { result: 'used', message: 'Bilet deja folosit.', ticket: view }
    if (mode === 'enter') {
      await q(`UPDATE tickets SET status = 'used', used_at = now(), used_by = $2 WHERE id = $1`, [id, user.id])
      view.status = 'used'
      view.usedAt = new Date().toISOString()
    }
    return { result: 'valid', message: mode === 'enter' ? 'Acces permis.' : 'Bilet valid (nefolosit).', ticket: view }
  })
}
