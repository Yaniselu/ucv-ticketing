// Teste automate pentru API (rulează local, cu o bază PGlite în memorie): conturi, securitate,
// rezervări concurente, plată, bilete cu QR, administrare, scanare. npm run test:api
process.env.PGLITE_DIR = 'memory'
process.env.ADMIN_SETUP_CODE = 'cod-de-test-admin-123456'
const http = await import('node:http')
const { handle } = await import('../server/app.js')
const { query } = await import('../server/db.js')

const server = http.createServer((req, res) => handle(req, res))
await new Promise((r) => server.listen(0, r))
const base = `http://localhost:${server.address().port}`
let failed = 0
const ok = (cond, msg) => {
  if (cond) console.log(`  ✓ ${msg}`)
  else {
    failed++
    console.log(`  ✗ ${msg}`)
  }
}

let ipN = 0
function client() {
  let cookie = ''
  const ip = `10.0.${Math.floor(++ipN / 250)}.${ipN % 250}`
  return async function api(method, path, body, headers = {}) {
    const r = await fetch(base + path, {
      method,
      headers: { 'Content-Type': 'application/json', 'X-UCV': '1', 'X-Real-IP': ip, ...(cookie ? { Cookie: cookie } : {}), ...headers },
      body: body ? JSON.stringify(body) : undefined,
    })
    const sc = r.headers.get('set-cookie')
    if (sc) cookie = sc.split(';')[0]
    const ct = r.headers.get('content-type') || ''
    const data = ct.includes('json') ? await r.json() : Buffer.from(await r.arrayBuffer())
    return { status: r.status, data, headers: r.headers }
  }
}

const A = client()
const B = client()
const ADM = client()
const anon = client()
const reg = (c, n) => c('POST', '/api/auth/register', { name: `Test ${n}`, email: `${n}@exemplu.ro`, phone: '0722 123 456', password: 'parola123', terms: true })

console.log('Conturi')
ok((await reg(A, 'ana')).status === 200, 'înregistrare cont A')
ok((await reg(B, 'bogdan')).status === 200, 'înregistrare cont B')
ok((await reg(client(), 'ana')).status === 409, 'emailul duplicat e refuzat')
ok((await client()('POST', '/api/auth/register', { name: 'X Y', email: 'x@y.ro', phone: '123', password: 'parola123', terms: true })).status === 400, 'telefon invalid refuzat')
ok((await client()('POST', '/api/auth/register', { name: 'X Y', email: 'x@y.ro', phone: '0722123456', password: 'scurta', terms: true })).status === 400, 'parolă slabă refuzată')
const me = await A('GET', '/api/auth/me')
ok(me.data.user?.phone === '+40722123456', 'telefonul e normalizat (+40…)')
const [hashRow] = await query(`SELECT password_hash FROM users WHERE email = 'ana@exemplu.ro'`)
ok(hashRow.password_hash.startsWith('scrypt$') && !hashRow.password_hash.includes('parola123'), 'parola e stocată doar ca hash scrypt')
ok((await anon('POST', '/api/auth/login', { email: 'ana@exemplu.ro', password: 'gresit123' })).status === 401, 'parolă greșită → 401')
ok((await anon('POST', '/api/auth/login', { email: 'ana@exemplu.ro', password: 'parola123' })).status === 200, 'autentificare corectă')

console.log('Securitate (CSRF)')
ok((await A('POST', '/api/checkout/hold', { eventId: 'x', seats: [] }, { 'X-UCV': '0' })).status === 403, 'fără antetul X-UCV → 403')
ok((await A('POST', '/api/checkout/hold', { eventId: 'x', seats: [] }, { Origin: 'https://site-rau.com' })).status === 403, 'Origin străin → 403')
ok((await client()('POST', '/api/checkout/hold', { eventId: 'x', seats: ['a'] })).status === 401, 'fără cont nu se poate rezerva')

console.log('Meciuri și disponibilitate')
const evs = await anon('GET', '/api/events')
const ev = evs.data.events[0]
ok(ev && ev.saleState === 'open', `meciul implicit e la vânzare (${ev?.id})`)
const av = await A('GET', `/api/events/${ev.id}/availability`)
ok(av.status === 200 && av.data.seats === 30704, 'disponibilitatea are toate cele 30.704 locuri')

