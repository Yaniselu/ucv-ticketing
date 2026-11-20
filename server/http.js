// Utilitare HTTP: răspunsuri JSON, citirea corpului cererii, cookie-uri, erori
export class HttpError extends Error {
  constructor(status, message, extra) {
    super(message)
    this.status = status
    this.extra = extra
  }
}
export const fail = (status, message, extra) => {
  throw new HttpError(status, message, extra)
}

const BASE_HEADERS = {
  'Cache-Control': 'no-store',
  'X-Content-Type-Options': 'nosniff',
  'Referrer-Policy': 'same-origin',
  'Content-Security-Policy': "default-src 'none'; frame-ancestors 'none'",
}

export function send(res, status, body, headers = {}) {
  if (res.headersSent) return
  const isBuf = Buffer.isBuffer(body)
  const data = isBuf ? body : JSON.stringify(body ?? {})
  res.writeHead(status, { ...BASE_HEADERS, 'Content-Type': isBuf ? 'application/octet-stream' : 'application/json; charset=utf-8', ...headers })
  res.end(data)
}

const MAX_BODY = 64 * 1024
export async function readJson(req) {
  if (req.body !== undefined && req.body !== null && typeof req.body === 'object' && !Buffer.isBuffer(req.body)) return req.body
  let raw = ''
  if (typeof req.body === 'string') raw = req.body
  else if (Buffer.isBuffer(req.body)) raw = req.body.toString('utf8')
  else {
    const chunks = []
    let size = 0
    for await (const c of req) {
      size += c.length
      if (size > MAX_BODY) fail(413, 'Cererea este prea mare.')
      chunks.push(c)
    }
    raw = Buffer.concat(chunks).toString('utf8')
  }
  if (!raw) return {}
  if (raw.length > MAX_BODY) fail(413, 'Cererea este prea mare.')
  let v
  try {
    v = JSON.parse(raw)
  } catch {
    fail(400, 'Date invalide.')
  }
  if (!v || typeof v !== 'object' || Array.isArray(v)) fail(400, 'Date invalide.')
  return v
}

export function parseCookies(req) {
  const out = {}
  for (const part of String(req.headers.cookie || '').split(';')) {
    const k = part.indexOf('=')
    if (k < 0) continue
    try {
      out[part.slice(0, k).trim()] = decodeURIComponent(part.slice(k + 1).trim())
    } catch {}
  }
  return out
}

export const clientIp = (req) =>
  String(req.headers['x-real-ip'] || req.headers['x-vercel-forwarded-for'] || req.headers['x-forwarded-for'] || req.socket?.remoteAddress || '')
    .split(',')[0]
    .trim()
    .slice(0, 64)

// adresa publică a site-ului (pentru linkurile din email-uri)
export function siteOrigin(req) {
  if (process.env.SITE_URL) return process.env.SITE_URL.replace(/\/$/, '')
  const host = req.headers['x-forwarded-host'] || req.headers.host
  const proto = req.headers['x-forwarded-proto'] || (process.env.VERCEL ? 'https' : 'http')
  return `${proto}://${host}`
}
