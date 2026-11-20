import { EVENT, STANDS, MAX_TICKETS, CAPACITY, PRICES } from '../data/stadium-data.js'
import { FREE, BLOCKED } from '../data/availability.js'

const $ = (id) => document.getElementById(id)
const fmt = (n) => n.toLocaleString('ro-RO')
const lei = (n) => `${fmt(n)} lei`
const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c])

const STAND_ORDER = ['PN', 'T2', 'PS', 'T1', 'VIP']
const STAND_NOTES = {
  PN: 'Peluza 2: sectoarele 3–6, în spatele porții de nord (6.053 de locuri). Peluza galeriei, cele mai accesibile bilete.',
  T2: 'Sectoarele 7–13 (10.726 de locuri); 8–12 pe două inele, sectorul 10 la centrul terenului. În față sunt cele două zone pentru persoane în scaun rulant.',
  PS: 'Peluza 1: sectoarele 14–17, în spatele porții de sud (6.170 de locuri).',
  T1: 'Tribuna principală (vest): sectoarele 19 și 1 la capete, G și I pe terasa de lângă presă, colțurile 18 (sud-vest) și 2 (nord-vest, sectorul oaspeților).',
  VIP: 'Centrul Tribunei 1: sectoarele VIP A–F (1.944 de locuri), 42 de loje (101–120 și 201–222, 440 de locuri) și presa (sectorul H).',
}

