// Conturi: înregistrare (nume, email, telefon, parolă), autentificare, profil, parolă uitată
import { query, tx } from './db.js'
import { fail, siteOrigin } from './http.js'
import {
  hashPassword, verifyPassword, dummyVerify, createSession, destroySession, rateLimit, ipKey, sha256, randomToken, timingSafeEqualStr, audit,
} from './security.js'
import { mailEnabled, sendMail, resetEmail } from './mail.js'

export const cleanText = (s, max = 80) => String(s ?? '').replace(/[\u0000-\u001f<>]/g, '').replace(/\s+/g, ' ').trim().slice(0, max)

export function normEmail(v) {
  const e = String(v ?? '').trim().toLowerCase()
  if (e.length > 254 || !/^[^\s@<>()",;:]{1,64}@[^\s@<>()",;:]{1,253}\.[a-z]{2,}$/.test(e)) fail(400, 'Adresa de email nu este validă.')
  return e
}
export function normPhone(v) {
  let p = String(v ?? '').replace(/[\s().-]/g, '')
  if (p.startsWith('00')) p = `+${p.slice(2)}`
  if (/^0[2-9]\d{8}$/.test(p)) p = `+40${p.slice(1)}`
  if (!/^\+[1-9]\d{7,14}$/.test(p)) fail(400, 'Numărul de telefon nu este valid (ex. 07xx xxx xxx).')
  return p
}
function checkPassword(pw) {
  const s = String(pw ?? '')
  if (s.length < 8) fail(400, 'Parola trebuie să aibă cel puțin 8 caractere.')
  if (s.length > 128) fail(400, 'Parola este prea lungă.')
  if (!/[a-zA-Z]/.test(s) || !/\d/.test(s)) fail(400, 'Parola trebuie să conțină cel puțin o literă și o cifră.')
  return s
}
const publicUser = (u) => ({ id: u.id, name: u.name, email: u.email, phone: u.phone, role: u.role })

export async function register(req, res, body) {
  await rateLimit(ipKey(req, 'register'), 10, 3600)
  const name = cleanText(body.name)
  if (name.length < 3) fail(400, 'Scrie numele complet.')
  const email = normEmail(body.email)
  const phone = normPhone(body.phone)
  const pw = checkPassword(body.password)
  if (!body.terms) fail(400, 'Trebuie să accepți termenii și prelucrarea datelor.')
  const hash = await hashPassword(pw)
  const rows = await query(
    'INSERT INTO users (email, name, phone, password_hash) VALUES ($1, $2, $3, $4) ON CONFLICT (email) DO NOTHING RETURNING id, email, name, phone, role',
    [email, name, phone, hash],
  )
  if (!rows.length) fail(409, 'Există deja un cont cu acest email. Intră în cont sau resetează parola.')
  await createSession(res, rows[0].id)
  return { user: publicUser(rows[0]) }
}

export async function login(req, res, body) {
  const email = normEmail(body.email)
  await rateLimit(ipKey(req, 'login'), 30, 900)
  await rateLimit(`login:${email}`, 10, 900)
  const pw = String(body.password ?? '').slice(0, 200)
  const rows = await query('SELECT * FROM users WHERE email = $1', [email])
  const u = rows[0]
  const ok = u ? await verifyPassword(pw, u.password_hash) : await dummyVerify(pw)
  if (!ok) fail(401, 'Email sau parolă greșită.')
  await createSession(res, u.id)
  return { user: publicUser(u) }
}

export async function logout(req, res) {
  await destroySession(req, res)
  return { ok: true }
}

export async function updateMe(user, body) {
  const name = cleanText(body.name)
  if (name.length < 3) fail(400, 'Scrie numele complet.')
  const phone = normPhone(body.phone)
  const rows = await query('UPDATE users SET name = $2, phone = $3 WHERE id = $1 RETURNING id, email, name, phone, role', [user.id, name, phone])
  return { user: publicUser(rows[0]) }
}

export async function changePassword(req, res, user, body) {
  await rateLimit(`pw:${user.id}`, 10, 900)
  const rows = await query('SELECT password_hash FROM users WHERE id = $1', [user.id])
  if (!(await verifyPassword(String(body.current ?? ''), rows[0].password_hash))) fail(400, 'Parola actuală nu este corectă.')
  const hash = await hashPassword(checkPassword(body.password))
  await query('UPDATE users SET password_hash = $2 WHERE id = $1', [user.id, hash])
  // celelalte sesiuni (alte dispozitive) sunt închise
  await query('DELETE FROM sessions WHERE user_id = $1', [user.id])
  await createSession(res, user.id)
  return { ok: true }
}

export async function forgot(req, body) {
  const email = normEmail(body.email)
  await rateLimit(ipKey(req, 'forgot'), 10, 3600)
  await rateLimit(`forgot:${email}`, 3, 3600)
  if (!mailEnabled()) return { ok: true, mail: false }
  const rows = await query('SELECT id, name, email FROM users WHERE email = $1', [email])
  if (rows[0]) {
    const token = randomToken()
    await query('INSERT INTO password_resets (token_hash, user_id, expires_at) VALUES ($1, $2, now() + interval \'1 hour\')', [sha256(token), rows[0].id])
    const m = resetEmail({ user: rows[0], link: `${siteOrigin(req)}/?reset=${token}` })
    await sendMail({ to: rows[0].email, ...m }).catch((e) => console.error('reset mail', e.message))
  }
  return { ok: true, mail: true }
}

export async function resetPassword(req, res, body) {
  await rateLimit(ipKey(req, 'reset'), 20, 3600)
  const token = String(body.token ?? '')
  if (token.length < 20 || token.length > 100) fail(400, 'Linkul de resetare nu este valid.')
  const hash = await hashPassword(checkPassword(body.password))
  const userId = await tx(async (q) => {
    const r = await q(`UPDATE password_resets SET used = true WHERE token_hash = $1 AND NOT used AND expires_at > now() RETURNING user_id`, [sha256(token)])
    if (!r.length) fail(400, 'Linkul de resetare a expirat sau a fost deja folosit.')
    await q('UPDATE users SET password_hash = $2 WHERE id = $1', [r[0].user_id, hash])
    await q('DELETE FROM sessions WHERE user_id = $1', [r[0].user_id])
    return r[0].user_id
  })
  await createSession(res, userId)
  return { ok: true }
}

// primul administrator: un cont existent devine admin cu codul ADMIN_SETUP_CODE (variabilă de mediu)
export async function claimAdmin(req, user, body) {
  await rateLimit(ipKey(req, 'claim'), 5, 3600)
  const code = process.env.ADMIN_SETUP_CODE || ''
  if (code.length < 12 || !timingSafeEqualStr(String(body.code ?? ''), code)) fail(403, 'Codul nu este corect.')
  await query(`UPDATE users SET role = 'admin' WHERE id = $1`, [user.id])
  await audit(user.id, 'admin.claim', null)
  return { ok: true }
}
