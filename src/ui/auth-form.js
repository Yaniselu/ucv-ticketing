// Formularele de cont (intrare, cont nou, parolă uitată, parolă nouă), folosite pe toate paginile
import { api, setMe, meta } from '../net/api.js'
import { esc } from './ticket-card.js'

export function authForm(root, { mode = 'login', note = '', resetToken = null, onDone }) {
  let current = resetToken ? 'reset' : mode
  const render = () => {
    const tabs = current === 'login' || current === 'register'
      ? `<div class="auth-tabs" role="tablist">
          <button role="tab" data-tab="login" aria-selected="${current === 'login'}">Intră în cont</button>
          <button role="tab" data-tab="register" aria-selected="${current === 'register'}">Cont nou</button>
        </div>`
      : ''
    const body = {
      login: `
        <label>Email<input name="email" type="email" autocomplete="email" required maxlength="254" /></label>
        <label>Parolă<input name="password" type="password" autocomplete="current-password" required maxlength="128" /></label>
        <button class="btn primary" type="submit">Intră în cont</button>
        <button class="linkish" type="button" data-tab="forgot">Am uitat parola</button>`,
      register: `
        <label>Nume și prenume<input name="name" autocomplete="name" required minlength="3" maxlength="80" /></label>
        <label>Email <small>(aici primești biletele)</small><input name="email" type="email" autocomplete="email" required maxlength="254" /></label>
        <label>Telefon<input name="phone" type="tel" autocomplete="tel" inputmode="tel" placeholder="07xx xxx xxx" required maxlength="20" /></label>
        <label>Parolă <small>(minimum 8 caractere, cu litere și cifre)</small><input name="password" type="password" autocomplete="new-password" required minlength="8" maxlength="128" /></label>
        <label class="check"><input name="terms" type="checkbox" required /> <span>Sunt de acord cu termenii de vânzare și cu prelucrarea datelor pentru emiterea biletelor.</span></label>
        <button class="btn primary" type="submit">Creează contul</button>`,
      forgot: `
        <p>Scrie emailul contului. Îți trimitem un link pentru o parolă nouă.</p>
        <label>Email<input name="email" type="email" autocomplete="email" required maxlength="254" /></label>
        <button class="btn primary" type="submit">Trimite linkul</button>
        <button class="linkish" type="button" data-tab="login">Înapoi</button>`,
      reset: `
        <p>Alege o parolă nouă pentru cont.</p>
        <label>Parolă nouă<input name="password" type="password" autocomplete="new-password" required minlength="8" maxlength="128" /></label>
        <button class="btn primary" type="submit">Salvează parola</button>`,
    }[current]
    root.innerHTML = `${note ? `<p class="auth-note">${esc(note)}</p>` : ''}${tabs}<form class="auth-form" novalidate>${body}<div class="form-msg" role="alert"></div></form>`
    root.querySelectorAll('[data-tab]').forEach((b) => (b.onclick = () => { current = b.dataset.tab; render() }))
    const form = root.querySelector('form')
    const msg = form.querySelector('.form-msg')
    form.onsubmit = async (e) => {
      e.preventDefault()
      if (!form.checkValidity()) {
        form.reportValidity()
        return
      }
      const f = Object.fromEntries(new FormData(form))
      const btn = form.querySelector('[type="submit"]')
      btn.disabled = true
      msg.className = 'form-msg'
      msg.textContent = ''
      try {
        if (current === 'login' || current === 'register') {
          const r = await api('POST', `/api/auth/${current}`, current === 'register' ? { ...f, terms: !!f.terms } : f)
          setMe(r.user)
          onDone?.(r.user)
        } else if (current === 'forgot') {
          const r = await api('POST', '/api/auth/forgot', f)
          msg.className = 'form-msg ok'
          msg.textContent = r.mail
            ? 'Dacă există un cont cu acest email, ai primit un link de resetare (verifică și Spam).'
            : 'Trimiterea email-urilor nu este încă activă. Contactează clubul pentru resetarea parolei.'
        } else if (current === 'reset') {
          await api('POST', '/api/auth/reset', { token: resetToken, password: f.password })
          history.replaceState(null, '', location.pathname)
          const me = await api('GET', '/api/auth/me')
          setMe(me.user)
          onDone?.(me.user)
        }
      } catch (err) {
        msg.className = 'form-msg err'
        msg.textContent = err.message
      } finally {
        btn.disabled = false
      }
    }
    form.querySelector('input')?.focus()
  }
  render()
  return { meta }
}
