// Culorile biletului pentru fiecare competiție (folosite în PDF, în email și pe pagina biletului)
export const TICKET_THEMES = {
  superliga: { bg: '#e30613', bg2: '#a8000d', fg: '#ffffff', accent: '#ffd400', label: 'Superliga' },
  cupa: { bg: '#d7141a', bg2: '#0b4aa2', fg: '#ffffff', accent: '#ffd200', label: 'Cupa României' },
  supercupa: { bg: '#0b4aa2', bg2: '#06306f', fg: '#ffffff', accent: '#ffd200', label: 'Supercupa României' },
  champions: { bg: '#0a1f5c', bg2: '#020b2d', fg: '#ffffff', accent: '#00c8ff', label: 'UEFA Champions League' },
  europa: { bg: '#141414', bg2: '#000000', fg: '#ffffff', accent: '#ff6900', label: 'UEFA Europa League' },
  conference: { bg: '#141414', bg2: '#000000', fg: '#ffffff', accent: '#2bd35b', label: 'UEFA Conference League' },
}
export const themeFor = (id) => TICKET_THEMES[id] || TICKET_THEMES.superliga
