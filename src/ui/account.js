// Contul pe pagina hărții: butonul din antet, intrarea în cont, „Biletele mele”, profilul și
// finalizarea comenzii (date titulari, plată, confirmare cu biletele).
import { api, loadMe, getMe, setMe, onMe, meta, pdfUrl } from '../net/api.js'
import { authForm } from './auth-form.js'
import { ticketHTML, hydrateQr, esc } from './ticket-card.js'
import { EVENT } from '../data/stadium-data.js'

const $ = (id) => document.getElementById(id)
const lei = (n) => `${Number(n).toLocaleString('ro-RO')} lei`

export function createAccount({ onChange, onRoute } = {}) {
  const modal = $('modal')
  const chip = $('account')
  let menuOpen = false
  let timer = 0

  function show(html, { wide = false } = {}) {
    clearInterval(timer)
    modal.innerHTML = `<div class="modal-card${wide ? ' wide' : ''}"><button class="modal-x" data-close aria-label="Închide">×</button>${html}</div>`
    modal.classList.add('on')
    modal.querySelectorAll('[data-close]').forEach((b) => (b.onclick = close))
    return modal.querySelector('.modal-card')
  }
  function close() {
    clearInterval(timer)
    modal.classList.remove('on')
    modal.innerHTML = ''
  }
  // „Traseul spre loc” de pe bilete: închide fereastra și arată drumul pe hartă
  const bindRoutes = (card) => card.querySelectorAll('[data-route]').forEach((b) => (b.onclick = () => {
    close()
    onRoute?.(b.dataset.route)
  }))

  // ─── butonul de cont din antet ───
  function renderChip() {
    const u = getMe()
    if (!u) {
      chip.innerHTML = '<button class="acct-btn" data-a="login"><span class="acct-ico" aria-hidden="true"></span>Intră în cont</button>'
    } else {
      const initials = u.name.split(' ').map((w) => w[0]).slice(0, 2).join('').toUpperCase()
      chip.innerHTML = `<button class="acct-btn" data-a="menu" aria-haspopup="menu" aria-expanded="${menuOpen}"><span class="acct-av">${esc(initials)}</span><span class="acct-name">${esc(u.name.split(' ')[0])}</span></button>
        <div class="acct-menu ${menuOpen ? 'on' : ''}" role="menu">
          <div class="acct-who"><b>${esc(u.name)}</b><span>${esc(u.email)}</span></div>
          <button role="menuitem" data-a="tickets">Biletele mele</button>
          <button role="menuitem" data-a="profile">Contul meu</button>
          ${u.role === 'admin' ? '<a role="menuitem" href="/admin">Administrare</a>' : ''}
          ${u.role === 'admin' || u.role === 'scanner' ? '<a role="menuitem" href="/scan">Scanare bilete</a>' : ''}
          <button role="menuitem" data-a="logout">Ieși din cont</button>
        </div>`
    }
    chip.querySelectorAll('[data-a]').forEach((b) => (b.onclick = (e) => {
      e.stopPropagation()
      const a = b.dataset.a
      if (a === 'menu') { menuOpen = !menuOpen; renderChip(); return }
      menuOpen = false
      renderChip()
      if (a === 'login') openAuth()
      if (a === 'tickets') openTickets()
      if (a === 'profile') openProfile()
      if (a === 'logout') logout()
    }))
  }
  document.addEventListener('click', () => { if (menuOpen) { menuOpen = false; renderChip() } })
  onMe(() => { renderChip(); onChange?.(getMe()) })

  async function logout() {
    await api('POST', '/api/auth/logout').catch(() => {})
    setMe(null)
  }

  // ─── intrarea în cont ───
  function openAuth({ note = '', mode = 'login', then, resetToken } = {}) {
    const card = show(`<div class="eyebrow">Contul tău</div><h2>${resetToken ? 'Parolă nouă' : 'Bilete Universitatea Craiova'}</h2><div class="auth"></div>`)
    authForm(card.querySelector('.auth'), { mode, note, resetToken, onDone: () => { close(); then?.() } })
  }

  // ─── biletele mele ───
  async function openTickets() {
    if (!getMe()) return openAuth({ note: 'Intră în cont ca să-ți vezi biletele.', then: openTickets })
    const card = show('<div class="eyebrow">Contul tău</div><h2>Biletele mele</h2><p class="muted">Se încarcă…</p>', { wide: true })
    try {
      const { orders } = await api('GET', '/api/me/orders')
      const testMode = meta.payment === 'test'
      card.innerHTML = `<button class="modal-x" data-close aria-label="Închide">×</button><div class="eyebrow">Contul tău</div><h2>Biletele mele</h2>
        ${orders.length ? '' : '<p>Nu ai încă bilete. Alege un loc pe hartă și finalizează comanda.</p>'}
        ${orders.map((o) => `<section class="order">
          <div class="order-head">
            <div><b>Comanda ${esc(o.code)}</b><span>${o.tickets.length} ${o.tickets.length === 1 ? 'bilet' : 'bilete'} · ${lei(o.total)} · ${new Date(o.paidAt || o.createdAt).toLocaleString('ro-RO', { dateStyle: 'medium', timeStyle: 'short' })}${o.status === 'cancelled' ? ' · <em class="bad">anulată</em>' : ''}</span></div>
            <div class="order-actions">
              <a class="btn ghost" href="${pdfUrl(o.id)}" target="_blank" rel="noopener">PDF cu toate biletele</a>
              ${o.status === 'paid' && meta.mail ? `<button class="btn ghost" data-resend="${o.id}">Retrimite pe email</button>` : ''}
            </div>
          </div>
          <div class="order-tickets">${o.tickets.map((t) => ticketHTML(t, { orderId: o.id, orderCode: o.code, testMode })).join('')}</div>
        </section>`).join('')}`
      card.querySelector('[data-close]').onclick = close
      card.querySelectorAll('[data-resend]').forEach((b) => (b.onclick = async () => {
        b.disabled = true
        try {
          const r = await api('POST', `/api/orders/${b.dataset.resend}/resend`)
          b.textContent = r.emailed ? 'Trimis ✓' : 'Nu s-a putut trimite'
        } catch (e) {
          b.textContent = e.message
        }
      }))
      bindRoutes(card)
      hydrateQr(card)
    } catch (e) {
      card.querySelector('.muted').textContent = e.message
    }
  }

  // ─── profilul ───
  function openProfile() {
    const u = getMe()
    if (!u) return openAuth({ then: openProfile })
    const card = show(`<div class="eyebrow">Contul tău</div><h2>Contul meu</h2>
      <form class="auth-form" data-f="profile">
        <label>Email<input value="${esc(u.email)}" disabled /></label>
        <label>Nume și prenume<input name="name" value="${esc(u.name)}" required minlength="3" maxlength="80" /></label>
        <label>Telefon<input name="phone" type="tel" value="${esc(u.phone)}" required maxlength="20" /></label>
        <button class="btn primary" type="submit">Salvează</button><div class="form-msg" role="alert"></div>
      </form>
      <h3>Schimbă parola</h3>
      <form class="auth-form" data-f="password">
        <label>Parola actuală<input name="current" type="password" autocomplete="current-password" required /></label>
        <label>Parola nouă<input name="password" type="password" autocomplete="new-password" required minlength="8" maxlength="128" /></label>
        <button class="btn ghost" type="submit">Schimbă parola</button><div class="form-msg" role="alert"></div>
      </form>
      ${u.role === 'admin' ? '' : `<details class="admin-claim"><summary>Am un cod de administrator</summary>
        <form class="auth-form" data-f="claim"><label>Codul primit de la club<input name="code" required maxlength="100" autocomplete="off" /></label>
        <button class="btn ghost" type="submit">Activează</button><div class="form-msg" role="alert"></div></form></details>`}`)
    const handlers = {
      profile: async (f) => { const r = await api('PUT', '/api/auth/me', f); setMe(r.user); return 'Datele au fost salvate.' },
      password: async (f) => { await api('POST', '/api/auth/password', f); return 'Parola a fost schimbată. Celelalte dispozitive au fost deconectate.' },
      claim: async (f) => { await api('POST', '/api/auth/claim-admin', f); await loadMe(true).then(setMe); return 'Contul tău este acum administrator. Găsești „Administrare” în meniul contului.' },
    }
    card.querySelectorAll('form[data-f]').forEach((form) => (form.onsubmit = async (e) => {
      e.preventDefault()
      if (!form.checkValidity()) return form.reportValidity()
      const msg = form.querySelector('.form-msg')
      const btn = form.querySelector('[type="submit"]')
      btn.disabled = true
      try {
        msg.className = 'form-msg ok'
        msg.textContent = await handlers[form.dataset.f](Object.fromEntries(new FormData(form)))
        if (form.dataset.f === 'password') form.reset()
      } catch (err) {
        msg.className = 'form-msg err'
        msg.textContent = err.message
      } finally {
        btn.disabled = false
      }
    }))
  }

  // ─── finalizarea comenzii ───
  // order: rezervarea de pe server; items: [{ key, where, what, gate, price }]
  function openCheckout(order, items, { onPaid, onCancel, onExpired }) {
    const u = getMe()
    const testMode = meta.payment === 'test'
    const card = show(`<div class="eyebrow">Finalizează comanda · ${esc(order.code)}</div>
      <h2>${esc(EVENT.home)} – ${esc(EVENT.away)}</h2>
      <p>${esc(EVENT.competition)} · ${esc(EVENT.dateLabel)}, ora ${esc(EVENT.time)}</p>
      <div class="hold-timer" id="hold-timer"></div>
      <form class="checkout" novalidate>
        <div class="co-items">${items.map((it, k) => `<div class="co-item">
          <div class="co-seat"><b>${esc(it.where)}</b><span>${esc(it.what)} · Acces ${esc(it.gate)}</span></div>
          <span class="p">${lei(it.price)}</span>
          <label class="co-holder">Numele titularului<input name="h${k}" value="${esc(u.name)}" required minlength="3" maxlength="80" autocomplete="name" /></label>
        </div>`).join('')}</div>
        <div class="co-contact">Biletele vor fi în contul tău${meta.mail ? ` și trimise pe email la <b>${esc(u.email)}</b>` : ''}. Telefon de contact: <b>${esc(u.phone)}</b>.</div>
        <div class="pay-box">
          ${testMode
            ? '<b>Mod de test</b><span>Plata cu cardul nu este încă conectată: comanda se confirmă fără să se încaseze bani, iar biletele sunt marcate „bilet de test”.</span>'
            : '<b>Plata cu cardul</b><span>Vei fi redirecționat către pagina securizată a procesatorului de plăți.</span>'}
        </div>
        <div class="total"><span>Total de plată</span><b>${lei(order.total)}</b></div>
        <div class="form-msg" role="alert"></div>
        <div class="co-btns">
          <button class="btn ghost" type="button" data-cancel>Renunță</button>
          <button class="btn primary" type="submit">${testMode ? `Confirmă comanda · ${lei(order.total)}` : `Plătește ${lei(order.total)}`}</button>
        </div>
      </form>`)
    const tEl = card.querySelector('#hold-timer')
    const until = new Date(order.expiresAt).getTime() - (order.skew || 0)
    const tick = () => {
      const left = Math.max(0, Math.round((until - Date.now()) / 1000))
      tEl.innerHTML = `Locurile sunt rezervate pentru tine încă <b>${String(Math.floor(left / 60)).padStart(2, '0')}:${String(left % 60).padStart(2, '0')}</b>`
      tEl.classList.toggle('low', left < 60)
      if (!left) {
        clearInterval(timer)
        show('<div class="eyebrow">Rezervare expirată</div><h2>Timpul a expirat</h2><p>Locurile au fost eliberate. Le poți alege din nou, dacă sunt încă libere.</p><button class="btn primary" data-close>Înapoi la hartă</button>')
        onExpired?.()
      }
    }
    tick()
    timer = setInterval(tick, 1000)
    const form = card.querySelector('form')
    const msg = form.querySelector('.form-msg')
    card.querySelector('[data-cancel]').onclick = async () => {
      clearInterval(timer)
      await api('POST', '/api/checkout/release', { orderId: order.id }).catch(() => {})
      close()
      onCancel?.()
    }
    form.onsubmit = async (e) => {
      e.preventDefault()
      if (!form.checkValidity()) return form.reportValidity()
      const f = Object.fromEntries(new FormData(form))
      const holders = Object.fromEntries(items.map((it, k) => [it.key, f[`h${k}`]]))
      const btn = form.querySelector('[type="submit"]')
      btn.disabled = true
      btn.textContent = 'Se confirmă…'
      try {
        const r = await api('POST', '/api/checkout/pay', { orderId: order.id, holders })
        clearInterval(timer)
        showSuccess(r.order, r.emailed)
        onPaid?.(r.order)
      } catch (err) {
        msg.className = 'form-msg err'
        msg.textContent = err.message
        btn.disabled = false
        btn.textContent = 'Încearcă din nou'
        if (err.status === 410) { clearInterval(timer); onExpired?.() }
      }
    }
  }

  function showSuccess(order, emailed) {
    const u = getMe()
    const card = show(`<div class="eyebrow ok">Comanda ${esc(order.code)} · confirmată</div>
      <h2>Biletele sunt ale tale</h2>
      <p>${emailed ? `Le-am trimis pe email la <b>${esc(u.email)}</b> (verifică și Spam). ` : ''}Le găsești oricând în „Biletele mele”. La intrare scanezi codul QR de pe telefon sau de pe biletul tipărit.</p>
      <div class="order-tickets">${order.tickets.map((t) => ticketHTML(t, { orderId: order.id, orderCode: order.code, testMode: meta.payment === 'test' })).join('')}</div>
      <div class="co-btns">
        <a class="btn ghost" href="${pdfUrl(order.id)}" target="_blank" rel="noopener">Descarcă toate (PDF)</a>
        <button class="btn primary" data-close>Gata</button>
      </div>`, { wide: true })
    bindRoutes(card)
    hydrateQr(card)
  }

  renderChip()
  return { openAuth, openTickets, openProfile, openCheckout, close, renderChip, show }
}
