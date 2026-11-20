// Caută lățimea locului (0,50–0,56 m public, 0,50–0,56 m VIP) pentru care geometria dă
// cel puțin capacitatea oficială cu cât mai puține locuri de scos la final.
// Rulează după orice schimbare de geometrie și copiază valorile în G (src/data/layout.js).
import { countNatural, G } from '../src/data/layout.js'
import { CAPACITY } from '../src/data/stadium-data.js'

function scan(key, target, lo, hi, step, other) {
  let best = null
  for (let w = lo; w <= hi + 1e-9; w += step) {
    const c = countNatural({ ...other, [key === 'pub' ? 'seatW' : 'vipSeatW']: w })[key]
    const ex = c - target
    if (ex >= 0 && (!best || ex < best.ex || (ex === best.ex && Math.abs(w - 0.5) < Math.abs(best.w - 0.5)))) best = { w: +w.toFixed(5), ex }
  }
  return best
}
const t0 = performance.now()
const pub = scan('pub', CAPACITY.public, 0.5, 0.56, 0.0001, { vipSeatW: G.vipSeatW })
const vip = scan('vip', CAPACITY.vip, 0.5, 0.56, 0.0002, { seatW: pub.w })
console.log(`public: seatW = ${pub.w} (de scos: ${pub.ex})`)
console.log(`VIP:    vipSeatW = ${vip.w} (de scos: ${vip.ex})`)
console.log(`(${((performance.now() - t0) / 1000).toFixed(1)} s)`)
