// Local-date helpers (never UTC — see build learnings). Week starts Saturday.
export const pad = n => String(n).padStart(2, '0')
export const ymd = d => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
export const today = () => ymd(new Date())
export const parse = s => { const [y, m, d] = s.split('-').map(Number); return new Date(y, m - 1, d) }
export function weekStart(date = new Date()) {
  const d = new Date(date.getFullYear(), date.getMonth(), date.getDate())
  d.setDate(d.getDate() - ((d.getDay() + 1) % 7))
  return ymd(d)
}
export function fmt(s) {
  return parse(s).toLocaleDateString('en-AU', { weekday: 'short', day: 'numeric', month: 'short' })
}
export function daysAgo(s) {
  const diff = Math.round((parse(today()) - parse(s)) / 86400000)
  return diff === 0 ? 'today' : diff === 1 ? 'yesterday' : `${diff}d ago`
}