console.log('Rezervare și plată')
const seats = ['10-2|5|10', '10-2|5|11']
const h1 = await A('POST', '/api/checkout/hold', { eventId: ev.id, seats })
ok(h1.status === 200 && h1.data.order.total === 2 * ev.config.sectors['10-2'].price, `A rezervă 2 locuri (${h1.data.order?.total} lei, preț de pe server)`)
const h2 = await B('POST', '/api/checkout/hold', { eventId: ev.id, seats: ['10-2|5|11'] })
ok(h2.status === 409 && h2.data.taken?.includes('10-2|5|11'), 'B nu poate rezerva un loc rezervat de A')
ok((await B('POST', '/api/checkout/pay', { orderId: h1.data.order.id })).status === 404, 'B nu poate plăti comanda lui A')
ok((await A('POST', '/api/checkout/hold', { eventId: ev.id, seats: ['PRESA|1|1'] })).status === 400, 'loc inexistent refuzat')
ok((await A('POST', '/api/checkout/hold', { eventId: ev.id, seats: ['H|1|1'] })).status === 409, 'presa nu se vinde')
ok((await A('POST', '/api/checkout/hold', { eventId: ev.id, seats: ['18|5|5'] })).status === 409, 'sectorul oaspeților nu se vinde online')
const many = Array.from({ length: 7 }, (_, k) => `10-2|8|${k + 1}`)
ok((await A('POST', '/api/checkout/hold', { eventId: ev.id, seats: many })).status === 400, 'peste 6 bilete pe comandă refuzat')
// o nouă rezervare a aceluiași cont înlocuiește rezervarea veche
const h3 = await A('POST', '/api/checkout/hold', { eventId: ev.id, seats })
ok(h3.status === 200, 'A își refă rezervarea')
const paid = await A('POST', '/api/checkout/pay', { orderId: h3.data.order.id, holders: { '10-2|5|10': 'Ana Popescu <script>' } })
ok(paid.status === 200 && paid.data.order.tickets.length === 2, 'plata (mod de test) emite 2 bilete')
const t0 = paid.data.order.tickets.find((t) => t.seatKey === '10-2|5|10')
ok(t0.holder === 'Ana Popescu script', 'numele titularului e curățat de HTML')
ok(/^UCV1\.[\w-]{22}\.[\w-]{16}$/.test(t0.qr), 'biletul are cod QR semnat')
ok(t0.info.sector === 'Sector 10 · Inel 2' && t0.info.row === 5 && t0.info.seat === 10 && t0.info.gate === 'Poarta 8', 'datele locului sunt pe bilet')
const pdf = await A('GET', `/api/orders/${paid.data.order.id}/pdf`)
ok(pdf.status === 200 && pdf.data.subarray(0, 4).toString() === '%PDF', `PDF-ul biletelor (${Math.round(pdf.data.length / 1024)} KB)`)
ok((await B('GET', `/api/orders/${paid.data.order.id}/pdf`)).status === 404, 'B nu poate descărca biletele lui A')
const mine = await A('GET', '/api/me/orders')
ok(mine.data.orders.length === 1 && mine.data.orders[0].tickets.length === 2, '„Biletele mele” arată comanda')
const avB = await B('GET', `/api/events/${ev.id}/availability`)
ok(avB.data.taken.length > 0, 'locurile vândute apar ocupate pentru ceilalți')

console.log('Concurență: 15 conturi încearcă același loc în același timp')
const racers = []
for (let k = 0; k < 15; k++) {
  const c = client()
  await reg(c, `r${k}`)
  racers.push(c)
}
const res = await Promise.all(racers.map((c) => c('POST', '/api/checkout/hold', { eventId: ev.id, seats: ['9-1|3|7'] })))
console.log('    ', res.map((r) => r.status).join(' '))
ok(res.filter((r) => r.status === 200).length === 1 && res.filter((r) => r.status === 409).length === 14, 'exact o rezervare reușește, 14 sunt refuzate')

console.log('Expirarea rezervării')
const hb = await B('POST', '/api/checkout/hold', { eventId: ev.id, seats: ['11-1|2|2'] })
await query(`UPDATE orders SET expires_at = now() - interval '1 minute' WHERE id = $1`, [hb.data.order.id])
await query(`UPDATE seat_locks SET expires_at = now() - interval '1 minute' WHERE order_id = $1`, [hb.data.order.id])
ok((await A('POST', '/api/checkout/hold', { eventId: ev.id, seats: ['11-1|2|2'] })).status === 200, 'după expirare, locul poate fi rezervat de altcineva')
ok((await B('POST', '/api/checkout/pay', { orderId: hb.data.order.id })).status === 410, 'plata unei rezervări expirate e refuzată')

