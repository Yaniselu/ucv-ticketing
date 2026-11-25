// Panoul de administrare: meciuri, vânzare (sectoare, prețuri, oaspeți), locuri blocate,
// comenzi, utilizatori și jurnalul acțiunilor. Toate drepturile sunt verificate pe server.
import './admin.css'
import { api, loadMe, setMe, pdfUrl } from '../net/api.js'
import { authForm } from '../ui/auth-form.js'
import { esc } from '../ui/ticket-card.js'
import { buildLayout } from '../data/layout.js'
import { STANDS } from '../data/stadium-data.js'

const $ = (s, r = document) => r.querySelector(s)
const main = $('#adm-main')
const fmt = (n) => Number(n || 0).toLocaleString('ro-RO')
const lei = (n) => `${fmt(n)} lei`
const when = (iso) => (iso ? new Date(iso).toLocaleString('ro-RO', { timeZone: 'Europe/Bucharest', dateStyle: 'medium', timeStyle: 'short' }) : '—')
const toLocalInput = (iso) => {
  if (!iso) return ''
  const d = new Date(iso)
  const p = (n) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}`
}
const fromLocalInput = (v) => (v ? new Date(v).toISOString() : null)

const TABS = [
  ['meciuri', 'Meciuri'], ['vanzare', 'Vânzare și prețuri'], ['locuri', 'Locuri blocate'], ['comenzi', 'Comenzi'], ['utilizatori', 'Utilizatori'], ['jurnal', 'Jurnal'],
]
const STATUS_LABEL = { draft: ['Ciornă', ''], published: ['Publicat', 'ok'], archived: ['Arhivat', 'bad'] }
const SALE_LABEL = { open: ['La vânzare', 'ok'], soon: ['Vânzarea nu a început', 'warn'], closed: ['Vânzare închisă', 'bad'] }
const STAND_ORDER = ['T1', 'VIP', 'PN', 'T2', 'PS']

let me = null
let layout = null
const S = { events: [], comps: [], eventId: localStorage.getItem('adm-ev') || '' }
const selected = () => S.events.find((e) => e.id === S.eventId) || S.events[0]

// ─── pornire ───
async function start() {
  me = await loadMe()
  renderUser()
  if (!me) {
    main.innerHTML = '<h1>Administrare</h1><div class="card auth"></div>'
    authForm($('.auth', main), { note: 'Intră cu contul de administrator.', onDone: () => location.reload() })
    return
  }
  if (me.role !== 'admin') {
    main.innerHTML = `<h1>Administrare</h1><div class="card"><p>Contul <b>${esc(me.email)}</b> nu are drepturi de administrator.</p>
      ${me.role === 'scanner' ? '<p><a class="btn primary" href="/scan">Deschide scanarea biletelor</a></p>' : ''}
      <form class="form" data-claim><label>Cod de administrator <small>(primit de la club)</small><input name="code" required autocomplete="off" maxlength="100" /></label>
      <div class="row" style="align-self:end"><button class="btn primary">Activează</button></div><div class="form-msg" role="alert"></div></form></div>`
    $('[data-claim]').onsubmit = async (e) => {
      e.preventDefault()
      const msg = $('.form-msg', e.target)
      try {
        await api('POST', '/api/auth/claim-admin', Object.fromEntries(new FormData(e.target)))
        location.reload()
      } catch (err) {
        msg.className = 'form-msg err'
        msg.textContent = err.message
      }
    }
    return
  }
  layout = buildLayout()
  await loadEvents()
  window.addEventListener('hashchange', route)
  route()
}

function renderUser() {
  const el = $('#adm-user')
  el.innerHTML = me ? `<span>${esc(me.name)} · ${esc(me.role)}</span><button data-out>Ieși</button>` : ''
  const b = $('[data-out]', el)
  if (b) b.onclick = async () => { await api('POST', '/api/auth/logout').catch(() => {}); setMe(null); location.reload() }
}

async function loadEvents() {
  const r = await api('GET', '/api/admin/events')
  S.events = r.events
  S.comps = r.competitions
  S.demo = r.demo
  if (!S.events.some((e) => e.id === S.eventId)) S.eventId = S.events[0]?.id || ''
}

function route() {
  const tab = (location.hash.slice(1) || 'meciuri').split('?')[0]
  $('#adm-nav').innerHTML = TABS.map(([id, label]) => `<a href="#${id}" ${id === tab ? 'aria-current="page"' : ''}>${label}</a>`).join('') +
    '<a href="/scan">Scanare</a><a href="/">Harta</a>'
  const views = { meciuri: viewEvents, vanzare: viewSale, locuri: viewSeats, comenzi: viewOrders, utilizatori: viewUsers, jurnal: viewAudit }
  ;(views[tab] || viewEvents)().catch((e) => { main.innerHTML = `<div class="form-msg err">${esc(e.message)}</div>` })
}

function eventPicker() {
  return `<label class="field" style="min-width:280px">Meciul<select data-ev>${S.events.map((e) => `<option value="${esc(e.id)}" ${e.id === selected()?.id ? 'selected' : ''}>${esc(e.home)} – ${esc(e.away)} · ${when(e.kickoff)}</option>`).join('')}</select></label>`
}
function bindPicker(root) {
  const sel = $('[data-ev]', root)
  if (sel) sel.onchange = () => { S.eventId = sel.value; localStorage.setItem('adm-ev', sel.value); route() }
}

// ─── modal ───
const modal = $('#modal')
function openModal(html) {
  modal.innerHTML = `<div class="modal-card"><button class="modal-x" aria-label="Închide">×</button>${html}</div>`
  modal.classList.add('on')
  $('.modal-x', modal).onclick = closeModal
  return $('.modal-card', modal)
}
function closeModal() {
  modal.classList.remove('on')
  modal.innerHTML = ''
}
modal.addEventListener('click', (e) => { if (e.target === modal) closeModal() })
function confirmBox(title, text, okLabel = 'Confirmă') {
  return new Promise((resolve) => {
    const c = openModal(`<h2>${esc(title)}</h2><p>${text}</p><div class="row" style="justify-content:flex-end"><button class="btn ghost" data-no>Renunță</button><button class="btn danger" data-yes>${esc(okLabel)}</button></div>`)
    $('[data-no]', c).onclick = () => { closeModal(); resolve(false) }
    $('[data-yes]', c).onclick = () => { closeModal(); resolve(true) }
  })
}

// ─── Meciuri ───
async function viewEvents() {
  await loadEvents()
  main.innerHTML = `<div class="row spread"><h1>Meciuri</h1><button class="btn primary" data-new>Meci nou</button></div>
    ${S.events.length ? '' : '<p class="muted">Nu există meciuri. Adaugă primul meci.</p>'}
    ${S.demo?.allowed ? `<div class="card demo-card"><div><h2>Date demo</h2><p class="muted">${S.demo.present
      ? 'Datele demo sunt încărcate: meciurile „demo-…”, 3.000 de cumpărători (@demo.test), comenzi plătite, bilete scanate, o comandă anulată, locuri blocate și coșuri în lucru.'
      : 'Umple panoul cu date de probă: 4 meciuri (la vânzare, vânzarea începe curând, jucat, ciornă), 3.000 de cumpărători, ~6.000 de bilete, scanări la poartă. Se generează prin aceleași reguli ca vânzarea reală și se pot șterge oricând.'}</p></div>
      <div class="row"><button class="btn primary" data-demo="seed">${S.demo.present ? 'Regenerează datele demo' : 'Generează date demo'}</button>${S.demo.present ? '<button class="btn danger" data-demo="clear">Șterge datele demo</button>' : ''}</div><div class="form-msg" role="alert"></div></div>` : ''}
    <div class="grid">${S.events.map((e) => {
      const [sl, sc] = STATUS_LABEL[e.status]
      const [vl, vc] = SALE_LABEL[e.saleState]
      const comp = S.comps.find((c) => c.id === e.competitionId)?.name || e.competitionId
      return `<div class="card">
        <div class="row spread"><span class="chip ${sc}">${sl}</span><span class="chip ${vc}">${vl}</span></div>
        <div><h2>${esc(e.home)} – ${esc(e.away)}</h2><div class="muted">${esc(comp)}${e.phase ? ` · ${esc(e.phase)}` : ''}</div><div><b>${when(e.kickoff)}</b></div></div>
        <div class="muted" style="font-size:13px">Vânzare: ${e.saleStart ? when(e.saleStart) : 'imediat'} → ${e.saleEnd ? when(e.saleEnd) : 'începutul meciului'}</div>
        <div class="kpis"><div class="kpi"><b>${fmt(e.stats.sold)}</b><span>bilete vândute</span></div><div class="kpi"><b>${fmt(e.stats.revenue)}</b><span>lei încasați</span></div><div class="kpi"><b>${fmt(e.stats.used)}</b><span>intrați la poartă</span></div></div>
        <div class="row"><button class="btn ghost small" data-edit="${esc(e.id)}">Editează</button><a class="btn ghost small" href="#vanzare" data-sel="${esc(e.id)}">Vânzare și prețuri</a><a class="btn ghost small" href="#comenzi" data-sel="${esc(e.id)}">Comenzi</a><a class="btn ghost small" href="/?meci=${encodeURIComponent(e.id)}" target="_blank" rel="noopener">Pe hartă</a></div>
      </div>`
    }).join('')}</div>`
  $('[data-new]').onclick = () => eventForm(null)
  main.querySelectorAll('[data-demo]').forEach((b) => (b.onclick = async () => {
    const seed = b.dataset.demo === 'seed'
    if (!seed && !(await confirmBox('Ștergi datele demo?', 'Se șterg meciurile „demo-…”, comenzile, biletele și conturile @demo.test. Meciurile și comenzile reale rămân neatinse.', 'Șterge'))) return
    const msg = $('.demo-card .form-msg')
    b.disabled = true
    msg.className = 'form-msg'
    msg.textContent = seed ? 'Se generează…' : 'Se șterg…'
    try {
      const r = await api(seed ? 'POST' : 'DELETE', '/api/admin/demo')
      await viewEvents()
      const m = $('.demo-card .form-msg')
      m.className = 'form-msg ok'
      m.textContent = seed
        ? `Gata: ${fmt(r.orders)} comenzi, ${fmt(r.tickets)} bilete, ${fmt(r.scanned)} intrați la poartă, ${r.holds} coșuri în lucru.`
        : `Șters: ${r.events} meciuri, ${fmt(r.orders)} comenzi, ${fmt(r.tickets)} bilete, ${fmt(r.users)} conturi.`
    } catch (err) {
      msg.className = 'form-msg err'
      msg.textContent = err.message
      b.disabled = false
    }
  }))
  main.querySelectorAll('[data-edit]').forEach((b) => (b.onclick = () => eventForm(S.events.find((e) => e.id === b.dataset.edit))))
  main.querySelectorAll('[data-sel]').forEach((a) => (a.onclick = () => { S.eventId = a.dataset.sel; localStorage.setItem('adm-ev', a.dataset.sel) }))
}

function eventForm(ev) {
  const c = openModal(`<h2>${ev ? 'Editează meciul' : 'Meci nou'}</h2>
    <form class="form" style="grid-template-columns:1fr 1fr">
      <label>Gazde<input name="home" required maxlength="60" value="${esc(ev?.home || 'Universitatea Craiova')}" /></label>
      <label>Oaspeți<input name="away" required maxlength="60" value="${esc(ev?.away || '')}" /></label>
      <label>Competiția<select name="competitionId">${S.comps.map((x) => `<option value="${x.id}" ${x.id === (ev?.competitionId || 'superliga') ? 'selected' : ''}>${esc(x.name)}</option>`).join('')}</select></label>
      <label>Faza / etapa<input name="phase" maxlength="80" value="${esc(ev?.phase || '')}" placeholder="ex. Etapa 20" /></label>
      <label>Data și ora meciului<input name="kickoff" type="datetime-local" required value="${toLocalInput(ev?.kickoff)}" /></label>
      <label>Starea<select name="status">${Object.entries(STATUS_LABEL).map(([k, [l]]) => `<option value="${k}" ${k === (ev?.status || 'draft') ? 'selected' : ''}>${l}</option>`).join('')}</select></label>
      <label>Vânzarea începe <small>(gol = imediat)</small><input name="saleStart" type="datetime-local" value="${toLocalInput(ev?.saleStart)}" /></label>
      <label>Vânzarea se încheie <small>(gol = la începutul meciului)</small><input name="saleEnd" type="datetime-local" value="${toLocalInput(ev?.saleEnd)}" /></label>
      <div class="form-msg" role="alert" style="grid-column:1/-1"></div>
      <div class="row" style="grid-column:1/-1;justify-content:flex-end"><button type="button" class="btn ghost" data-no>Renunță</button><button class="btn primary">${ev ? 'Salvează' : 'Creează meciul'}</button></div>
    </form>
    <p class="muted" style="font-size:13px">Un meci „Ciornă” nu apare pe site. Când e „Publicat”, se vinde în perioada de vânzare. Sectoarele, prețurile și oaspeții se setează în „Vânzare și prețuri”.</p>`)
  $('[data-no]', c).onclick = closeModal
  $('form', c).onsubmit = async (e) => {
    e.preventDefault()
    const f = Object.fromEntries(new FormData(e.target))
    const body = { ...f, kickoff: fromLocalInput(f.kickoff), saleStart: fromLocalInput(f.saleStart), saleEnd: fromLocalInput(f.saleEnd) }
    try {
      const r = ev ? await api('PUT', `/api/admin/events/${encodeURIComponent(ev.id)}`, body) : await api('POST', '/api/admin/events', body)
      S.eventId = r.event.id
      localStorage.setItem('adm-ev', r.event.id)
      closeModal()
      route()
    } catch (err) {
      const m = $('.form-msg', c)
      m.className = 'form-msg err'
      m.textContent = err.message
    }
  }
}

// ─── Vânzare și prețuri ───
async function viewSale() {
  const ev = selected()
  if (!ev) return viewEvents()
  const [st, chk] = await Promise.all([
    api('GET', `/api/admin/events/${encodeURIComponent(ev.id)}/stats`),
    api('GET', `/api/admin/events/${encodeURIComponent(ev.id)}/integrity`).catch(() => null),
  ])
  const cfg = structuredClone(st.event.config)
  const by = new Map(st.sectors.map((r) => [r.id, r]))
  let dirty = false
  const t = st.total
  const groups = STAND_ORDER.map((sid) => [sid, layout.sectors.filter((s) => s.stand === sid)])
  main.innerHTML = `<div class="row spread"><h1>Vânzare și prețuri</h1>${eventPicker()}</div>
    <div class="card"><div class="kpis">
      <div class="kpi"><b>${fmt(t.sold)}</b><span>vândute din ${fmt(t.capacity)}</span></div>
      <div class="kpi"><b>${lei(t.revenue)}</b><span>încasări</span></div>
      <div class="kpi"><b>${fmt(t.held)}</b><span>rezervate acum (10 min)</span></div>
      <div class="kpi"><b>${fmt(t.blocked)}</b><span>blocate de administrator</span></div>
      <div class="kpi"><b>${fmt(t.used)}</b><span>intrați la poartă</span></div>
    </div><div><span class="chip ${SALE_LABEL[st.saleState][1]}">${SALE_LABEL[st.saleState][0]}</span> <span class="muted" style="font-size:13px">Perioada și starea meciului se schimbă din „Meciuri” → Editează.</span></div>
    ${chk ? `<div class="integrity ${chk.ok ? 'ok' : 'bad'}">${chk.ok
      ? `✓ Verificat acum: ${fmt(chk.activeTickets)} bilete active, fiecare loc vândut o singură dată.`
      : `✗ Probleme: ${chk.duplicateSeats} locuri cu mai multe bilete, ${chk.ticketsWithoutSoldSeat} bilete fără loc vândut, ${chk.soldSeatsWithoutTicket} locuri vândute fără bilet.`}</div>` : ''}</div>
    <div class="card"><h3>Reguli</h3><div class="form">
      <label>Bilete pe comandă (maximum)<input type="number" min="1" max="20" data-k="maxPerOrder" value="${cfg.maxPerOrder}" /></label>
      <label>Bilete pe cont pentru acest meci<input type="number" min="1" max="50" data-k="maxPerUser" value="${cfg.maxPerUser}" /></label>
      <label class="check"><input type="checkbox" data-k="boxes.onSale" ${cfg.boxes.onSale ? 'checked' : ''} /> Lojele VIP la vânzare</label>
      <label>Preț loc în lojă (lei)<input type="number" min="0" data-k="boxes.price" value="${cfg.boxes.price}" /></label>
      <label class="check"><input type="checkbox" data-k="wheelchairOnline" ${cfg.wheelchairOnline ? 'checked' : ''} /> Locurile pentru scaun rulant se vând online</label>
    </div>
    <h3>Oaspeți</h3>
    <div class="form">
      <label class="check"><input type="checkbox" data-k="away.online" ${cfg.away.online ? 'checked' : ''} /> Sectoarele oaspeților se vând online pe acest site</label>
      <label class="check"><input type="checkbox" data-k="away.half19" ${cfg.away.half19 ? 'checked' : ''} /> Jumătatea sectorului 19 dinspre colț e a oaspeților</label>
    </div>
    <p class="muted" style="margin:0;font-size:13px">Bifează în tabel coloana „Oaspeți” pentru sectoarele date fanilor echipei oaspete (pe hartă apar ca sector al oaspeților, cu acces separat).</p></div>
    <div class="card"><div class="table-wrap"><table class="t">
      <thead><tr><th>Sector</th><th class="num">Locuri</th><th class="num">Vândute</th><th class="num">Rezervate</th><th class="num">Blocate</th><th class="num">Încasări</th><th>La vânzare</th><th>Preț (lei)</th><th>Oaspeți</th></tr></thead>
      <tbody>${groups.map(([sid, secs]) => `
        <tr class="group"><td colspan="6">${esc(STANDS[sid].name)}</td>
          <td><label class="check"><input type="checkbox" data-stand-sale="${sid}" ${secs.every((s) => cfg.sectors[s.id].onSale) ? 'checked' : ''} /> toate</label></td>
          <td colspan="2"><span class="row"><input type="number" min="0" placeholder="preț" data-stand-price="${sid}" style="width:80px" /><button class="btn ghost small" data-apply="${sid}">Aplică la toată tribuna</button></span></td></tr>
        ${secs.map((s) => {
          const r = by.get(s.id) || {}
          const c = cfg.sectors[s.id]
          const awayable = s.num != null
          return `<tr data-row="${s.id}" class="${c.onSale ? '' : 'off'}"><td><b>${esc(s.baseTitle)}</b></td><td class="num">${fmt(r.capacity)}</td><td class="num">${fmt(r.sold)}</td><td class="num">${fmt(r.held)}</td><td class="num">${fmt(r.blocked)}</td><td class="num">${fmt(r.revenue)}</td>
            <td><input type="checkbox" data-sale="${s.id}" ${c.onSale ? 'checked' : ''} aria-label="${esc(s.baseTitle)} la vânzare" /></td>
            <td><input type="number" min="0" max="100000" data-price="${s.id}" value="${c.price}" aria-label="Preț ${esc(s.baseTitle)}" /></td>
            <td>${awayable ? `<input type="checkbox" data-away="${s.group}" ${cfg.away.groups.includes(String(s.group)) ? 'checked' : ''} aria-label="Sectorul ${esc(s.group)} pentru oaspeți" />` : ''}</td></tr>`
        }).join('')}`).join('')}
      </tbody></table></div></div>
    <div class="sticky-save"><span class="dirty"></span><div class="form-msg" role="alert"></div><button class="btn primary" data-save>Salvează configurația</button></div>`
  bindPicker(main)
  const markDirty = () => { dirty = true; $('.dirty').textContent = 'Ai modificări nesalvate' }
  const setPath = (path, v) => {
    const k = path.split('.')
    let o = cfg
    while (k.length > 1) o = o[k.shift()]
    o[k[0]] = v
  }
  main.querySelectorAll('[data-k]').forEach((inp) => (inp.onchange = () => { setPath(inp.dataset.k, inp.type === 'checkbox' ? inp.checked : Number(inp.value)); markDirty() }))
  main.querySelectorAll('[data-sale]').forEach((inp) => (inp.onchange = () => {
    cfg.sectors[inp.dataset.sale].onSale = inp.checked
    inp.closest('tr').classList.toggle('off', !inp.checked)
    markDirty()
  }))
  main.querySelectorAll('[data-price]').forEach((inp) => (inp.onchange = () => { cfg.sectors[inp.dataset.price].price = Number(inp.value); markDirty() }))
  main.querySelectorAll('[data-away]').forEach((inp) => (inp.onchange = () => {
    const g = inp.dataset.away
    cfg.away.groups = inp.checked ? [...new Set([...cfg.away.groups, g])] : cfg.away.groups.filter((x) => x !== g)
    main.querySelectorAll(`[data-away="${g}"]`).forEach((o) => (o.checked = inp.checked))
    markDirty()
  }))
  main.querySelectorAll('[data-stand-sale]').forEach((inp) => (inp.onchange = () => {
    for (const s of layout.sectors.filter((x) => x.stand === inp.dataset.standSale)) {
      cfg.sectors[s.id].onSale = inp.checked
      const cb = $(`[data-sale="${s.id}"]`)
      cb.checked = inp.checked
      cb.closest('tr').classList.toggle('off', !inp.checked)
    }
    markDirty()
  }))
  main.querySelectorAll('[data-apply]').forEach((b) => (b.onclick = () => {
    const v = Number($(`[data-stand-price="${b.dataset.apply}"]`).value)
    if (!Number.isFinite(v) || v < 0) return
    for (const s of layout.sectors.filter((x) => x.stand === b.dataset.apply)) {
      cfg.sectors[s.id].price = v
      $(`[data-price="${s.id}"]`).value = v
    }
    markDirty()
  }))
  $('[data-save]').onclick = async () => {
    const msg = $('.sticky-save .form-msg')
    try {
      await api('PUT', `/api/admin/events/${encodeURIComponent(ev.id)}`, { config: cfg })
      dirty = false
      $('.dirty').textContent = ''
      msg.className = 'form-msg ok'
      msg.textContent = 'Salvat. Harta și vânzarea folosesc deja noua configurație.'
      await loadEvents()
    } catch (err) {
      msg.className = 'form-msg err'
      msg.textContent = err.message
    }
  }
  window.onbeforeunload = () => (dirty ? true : undefined)
}

// ─── Locuri blocate ───
async function viewSeats() {
  const ev = selected()
  if (!ev) return viewEvents()
  const st = await api('GET', `/api/admin/events/${encodeURIComponent(ev.id)}/stats`)
  const options = STAND_ORDER.map((sid) => `<optgroup label="${esc(STANDS[sid].name)}">${layout.sectors.filter((s) => s.stand === sid).map((s) => `<option value="${s.id}">${esc(s.baseTitle)}</option>`).join('')}</optgroup>`).join('') +
    `<optgroup label="Loje">${layout.boxes.map((b) => `<option value="${b.id}">Loja ${b.num}</option>`).join('')}</optgroup>`
  const blocked = st.sectors.filter((r) => r.blocked)
  main.innerHTML = `<div class="row spread"><h1>Locuri blocate</h1>${eventPicker()}</div>
    <div class="card"><p class="muted" style="margin:0">Locurile blocate nu se pot cumpăra online (protocol, sponsori, siguranță, locuri cu vizibilitate redusă). Blocarea nu afectează biletele deja vândute.</p>
    <form class="form">
      <label>Sector / lojă<select name="sector">${options}</select></label>
      <label>De la rândul<input type="number" name="rowFrom" min="1" placeholder="1" /></label>
      <label>Până la rândul<input type="number" name="rowTo" min="1" placeholder="ultimul" /></label>
      <label>De la locul<input type="number" name="seatFrom" min="1" placeholder="1" /></label>
      <label>Până la locul<input type="number" name="seatTo" min="1" placeholder="ultimul" /></label>
      <div class="row" style="align-self:end"><button class="btn danger" data-act="block">Blochează</button><button class="btn ghost" data-act="unblock">Deblochează</button></div>
      <div class="form-msg" role="alert" style="grid-column:1/-1"></div>
    </form></div>
    <div class="card"><h3>Blocate acum</h3>${blocked.length ? `<table class="t"><thead><tr><th>Sector</th><th class="num">Locuri blocate</th><th class="num">din</th></tr></thead><tbody>${blocked.map((r) => `<tr><td>${esc(layout.sectors.find((s) => s.id === r.id)?.baseTitle || (r.id === 'LOJE' ? 'Loje' : r.id))}</td><td class="num">${fmt(r.blocked)}</td><td class="num">${fmt(r.capacity)}</td></tr>`).join('')}</tbody></table>` : '<p class="muted" style="margin:0">Niciun loc blocat.</p>'}</div>`
  bindPicker(main)
  const form = $('form', main)
  form.querySelectorAll('[data-act]').forEach((b) => (b.onclick = async (e) => {
    e.preventDefault()
    const f = Object.fromEntries(new FormData(form))
    const msg = $('.form-msg', form)
    try {
      const r = await api('POST', `/api/admin/events/${encodeURIComponent(ev.id)}/blocks`, { ...f, action: b.dataset.act })
      msg.className = 'form-msg ok'
      msg.textContent = `${b.dataset.act === 'block' ? 'Blocate' : 'Deblocate'}: ${fmt(r.changed)} locuri${r.changed < r.requested ? ` (${fmt(r.requested - r.changed)} erau deja vândute, rezervate sau în starea cerută)` : ''}.`
      setTimeout(route, 1200)
    } catch (err) {
      msg.className = 'form-msg err'
      msg.textContent = err.message
    }
  }))
}

// ─── Comenzi ───
async function viewOrders() {
  const params = new URLSearchParams(location.hash.split('?')[1] || '')
  const q = params.get('q') || ''
  const evFilter = params.get('ev') ?? (S.eventId || '')
  main.innerHTML = `<div class="row spread"><h1>Comenzi</h1></div>
    <form class="card row" data-search>
      <label class="field" style="flex:2;min-width:220px">Caută<input type="search" name="q" value="${esc(q)}" placeholder="cod comandă, email, nume, telefon, nr. bilet" /></label>
      <label class="field" style="flex:1;min-width:220px">Meciul<select name="ev"><option value="">Toate meciurile</option>${S.events.map((e) => `<option value="${esc(e.id)}" ${e.id === evFilter ? 'selected' : ''}>${esc(e.home)} – ${esc(e.away)}</option>`).join('')}</select></label>
      <button class="btn primary" style="align-self:end">Caută</button>
    </form>
    <div class="orders"><p class="muted">Se încarcă…</p></div>`
  $('[data-search]').onsubmit = (e) => {
    e.preventDefault()
    const f = new URLSearchParams(Object.fromEntries(new FormData(e.target)))
    location.hash = `comenzi?${f}`
  }
  const r = await api('GET', `/api/admin/orders?q=${encodeURIComponent(q)}${evFilter ? `&event=${encodeURIComponent(evFilter)}` : ''}`)
  const list = $('.orders')
  list.innerHTML = r.orders.length ? r.orders.map((o) => `<div class="order-row">
      <div class="code"><b>${esc(o.code)}</b><span>${when(o.paidAt || o.createdAt)}</span><span class="chip ${o.status === 'paid' ? 'ok' : 'bad'}">${o.status === 'paid' ? 'Plătită' : 'Anulată'}</span></div>
      <div class="who"><b>${esc(o.user.name)}</b><span>${esc(o.user.email)}</span><span>${esc(o.user.phone)}</span></div>
      <ul>${o.tickets.map((t) => `<li>${esc(t.info.sector)} · rând ${t.info.row} · loc ${t.info.seat} · <span class="muted">${esc(t.holder)}</span> <span class="chip ${t.status === 'valid' ? 'ok' : t.status === 'used' ? 'blue' : 'bad'}">${{ valid: 'valabil', used: 'folosit', cancelled: 'anulat' }[t.status]}</span></li>`).join('')}
        <li><b>${lei(o.total)}</b> <span class="muted">· ${esc(o.paymentRef || '')}${o.emailSentAt ? ' · email trimis' : ''}</span></li></ul>
      <div class="acts"><a class="btn ghost small" href="${pdfUrl(o.id)}" target="_blank" rel="noopener">PDF</a>
        ${o.status === 'paid' ? `<button class="btn ghost small" data-resend="${o.id}">Retrimite email</button><button class="btn danger small" data-cancel="${o.id}" data-code="${esc(o.code)}">Anulează</button>` : ''}</div>
    </div>`).join('') : '<p class="muted">Nicio comandă găsită.</p>'
  list.querySelectorAll('[data-resend]').forEach((b) => (b.onclick = async () => {
    b.disabled = true
    try {
      const x = await api('POST', `/api/orders/${b.dataset.resend}/resend`)
      b.textContent = x.emailed ? 'Trimis ✓' : 'Netrimis'
    } catch (e) {
      b.textContent = e.message
    }
  }))
  list.querySelectorAll('[data-cancel]').forEach((b) => (b.onclick = async () => {
    if (!(await confirmBox('Anulezi comanda?', `Biletele comenzii <b>${esc(b.dataset.code)}</b> nu vor mai fi valabile la intrare, iar locurile revin la vânzare. Rambursarea banilor se face separat, prin procesatorul de plăți.`, 'Anulează comanda'))) return
    try {
      await api('POST', `/api/admin/orders/${b.dataset.cancel}/cancel`)
      route()
    } catch (e) {
      alert(e.message)
    }
  }))
}

// ─── Utilizatori ───
async function viewUsers() {
  const q = new URLSearchParams(location.hash.split('?')[1] || '').get('q') || ''
  const r = await api('GET', `/api/admin/users?q=${encodeURIComponent(q)}`)
  main.innerHTML = `<div class="row spread"><h1>Utilizatori</h1></div>
    <form class="card row" data-search><label class="field" style="flex:1">Caută<input type="search" name="q" value="${esc(q)}" placeholder="nume, email sau telefon" /></label><button class="btn primary" style="align-self:end">Caută</button></form>
    <div class="card"><p class="muted" style="margin:0;font-size:13px">„Scanare” poate doar valida bilete la poartă. „Administrator” are acces la tot acest panou.</p>
    <div class="table-wrap"><table class="t"><thead><tr><th>Nume</th><th>Email</th><th>Telefon</th><th class="num">Bilete</th><th>Cont creat</th><th>Rol</th></tr></thead>
    <tbody>${r.users.map((u) => `<tr><td><b>${esc(u.name)}</b></td><td>${esc(u.email)}</td><td>${esc(u.phone)}</td><td class="num">${fmt(u.tickets)}</td><td>${when(u.created_at)}</td>
      <td><select data-role="${u.id}" ${u.id === me.id ? 'disabled' : ''}>${[['user', 'Client'], ['scanner', 'Scanare'], ['admin', 'Administrator']].map(([v, l]) => `<option value="${v}" ${v === u.role ? 'selected' : ''}>${l}</option>`).join('')}</select></td></tr>`).join('')}</tbody></table></div></div>`
  $('[data-search]').onsubmit = (e) => { e.preventDefault(); location.hash = `utilizatori?q=${encodeURIComponent(new FormData(e.target).get('q'))}` }
  main.querySelectorAll('[data-role]').forEach((sel) => (sel.onchange = async () => {
    try {
      await api('PUT', `/api/admin/users/${sel.dataset.role}`, { role: sel.value })
      sel.style.outline = '2px solid #16a34a'
    } catch (e) {
      alert(e.message)
      route()
    }
  }))
}

// ─── Jurnal ───
async function viewAudit() {
  const r = await api('GET', '/api/admin/audit')
  const LBL = { 'event.create': 'Meci creat', 'event.update': 'Meci modificat', 'seats.block': 'Locuri blocate', 'seats.unblock': 'Locuri deblocate', 'order.cancel': 'Comandă anulată', 'user.role': 'Rol schimbat', 'admin.claim': 'Cont devenit administrator' }
  main.innerHTML = `<h1>Jurnal</h1><div class="card"><p class="muted" style="margin:0;font-size:13px">Ultimele 100 de acțiuni de administrare.</p>
    <div class="table-wrap"><table class="t"><thead><tr><th>Când</th><th>Cine</th><th>Acțiune</th><th>Detalii</th></tr></thead>
    <tbody>${r.entries.map((a) => `<tr><td>${when(a.created_at)}</td><td>${esc(a.name || '—')}<br><span class="muted">${esc(a.email || '')}</span></td><td>${esc(LBL[a.action] || a.action)}</td><td class="muted" style="font-size:12.5px">${esc(a.details ? JSON.stringify(a.details) : '')}</td></tr>`).join('')}</tbody></table></div></div>`
}

start()
