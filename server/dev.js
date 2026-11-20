// Serverul API local (npm run api): aceeași logică ca funcția de pe Vercel, cu PGlite în .data/
import http from 'node:http'
import { handle } from './app.js'

const port = Number(process.env.API_PORT || 3001)
http.createServer((req, res) => handle(req, res)).listen(port, () => console.log(`API local pe http://localhost:${port}`))