console.log('Administrare')
ok((await A('GET', '/api/admin/events')).status === 403, 'un cont obișnuit nu are acces la administrare')
await reg(ADM, 'admin')
ok((await ADM('POST', '/api/auth/claim-admin', { code: 'gresit' })).status === 403, 'cod de admin greșit refuzat')
ok((await ADM('POST', '/api/auth/claim-admin', { code: process.env.ADMIN_SETUP_CODE })).status === 200, 'codul corect face contul administrator')
const cfg = structuredClone(ev.config)
cfg.sectors['12-1'].onSale = false
cfg.sectors['8-1'].price = 99
cfg.away.groups = ['17', '18']
const up = await ADM('PUT', `/api/admin/events/${ev.id}`, { config: cfg })
ok(up.status === 200 && up.data.event.config.sectors['8-1'].price === 99, 'adminul schimbă prețul unui sector')
ok((await B('POST', '/api/checkout/hold', { eventId: ev.id, seats: ['12-1|3|3'] })).status === 409, 'sectorul scos de la vânzare nu se mai poate cumpăra')
ok((await B('POST', '/api/checkout/hold', { eventId: ev.id, seats: ['17|3|3'] })).status === 409, 'sectorul 17 dat oaspeților nu se mai vinde')
const h8 = await B('POST', '/api/checkout/hold', { eventId: ev.id, seats: ['8-1|3|3'] })
ok(h8.status === 200 && h8.data.order.total === 99, 'noul preț se aplică la comandă')
const bl = await ADM('POST', `/api/admin/events/${ev.id}/blocks`, { action: 'block', sector: '9-2', rowFrom: 1, rowTo: 2 })
ok(bl.status === 200 && bl.data.changed > 30, `adminul blochează rândurile 1–2 din 9-2 (${bl.data.changed} locuri)`)
ok((await B('POST', '/api/checkout/hold', { eventId: ev.id, seats: ['9-2|1|5'] })).status === 409, 'locurile blocate nu se pot cumpăra')
const st = await ADM('GET', `/api/admin/events/${ev.id}/stats`)
ok(st.status === 200 && st.data.total.sold === 2, 'statistici: 2 bilete vândute')
const created = await ADM('POST', '/api/admin/events', { home: 'Universitatea Craiova', away: 'Rapid București', competitionId: 'superliga', phase: 'Etapa 20', kickoff: '2027-02-14T17:30:00Z', status: 'draft' })
ok(created.status === 200 && created.data.event.id.startsWith('universitatea-rapid'), 'adminul creează un meci nou (ciornă)')
ok(!(await anon('GET', '/api/events')).data.events.some((e) => e.id === created.data.event.id), 'meciul ciornă nu apare public')
ok((await ADM('GET', `/api/admin/orders?q=${encodeURIComponent("' OR 1=1 --")}`)).status === 200, 'căutarea e protejată la injecții SQL')
const found = await ADM('GET', `/api/admin/orders?q=ana@exemplu`)
ok(found.data.orders.length === 1, 'căutare comandă după email')

console.log('Scanare la poartă')
ok((await A('POST', '/api/scan', { code: t0.qr })).status === 403, 'un cont obișnuit nu poate scana')
const fake = t0.qr.slice(0, -2) + (t0.qr.endsWith('AA') ? 'BB' : 'AA')
ok((await ADM('POST', '/api/scan', { code: fake })).data.result === 'invalid', 'un cod QR falsificat e respins')
ok((await ADM('POST', '/api/scan', { code: t0.qr })).data.result === 'valid', 'prima scanare: acces permis')
ok((await ADM('POST', '/api/scan', { code: t0.qr })).data.result === 'used', 'a doua scanare: bilet deja folosit')
const t1 = paid.data.order.tickets.find((t) => t.seatKey === '10-2|5|11')
ok((await ADM('POST', `/api/admin/orders/${paid.data.order.id}/cancel`)).status === 200, 'adminul anulează comanda')
ok((await ADM('POST', '/api/scan', { code: t1.qr })).data.result === 'cancelled', 'biletul anulat e respins la poartă')
ok((await B('POST', '/api/checkout/hold', { eventId: ev.id, seats: ['10-2|5|11'] })).status === 200, 'locul anulat se poate cumpăra din nou')

console.log('Limitarea încercărilor')
let last = 0
for (let k = 0; k < 12; k++) last = (await anon('POST', '/api/auth/login', { email: 'bogdan@exemplu.ro', password: `gresit${k}x` })).status
ok(last === 429, 'după 10 parole greșite, autentificarea e blocată temporar')

server.close()
console.log(failed ? `\n${failed} teste eșuate` : '\nToate testele au trecut')
process.exit(failed ? 1 : 0)
