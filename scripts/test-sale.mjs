// Test complet al vânzării, prin API, cu atacuri de „vânzare dublă”:
//   1. administratorul creează meciul, pune prețurile și deschide vânzarea;
//   2. un cumpărător rezervă și plătește;
//   3. se încearcă în toate felurile vânzarea aceluiași loc de două ori (cereri simultane, plăți
//      repetate, comenzi suprapuse, rezervări expirate, chei de loc modificate, scriere direct în
//      baza de date);
//   4. scanarea la poartă și anularea;
//   5. verificarea finală a integrității.
//
//   npm run test:vanzare                                  (PGlite în memorie)
//   TEST_DATABASE_URL=postgres://… npm run test:vanzare   (Postgres real, cereri cu adevărat paralele)
if (process.env.TEST_DATABASE_URL) {
  process.env.DATABASE_URL = process.env.TEST_DATABASE_URL
  process.env.PG_POOL_MAX ||= '24'
} else {
  delete process.env.DATABASE_URL
  delete process.env.POSTGRES_URL
  process.env.PGLITE_DIR = 'memory'
}
process.env.ADMIN_SETUP_CODE = 'cod-de-test-admin-vanzare-2026'
process.env.PAYMENT_MODE = 'test'
const http = await import('node:http')
const { handle } = await import('../server/app.js')
const { query, dbKind } = await import('../server/db.js')
const { buildLayout } = await import('../src/data/layout.js')
const { seatKey } = await import('../src/data/sale.js')

const server = http.createServer((req, res) => handle(req, res))
await new Promise((r) => server.listen(0, r))
const base = `http://localhost:${server.address().port}`
let failed = 0
let passed = 0
const ok = (cond, msg, extra = '') => {
  if (cond) passed++
  else failed++
  console.log(`  ${cond ? '✓' : '✗'} ${msg}${extra ? `  ${extra}` : ''}`)
}
const section = (t) => console.log(`\n${t}`)

let ipN = 0
function client() {
  let cookie = ''
  const ip = `10.9.${Math.floor(++ipN / 250)}.${ipN % 250}`
  return async function api(method, path, body) {
    const r = await fetch(base + path, {
      method,
      headers: { 'Content-Type': 'application/json', 'X-UCV': '1', 'X-Real-IP': ip, ...(cookie ? { Cookie: cookie } : {}) },
      body: body ? JSON.stringify(body) : undefined,
    })
    const sc = r.headers.get('set-cookie')
    if (sc) cookie = sc.split(';')[0]
    const data = (r.headers.get('content-type') || '').includes('json') ? await r.json() : null
    return { status: r.status, data }
  }
}
const people = new Map()
async function person(name) {
  const c = client()
  const slug = name.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/\W+/g, '.')
  const r = await c('POST', '/api/auth/register', { name, email: `${slug}.${people.size}@test.ro`, phone: `07${String(20000000 + people.size).padStart(8, '0')}`, password: 'Parola-Test-1', terms: true })
  if (r.status !== 200) throw new Error(`înregistrare ${name}: ${r.status} ${JSON.stringify(r.data)}`)
  c.id = (await c('GET', '/api/auth/me')).data.user.id
  people.set(name, c)
  return c
}
const errCode = async (fn) => {
  try {
    await fn()
    return null
  } catch (e) {
    return e.code || e.message
  }
}

const layout = buildLayout()
const rowKeys = (sector, row) => layout.seats.filter((s) => s.sector === sector && s.row === row).sort((a, b) => a.num - b.num).map(seatKey)
const t0 = Date.now()
console.log(`Test: punerea biletelor în vânzare și vânzarea fără dublări (${process.env.TEST_DATABASE_URL ? 'Postgres real' : 'PGlite în memorie'})`)

