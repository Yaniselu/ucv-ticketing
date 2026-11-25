// Baza de date: Postgres (DATABASE_URL, ex. Neon conectat din Vercel) sau, local, PGlite
// (Postgres compilat în WebAssembly, într-un dosar .data/). Aceeași schemă, aceleași interogări.
import { SCHEMA } from './schema.js'

let ready = null
let backend = null

export class DbUnavailable extends Error {}

async function open() {
  const url = process.env.DATABASE_URL || process.env.POSTGRES_URL
  if (url) {
    const { default: pg } = await import('pg')
    const pool = new pg.Pool({ connectionString: url, max: Number(process.env.PG_POOL_MAX) || 4, idleTimeoutMillis: 10000, connectionTimeoutMillis: 8000 })
    pool.on('error', () => {})
    backend = {
      kind: 'postgres',
      query: (text, params) => pool.query(text, params).then((r) => r.rows),
      async tx(fn) {
        const c = await pool.connect()
        try {
          await c.query('BEGIN')
          const out = await fn((text, params) => c.query(text, params).then((r) => r.rows))
          await c.query('COMMIT')
          return out
        } catch (e) {
          await c.query('ROLLBACK').catch(() => {})
          throw e
        } finally {
          c.release()
        }
      },
    }
  } else {
    // pe Vercel nu se folosește niciodată o bază locală: datele s-ar pierde
    if (process.env.VERCEL) throw new DbUnavailable('DATABASE_URL lipsește')
    const { PGlite } = await import('@electric-sql/pglite')
    const dir = process.env.PGLITE_DIR || '.data/pglite'
    if (dir !== 'memory') (await import('node:fs')).mkdirSync(dir, { recursive: true })
    const lite = dir === 'memory' ? new PGlite() : new PGlite(dir)
    await lite.waitReady
    let chain = Promise.resolve()
    // PGlite are o singură conexiune: tranzacțiile se execută pe rând
    const serial = (fn) => {
      const p = chain.then(fn, fn)
      chain = p.catch(() => {})
      return p
    }
    backend = {
      kind: 'pglite',
      query: (text, params) => serial(() => lite.query(text, params).then((r) => r.rows)),
      tx: (fn) => serial(() => lite.transaction((t) => fn((text, params) => t.query(text, params).then((r) => r.rows)))),
    }
  }
  await backend.tx(async (q) => {
    await q('SELECT pg_advisory_xact_lock(424242)')
    for (const stmt of SCHEMA) await q(stmt)
  })
  return backend
}

export async function db() {
  if (!ready) ready = open().catch((e) => { ready = null; throw e })
  return ready
}
export const query = async (text, params = []) => (await db()).query(text, params)
export const tx = async (fn) => (await db()).tx(fn)
export const dbKind = () => backend?.kind
