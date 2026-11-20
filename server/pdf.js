// Biletul în PDF (o pagină A4 pe bilet): antet în culorile competiției cu logoul ei, meciul,
// data, datele locului (tribună, sector, inel, rând, loc, acces), titularul și codul QR.
import fs from 'node:fs/promises'
import { PDFDocument, rgb } from 'pdf-lib'
import fontkit from '@pdf-lib/fontkit'
import QRCode from 'qrcode'
import { themeFor } from '../src/data/ticket-theme.js'
import { kickoffLabels } from '../src/data/stadium-data.js'

const ROOT = new URL('../', import.meta.url)
const cache = new Map()
async function asset(rel) {
  if (!cache.has(rel)) cache.set(rel, fs.readFile(new URL(rel, ROOT)).catch(() => null))
  return cache.get(rel)
}
const hex = (h) => {
  const n = parseInt(h.slice(1), 16)
  return rgb(((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255)
}
const INK = hex('#142640')
const GREY = hex('#5a6a82')
const LINE = hex('#d9e0ea')
const PAPER2 = hex('#f3f6fa')
const BLUE = hex('#0b57d0')

export async function ticketsPdf(tickets, { testMode = false } = {}) {
  const pdf = await PDFDocument.create()
  pdf.registerFontkit(fontkit)
  pdf.setTitle(`Bilete ${tickets[0]?.info?.home || ''} – ${tickets[0]?.info?.away || ''}`)
  pdf.setAuthor('Universitatea Craiova')
  pdf.setCreator('Bilete Universitatea Craiova')
  const F = {
    xb: await pdf.embedFont(await asset('server/assets/fonts/BarlowCondensed_800ExtraBold.ttf'), { subset: true }),
    sb: await pdf.embedFont(await asset('server/assets/fonts/BarlowCondensed_600SemiBold.ttf'), { subset: true }),
    md: await pdf.embedFont(await asset('server/assets/fonts/Barlow_500Medium.ttf'), { subset: true }),
    bd: await pdf.embedFont(await asset('server/assets/fonts/Barlow_700Bold.ttf'), { subset: true }),
  }
  const crestPng = await asset('public/brand/ucv-crest-180.png')
  const crest = crestPng ? await pdf.embedPng(crestPng) : null
  const logos = new Map()
  for (const t of tickets) {
    const id = t.info.competitionId
    if (!logos.has(id)) {
      const png = await asset(`src/assets/logos/${id}.png`)
      logos.set(id, png ? await pdf.embedPng(png) : null)
    }
    await page(pdf, F, t, logos.get(id), testMode, crest)
  }
  return Buffer.from(await pdf.save())
}

// text care se micșorează până încape în lățimea dată
function fit(p, text, font, size, maxW, opts) {
  let s = size
  while (s > 6 && font.widthOfTextAtSize(text, s) > maxW) s -= 0.5
  p.drawText(text, { font, size: s, ...opts })
  return s
}

async function page(pdf, F, t, logo, testMode, crest) {
  const W = 595.28
  const H = 841.89
  const p = pdf.addPage([W, H])
  const th = themeFor(t.info.competitionId)
  const M = 36
  const cw = W - 2 * M
  const ch = 318
  const top = H - M
  const y0 = top - ch // marginea de jos a cardului
  const HEAD = 118
  const STUB = 162
  const info = t.info
  const { dateLabel, time } = kickoffLabels(info.kickoff)

  // cardul
  p.drawRectangle({ x: M, y: y0, width: cw, height: ch, color: rgb(1, 1, 1), borderColor: LINE, borderWidth: 1 })
  // antetul în culorile competiției, cu o bandă diagonală mai închisă
  p.drawRectangle({ x: M, y: top - HEAD, width: cw, height: HEAD, color: hex(th.bg) })
  p.drawSvgPath(`M ${cw * 0.62} 0 L ${cw} 0 L ${cw} ${HEAD} L ${cw * 0.5} ${HEAD} Z`, { x: M, y: top, color: hex(th.bg2), opacity: 0.55 })
  p.drawRectangle({ x: M, y: top - HEAD - 4, width: cw, height: 4, color: hex(th.accent) })

  // logoul competiției
  let tx = M + 22
  if (logo) {
    const box = 92
    const k = Math.min(box / logo.width, box / logo.height)
    const w = logo.width * k
    const h = logo.height * k
    p.drawImage(logo, { x: M + 18 + (box - w) / 2, y: top - HEAD / 2 - h / 2, width: w, height: h })
    tx = M + 18 + box + 18
  }
  const fg = hex(th.fg)
  const textW = M + cw - 80 - tx
  p.drawText(`${th.label}${info.phase ? ` · ${info.phase}` : ''}`.toUpperCase(), { x: tx, y: top - 30, font: F.sb, size: 10, color: hex(th.accent) })
  fit(p, `${info.home} – ${info.away}`.toUpperCase(), F.xb, 26, textW, { x: tx, y: top - 58, color: fg })
  p.drawText(`${dateLabel} · ora ${time}`, { x: tx, y: top - 80, font: F.bd, size: 12, color: fg })
  p.drawText(info.venue, { x: tx, y: top - 97, font: F.md, size: 9.5, color: fg, opacity: 0.85 })
  // stema Universității Craiova
  if (crest) {
    const ch2 = 62
    const cw2 = (crest.width / crest.height) * ch2
    p.drawImage(crest, { x: M + cw - 18 - cw2, y: top - 14 - ch2, width: cw2, height: ch2 })
  } else {
    p.drawCircle({ x: M + cw - 34, y: top - 34, size: 16, color: BLUE })
  }

  // datele locului
  const bodyTop = top - HEAD - 4
  const lx = M + 20
  const lw = cw - STUB - 40
  const cells = info.kind === 'box'
    ? [['TRIBUNA', 'VIP'], ['LOJA', info.sectorShort], ['NIVEL', String(info.level)], ['RÂND', String(info.row)], ['FOTOLIU', String(info.seat)]]
    : [['TRIBUNA', info.stand.replace('Tribuna VIP & Loje', 'VIP')], ['SECTOR', info.sectorShort], ['INEL', info.ring ? String(info.ring) : '—'], ['RÂND', String(info.row)], ['LOC', String(info.seat)]]
  const gap = 6
  const cwid = (lw - gap * (cells.length - 1)) / cells.length
  const cellTop = bodyTop - 16
  cells.forEach(([label, value], k) => {
    const x = lx + k * (cwid + gap)
    p.drawRectangle({ x, y: cellTop - 58, width: cwid, height: 58, color: PAPER2 })
    p.drawRectangle({ x, y: cellTop - 3, width: cwid, height: 3, color: hex(th.bg) })
    p.drawText(label, { x: x + 8, y: cellTop - 17, font: F.sb, size: 8, color: GREY })
    fit(p, value, F.xb, k === 0 ? 20 : 28, cwid - 14, { x: x + 8, y: cellTop - 48, color: INK })
  })
  const row2 = cellTop - 58 - 18
  const field = (label, value, x, w, size = 15) => {
    p.drawText(label, { x, y: row2 - 8, font: F.sb, size: 8, color: GREY })
    fit(p, value, F.xb, size, w, { x, y: row2 - 27, color: INK })
  }
  const third = lw / 3
  field('ACCES', info.gate || '—', lx, third - 10)
  field('PREȚ', `${t.price} lei`, lx + third, third - 10)
  field('TITULAR', t.holder, lx + third * 2, third)
  const row3 = row2 - 50
  p.drawText('SECTORUL', { x: lx, y: row3, font: F.sb, size: 8, color: GREY })
  fit(p, info.sector, F.bd, 10, lw * 0.55, { x: lx + 44, y: row3, color: INK })
  p.drawText(`Comanda ${t.orderCode}`, { x: lx, y: row3 - 16, font: F.md, size: 9, color: GREY })
  p.drawText(`Bilet nr. ${t.number}`, { x: lx + lw * 0.42, y: row3 - 16, font: F.md, size: 9, color: GREY })
  let bx = lx
  const badge = (text, color) => {
    const w = F.sb.widthOfTextAtSize(text, 9) + 14
    p.drawRectangle({ x: bx, y: y0 + 16, width: w, height: 16, color })
    p.drawText(text, { x: bx + 7, y: y0 + 20.5, font: F.sb, size: 9, color: rgb(1, 1, 1) })
    bx += w + 6
  }
  if (info.awayFans) badge('SECTORUL OASPEȚILOR', hex('#8a1c1c'))
  if (testMode) badge('BILET DE TEST · PLATĂ SIMULATĂ', hex('#b45309'))
  if (t.status === 'cancelled') badge('ANULAT', hex('#b91c1c'))

  // cotorul cu codul QR
  const sx = M + cw - STUB
  p.drawRectangle({ x: sx, y: y0, width: STUB, height: bodyTop - y0, color: PAPER2 })
  for (let y = y0 + 4; y < bodyTop - 4; y += 9) p.drawLine({ start: { x: sx, y }, end: { x: sx, y: y + 4.5 }, thickness: 1, color: GREY, opacity: 0.6 })
  if (t.qr) {
    const png = await QRCode.toBuffer(t.qr, { errorCorrectionLevel: 'M', margin: 1, width: 480, color: { dark: '#0a1f44', light: '#ffffff' } })
    const img = await pdf.embedPng(png)
    const q = 128
    p.drawRectangle({ x: sx + (STUB - q) / 2 - 4, y: bodyTop - 22 - q - 4, width: q + 8, height: q + 8, color: rgb(1, 1, 1) })
    p.drawImage(img, { x: sx + (STUB - q) / 2, y: bodyTop - 22 - q, width: q, height: q })
  }
  const center = (text, font, size, y, color = INK) => p.drawText(text, { x: sx + (STUB - font.widthOfTextAtSize(text, size)) / 2, y, font, size, color })
  center('SCANEAZĂ LA INTRARE', F.sb, 9, bodyTop - 168, GREY)
  center(t.number, F.xb, 13, bodyTop - 184)
  p.drawRectangle({ x: M, y: y0, width: cw, height: 5, color: hex(th.accent) })

  // informații sub bilet
  let y = y0 - 34
  p.drawText('Informații pentru acces', { x: M, y, font: F.xb, size: 15, color: INK })
  y -= 20
  const lines = [
    `Prezintă codul QR la turnicheții accesului indicat (${info.gate || 'conform biletului'}), de pe telefon sau tipărit.`,
    'Codul se poate folosi o singură dată: după scanare, biletul nu mai permite intrarea.',
    'Nu publica și nu trimite altora codul: oricine are o copie a lui poate intra în locul tău.',
    'Ai la tine un act de identitate; la meciurile UEFA numele de pe bilet trebuie să fie al tău.',
    'Porțile se deschid cu două ore înainte de ora de începere a meciului.',
  ]
  for (const l of lines) {
    p.drawCircle({ x: M + 4, y: y + 3.5, size: 2, color: hex(th.bg) })
    p.drawText(l, { x: M + 14, y, font: F.md, size: 10, color: INK })
    y -= 17
  }
  y -= 8
  p.drawLine({ start: { x: M, y }, end: { x: W - M, y }, thickness: 0.6, color: LINE })
  y -= 16
  p.drawText('Universitatea Craiova · Stadionul „Ion Oblemenco”, Craiova', { x: M, y, font: F.md, size: 8.5, color: GREY })
  if (testMode) p.drawText('Bilet emis în modul de test al sistemului de ticketing: nu a fost încasată nicio plată.', { x: M, y: y - 13, font: F.md, size: 8.5, color: hex('#b45309') })
}