// ─── 1. Administratorul pune biletele în vânzare ───
section('1. Administratorul pune biletele în vânzare')
const ADM = await person('Admin Club')
ok((await ADM('POST', '/api/auth/claim-admin', { code: process.env.ADMIN_SETUP_CODE })).status === 200, 'contul de administrator primește drepturile (codul ADMIN_SETUP_CODE)')
const kickoff = new Date(Date.now() + 12 * 86400000).toISOString()
const created = await ADM('POST', '/api/admin/events', { home: 'Universitatea Craiova', away: 'Petrolul Ploiești', competitionId: 'superliga', phase: 'Etapa 20', kickoff, status: 'draft' })
const ev = created.data.event
ok(created.status === 200 && ev.status === 'draft', `meciul e creat ca ciornă (${ev?.id})`)
const ANA = await person('Ana Popescu')
ok(!(await ANA('GET', '/api/events')).data.events.some((e) => e.id === ev.id), 'ciorna nu apare public')
ok((await ANA('POST', '/api/checkout/hold', { eventId: ev.id, seats: [rowKeys('10-2', 5)[9]] })).status === 404, 'ciorna nu se poate cumpăra')

const cfg = structuredClone(ev.config)
for (const s of layout.sectors) {
  if (s.stand === 'PN') cfg.sectors[s.id].price = 40
  if (s.stand === 'PS') cfg.sectors[s.id].price = 45
  if (s.stand === 'T2') cfg.sectors[s.id].price = s.num === 10 ? 85 : 70
}
cfg.sectors['12-1'].onSale = false
cfg.maxPerUser = 4
cfg.maxPerOrder = 4
const tomorrow = new Date(Date.now() + 86400000).toISOString()
const pub = await ADM('PUT', `/api/admin/events/${ev.id}`, { config: cfg, status: 'published', saleStart: tomorrow })
ok(pub.status === 200 && pub.data.event.config.sectors['10-2'].price === 85, 'prețurile sunt salvate: Peluza Nord 40, Peluza Sud 45, Tribuna 2 70 / centru 85 lei; 12-1 nu se vinde; max. 4 bilete pe cont')
const pubList = (await ANA('GET', '/api/events')).data.events.find((e) => e.id === ev.id)
ok(pubList?.saleState === 'soon', 'publicat cu vânzarea de mâine: apare ca „vânzarea începe curând”')
ok((await ANA('POST', '/api/checkout/hold', { eventId: ev.id, seats: [rowKeys('10-2', 5)[9]] })).status === 409, 'înainte de începerea vânzării, rezervarea e refuzată')
const part = await ADM('PUT', `/api/admin/events/${ev.id}`, { config: { sectors: { 3: { price: 42 } } } })
ok(part.data.event.config.sectors['3'].price === 42 && part.data.event.config.sectors['10-2'].price === 85 && !part.data.event.config.sectors['12-1'].onSale && part.data.event.config.maxPerUser === 4,
  'o configurație trimisă parțial (doar sectorul 3) nu schimbă restul prețurilor și regulilor')
await ADM('PUT', `/api/admin/events/${ev.id}`, { config: { sectors: { 3: { price: 40 } } } })
const open = await ADM('PUT', `/api/admin/events/${ev.id}`, { saleStart: new Date(Date.now() - 60000).toISOString() })
ok(open.status === 200 && open.data.event.saleState === 'open', 'adminul deschide vânzarea acum: „la vânzare”')
const av = await ANA('GET', `/api/events/${ev.id}/availability`)
ok(av.status === 200 && av.data.seats === layout.seats.length, `harta primește toate cele ${layout.seats.length.toLocaleString('ro-RO')} de locuri`)

