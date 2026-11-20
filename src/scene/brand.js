// Imaginile clubului și ale competiției, încărcate înainte de construirea scenei, ca texturile
// (tabela, panourile LED, prelatele tunelurilor) să le poată desena direct.
import { COMPETITION_ID } from '../data/stadium-data.js'

const LOGOS = import.meta.glob('../assets/logos/*.png', { eager: true, query: '?url', import: 'default' })
export const CREST_URL = '/brand/ucv-crest.png'
export const brand = { crest: null, compLogo: null }

const load = (src) =>
  new Promise((resolve) => {
    if (!src) return resolve(null)
    const img = new Image()
    img.onload = () => resolve(img)
    img.onerror = () => resolve(null)
    img.src = src
  })

export async function loadBrand() {
  const logo = Object.entries(LOGOS).find(([p]) => p.endsWith(`/${COMPETITION_ID}.png`))?.[1]
  const [crest, compLogo] = await Promise.all([load(CREST_URL), load(logo)])
  Object.assign(brand, { crest, compLogo })
  return brand
}

// desenează o imagine încadrată într-un dreptunghi (păstrând proporțiile)
export function drawFit(g, img, x, y, w, h) {
  if (!img) return
  const k = Math.min(w / img.width, h / img.height)
  g.drawImage(img, x + (w - img.width * k) / 2, y + (h - img.height * k) / 2, img.width * k, img.height * k)
}
