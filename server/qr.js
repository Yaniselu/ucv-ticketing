// Codul QR al biletului: UCV1.<id bilet>.<semnătură HMAC-SHA256>. Fără cheia secretă de pe
// server nu se poate fabrica un cod valid; la poartă codul e verificat și în baza de date
// (bilet anulat / deja folosit).
import crypto from 'node:crypto'

const PREFIX = 'UCV1'

export function ticketSecret() {
  const s = process.env.TICKET_SECRET
  if (s && s.length >= 32) return s
  if (process.env.VERCEL) throw Object.assign(new Error('TICKET_SECRET lipsește'), { status: 503 })
  return 'dev-only-secret-do-not-use-in-production-0123456789'
}

const uuidToB64 = (uuid) => Buffer.from(uuid.replace(/-/g, ''), 'hex').toString('base64url')
const b64ToUuid = (b) => {
  const h = Buffer.from(b, 'base64url').toString('hex')
  return h.length === 32 ? `${h.slice(0, 8)}-${h.slice(8, 12)}-${h.slice(12, 16)}-${h.slice(16, 20)}-${h.slice(20)}` : null
}
const sign = (body) => crypto.createHmac('sha256', ticketSecret()).update(body).digest().subarray(0, 12).toString('base64url')

export function qrCode(ticketId) {
  const body = `${PREFIX}.${uuidToB64(ticketId)}`
  return `${body}.${sign(body)}`
}

// întoarce id-ul biletului dacă semnătura e corectă, altfel null
export function verifyQr(code) {
  const parts = String(code || '').trim().split('.')
  if (parts.length !== 3 || parts[0] !== PREFIX || parts[1].length !== 22 || parts[2].length !== 16) return null
  const body = `${parts[0]}.${parts[1]}`
  const a = Buffer.from(sign(body))
  const b = Buffer.from(parts[2])
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) return null
  return b64ToUuid(parts[1])
}

// numărul biletului tipărit (scurt, ușor de citit la telefon)
export const ticketNumber = (id) => id.replace(/-/g, '').slice(0, 12).toUpperCase().replace(/(.{4})(?=.)/g, '$1-')

// codul comenzii: UCV-XXXXXX (fără caractere ușor de confundat)
const ALPH = '23456789ABCDEFGHJKLMNPQRSTUVWXYZ'
export function orderCode() {
  const b = crypto.randomBytes(8)
  let s = ''
  for (let k = 0; k < 8; k++) s += ALPH[b[k] % ALPH.length]
  return `UCV-${s}`
}
