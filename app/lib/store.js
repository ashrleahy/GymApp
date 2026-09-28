import { seedState } from './catalog.js'

const LS = 'gymapp_v3'
const lsGet = () => { try { const r = localStorage.getItem(LS); return r ? JSON.parse(r) : null } catch { return null } }
const lsSet = d => { try { localStorage.setItem(LS, JSON.stringify(d)) } catch {} }

export async function loadState() {
  try {
    const res = await fetch('/api/state', { cache: 'no-store' })
    if (res.ok) {
      const { data } = await res.json()
      if (data?.version === 3) { lsSet(data); return { state: data, synced: true } }
      const local = lsGet()
      return { state: local || seedState(), synced: true, fresh: !local }
    }
  } catch {}
  return { state: lsGet() || seedState(), synced: false }
}

export async function saveState(state) {
  lsSet(state)
  try {
    const res = await fetch('/api/state', {
      method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ data: state }),
    })
    return res.ok
  } catch { return false }
}

// Best-effort import of logs from the previous app (Redis key gym_sessions).
export async function importLegacy(state) {
  const res = await fetch('/api/state?legacy=1', { cache: 'no-store' })
  const { data } = await res.json()
  if (!Array.isArray(data) || !data.length) return { state, count: 0 }
  const home = state.locations.find(l => l.id === 'home' || /home/i.test(l.name)) || state.locations[0]
  const gym = state.locations.find(l => l !== home) || state.locations[0]
  const have = new Set(state.logs.map(l => `${l.date}|${l.day}|${l.locId}`))
  const logs = []
  for (const s of data) {
    if (!s?.date || !s?.type) continue
    const locId = s.location === 'home' ? home.id : gym.id
    const day = s.type === 'legs' ? 'legs' : 'upper'
    const k = `${s.date}|${day}|${locId}`
    if (have.has(k)) continue
    const entries = (s.exercises || []).map(ex => ({
      name: ex.name,
      sets: (ex.sets || []).filter(x => x.kg !== '' && x.reps !== '' && x.reps != null)
        .map(x => ({ kg: Number(x.kg) || 0, reps: Number(x.reps) || 0 })),
      mark: 'import',
    })).filter(e => e.sets.length)
    if (entries.length) logs.push({ id: `imp-${k}`, date: s.date, locId, day, entries })
  }
  return { state: { ...state, logs: [...state.logs, ...logs] }, count: logs.length }
}
