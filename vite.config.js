import { defineConfig } from 'vite'

// data și ora build-ului, afișate în antet (ca să se vadă dacă pagina e la zi)
const built = new Intl.DateTimeFormat('ro-RO', { timeZone: 'Europe/Bucharest', day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' }).format(new Date())
// local, cererile /api merg la serverul din server/dev.js (npm run api)
const api = { '/api': { target: `http://localhost:${process.env.API_PORT || 3001}`, changeOrigin: false } }

export default defineConfig({
  define: { __BUILD__: JSON.stringify(built) },
  server: { proxy: api },
  preview: { proxy: api },
  build: {
    rollupOptions: {
      input: { main: 'index.html', admin: 'admin.html', scan: 'scan.html' },
    },
  },
})