export function createUI(ctx) {
  const { layout, seats, status, cart, state, sectorById, boxById, freeCount, standSectors, standStats, actions } = ctx
  const panel = $('panel')
  const tip = $('tip')
  const ticket = $('ticket')
  const legend = $('legend')
  const hint = $('hint')
  const modal = $('modal')
  const crumbs = $('crumbs')
  let qty = 2
  let tipKey = ''
  let hintTimer = 0
  let lastMode = ''
  let povBar = null

  $('match').innerHTML = `
    <div class="match-teams">${esc(EVENT.home)} – ${esc(EVENT.away)}</div>
    <div class="match-meta">${esc(EVENT.competition)} · ${esc(EVENT.dateLabel)}, ${esc(EVENT.time)} · ${esc(EVENT.venue)}</div>`

  const seatLabel = (i) => {
    const s = seats[i]
    if (s.kind === 'box') return { where: `Loja ${s.box} · Nivel ${s.level}`, what: `Fotoliul ${s.num}`, stand: 'Loje VIP' }
    const sec = sectorById.get(s.sector)
    return { where: sec.title, what: `Rând ${s.row} · Loc ${s.num}`, stand: STANDS[sec.stand].name, sec }
  }
  const gateOf = (i) => {
    const s = seats[i]
    if (s.kind === 'box') return 'VIP / Loje'
    return sectorById.get(s.sector).gate
  }
  const statusChip = (free, away) => {
    if (away) return '<span class="chip na">Doar oaspeți</span>'
    if (!free) return '<span class="chip sold">Epuizat</span>'
    if (free < 40) return `<span class="chip low">${fmt(free)} libere</span>`
    return `<span class="chip free">${fmt(free)} libere</span>`
  }

  // ─── Pași ───
  function renderCrumbs() {
    const items = [{ label: 'Stadion', go: () => actions.goOverview(), on: state.mode === 'overview' }]
    if (state.stand) items.push({ label: STANDS[state.stand].short, go: () => actions.goStand(state.stand), on: state.mode === 'stand' })
    if (state.sector) items.push({ label: sectorById.get(state.sector).title, go: () => actions.goSector(state.sector), on: state.mode === 'sector' })
    if (state.box) items.push({ label: `Loja ${boxById.get(state.box).num}`, go: () => actions.goBox(state.box), on: state.mode === 'box' })
    if (state.mode === 'pov') items.push({ label: 'Vederea din loc', go: () => {}, on: true })
    crumbs.innerHTML = items
      .map((it, k) => `${k ? '<span class="sep">›</span>' : ''}<button data-k="${k}" ${it.on ? 'aria-current="step"' : ''}>${esc(it.label)}</button>`)
      .join('')
    crumbs.querySelectorAll('button').forEach((b) => (b.onclick = () => {
      const it = items[+b.dataset.k]
      if (state.mode === 'pov' && !it.on) actions.exitPov()
      else if (!it.on) it.go()
    }))
  }

  // ─── Panou ───
  function renderPanel() {
    let html = '<div class="panel-scroll">'
    if (state.mode === 'overview') html += overviewHTML()
    else if (state.mode === 'stand') html += standHTML()
    else if (state.mode === 'box' || (state.mode === 'pov' && seats[state.povSeat].kind === 'box')) html += boxHTML()
    else html += sectorHTML()
    html += '</div>'
    html += cartHTML()
    panel.innerHTML = html
    bindPanel()
  }

  function overviewHTML() {
    const rows = STAND_ORDER.map((id) => {
      const st = standStats(id)
      const pct = st.total ? Math.round((st.free / st.total) * 100) : 0
      return `<button class="row-btn" data-stand="${id}">
        <span class="row-title">${esc(STANDS[id].name)}</span>
        <span class="row-price"><small>DE LA</small>${st.min ? lei(st.min) : '—'}</span>
        <span class="row-sub">${st.free ? `${fmt(st.free)} locuri libere din ${fmt(st.total)}` : 'Epuizat'}</span>
        ${statusChip(st.free)}
        <span class="bar"><i style="width:${pct}%"></i></span>
      </button>`
    }).join('')
    return `
      <div class="eyebrow">Pasul 1 din 3</div>
      <h2>Alege tribuna</h2>
      <p>Rotește stadionul și atinge o tribună sau alege din listă. Prețurile sunt pentru un bilet la meci.</p>
      <div class="facts">
        <div class="fact"><b>${fmt(CAPACITY.total)}</b><span>locuri</span></div>
        <div class="fact"><b>28</b><span>sectoare</span></div>
        <div class="fact"><b>${layout.boxes.length}</b><span>loje</span></div>
      </div>
      <div class="list">${rows}</div>`
  }

  function standHTML() {
    const id = state.stand
    const secs = standSectors(id)
    const rows = secs.map((s) => {
      const f = freeCount(s.seatIdx)
      const sub = s.legend ? `„${esc(s.legend)}”` : s.away ? 'Vânzare prin clubul oaspete' : `${fmt(s.capacity)} locuri`
      return `<button class="row-btn" data-sector="${s.id}" ${s.away ? 'disabled' : ''}>
        <span class="row-title">${esc(s.title)}</span>
        <span class="row-price">${lei(s.price)}</span>
        <span class="row-sub">${sub}</span>
        ${statusChip(f, s.away)}
      </button>`
    }).join('')
    let boxes = ''
    if (id === 'VIP') {
      const chips = (level) => layout.boxes.filter((b) => b.level === level).map((b) => {
        const f = freeCount(b.seatIdx)
        return `<button class="box-chip ${f ? '' : 'full'}" data-box="${b.id}" title="Loja ${b.num}: ${f ? `${f} locuri libere` : 'ocupată'}" ${f ? '' : 'aria-disabled="true"'}>${b.num}</button>`
      }).join('')
      boxes = `
        <h3>Loje VIP · ${lei(PRICES.BOX)} / loc</h3>
        <p>10 locuri într-o lojă (20 în lojile duble 119 și 120). Verde = are locuri libere.</p>
        <div class="eyebrow">Nivelul 2</div><div class="boxes">${chips(2)}</div>
        <div class="eyebrow">Nivelul 1</div><div class="boxes">${chips(1)}</div>
        <p>Tribuna presei (${fmt(CAPACITY.press)} locuri) este rezervată jurnaliștilor acreditați.</p>`
    }
    return `
      <button class="back" data-act="back">← Toate tribunele</button>
      <div class="eyebrow">Pasul 2 din 3</div>
      <h2>${esc(STANDS[id].name)}</h2>
      <p>${esc(STAND_NOTES[id])}</p>
      <h3>Sectoare</h3>
      <div class="list">${rows}</div>
      ${boxes}`
  }

  function keysHTML() {
    return `<div class="keys">
      <span class="key"><i style="background:#22c55e"></i>Liber</span>
      <span class="key"><i style="background:#4d6a99"></i>Ocupat</span>
      <span class="key"><i style="background:#f59e0b"></i>În coșul tău</span>
      <span class="key"><i style="background:#c7ccd3"></i>Nu se vinde online</span>
    </div>`
  }

  function sectorHTML() {
    const s = sectorById.get(state.sector)
    const f = freeCount(s.seatIdx)
    const rowsN = seats[s.seatIdx[s.seatIdx.length - 1]].row
    return `
      <button class="back" data-act="back">← ${esc(STANDS[s.stand].name)}</button>
      <div class="eyebrow">Pasul 3 din 3 · ${esc(STANDS[s.stand].short)}</div>
      <h2>${esc(s.title)}</h2>
      <p>${s.legend ? `Sectorul „${esc(s.legend)}”. ` : ''}Acces: ${esc(s.gate)}.</p>
      <div class="facts">
        <div class="fact"><b>${s.price}</b><span>lei / bilet</span></div>
        <div class="fact"><b>${fmt(f)}</b><span>locuri libere</span></div>
        <div class="fact"><b>${rowsN}</b><span>rânduri</span></div>
      </div>
      <div class="qty">
        <span>Câte locuri alăturate?</span>
        <button data-act="minus" aria-label="Mai puține">−</button>
        <output>${qty}</output>
        <button data-act="plus" aria-label="Mai multe">+</button>
      </div>
      <button class="btn ghost" data-act="auto" ${f ? '' : 'disabled'}>Alege automat cele mai bune locuri</button>
      ${keysHTML()}
      <p>Atinge un loc verde ca să-l adaugi în coș. Rotește și apropie camera ca să vezi rândurile.</p>`
  }

  function boxHTML() {
    const id = state.box || seats[state.povSeat].sector
    const b = boxById.get(id)
    const f = freeCount(b.seatIdx)
    return `
      <button class="back" data-act="back">← Tribuna VIP</button>
      <div class="eyebrow">Loje VIP · Nivelul ${b.level}</div>
      <h2>Loja ${b.num}</h2>
      <p>${b.seatIdx.length} fotolii pe două rânduri, pe terasa din fața lojei, cu acces separat prin intrarea VIP și catering în lojă.</p>
      <div class="facts">
        <div class="fact"><b>${PRICES.BOX}</b><span>lei / loc</span></div>
        <div class="fact"><b>${f}</b><span>fotolii libere</span></div>
        <div class="fact"><b>${b.seatIdx.length}</b><span>locuri</span></div>
      </div>
      ${keysHTML()}
      <p>Atinge un fotoliu verde ca să-l rezervi.</p>`
  }

  function cartHTML() {
    if (!cart.size) return ''
    const items = [...cart].map((i) => {
      const l = seatLabel(i)
      return `<div class="cart-item">
        <div><b>${esc(l.where)}</b><span>${esc(l.what)} · ${esc(gateOf(i))}</span></div>
        <span class="p">${lei(seats[i].price)}</span>
        <button data-remove="${i}" aria-label="Elimină ${esc(l.what)}">×</button>
      </div>`
    }).join('')
    const total = [...cart].reduce((a, i) => a + seats[i].price, 0)
    return `<div class="cart">
      <div class="cart-head"><b>Coșul tău · ${cart.size}/${MAX_TICKETS}</b><span class="timer" id="timer"></span></div>
      <div class="cart-items">${items}</div>
      <div class="total"><span>Total</span><b>${lei(total)}</b></div>
      <button class="btn primary" data-act="checkout">Continuă spre plată</button>
    </div>`
  }

  function bindPanel() {
    panel.querySelectorAll('[data-stand]').forEach((b) => {
      b.onclick = () => actions.goStand(b.dataset.stand)
      b.onmouseenter = () => actions.hoverStand(b.dataset.stand)
      b.onmouseleave = () => actions.hoverStand(null)
    })
    panel.querySelectorAll('[data-sector]').forEach((b) => {
      b.onclick = () => actions.goSector(b.dataset.sector)
      b.onmouseenter = () => actions.hoverSector(b.dataset.sector)
      b.onmouseleave = () => actions.hoverSector(null)
    })
    panel.querySelectorAll('[data-box]').forEach((b) => {
      b.onclick = () => !b.classList.contains('full') && actions.goBox(b.dataset.box)
      b.onmouseenter = () => actions.hoverBox(b.dataset.box)
      b.onmouseleave = () => actions.hoverBox(null)
    })
    panel.querySelectorAll('[data-remove]').forEach((b) => (b.onclick = () => actions.removeSeat(+b.dataset.remove)))
    const act = (name, fn) => panel.querySelectorAll(`[data-act="${name}"]`).forEach((b) => (b.onclick = fn))
    act('back', () => actions.back())
    act('minus', () => { qty = Math.max(1, qty - 1); renderPanel() })
    act('plus', () => { qty = Math.min(MAX_TICKETS, qty + 1); renderPanel() })
    act('auto', () => actions.autoPick(state.sector, qty))
    act('checkout', openCheckout)
    tickTimer()
  }

  // ─── Biletul ───
  function renderTicket() {
    const i = state.focusSeat
    const show = i != null && cart.has(i) && (state.mode === 'sector' || state.mode === 'box')
    ticket.classList.toggle('on', show)
    if (!show) return
    const s = seats[i]
    const l = seatLabel(i)
    const thumb = actions.thumb(i)
    ticket.innerHTML = `
      <div class="ticket-view" style="background-image:url(${thumb})"><span class="tag">Vederea ta</span></div>
      <div class="ticket-body">
        <div class="eyebrow">${esc(l.stand)}${s.ring && s.kind !== 'box' ? ` · Inel ${s.ring}` : ''}</div>
        <h4>${esc(l.where)}</h4>
        ${l.sec?.legend ? `<div class="legend-name">„${esc(l.sec.legend)}”</div>` : ''}
        <div class="ticket-grid">
          ${s.kind === 'box' ? `<div><small>FOTOLIU</small><b>${s.num}</b></div><div><small>RÂND</small><b>${s.row}</b></div>` : `<div><small>RÂND</small><b>${s.row}</b></div><div><small>LOC</small><b>${s.num}</b></div>`}
          <div><small>ACCES</small><b class="gate">${esc(gateOf(i))}</b></div>
        </div>
        <div class="ticket-actions">
          <button class="btn primary" data-t="pov">Vezi din loc</button>
          <button class="btn ghost" data-t="remove">Elimină</button>
          <button class="btn ghost" data-t="close">Alege alt loc</button>
        </div>
      </div>
      <div class="ticket-stub"><small>LEI</small><b>${fmt(s.price)}</b><div class="barcode" aria-hidden="true"></div></div>`
    ticket.querySelector('[data-t="pov"]').onclick = () => actions.goPov(i)
    ticket.querySelector('[data-t="remove"]').onclick = () => actions.removeSeat(i)
    ticket.querySelector('[data-t="close"]').onclick = () => actions.focusSeat(null)
  }

  function renderPovBar() {
    if (state.mode !== 'pov') {
      povBar?.remove()
      povBar = null
      return
    }
    const i = state.povSeat
    const l = seatLabel(i)
    if (!povBar) {
      povBar = document.createElement('div')
      povBar.className = 'pov-bar'
      $('app').appendChild(povBar)
    }
    const inCart = cart.has(i)
    povBar.innerHTML = `
      <div class="info"><b>${esc(l.where)} · ${esc(l.what)}</b><span>Trage pentru a privi în jur</span></div>
      ${inCart ? '' : status[i] === FREE ? '<button class="btn primary" data-p="add">Adaugă în coș</button>' : ''}
      <button class="btn ${inCart ? 'primary' : 'ghost'}" data-p="back">${inCart ? 'Confirmă locul' : 'Înapoi'}</button>`
    povBar.querySelector('[data-p="back"]').onclick = () => actions.exitPov()
    const add = povBar.querySelector('[data-p="add"]')
    if (add) add.onclick = () => actions.toggleSeat(i)
  }

  function renderLegendAndHint() {
    legend.classList.toggle('on', state.mode !== 'overview' && state.mode !== 'pov')
    legend.innerHTML = state.mode === 'overview' ? '' : keysHTML().replace('class="keys"', 'class="keys" style="gap:10px 14px"')
    if (state.mode !== lastMode) {
      lastMode = state.mode
      const text = {
        overview: 'Atinge o tribună ca să vezi sectoarele',
        stand: state.stand === 'VIP' ? 'Alege un sector VIP sau o lojă' : 'Alege un sector · verde = locuri libere',
        sector: 'Atinge un loc verde ca să-l rezervi',
        box: 'Alege un fotoliu verde din lojă',
        pov: 'Așa se vede terenul din locul tău',
      }[state.mode]
      showHint(text)
    }
  }
  function showHint(text, ms = 3200) {
    hint.textContent = text
    hint.classList.add('on')
    clearTimeout(hintTimer)
    hintTimer = setTimeout(() => hint.classList.remove('on'), ms)
  }

  // ─── Checkout (demo) ───
  function openCheckout() {
    const list = [...cart]
    const total = list.reduce((a, i) => a + seats[i].price, 0)
    modal.innerHTML = `<div class="modal-card">
      <div class="eyebrow">Rezumatul comenzii</div>
      <h2>${esc(EVENT.home)} – ${esc(EVENT.away)}</h2>
      <p>${esc(EVENT.dateLabel)}, ora ${esc(EVENT.time)} · ${esc(EVENT.venue)}</p>
      <div class="cart-items" style="max-height:none">${list.map((i) => {
        const l = seatLabel(i)
        return `<div class="cart-item"><div><b>${esc(l.where)}</b><span>${esc(l.what)} · ${esc(gateOf(i))}</span></div><span class="p">${lei(seats[i].price)}</span><span></span></div>`
      }).join('')}</div>
      <div class="total"><span>Total de plată</span><b>${lei(total)}</b></div>
      <p>Prototip: plata nu este conectată. Pasul următor ar fi integrarea cu platforma de ticketing a clubului.</p>
      <div style="display:flex;gap:8px">
        <button class="btn ghost" data-m="close" style="flex:1">Înapoi</button>
        <button class="btn primary" data-m="ok" style="flex:1">Rezervă (demo)</button>
      </div>
    </div>`
    modal.classList.add('on')
    modal.querySelector('[data-m="close"]').onclick = closeModal
    modal.querySelector('[data-m="ok"]').onclick = () => {
      const code = `UCV-${Date.now().toString(36).toUpperCase().slice(-6)}`
      modal.querySelector('.modal-card').innerHTML = `
        <div class="eyebrow">Rezervare demo</div>
        <h2>Locurile sunt ale tale</h2>
        <p>Cod rezervare <b>${code}</b>. Într-o versiune reală ai primi biletele pe e-mail și în aplicație.</p>
        <button class="btn primary" data-m="done">Gata</button>`
      modal.querySelector('[data-m="done"]').onclick = () => { closeModal(); actions.clearCart() }
    }
    modal.querySelector('[data-m="ok"]').focus()
  }
  function closeModal() {
    modal.classList.remove('on')
    modal.innerHTML = ''
  }
  modal.addEventListener('click', (e) => { if (e.target === modal) closeModal() })

  // ─── Tooltip ───
  function tooltip(hit, pointer) {
    if (!hit || !pointer) {
      tip.classList.remove('on')
      tipKey = ''
      return
    }
    const key = JSON.stringify(hit) + cart.size
    if (key !== tipKey) {
      tipKey = key
      tip.innerHTML = tipHTML(hit)
    }
    tip.style.left = `${pointer.x}px`
    tip.style.top = `${pointer.y}px`
    tip.classList.add('on')
  }
  function tipHTML(hit) {
    const box = (eyebrow, title, sub, st, priceLabel, price) => `
      <div class="tip-main">
        <div class="tip-eyebrow">${esc(eyebrow)}</div>
        <div class="tip-title">${esc(title)}</div>
        ${sub ? `<div class="tip-sub">${esc(sub)}</div>` : ''}
        <div class="tip-status ${st[0]}">${esc(st[1])}</div>
      </div>
      ${price != null ? `<div class="tip-price"><small>${priceLabel}</small><b>${price}</b></div>` : ''}`
    if (hit.stand) {
      const st = standStats(hit.stand)
      return box('Tribună', STANDS[hit.stand].name, null, st.free ? ['free', `${fmt(st.free)} locuri libere`] : ['sold', 'Epuizat'], 'DE LA', st.min ? lei(st.min) : '—')
    }
    if (hit.sector) {
      const s = sectorById.get(hit.sector)
      const f = freeCount(s.seatIdx)
      const st = s.away ? ['na', 'Rezervat fanilor oaspeți'] : f ? ['free', `${fmt(f)} locuri libere`] : ['sold', 'Epuizat']
      return box(STANDS[s.stand].name, s.title, s.legend ? `„${s.legend}”` : null, st, 'LEI', fmt(s.price))
    }
    if (hit.box) {
      const b = boxById.get(hit.box)
      const f = freeCount(b.seatIdx)
      return box(`Loje VIP · Nivel ${b.level}`, `Loja ${b.num}`, `${b.seatIdx.length} fotolii`, f ? ['free', `${f} fotolii libere`] : ['sold', 'Ocupată'], 'LEI / LOC', fmt(PRICES.BOX))
    }
    if (hit.seat != null) {
      const i = hit.seat
      const l = seatLabel(i)
      const st = cart.has(i) ? ['free', 'În coșul tău · atinge pentru a elimina'] : status[i] === FREE ? ['free', 'Liber'] : status[i] === BLOCKED ? ['na', 'Nu se vinde online'] : ['sold', 'Ocupat']
      return box(l.where, l.what, null, st, 'LEI', status[i] === FREE ? fmt(seats[i].price) : '—')
    }
    return ''
  }

  function highlight() {
    panel.querySelectorAll('[data-sector]').forEach((b) => b.classList.toggle('hot', b.dataset.sector === state.hoverSector))
    panel.querySelectorAll('[data-stand]').forEach((b) => b.classList.toggle('hot', b.dataset.stand === state.hoverStand))
    panel.querySelectorAll('[data-box]').forEach((b) => b.classList.toggle('hot', b.dataset.box === state.hoverBox))
  }

  function tickTimer() {
    const el = document.getElementById('timer')
    if (!el) return
    const left = actions.holdLeft()
    el.textContent = `Rezervat ${String(Math.floor(left / 60)).padStart(2, '0')}:${String(left % 60).padStart(2, '0')}`
    if (left <= 0 && cart.size) {
      actions.clearCart()
      showHint('Timpul de rezervare a expirat. Locurile au fost eliberate.', 4000)
    }
  }
  let lastTick = 0
  function tick() {
    const now = performance.now()
    if (now - lastTick > 500) {
      lastTick = now
      tickTimer()
    }
  }

  return {
    render() {
      renderCrumbs()
      renderPanel()
      renderTicket()
      renderPovBar()
      renderLegendAndHint()
    },
    tooltip,
    highlight,
    tick,
    flash: (m) => showHint(m, 2600),
    closeModal,
  }
}
