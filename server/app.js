// Routerul API-ului (o singură funcție pe Vercel: /api/index.js; local: server/dev.js)
import { send, readJson, HttpError, siteOrigin } from './http.js'
import { db, DbUnavailable, query } from './db.js'
import { currentUser, requireUser, requireRole, checkCsrf, rateLimit } from './security.js'
import * as auth from './auth.js'
import * as sales from './sales.js'
import * as admin from './admin.js'
import { ticketsPdf } from './pdf.js'
import { mailEnabled, sendMail, ticketsEmail } from './mail.js'

let seeded = null
const init = async () => {
  await db()
  if (!seeded) seeded = sales.ensureSeed().catch((e) => { seeded = null; throw e })
  await seeded
}

// trimite biletele comenzii pe email (cu PDF-ul atașat); nu blochează confirmarea dacă eșuează
async function emailOrder(req, orderRow) {
  if (!mailEnabled()) return false
  try {
    const [user] = await query('SELECT name, email FROM users WHERE id = $1', [orderRow.user_id])
    const order = await sales.orderView(orderRow)
    const tickets = order.tickets.filter((t) => t.status !== 'cancelled').map((t) => ({ ...t, orderCode: order.code }))
    if (!tickets.length) return false
    const pdf = await ticketsPdf(tickets, { testMode: sales.paymentMode() === 'test' })
    const m = ticketsEmail({ user, order, tickets, link: `${siteOrigin(req)}/?bilete=1` })
    await Promise.race([
      sendMail({ to: user.email, ...m, attachments: [{ filename: `bilete-${order.code}.pdf`, content: pdf, contentType: 'application/pdf' }] }),
      new Promise((_, rej) => setTimeout(() => rej(new Error('timeout')), 15000)),
    ])
    await query('UPDATE orders SET email_sent_at = now() WHERE id = $1', [orderRow.id])
    return true
  } catch (e) {
    console.error('email bilete', e.message)
    return false
  }
}

async function pdfFor(res, orderRow, ticketId) {
  const order = await sales.orderView(orderRow)
  let tickets = order.tickets.map((t) => ({ ...t, orderCode: order.code }))
  if (ticketId) tickets = tickets.filter((t) => t.id === ticketId)
  if (!tickets.length) throw new HttpError(404, 'Biletul nu există.')
  const pdf = await ticketsPdf(tickets, { testMode: sales.paymentMode() === 'test' })
  send(res, 200, pdf, {
    'Content-Type': 'application/pdf',
    'Content-Disposition': `inline; filename="bilet-${ticketId ? tickets[0].number : order.code}.pdf"`,
  })
}

const R = []
const route = (method, path, fn) => R.push({ method, re: new RegExp(`^${path.replace(/:(\w+)/g, '(?<$1>[^/]+)')}$`), fn })

route('GET', '/api/health', async () => ({ ok: true, mail: mailEnabled(), payment: sales.paymentMode() }))
route('GET', '/api/events', async () => ({ events: await sales.listEvents() }))
route('GET', '/api/events/:id/availability', async (req, res, p) => sales.availability(p.id, await currentUser(req)))

route('POST', '/api/auth/register', (req, res, p, body) => auth.register(req, res, body))
route('POST', '/api/auth/login', (req, res, p, body) => auth.login(req, res, body))
route('POST', '/api/auth/logout', (req, res) => auth.logout(req, res))
route('GET', '/api/auth/me', async (req) => {
  const u = await currentUser(req)
  return { user: u && { id: u.id, name: u.name, email: u.email, phone: u.phone, role: u.role }, mail: mailEnabled(), payment: sales.paymentMode() }
})
route('PUT', '/api/auth/me', async (req, res, p, body) => auth.updateMe(await requireUser(req), body))
route('POST', '/api/auth/password', async (req, res, p, body) => auth.changePassword(req, res, await requireUser(req), body))
route('POST', '/api/auth/forgot', (req, res, p, body) => auth.forgot(req, body))
route('POST', '/api/auth/reset', (req, res, p, body) => auth.resetPassword(req, res, body))
route('POST', '/api/auth/claim-admin', async (req, res, p, body) => auth.claimAdmin(req, await requireUser(req), body))