// ─── 2. Cumpărarea ───
section('2. Cumpărarea')
const r5 = rowKeys('10-2', 5)
const [s1, s2] = [r5[9], r5[10]]
const hA = await ANA('POST', '/api/checkout/hold', { eventId: ev.id, seats: [s1, s2], price: 1, total: 1 })
ok(hA.status === 200 && hA.data.order.total === 170, `Ana rezervă ${s1} și ${s2}: 170 lei, prețul vine de pe server (cererea trimisă cu „preț 1 leu” e ignorată)`)
const pA = await ANA('POST', '/api/checkout/pay', { orderId: hA.data.order.id })
ok(pA.status === 200 && pA.data.order.tickets.length === 2 && pA.data.order.tickets.every((t) => /^UCV1\./.test(t.qr)), 'plătește (plată de test) și primește 2 bilete cu cod QR semnat')

// ─── 3. Un loc nu se poate vinde de două ori ───
section('3. Un loc nu se poate vinde de două ori')
const BOG = await person('Bogdan Ionescu')
const hB = await BOG('POST', '/api/checkout/hold', { eventId: ev.id, seats: [s1] })
ok(hB.status === 409 && hB.data.taken?.includes(s1), 'Bogdan nu poate rezerva un loc deja vândut')

const target = rowKeys('10-2', 8)[14]
const crowd = await Promise.all(Array.from({ length: 50 }, (_, k) => person(`Fan ${k + 1}`)))
const race = await Promise.all(crowd.map((c) => c('POST', '/api/checkout/hold', { eventId: ev.id, seats: [target] })))
const winners = race.filter((r) => r.status === 200)
ok(winners.length === 1 && race.filter((r) => r.status === 409).length === 49, `50 de cumpărători apasă în aceeași clipă pe ${target}: exact 1 rezervare reușește, 49 sunt refuzate`)
const winner = crowd[race.findIndex((r) => r.status === 200)]
const wOrder = winners[0].data.order.id
const pays = await Promise.all(Array.from({ length: 5 }, () => winner('POST', '/api/checkout/pay', { orderId: wOrder })))
const [tc] = await query(`SELECT count(*)::int AS n FROM tickets WHERE event_id = $1 AND seat_key = $2`, [ev.id, target])
ok(pays.every((p) => p.status === 200) && tc.n === 1, 'câștigătorul apasă „Plătește” de 5 ori în paralel: o singură plată, un singur bilet')
const losersPay = await crowd[(race.findIndex((r) => r.status === 200) + 1) % 50]('POST', '/api/checkout/pay', { orderId: wOrder })
ok(losersPay.status === 404, 'alt cont nu poate plăti (sau prelua) comanda câștigătorului')

const r9 = rowKeys('9-2', 6)
const [x1, x2, x3] = [r9[4], r9[5], r9[6]]
const C = await person('Cristina Matei')
const D = await person('Dan Stoica')
const [hc, hd] = await Promise.all([C('POST', '/api/checkout/hold', { eventId: ev.id, seats: [x1, x2] }), D('POST', '/api/checkout/hold', { eventId: ev.id, seats: [x2, x3] })])
const locks = await query(`SELECT seat_key FROM seat_locks WHERE event_id = $1 AND seat_key = ANY($2::text[])`, [ev.id, [x1, x2, x3]])
const oneWon = [hc.status, hd.status].sort().join(',') === '200,409'
const atomic = hc.status === 200 ? locks.length === 2 && !locks.some((l) => l.seat_key === x3) : locks.length === 2 && !locks.some((l) => l.seat_key === x1)
ok(oneWon && atomic, 'două comenzi care se suprapun (x1+x2 și x2+x3), trimise simultan: una reușește, cealaltă nu păstrează niciun loc (tot sau nimic)')

const r6 = rowKeys('10-2', 6)
const fake = [r6[3].replace(/\|(\d+)$/, (m, n) => `|0${n}`), ` ${r6[3]}`, `${r6[3]} `, r6[3].replace('10-2', '10-2 '), "10-2|6|4' OR '1'='1"]
const fakes = await Promise.all(fake.map((k) => BOG('POST', '/api/checkout/hold', { eventId: ev.id, seats: [k] })))
ok(fakes.every((r) => r.status === 400), 'cheile de loc modificate („|04”, spații, injecție SQL) sunt refuzate: nu există „alt” loc cu același scaun')
const dupReq = await BOG('POST', '/api/checkout/hold', { eventId: ev.id, seats: [r6[3], r6[3], r6[3]] })
ok(dupReq.status === 200 && dupReq.data.order.seats.length === 1 && dupReq.data.order.total === 85, 'același loc de 3 ori în aceeași cerere: o singură rezervare, un singur preț')

