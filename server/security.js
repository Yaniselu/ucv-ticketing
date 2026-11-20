// Parole (scrypt), sesiuni (token aleator în cookie HttpOnly, doar hash-ul în baza de date),
// protecție CSRF (Origin + antet propriu) și limitarea încercărilor.
import crypto from 'node:crypto'
import { promisify } from 'node:util'
import { query } from './db.js'
import { fail, parseCookies, clientIp } from './http.js'

const scrypt = promisify(crypto.scrypt)
const SCRYPT = { N: 16384, r: 8, p: 1, maxmem: 64 * 1024 * 1024 }
const KEYLEN = 32

export async function hashPassword(pw) {
  const salt = crypto.randomBytes(16)
  const key = await scrypt(pw, salt, KEYLEN, SCRYPT)
  return `scrypt$${SCRYPT.N}$${SCRYPT.r}$${SCRYPT.p}$${salt.toString('base64')}$${key.toString('base64')}`
}
export async function verifyPassword(pw, stored) {
  const [alg, N, r, p, salt, hash] = String(stored || '').split('$')
  if (alg !== 'scrypt' || !salt || !hash) return false
  const key = await scrypt(pw, Buffer.from(salt, 'base64'), KEYLEN, { N: +N, r: +r, p: +p, maxmem: SCRYPT.maxmem })
  const ref = Buffer.from(hash, 'base64')
  return ref.length === key.length && crypto.timingSafeEqual(ref, key)
}
// pentru conturi inexistente se calculează totuși un hash: răspunsul durează la fel,
// deci nu se poate afla din timp dacă un email are cont
let dummy = null
export async function dummyVerify(pw) {
  dummy = dummy || (await hashPassword('nu-exista-acest-cont'))
  await verifyPassword(pw, dummy)
  return false
}

export const sha256 = (s) => crypto.createHash('sha256').update(s).digest('hex')
export const randomToken = (bytes = 32) => crypto.randomBytes(bytes).toString('base64url')

const PROD = !!process.env.VERCEL
const COOKIE = PROD ? '__Host-ucv_s' : 'ucv_s'
const SESSION_DAYS = 30

function setCookie(res, value) {
  const prev = res.getHeader('Set-Cookie')
  res.setHeader('Set-Cookie', prev ? [].concat(prev, value) : value)
}

export async function createSession(res, userId) {
  const token = randomToken()
  const expires = new Date(Date.now() + SESSION_DAYS * 864e5)
  await query('INSERT INTO sessions (token_hash, user_id, expires_at) VALUES ($1, $2, $3)', [sha256(token), userId, expires])
  if (Math.random() < 0.05) await query('DELETE FROM sessions WHERE expires_at < now()')
  setCookie(res, `${COOKIE}=${token}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${SESSION_DAYS * 86400}${PROD ? '; Secure' : ''}`)
}
export async function destroySession(req, res) {
  const token = parseCookies(req)[COOKIE]
  if (token) await query('DELETE FROM sessions WHERE token_hash = $1', [sha256(token)])
  setCookie(res, `${COOKIE}=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0${PROD ? '; Secure' : ''}`)
}

export async function currentUser(req) {
  if (req._user !== undefined) return req._user
  const token = parseCookies(req)[COOKIE]
  req._user = null
  if (token && token.length < 100) {
    const rows = await query(
      `SELECT u.id, u.email, u.name, u.phone, u.role FROM sessions s JOIN users u ON u.id = s.user_id
       WHERE s.token_hash = $1 AND s.expires_at > now()`,
      [sha256(token)],
    )
    req._user = rows[0] || null
  }
  return req._user
}
export async function requireUser(req) {
  const u = await currentUser(req)
  if (!u) fail(401, 'Trebuie să intri în cont.')
  return u
}
export async function requireRole(req, ...roles) {
  const u = await requireUser(req)
  if (!roles.includes(u.role)) fail(403, 'Nu ai drepturi pentru această acțiune.')
  return u
}

// CSRF: cererile care modifică date trebuie să vină de pe același site (Origin) și să aibă
// antetul X-UCV, pe care alt site nu îl poate trimite (nu permitem CORS)
export function checkCsrf(req) {
  if (req.headers['x-ucv'] !== '1') fail(403, 'Cerere respinsă.')
  const origin = req.headers.origin
  if (!origin) return
  const host = req.headers['x-forwarded-host'] || req.headers.host
  let ok = false
  try {
    ok = new URL(origin).host === host
  } catch {}
  const extra = (process.env.ALLOWED_ORIGINS || '').split(',').map((s) => s.trim()).filter(Boolean)
  if (!ok && !extra.includes(origin)) fail(403, 'Cerere respinsă.')
}

// limitare: cel mult `max` cereri în `windowSec` secunde pentru o cheie (ex. IP + acțiune)
export async function rateLimit(key, max, windowSec) {
  const rows = await query(
    `INSERT INTO rate_limits (key, count, reset_at) VALUES ($1, 1, now() + make_interval(secs => $2))
     ON CONFLICT (key) DO UPDATE SET
       count = CASE WHEN rate_limits.reset_at < now() THEN 1 ELSE rate_limits.count + 1 END,
       reset_at = CASE WHEN rate_limits.reset_at < now() THEN now() + make_interval(secs => $2) ELSE rate_limits.reset_at END
     RETURNING count, reset_at`,
    [key, windowSec],
  )
  if (rows[0].count > max) {
    const wait = Math.max(1, Math.ceil((new Date(rows[0].reset_at) - Date.now()) / 1000))
    fail(429, `Prea multe încercări. Încearcă din nou peste ${wait > 90 ? `${Math.ceil(wait / 60)} minute` : `${wait} secunde`}.`)
  }
  if (Math.random() < 0.02) await query('DELETE FROM rate_limits WHERE reset_at < now()')
}
export const ipKey = (req, action) => `${action}:${clientIp(req)}`

export async function audit(userId, action, details) {
  await query('INSERT INTO audit_log (user_id, action, details) VALUES ($1, $2, $3)', [userId, action, details ? JSON.stringify(details) : null])
}

export function timingSafeEqualStr(a, b) {
  const x = Buffer.from(String(a))
  const y = Buffer.from(String(b))
  return x.length === y.length && crypto.timingSafeEqual(x, y)
}
