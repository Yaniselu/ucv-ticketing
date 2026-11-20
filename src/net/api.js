// Cereri către API (același domeniu; cookie-ul de sesiune e HttpOnly, nu e accesibil din JS)
export class ApiError extends Error {
  constructor(status, message, data) {
    super(message)
    this.status = status
    this.data = data
  }
}

export async function api(method, path, body) {
  let r
  try {
    r = await fetch(path, {
      method,
      credentials: 'same-origin',
      headers: { Accept: 'application/json', ...(body !== undefined ? { 'Content-Type': 'application/json' } : {}), ...(method !== 'GET' ? { 'X-UCV': '1' } : {}) },
      body: body !== undefined ? JSON.stringify(body) : undefined,
    })
  } catch {
    throw new ApiError(0, 'Nu există conexiune la server. Verifică internetul și încearcă din nou.')
  }
  let data = null
  if ((r.headers.get('content-type') || '').includes('application/json')) data = await r.json().catch(() => null)
  if (!r.ok) throw new ApiError(r.status, data?.error || 'A apărut o eroare. Încearcă din nou.', data)
  return data
}

// utilizatorul curent (null dacă nu e autentificat); păstrat între pagini în aceeași sesiune
let me = undefined
const listeners = new Set()
export async function loadMe(force = false) {
  if (me !== undefined && !force) return me
  try {
    const r = await api('GET', '/api/auth/me')
    me = r.user
    me && (me.serverMail = r.mail)
    setMeta(r)
  } catch {
    me = null
  }
  return me
}
export const getMe = () => me ?? null
export function setMe(u) {
  me = u
  for (const fn of listeners) fn(me)
}
export const onMe = (fn) => listeners.add(fn)

// informații despre server: email activ, modul de plată
export const meta = { mail: false, payment: 'test' }
function setMeta(r) {
  if (r && 'mail' in r) meta.mail = !!r.mail
  if (r && r.payment) meta.payment = r.payment
}

export const pdfUrl = (orderId, ticketId) => (ticketId ? `/api/orders/${orderId}/tickets/${ticketId}/pdf` : `/api/orders/${orderId}/pdf`)