route('POST', '/api/checkout/hold', async (req, res, p, body) => {
  const u = await requireUser(req)
  await rateLimit(`hold:${u.id}`, 40, 600)
  return sales.hold(u, body)
})
route('POST', '/api/checkout/release', async (req, res, p, body) => sales.release(await requireUser(req), body))
route('POST', '/api/checkout/pay', async (req, res, p, body) => {
  const u = await requireUser(req)
  await rateLimit(`pay:${u.id}`, 20, 600)
  const id = await sales.pay(u, body)
  const [o] = await query('SELECT * FROM orders WHERE id = $1', [id])
  const emailed = o.email_sent_at ? true : await emailOrder(req, o)
  const [fresh] = await query('SELECT * FROM orders WHERE id = $1', [id])
  return { order: await sales.orderView(fresh), emailed }
})
route('GET', '/api/me/orders', async (req) => ({ orders: await sales.myOrders(await requireUser(req)) }))
route('GET', '/api/orders/:id/pdf', async (req, res, p) => {
  const u = await requireUser(req)
  await pdfFor(res, await sales.loadOrderFor(u, p.id, { admin: u.role === 'admin' }))
})
route('GET', '/api/orders/:id/tickets/:tid/pdf', async (req, res, p) => {
  const u = await requireUser(req)
  await pdfFor(res, await sales.loadOrderFor(u, p.id, { admin: u.role === 'admin' }), p.tid)
})
route('POST', '/api/orders/:id/resend', async (req, res, p) => {
  const u = await requireUser(req)
  await rateLimit(`resend:${u.id}`, 5, 3600)
  const o = await sales.loadOrderFor(u, p.id, { admin: u.role === 'admin' })
  if (o.status !== 'paid') throw new HttpError(409, 'Comanda nu este plătită.')
  if (!mailEnabled()) throw new HttpError(503, 'Trimiterea pe email nu este încă configurată.')
  return { emailed: await emailOrder(req, o) }
})

// scanarea la poartă (rol „scanner” sau „admin”)
route('POST', '/api/scan', async (req, res, p, body) => {
  const u = await requireRole(req, 'scanner', 'admin')
  await rateLimit(`scan:${u.id}`, 600, 60)
  return admin.scan(u, body)
})

// administrare (rol „admin”)
const A = (fn) => async (req, res, p, body) => fn(await requireRole(req, 'admin'), p, body, req)
route('GET', '/api/admin/events', A(() => admin.adminEvents()))
route('POST', '/api/admin/events', A((u, p, body) => admin.createEvent(u, body)))
route('PUT', '/api/admin/events/:id', A((u, p, body) => admin.updateEvent(u, p.id, body)))
route('GET', '/api/admin/events/:id/stats', A((u, p) => admin.eventStats(p.id)))
route('POST', '/api/admin/events/:id/blocks', A((u, p, body) => admin.blockSeats(u, p.id, body)))
route('GET', '/api/admin/orders', A((u, p, body, req) => admin.searchOrders(new URL(req.url, 'http://x').searchParams)))
route('POST', '/api/admin/orders/:id/cancel', A((u, p) => admin.cancelOrder(u, p.id)))
route('GET', '/api/admin/users', A((u, p, body, req) => admin.listUsers(new URL(req.url, 'http://x').searchParams)))
route('PUT', '/api/admin/users/:id', A((u, p, body) => admin.setRole(u, p.id, body)))
route('GET', '/api/admin/audit', A(() => admin.auditLog()))

export async function handle(req, res) {
  try {
    const url = new URL(req.url, 'http://localhost')
    // pe Vercel toate rutele /api/* sunt rescrise spre /api/index?path=...
    let path = url.pathname
    if (path === '/api/index' || path === '/api') path = `/api/${url.searchParams.get('path') || ''}`
    path = path.replace(/\/+$/, '') || '/'
    const method = req.method === 'HEAD' ? 'GET' : req.method
    let hit = null
    let allowed = false
    for (const r of R) {
      const m = r.re.exec(path)
      if (!m) continue
      allowed = true
      if (r.method === method) {
        hit = { r, params: m.groups || {} }
        break
      }
    }
    if (!hit) return send(res, allowed ? 405 : 404, { error: allowed ? 'Metodă nepermisă.' : 'Nu există.' })
    if (path !== '/api/health') await init()
    let body = {}
    if (method !== 'GET') {
      checkCsrf(req)
      body = await readJson(req)
    }
    const out = await hit.r.fn(req, res, hit.params, body)
    if (!res.headersSent) send(res, 200, out)
  } catch (e) {
    if (e instanceof HttpError) return send(res, e.status, { error: e.message, ...(e.extra || {}) })
    if (e instanceof DbUnavailable) return send(res, 503, { error: 'Vânzarea online nu este disponibilă momentan (baza de date nu este conectată).', code: 'no_db' })
    if (e?.status === 503) return send(res, 503, { error: 'Serverul nu este configurat complet.', code: 'config' })
    console.error(e)
    send(res, 500, { error: 'A apărut o eroare. Încearcă din nou.' })
  }
}
