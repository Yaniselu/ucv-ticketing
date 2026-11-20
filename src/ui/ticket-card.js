// Biletul afișat în pagină (aceeași grafică ca PDF-ul): antet în culorile competiției, datele
// locului, titularul și codul QR de scanat la intrare.
import QRCode from 'qrcode'
import { themeFor } from '../data/ticket-theme.js'
import { kickoffLabels } from '../data/stadium-data.js'
import { pdfUrl } from '../net/api.js'
import './tickets.css'

const LOGOS = import.meta.glob('../assets/logos/*.png', { eager: true, query: '?url', import: 'default' })
const logoUrl = (id) => Object.entries(LOGOS).find(([p]) => p.endsWith(`/${id}.png`))?.[1]
export const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c])

const STATUS = { valid: ['ok', 'Valabil'], used: ['used', 'Folosit'], cancelled: ['off', 'Anulat'] }

export function ticketHTML(t, { orderId, orderCode, testMode = false, actions = true } = {}) {
  const i = t.info
  const th = themeFor(i.competitionId)
  const { dateLabel, time } = kickoffLabels(i.kickoff)
  const logo = logoUrl(i.competitionId)
  const cells = i.kind === 'box'
    ? [['Tribuna', 'VIP'], ['Loja', i.sectorShort], ['Nivel', i.level], ['Rând', i.row], ['Fotoliu', i.seat]]
    : [['Tribuna', String(i.stand).replace('Tribuna VIP & Loje', 'VIP')], ['Sector', i.sectorShort], ['Inel', i.ring || '—'], ['Rând', i.row], ['Loc', i.seat]]
  const [cls, label] = STATUS[t.status] || STATUS.valid
  return `<article class="tk" style="--tk-bg:${th.bg};--tk-bg2:${th.bg2};--tk-fg:${th.fg};--tk-accent:${th.accent}">
    <header class="tk-head">
      ${logo ? `<img class="tk-logo" src="${logo}" alt="${esc(th.label)}" />` : ''}
      <div class="tk-title">
        <div class="tk-eyebrow">${esc(th.label)}${i.phase ? ` · ${esc(i.phase)}` : ''}</div>
        <div class="tk-match">${esc(i.home)} – ${esc(i.away)}</div>
        <div class="tk-when">${esc(dateLabel)} · ora ${esc(time)}</div>
        <div class="tk-venue">${esc(i.venue)}</div>
      </div>
      <img class="tk-crest" src="/brand/ucv-crest-180.png" alt="Universitatea Craiova" />
    </header>
    <div class="tk-body">
      <div class="tk-main">
        <div class="tk-cells">${cells.map(([k, v]) => `<div class="tk-cell"><small>${k}</small><b>${esc(v)}</b></div>`).join('')}</div>
        <div class="tk-fields">
          <div><small>Acces</small><b>${esc(i.gate)}</b></div>
          <div><small>Preț</small><b>${esc(t.price)} lei</b></div>
          <div><small>Titular</small><b>${esc(t.holder)}</b></div>
        </div>
        <div class="tk-meta">${esc(i.sector)} · Comanda ${esc(orderCode || '')} · Bilet nr. ${esc(t.number)}</div>
        <div class="tk-badges">
          <span class="tk-status ${cls}">${label}${t.usedAt ? ` ${new Date(t.usedAt).toLocaleString('ro-RO', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })}` : ''}</span>
          ${i.awayFans ? '<span class="tk-badge away">Sectorul oaspeților</span>' : ''}
          ${testMode ? '<span class="tk-badge test">Bilet de test · plată simulată</span>' : ''}
        </div>
      </div>
      <div class="tk-stub">
        ${t.qr ? `<img class="tk-qr" data-qr="${esc(t.qr)}" alt="Codul QR al biletului ${esc(t.number)}" />` : '<div class="tk-qr void">Anulat</div>'}
        <small>Scanează la intrare</small>
        <b>${esc(t.number)}</b>
      </div>
    </div>
    ${actions && orderId ? `<footer class="tk-actions"><a class="btn ghost" href="${pdfUrl(orderId, t.id)}" target="_blank" rel="noopener">Descarcă PDF</a></footer>` : ''}
  </article>`
}

// desenează codurile QR din elementul dat (după ce HTML-ul a fost pus în pagină)
export async function hydrateQr(root) {
  const imgs = root.querySelectorAll('img[data-qr]')
  await Promise.all(
    [...imgs].map(async (img) => {
      img.src = await QRCode.toDataURL(img.dataset.qr, { errorCorrectionLevel: 'M', margin: 1, width: 360, color: { dark: '#0a1f44', light: '#ffffff' } })
      img.removeAttribute('data-qr')
    }),
  )
}