const r7 = rowKeys('8-2', 4)
const E = await person('Elena Dinu')
const F = await person('Florin Marin')
const hE = await E('POST', '/api/checkout/hold', { eventId: ev.id, seats: [r7[2]] })
await query(`UPDATE orders SET expires_at = now() - interval '1 minute' WHERE id = $1`, [hE.data.order.id])
await query(`UPDATE seat_locks SET expires_at = now() - interval '1 minute' WHERE order_id = $1`, [hE.data.order.id])
const hF = await F('POST', '/api/checkout/hold', { eventId: ev.id, seats: [r7[2]] })
const pE = await E('POST', '/api/checkout/pay', { orderId: hE.data.order.id })
const pF = await F('POST', '/api/checkout/pay', { orderId: hF.data.order.id })
const [tE] = await query(`SELECT count(*)::int AS n FROM tickets WHERE event_id = $1 AND seat_key = $2 AND status <> 'cancelled'`, [ev.id, r7[2]])
ok(hF.status === 200 && pE.status === 410 && pF.status === 200 && tE.n === 1, 'rezervarea Elenei expiră; Florin ia locul și plătește; plata întârziată a Elenei e refuzată (un singur bilet)')

const G = await person('Gabriela Tudor')
const heldKey = rowKeys('11-2', 3)[5]
await G('POST', '/api/checkout/hold', { eventId: ev.id, seats: [heldKey] })
const freeKey = rowKeys('11-2', 3)[8]
const bl = await ADM('POST', `/api/admin/events/${ev.id}/blocks`, { action: 'block', seats: [s1, heldKey, freeKey] })
const [s1Lock] = await query(`SELECT kind FROM seat_locks WHERE event_id = $1 AND seat_key = $2`, [ev.id, s1])
ok(bl.data.changed === 1 && s1Lock.kind === 'sold', 'adminul blochează un loc vândut, unul rezervat și unul liber: doar cel liber se blochează (vânzarea nu e anulată pe ascuns)')
ok((await BOG('POST', '/api/checkout/hold', { eventId: ev.id, seats: [freeKey] })).status === 409, 'locul blocat nu se poate rezerva')
ok((await BOG('POST', '/api/checkout/hold', { eventId: ev.id, seats: [rowKeys('12-1', 5)[3]] })).status === 409, 'sectorul scos de la vânzare (12-1) nu se poate cumpăra')

const H = await person('Horia Neagu')
const r10 = rowKeys('5', 6)
const h4 = await H('POST', '/api/checkout/hold', { eventId: ev.id, seats: r10.slice(0, 4) })
await H('POST', '/api/checkout/pay', { orderId: h4.data.order.id })
const h5 = await H('POST', '/api/checkout/hold', { eventId: ev.id, seats: [r10[6]] })
ok(h4.data.order.total === 160 && h5.status === 409, 'limita pe cont: Horia cumpără 4 bilete (4 × 40 lei), al 5-lea e refuzat')

