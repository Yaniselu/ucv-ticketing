// Date demo pentru administrare, în baza locală (PGlite, .data/pglite) sau în DATABASE_URL.
//
//   npm run demo            → contul de admin demo + meciuri, cumpărători, comenzi, scanări
//   npm run demo -- --sterge → șterge datele demo (meciurile „demo-…” și conturile @demo.test)
//
// Apoi: npm run api (API-ul pe :3001) și npm run dev → http://localhost:5173/admin
import crypto from 'node:crypto'

const { query } = await import('../server/db.js')
const { hashPassword } = await import('../server/security.js')
const { seedDemo, clearDemo, DEMO_EMAIL } = await import('../server/demo.js')

const remote = !!(process.env.DATABASE_URL || process.env.POSTGRES_URL)
const fmt = (n) => Number(n).toLocaleString('ro-RO')

if (process.argv.includes('--sterge') || process.argv.includes('--clear')) {
  const r = await clearDemo(null)
  console.log(`Șters: ${r.events} meciuri, ${fmt(r.orders)} comenzi, ${fmt(r.tickets)} bilete, ${fmt(r.users)} conturi demo.`)
  process.exit(0)
}

// contul de administrator demo: parolă fixă local, aleatoare pe o bază la distanță
const email = `admin${DEMO_EMAIL}`
const password = remote ? `Demo-${crypto.randomBytes(9).toString('base64url')}` : 'Admin-Demo-2026'
const hash = await hashPassword(password)
const [admin] = await query(
  `INSERT INTO users (email, name, phone, password_hash, role) VALUES ($1, 'Administrator Demo', '+40720000000', $2, 'admin')
   ON CONFLICT (email) DO UPDATE SET password_hash = EXCLUDED.password_hash, role = 'admin' RETURNING id, name, email, role`,
  [email, hash],
)

const t0 = Date.now()
const s = await seedDemo(admin)
console.log(`
Date demo generate în ${((Date.now() - t0) / 1000).toFixed(1)} s (${remote ? 'DATABASE_URL' : `baza locală ${process.env.PGLITE_DIR || '.data/pglite'}`}):
  meciuri:            ${s.events} (la vânzare, vânzarea începe curând, jucat, ciornă)
  cumpărători:        ${fmt(s.buyers)}
  comenzi plătite:    ${fmt(s.orders)}
  bilete:             ${fmt(s.tickets)}
  intrați la poartă:  ${fmt(s.scanned)}
  comenzi anulate:    ${s.cancelled}
  locuri blocate:     ${s.blocked}
  coșuri în lucru:    ${s.holds} (expiră în ${s.holdMinutes} minute)

Cont de administrator:
  email:  ${email}
  parolă: ${password}

Pornește API-ul și site-ul:
  npm run api
  npm run dev        → http://localhost:5173/admin
`)
process.exit(0)
