// Scanarea biletelor la poartă: camera telefonului citește codul QR, serverul verifică semnătura
// și starea biletului; la „Intrare” biletul devine folosit (a doua scanare e respinsă).
import './admin.css'
import jsQR from 'jsqr'
import { api, loadMe, setMe } from '../net/api.js'
import { authForm } from '../ui/auth-form.js'
import { esc } from '../ui/ticket-card.js'

const $ = (s, r = document) => r.querySelector(s)
const main = $('#scan-main')
let me = null
let mode = 'enter'
let eventId = localStorage.getItem('scan-ev') || ''
let busy = false
let lastCode = ''
let lastAt = 0
let okCount = Number(sessionStorage.getItem('scan-ok') || 0)
let stream = null

async function start() {
  me = await loadMe()
  const u = $('#adm-user')
  u.innerHTML = me ? `<span>${esc(me.name)}</span><button data-out>Ieși</button>` : ''
  if (me) $('[data-out]', u).onclick = async () => { await api('POST', '/api/auth/logout').catch(() => {}); setMe(null); location.reload() }
  if (!me) {
    main.innerHTML = '<h1>Scanare bilete</h1><div class="card auth"></div>'
    authForm($('.auth', main), { note: 'Intră cu un cont de scanare sau de administrator.', onDone: () => location.reload() })
    return
  }
  if (me.role !== 'scanner' && me.role !== 'admin') {
    main.innerHTML = `<h1>Scanare bilete</h1><div class="card"><p>Contul <b>${esc(me.email)}</b> nu are dreptul de a scana bilete. Cere unui administrator rolul „Scanare”.</p></div>`
    return
  }
  const { events } = await api('GET', '/api/events')
  if (!events.some((e) => e.id === eventId)) eventId = events[0]?.id || ''
  main.innerHTML = `
    <div class="scan-bar">
      <select data-ev aria-label="Meciul">${events.map((e) => `<option value="${esc(e.id)}" ${e.id === eventId ? 'selected' : ''}>${esc(e.home)} – ${esc(e.away)} · ${new Date(e.kickoff).toLocaleDateString('ro-RO')}</option>`).join('')}</select>
      <button class="btn ghost" data-cam>Pornește camera</button>
    </div>
    <div class="seg" role="group" aria-label="Mod">
      <button data-mode="enter" aria-pressed="true">Intrare</button>
      <button data-mode="check" aria-pressed="false">Doar verificare</button>
    </div>
    <div class="cam"><video playsinline muted></video><div class="frame"></div><div class="cam-msg">Apasă „Pornește camera” și îndreaptă telefonul spre codul QR al biletului.</div></div>
    <div class="scan-count" data-count></div>
    <form class="card row" data-manual><label class="field" style="flex:1">Sau lipește codul biletului<input name="code" autocomplete="off" placeholder="UCV1.…" /></label><button class="btn primary" style="align-self:end">Verifică</button></form>
    <div class="result" role="alert"></div>`
  $('[data-ev]').onchange = (e) => { eventId = e.target.value; localStorage.setItem('scan-ev', eventId) }
  main.querySelectorAll('[data-mode]').forEach((b) => (b.onclick = () => {
    mode = b.dataset.mode
    main.querySelectorAll('[data-mode]').forEach((x) => x.setAttribute('aria-pressed', x === b))
  }))
  $('[data-cam]').onclick = toggleCamera
  $('[data-manual]').onsubmit = (e) => {
    e.preventDefault()
    const code = new FormData(e.target).get('code')
    if (code) check(String(code).trim())
    e.target.reset()
  }
  renderCount()
}

function renderCount() {
  const el = $('[data-count]')
  if (el) el.textContent = okCount ? `${okCount} ${okCount === 1 ? 'intrare validată' : 'intrări validate'} pe acest telefon` : ''
}