const I = await person('Irina Preda')
const [y1, y2] = [rowKeys('15', 7)[2], rowKeys('15', 7)[9]]
const [hi1, hi2] = await Promise.all([I('POST', '/api/checkout/hold', { eventId: ev.id, seats: [y1] }), I('POST', '/api/checkout/hold', { eventId: ev.id, seats: [y2] })])
const pi = await Promise.all([I('POST', '/api/checkout/pay', { orderId: hi1.data.order.id }), I('POST', '/api/checkout/pay', { orderId: hi2.data.order.id })])
const iLocks = await query(`SELECT seat_key, kind FROM seat_locks WHERE event_id = $1 AND seat_key = ANY($2::text[])`, [ev.id, [y1, y2]])
ok(pi.filter((p) => p.status === 200).length === 1 && iLocks.length === 1 && iLocks[0].kind === 'sold', 'același cont, două rezervări în paralel: doar ultima e valabilă, cealaltă nu mai poate fi plătită și locul ei revine la vânzare')

const [tA] = await query(`SELECT order_id FROM tickets WHERE event_id = $1 AND seat_key = $2`, [ev.id, s1])
const dupTicket = await errCode(() => query(`INSERT INTO tickets (order_id, event_id, seat_key, holder_name, price, info) VALUES ($1, $2, $3, 'Hacker', 1, '{}')`, [tA.order_id, ev.id, s1]))
ok(dupTicket === '23505', 'direct în baza de date: al doilea bilet activ pe același loc e respins (index unic tickets_seat_active)', `[${dupTicket}]`)
const dupLock = await errCode(() => query(`INSERT INTO seat_locks (event_id, seat_key, kind) VALUES ($1, $2, 'sold')`, [ev.id, s1]))
ok(dupLock === '23505', 'direct în baza de date: a doua marcare „vândut” pe același loc e respinsă (cheia primară seat_locks)', `[${dupLock}]`)

// stres: 120 de cumpărători, fiecare vrea 1–3 locuri alăturate din aceleași 30, toți deodată;
// cei care reușesc plătesc (unii de două ori); apoi încă un val, după ce o parte renunță
const pool = rowKeys('10-2', 12).slice(0, 30)
const mob = await Promise.all(Array.from({ length: 120 }, (_, k) => person(`Suporter ${k + 1}`)))
let seed = 7
const rnd = () => ((seed = (seed * 1103515245 + 12345) % 2147483648) / 2147483648)
let soldTotal = 0
for (const wave of [1, 2]) {
  const asks = mob.map(() => {
    const n = 1 + Math.floor(rnd() * 3)
    const at = Math.floor(rnd() * (pool.length - n + 1))
    return pool.slice(at, at + n)
  })
  const holds = await Promise.all(mob.map((c, k) => c('POST', '/api/checkout/hold', { eventId: ev.id, seats: asks[k] })))
  const won = holds.map((h, k) => (h.status === 200 ? k : -1)).filter((k) => k >= 0)
  // primii jumătate plătesc (de două ori, în paralel), ceilalți renunță
  const payers = won.filter((_, j) => j % 2 === 0)
  const quitters = won.filter((_, j) => j % 2 === 1)
  await Promise.all([
    ...payers.flatMap((k) => [mob[k]('POST', '/api/checkout/pay', { orderId: holds[k].data.order.id }), mob[k]('POST', '/api/checkout/pay', { orderId: holds[k].data.order.id })]),
    ...quitters.map((k) => mob[k]('POST', '/api/checkout/release', { orderId: holds[k].data.order.id })),
  ])
  const [cnt] = await query(`SELECT count(*)::int AS n, count(DISTINCT seat_key)::int AS d FROM tickets WHERE event_id = $1 AND seat_key = ANY($2::text[]) AND status <> 'cancelled'`, [ev.id, pool])
  soldTotal = cnt.n
  ok(cnt.n === cnt.d && cnt.n <= pool.length, `stres, valul ${wave}: 120 de cumpărători pe aceleași 30 de locuri → ${won.length} rezervări reușite, ${cnt.n} locuri vândute, fiecare o singură dată`)
}
ok(soldTotal > 0, 'stres: locurile eliberate în primul val s-au vândut în al doilea, tot fără dubluri')

