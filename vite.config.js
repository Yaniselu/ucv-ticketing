import { defineConfig } from 'vite'

// data și ora build-ului, afișate în antet (ca să se vadă dacă pagina e la zi)
const built = new Intl.DateTimeFormat('ro-RO', { timeZone: 'Europe/Bucharest', day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' }).format(new Date())

export default defineConfig({
  define: { __BUILD__: JSON.stringify(built) },
})