async function toggleCamera() {
  const btn = $('[data-cam]')
  if (stream) {
    stream.getTracks().forEach((t) => t.stop())
    stream = null
    btn.textContent = 'Pornește camera'
    return
  }
  const msg = $('.cam-msg')
  try {
    stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment', width: { ideal: 1280 }, height: { ideal: 720 } }, audio: false })
  } catch {
    msg.textContent = 'Nu am acces la cameră. Permite accesul la cameră pentru acest site din setările browserului.'
    return
  }
  const video = $('video')
  video.srcObject = stream
  await video.play()
  msg.textContent = ''
  btn.textContent = 'Oprește camera'
  loop(video)
}

// citirea codului: detectorul nativ al browserului, sau jsQR pe o imagine micșorată
const detector = 'BarcodeDetector' in window ? new window.BarcodeDetector({ formats: ['qr_code'] }) : null
const cv = document.createElement('canvas')
const g = cv.getContext('2d', { willReadFrequently: true })
async function readFrame(video) {
  if (detector) {
    try {
      const r = await detector.detect(video)
      return r[0]?.rawValue || null
    } catch {}
  }
  const w = 480
  const h = Math.round((video.videoHeight / video.videoWidth) * w) || 360
  cv.width = w
  cv.height = h
  g.drawImage(video, 0, 0, w, h)
  const img = g.getImageData(0, 0, w, h)
  return jsQR(img.data, w, h, { inversionAttempts: 'dontInvert' })?.data || null
}
async function loop(video) {
  if (!stream) return
  if (!busy && video.readyState >= 2) {
    const code = await readFrame(video)
    if (code && !(code === lastCode && Date.now() - lastAt < 4000)) {
      lastCode = code
      lastAt = Date.now()
      await check(code)
    }
  }
  setTimeout(() => loop(video), 180)
}

const LABEL = { valid: 'Acces permis', used: 'Deja folosit', cancelled: 'Bilet anulat', invalid: 'Bilet invalid', wrong_event: 'Alt meci' }
async function check(code) {
  busy = true
  const box = $('.result')
  let r
  try {
    r = await api('POST', '/api/scan', { code, eventId, mode })
  } catch (e) {
    r = { result: 'invalid', message: e.message }
  }
  if (r.result === 'valid' && mode === 'enter') {
    okCount++
    sessionStorage.setItem('scan-ok', okCount)
    renderCount()
  }
  feedback(r.result === 'valid')
  const t = r.ticket
  const i = t?.info
  const seat = i ? (i.kind === 'box' ? `Loja ${i.sectorShort} · Rând ${i.row} · Fotoliu ${i.seat}` : `${i.sector} · Rând ${i.row} · Loc ${i.seat}`) : ''
  const usedAt = t?.usedAt && r.result === 'used' ? `Scanat la ${new Date(t.usedAt).toLocaleString('ro-RO', { hour: '2-digit', minute: '2-digit', day: '2-digit', month: '2-digit' })}` : ''
  box.className = `result on ${r.result}`
  box.innerHTML = `<div class="big">${esc(r.result === 'valid' && mode === 'check' ? 'Bilet valid' : LABEL[r.result] || r.result)}</div>
    ${seat ? `<div class="seat">${esc(seat)}</div>` : ''}
    <div class="sub">${esc([i?.gate && `Acces: ${i.gate}`, t?.holder, usedAt, r.result !== 'valid' ? r.message : ''].filter(Boolean).join(' · '))}</div>
    ${t ? `<div class="sub">Bilet nr. ${esc(t.number)}${i?.awayFans ? ' · sectorul oaspeților' : ''}</div>` : ''}
    <button class="btn" data-next>Următorul bilet</button>`
  const done = () => { box.className = 'result'; busy = false }
  $('[data-next]', box).onclick = done
  setTimeout(() => { if (box.classList.contains('on')) done() }, r.result === 'valid' ? 2200 : 5000)
}

let actx = null
function feedback(ok) {
  try {
    actx = actx || new AudioContext()
    const o = actx.createOscillator()
    const gn = actx.createGain()
    o.frequency.value = ok ? 1046 : 220
    gn.gain.value = 0.15
    o.connect(gn).connect(actx.destination)
    o.start()
    o.stop(actx.currentTime + (ok ? 0.15 : 0.45))
  } catch {}
  navigator.vibrate?.(ok ? 80 : [200, 100, 200])
}

start()
