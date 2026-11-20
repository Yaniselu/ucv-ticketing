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
console.log(`Loje: ${layout.boxes.length} (${layout.boxes.map((b) => b.num).join(', ')}) = ${sum.boxes} locuri`)
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

// fiecare loc trebuie să fie unic: niciun alt loc la mai puțin de 0,45 m (inclusiv la granița dintre sectoare)
{
  const cell = 1
  const grid = new Map()
  let clashes = 0
  let example = null
  for (const s of layout.seats) {
    const k = `${Math.floor(s.x / cell)},${Math.floor(s.y / cell)},${Math.floor(s.z / cell)}`
    if (!grid.has(k)) grid.set(k, [])
    grid.get(k).push(s)
  }
  for (const s of layout.seats) {
    const cx = Math.floor(s.x / cell), cy = Math.floor(s.y / cell), cz = Math.floor(s.z / cell)
    for (let dx = -1; dx <= 1; dx++) for (let dy = -1; dy <= 1; dy++) for (let dz = -1; dz <= 1; dz++) {
      for (const o of grid.get(`${cx + dx},${cy + dy},${cz + dz}`) || []) {
        if (o.i <= s.i) continue
        if (Math.hypot(o.x - s.x, o.y - s.y, o.z - s.z) < 0.45) {
          clashes++
          example ||= [s, o]
        }
      }
    }
  }
  if (clashes) {
    console.error(`✗ ${clashes} perechi de locuri suprapuse, ex.: ${example[0].sector} r${example[0].row} l${example[0].num} ↔ ${example[1].sector} r${example[1].row} l${example[1].num}`)
    process.exit(1)
  }
  console.log('✓ Niciun loc suprapus: fiecare loc aparține unui singur sector')
}
