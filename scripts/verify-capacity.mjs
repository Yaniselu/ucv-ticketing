// Verifică faptul că harta generează exact capacitatea oficială a stadionului.
import { buildLayout, summarize } from '../src/data/layout.js'
import { CAPACITY, SECTOR_SEATS } from '../src/data/stadium-data.js'

const t0 = performance.now()
const layout = buildLayout()
const sum = summarize(layout)
const ms = (performance.now() - t0).toFixed(0)

// locurile pe sector, comparate cu planul oficial al stadionului
const groups = new Map()
for (const sec of layout.sectors) groups.set(sec.group, (groups.get(sec.group) || 0) + sec.capacity)
const rows = Object.keys(SECTOR_SEATS).map((g) => ({ sector: g, oficial: SECTOR_SEATS[g], harta3D: groups.get(g), ok: groups.get(g) === SECTOR_SEATS[g] ? '✓' : '✗' }))
console.table(rows)
const wrong = rows.filter((r) => r.ok !== '✓')
console.log(`Loje: ${layout.boxes.length} (${layout.boxes.map((b) => b.num).join(', ')}) = ${sum.boxes} locuri`)
console.log('Rezumat:', sum, `(${ms} ms)`)
console.log(`Locuri redistribuite (un loc mai puțin în câteva rânduri din spate): ${Object.values(layout.trimmed).reduce((a, b) => a + b, 0)}`)

const expect = { ...CAPACITY }
let ok = !wrong.length
if (wrong.length) console.error('✗ Sectoare cu alt număr de locuri decât planul oficial:', wrong.map((r) => r.sector).join(', '))
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