// ─── 4. La poartă ───
section('4. La poartă')
const ST1 = await person('Steward Unu')
const ST2 = await person('Steward Doi')
for (const s of [ST1, ST2]) await ADM('PUT', `/api/admin/users/${s.id}`, { role: 'scanner' })
const qrA = pA.data.order.tickets[0].qr
const scans = await Promise.all([ST1('POST', '/api/scan', { code: qrA }), ST2('POST', '/api/scan', { code: qrA })])
ok(scans.map((s) => s.data.result).sort().join(',') === 'used,valid', 'doi stewarzi scanează același bilet în aceeași clipă: o singură intrare permisă')
ok((await ST1('POST', '/api/scan', { code: qrA.slice(0, -2) + (qrA.endsWith('AA') ? 'AB' : 'AA') })).data.result === 'invalid', 'un cod QR modificat e respins (semnătură HMAC)')
const cancel = await ADM('POST', `/api/admin/orders/${hA.data.order.id}/cancel`)
const qrB = pA.data.order.tickets[1].qr
ok(cancel.status === 200 && (await ST1('POST', '/api/scan', { code: qrB })).data.result === 'cancelled', 'adminul anulează comanda Anei: biletul ei nu mai intră la poartă')
const rebuy = await BOG('POST', '/api/checkout/hold', { eventId: ev.id, seats: [s2] })
const rePay = rebuy.status === 200 ? await BOG('POST', '/api/checkout/pay', { orderId: rebuy.data.order.id }) : null
const [act] = await query(`SELECT count(*) FILTER (WHERE status <> 'cancelled')::int AS active, count(*)::int AS all FROM tickets WHERE event_id = $1 AND seat_key = $2`, [ev.id, s2])
ok(rePay?.status === 200 && act.active === 1 && act.all === 2, 'locul anulat revine la vânzare; Bogdan îl cumpără: 1 bilet activ (al lui), cel anulat rămâne în istoric')

// ─── 5. Verificarea finală ───
section('5. Verificarea finală')
const chk = await ADM('GET', `/api/admin/events/${ev.id}/integrity`)
ok(chk.data.ok && chk.data.duplicateSeats === 0 && chk.data.ticketsWithoutSoldSeat === 0 && chk.data.soldSeatsWithoutTicket === 0, `integritate: ${chk.data.activeTickets} bilete active, 0 locuri cu două bilete, 0 bilete fără loc vândut, 0 locuri vândute fără bilet`)
const stats = await ADM('GET', `/api/admin/events/${ev.id}/stats`)
const [real] = await query(`SELECT count(*)::int AS n, coalesce(sum(price), 0)::int AS lei FROM tickets WHERE event_id = $1 AND status <> 'cancelled'`, [ev.id])
ok(stats.data.total.sold === real.n && stats.data.total.revenue === real.lei, `statisticile din panou = baza de date: ${real.n} bilete, ${real.lei} lei`)

// datele demo trec aceeași verificare
const seeded = await ADM('POST', '/api/admin/demo')
const demoChecks = await Promise.all(['demo-ucv-fcsb', 'demo-ucv-cfr'].map((id) => ADM('GET', `/api/admin/events/${id}/integrity`)))
ok(seeded.status === 200 && demoChecks.every((c) => c.data.ok), `datele demo (${seeded.data?.tickets?.toLocaleString('ro-RO')} bilete) trec aceeași verificare`)
const cleared = await ADM('DELETE', '/api/admin/demo')
ok(cleared.status === 200 && cleared.data.events === 4 && (await query(`SELECT count(*)::int AS n FROM tickets WHERE event_id = $1`, [ev.id]))[0].n > 0, 'ștergerea datelor demo nu atinge meciurile și biletele reale')

console.log(`\n${failed ? `✗ ${failed} verificări eșuate` : `✓ Toate cele ${passed} verificări au trecut`} (${((Date.now() - t0) / 1000).toFixed(1)} s, ${dbKind()})`)
server.close()
process.exit(failed ? 1 : 0)
