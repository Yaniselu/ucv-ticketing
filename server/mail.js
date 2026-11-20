// Trimiterea email-urilor (biletele, resetarea parolei) prin SMTP.
// Se activează când există SMTP_HOST, SMTP_USER, SMTP_PASS și MAIL_FROM; altfel biletele rămân
// în cont (și se pot descărca în PDF), iar serverul nu încearcă să trimită nimic.
import { themeFor } from '../src/data/ticket-theme.js'
import { kickoffLabels } from '../src/data/stadium-data.js'

export const mailEnabled = () => !!(process.env.SMTP_HOST && process.env.MAIL_FROM)

let transport = null
async function transporter() {
  if (transport) return transport
  const { default: nodemailer } = await import('nodemailer')
  const port = Number(process.env.SMTP_PORT || 587)
  transport = nodemailer.createTransport({
    host: process.env.SMTP_HOST,
    port,
    secure: port === 465,
    auth: process.env.SMTP_USER ? { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS } : undefined,
    connectionTimeout: 8000,
    greetingTimeout: 8000,
    socketTimeout: 12000,
  })
  return transport
}

const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c])

export async function sendMail({ to, subject, html, text, attachments }) {
  if (!mailEnabled()) return false
  const t = await transporter()
  await t.sendMail({ from: process.env.MAIL_FROM, to, subject, html, text, attachments })
  return true
}

export function ticketsEmail({ user, order, tickets, link }) {
  const info = tickets[0].info
  const th = themeFor(info.competitionId)
  const { dateLabel, time } = kickoffLabels(info.kickoff)
  const title = `${info.home} – ${info.away}`
  const rows = tickets
    .map((t) => {
      const i = t.info
      const where = i.kind === 'box' ? `Loja ${i.sectorShort} · Rând ${i.row} · Fotoliu ${i.seat}` : `${i.sector} · Rând ${i.row} · Loc ${i.seat}`
      return `<tr><td style="padding:10px 0;border-bottom:1px solid #e5eaf1"><b style="color:#142640">${esc(where)}</b><br><span style="color:#5a6a82;font-size:13px">Acces: ${esc(i.gate)} · Titular: ${esc(t.holder)} · Bilet ${esc(t.number)}</span></td><td style="padding:10px 0;border-bottom:1px solid #e5eaf1;text-align:right;white-space:nowrap;color:#142640"><b>${t.price} lei</b></td></tr>`
    })
    .join('')
  const html = `<!doctype html><html lang="ro"><body style="margin:0;background:#eef2f7;font-family:Arial,Helvetica,sans-serif">
  <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background:#eef2f7;padding:24px 0"><tr><td align="center">
  <table role="presentation" width="600" cellspacing="0" cellpadding="0" style="max-width:600px;width:100%;background:#ffffff;border-radius:14px;overflow:hidden">
    <tr><td style="background:${th.bg};padding:24px 28px;color:${th.fg}">
      <div style="font-size:12px;letter-spacing:.08em;text-transform:uppercase;color:${th.accent};font-weight:bold">${esc(th.label)}${info.phase ? ` · ${esc(info.phase)}` : ''}</div>
      <div style="font-size:26px;font-weight:bold;margin-top:6px">${esc(title)}</div>
      <div style="font-size:15px;margin-top:6px">${esc(dateLabel)} · ora ${esc(time)}</div>
      <div style="font-size:13px;opacity:.85;margin-top:2px">${esc(info.venue)}</div>
    </td></tr>
    <tr><td style="height:4px;background:${th.accent}"></td></tr>
    <tr><td style="padding:24px 28px;color:#142640">
      <p style="margin:0 0 12px;font-size:16px">Salut, ${esc(user.name)}!</p>
      <p style="margin:0 0 16px;font-size:15px;line-height:1.5;color:#33445e">Comanda <b>${esc(order.code)}</b> a fost confirmată. Biletele sunt atașate în PDF, câte unul pe pagină, cu codul QR pentru intrare. Le găsești oricând și în contul tău.</p>
      <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="font-size:15px">${rows}
        <tr><td style="padding:12px 0 0"><b>Total</b></td><td style="padding:12px 0 0;text-align:right"><b>${order.total} lei</b></td></tr></table>
      <p style="margin:22px 0 0"><a href="${esc(link)}" style="display:inline-block;background:#0b57d0;color:#ffffff;text-decoration:none;font-weight:bold;padding:12px 20px;border-radius:10px">Vezi biletele în cont</a></p>
      <p style="margin:22px 0 0;font-size:13px;line-height:1.5;color:#5a6a82">Prezintă codul QR la turnicheții accesului indicat. Fiecare cod se poate folosi o singură dată, așa că nu îl trimite altor persoane.</p>
    </td></tr>
  </table></td></tr></table></body></html>`
  const text = `Salut, ${user.name}!\n\nComanda ${order.code} pentru ${title} (${dateLabel}, ora ${time}) a fost confirmată.\n\n${tickets
    .map((t) => `- ${t.info.sector}, rând ${t.info.row}, loc ${t.info.seat} (acces ${t.info.gate}) · ${t.price} lei · bilet ${t.number}`)
    .join('\n')}\n\nTotal: ${order.total} lei\nBiletele sunt atașate în PDF și le găsești în cont: ${link}\n`
  return { subject: `Biletele tale: ${title} (${order.code})`, html, text }
}

export function resetEmail({ user, link }) {
  const html = `<!doctype html><html lang="ro"><body style="font-family:Arial,Helvetica,sans-serif;color:#142640">
  <p>Salut, ${esc(user.name)}!</p><p>Ai cerut resetarea parolei pentru contul de bilete Universitatea Craiova. Linkul e valabil o oră:</p>
  <p><a href="${esc(link)}" style="display:inline-block;background:#0b57d0;color:#fff;text-decoration:none;font-weight:bold;padding:12px 20px;border-radius:10px">Alege o parolă nouă</a></p>
  <p style="color:#5a6a82;font-size:13px">Dacă nu tu ai cerut resetarea, ignoră acest email; parola rămâne neschimbată.</p></body></html>`
  return { subject: 'Resetarea parolei · Bilete Universitatea Craiova', html, text: `Alege o parolă nouă (link valabil o oră): ${link}` }
}
