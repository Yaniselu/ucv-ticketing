// Verifică faptul că stadionul 3D are exact locurile din harta reală (Entertix), sector cu sector.
import { buildLayout, summarize } from '../src/data/layout.js'
import { CAPACITY, SECTOR_SEATS, PLAN_SEATS } from '../src/data/stadium-data.js'

const t0 = performance.now()
const layout = buildLayout()
const sum = summarize(layout)
const ms = (performance.now() - t0).toFixed(0)

// locurile pe sector: harta reală (de verificat exact) și, pentru comparație, planul oficial
const groups = new Map()
for (const sec of layout.sectors) groups.set(sec.group, (groups.get(sec.group) || 0) + sec.capacity)
const rows = Object.keys(SECTOR_SEATS).map((g) => ({ sector: g, hartaReala: SECTOR_SEATS[g], stadion3D: groups.get(g), ok: groups.get(g) === SECTOR_SEATS[g] ? '✓' : '✗', planOficial: PLAN_SEATS[g] }))
console.table(rows)
const wrong = rows.filter((r) => r.ok !== '✓')
console.log(`Loje: ${layout.boxes.length} (${layout.boxes.map((b) => b.num).join(', ')}) = ${sum.boxes} locuri`)
console.log('Rezumat:', sum, `(${ms} ms)`)

const expect = { ...CAPACITY }
let ok = !wrong.length
if (wrong.length) console.error('✗ Sectoare cu alt număr de locuri decât harta reală:', wrong.map((r) => r.sector).join(', '))
for (const k of Object.keys(expect)) {
  if (sum[k] !== expect[k]) {
    console.error(`✗ ${k}: ${sum[k]} ≠ ${expect[k]}`)
    ok = false
  }
}
if (!ok) process.exit(1)
console.log(`✓ Capacitate exactă: ${sum.total.toLocaleString('ro-RO')} locuri`)

// fiecare loc trebuie să fie unic: niciun alt loc la mai puțin de 0,40 m (pasul minim din hartă e 0,42 m)
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
        if (Math.hypot(o.x - s.x, o.y - s.y, o.z - s.z) < 0.4) {
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
