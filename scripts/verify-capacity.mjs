// Verifică faptul că harta generează exact capacitatea oficială a stadionului.
import { buildLayout, summarize } from '../src/data/layout.js'
import { CAPACITY } from '../src/data/stadium-data.js'

const t0 = performance.now()
const layout = buildLayout()
const sum = summarize(layout)
const ms = (performance.now() - t0).toFixed(0)

const rows = []
for (const s of layout.sectors) rows.push([s.title, s.stand, s.natural, s.capacity, s.price + ' lei'])
for (const k of ['PN', 'T2', 'PS', 'T1', 'VIP']) {
  const n = layout.sectors.filter((s) => s.stand === k).reduce((a, s) => a + s.capacity, 0)
  rows.push([`Σ ${k}`, '', '', n, ''])
}
console.table(rows)
console.log(`Loje: ${layout.boxes.length} × 11 = ${sum.boxes}`)
console.log('Rezumat:', sum, `(${ms} ms)`)

const expect = { ...CAPACITY }
let ok = true
for (const k of Object.keys(expect)) {
  if (sum[k] !== expect[k]) {
    console.error(`✗ ${k}: ${sum[k]} ≠ ${expect[k]}`)
    ok = false
  }
}
if (!ok) process.exit(1)
console.log(`✓ Capacitate exactă: ${sum.total.toLocaleString('ro-RO')} locuri`)
