// Calculează lățimea locului și granițele sectoarelor astfel încât fiecare sector să aibă
// exact numărul de locuri din planul oficial al stadionului (SECTOR_SEATS).
// Rezultatul se scrie în src/data/sector-bounds.js. Rulează după orice schimbare de geometrie:
//   npm run tune
import fs from 'node:fs'
import path from 'node:path'
import { countNatural, CHAIN, CHAIN_START, CHAIN_END, VIP_LETTERS, ring2RowsAtU, lenU, D2, G, T_BLOCK_A, T_BLOCK_B, T1_TOP_HALF } from '../src/data/layout.js'
import { SECTOR_SEATS } from '../src/data/stadium-data.js'

const OUT = path.join(path.dirname(path.dirname(new URL(import.meta.url).pathname)), 'src', 'data', 'sector-bounds.js')
// fiecare sector iese puțin peste țintă (o coloană de locuri are ~40–50 de locuri pe porțiunile drepte);
// surplusul se scoate apoi distanțând locurile din câteva rânduri din spate
const PAD = { chain: 28, vip: 9, terrace: 4 }
// estimare inițială: granițele după densitatea de locuri (rânduri × lungime) de-a lungul bolului
function initialChain() {
  const N = 4000
  const us = []
  const cum = [0]
  for (let k = 0; k <= N; k++) us.push(CHAIN_START + ((CHAIN_END - CHAIN_START) * k) / N)
  for (let k = 0; k < N; k++) {
    const um = (us[k] + us[k + 1]) / 2
    const rows = G.ring1.rows + ring2RowsAtU(um)
    cum.push(cum[k] + rows * lenU(us[k], us[k + 1], D2(8)))
  }
  const tot = CHAIN.reduce((a, k) => a + SECTOR_SEATS[k], 0)
  const out = [CHAIN_START]
  let acc = 0
  for (let i = 0; i < CHAIN.length - 1; i++) {
    acc += SECTOR_SEATS[CHAIN[i]]
    const want = (acc / tot) * cum[N]
    let k = cum.findIndex((c) => c >= want)
    out.push(us[Math.max(1, k)])
  }
  out.push(CHAIN_END)
  return out
}

const score = (nat, keys, pad) => {
  let below = 0
  let over = 0
  for (const k of keys) {
    const e = nat[k] - SECTOR_SEATS[k]
    if (e < 0) below += -e
    else over = Math.max(over, e)
  }
  return below * 1000 + over
}

function solveChain(bounds, keys, ends, field, pad) {
  let best = { sc: Infinity, b: bounds[field].slice() }
  for (let it = 0; it < 70; it++) {
    const nat = countNatural({ bounds })
    const sc = score(nat, keys, pad)
    if (sc < best.sc) best = { sc, b: bounds[field].slice() }
    const b = bounds[field]
    let E = 0
    const next = b.slice()
    const damp = it < 20 ? 0.7 : 0.35
    // surplusul real al grupului se împarte proporțional, ca și ultimul sector să-și primească partea
    const tTot = keys.reduce((a, k) => a + SECTOR_SEATS[k], 0)
    const surplus = keys.reduce((a, k) => a + nat[k], 0) - tTot
    for (let k = 0; k < keys.length - 1; k++) {
      E += nat[keys[k]] - (SECTOR_SEATS[keys[k]] * (1 + surplus / tTot))
      const dens = (nat[keys[k]] / (b[k + 1] - b[k]) + nat[keys[k + 1]] / (b[k + 2] - b[k + 1])) / 2
      next[k + 1] = b[k + 1] - (damp * E) / dens
    }
    next[0] = ends[0]
    next[keys.length] = ends[1]
    bounds[field] = next.map((v) => +v.toFixed(6))
  }
  bounds[field] = best.b
  return best.sc
}

function solveTerrace(bounds) {
  let best = { sc: Infinity, t: bounds.terrace.slice() }
  for (let it = 0; it < 40; it++) {
    const nat = countNatural({ bounds })
    const sc = score(nat, ['G', 'I'], PAD.terrace)
    if (sc < best.sc) best = { sc, t: bounds.terrace.slice() }
    const [zG, zI] = bounds.terrace
    const eG = nat.G - (SECTOR_SEATS.G + PAD.terrace)
    const eI = nat.I - (SECTOR_SEATS.I + PAD.terrace)
    const dG = nat.G / (T1_TOP_HALF - zG)
    const dI = nat.I / (zI + T1_TOP_HALF)
    bounds.terrace = [+(zG + (0.6 * eG) / dG).toFixed(4), +(zI - (0.6 * eI) / dI).toFixed(4)]
  }
  bounds.terrace = best.t
}

// lățimea locului pentru care totalul geometric al grupului ≈ ținta + surplusul dorit
function calibrate(bounds, keys, field, pad) {
  const aim = keys.reduce((a, k) => a + SECTOR_SEATS[k] + pad, 0)
  for (let i = 0; i < 8; i++) {
    const nat = countNatural({ bounds })
    const tot = keys.reduce((a, k) => a + nat[k], 0)
    bounds[field] = +(bounds[field] * (tot / aim)).toFixed(5)
  }
}

const t0 = performance.now()
const bounds = { seatW: 0.5333, vipSeatW: 0.59, chain: initialChain(), vip: [], terrace: [20, -20] }
bounds.vip = Array.from({ length: 7 }, (_, k) => 6 + T_BLOCK_A + ((T_BLOCK_B - T_BLOCK_A) * k) / 6)

for (let pass = 0; pass < 3; pass++) {
  calibrate(bounds, CHAIN, 'seatW', PAD.chain)
  console.log('seatW', bounds.seatW, '· lanț:', solveChain(bounds, CHAIN, [CHAIN_START, CHAIN_END], 'chain', PAD.chain))
}
calibrate(bounds, VIP_LETTERS, 'vipSeatW', PAD.vip)
console.log('vipSeatW', bounds.vipSeatW, '· VIP:', solveChain(bounds, VIP_LETTERS, [6 + T_BLOCK_A, 6 + T_BLOCK_B], 'vip', PAD.vip))
solveTerrace(bounds)
const nat = countNatural({ bounds })
const rows = Object.keys(SECTOR_SEATS).map((k) => [k, SECTOR_SEATS[k], nat[k], nat[k] - SECTOR_SEATS[k]])
console.table(rows)
const bad = rows.filter((r) => r[3] < 0)
if (bad.length) {
  console.error('✗ Sectoare sub țintă:', bad.map((r) => r[0]).join(', '))
  process.exit(1)
}
fs.writeFileSync(OUT, `// generat de scripts/tune-seats.mjs — nu edita manual\nexport const BOUNDS = ${JSON.stringify(bounds, null, 2)}\n`)
console.log(`✓ scris ${path.relative(process.cwd(), OUT)} (${((performance.now() - t0) / 1000).toFixed(1)} s)`)
