// Funcția Vercel care servește tot API-ul (/api/* e rescris aici în vercel.json)
import { handle } from '../server/app.js'

export default function handler(req, res) {
  return handle(req, res)
}
