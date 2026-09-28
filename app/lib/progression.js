import { kindOf, DEFAULT_INC } from './catalog.js'

export const REP_MIN = 5
export const REP_MAX = 8
const round = n => Math.round(n * 100) / 100
const sharedKind = k => k === 'bar' || k === 'bw'

// Past performances of one exercise, oldest first.
// Barbell/bodyweight share history across locations; dumbbell/machine are per location.
export function historyFor(state, name, locId) {
  const shared = sharedKind(kindOf(state, name))
  const out = []
  for (const log of state.logs) {
    if (!shared && log.locId !== locId) continue
    for (const e of log.entries) {
      if (e.name === name && e.sets?.length) out.push({ date: log.date, locId: log.locId, sets: e.sets, mark: e.mark })
    }
  }
  return out.sort((a, b) => a.date.localeCompare(b.date))
}

export function e1rm(sets, extra = 0) {
  let best = 0
  for (const s of sets) {
    const kg = (Number(s.kg) || 0) + extra, reps = Number(s.reps) || 0
    if (reps > 0) best = Math.max(best, kg * (1 + reps / 30))
  }
  return round(best)
}

// Double progression for N × 5–8 (N = sets for that exercise, default 2).
// All sets at 8+  -> add one increment, aim 5,5.
// Any set under 5 -> drop one increment, aim 6,6.
// Otherwise       -> same kg, aim +1 rep per set (capped at 8).
export function nextTarget(last, inc, sets = 2) {
  const kg = Math.max(...last.sets.map(s => Number(s.kg) || 0))
  const top = last.sets.filter(s => (Number(s.kg) || 0) === kg)
  const reps = top.map(s => Number(s.reps) || 0)
  const n = sets
  if (reps.every(r => r >= REP_MAX)) {
    return { kg: round(kg + inc), reps: Array(n).fill(REP_MIN), rule: 'up' }
  }
  if (reps.some(r => r < REP_MIN)) {
    return { kg: round(Math.max(0, kg - inc)), reps: Array(n).fill(6), rule: 'down' }
  }
  const aim = Array.from({ length: n }, (_, i) => Math.min(REP_MAX, (reps[i] ?? Math.min(...reps)) + 1))
  return { kg, reps: aim, rule: 'hold' }
}

// Stalled = the last 3 sessions haven't beaten the session before them (or the first of 3).
export function isStalled(hist) {
  if (hist.length < 3) return false
  const w = hist.slice(-4)
  const base = e1rm(w[0].sets)
  return w.slice(1).every(h => e1rm(h.sets) <= base)
}

export function targetFor(state, item, locId) {
  const kind = kindOf(state, item.name)
  const inc = Number(item.inc) || DEFAULT_INC[kind]
  const n = Number(item.sets) || 2
  const hist = historyFor(state, item.name, locId)
  const last = hist[hist.length - 1]
  if (!last) {
    if (item.start && item.start.kg !== '' && item.start.kg != null) {
      return { kg: Number(item.start.kg), reps: Array(n).fill(6), rule: 'start', kind, inc, last: null, stalled: false }
    }
    return { kg: null, reps: Array(n).fill(null), rule: 'new', kind, inc, last: null, stalled: false }
  }
  return { ...nextTarget(last, inc, n), kind, inc, last, stalled: isStalled(hist) }
}

// Trend series for free weights only (machines vary between gyms).
export function trends(state, bodyweight = 0) {
  const map = {}
  const sorted = [...state.logs].sort((a, b) => a.date.localeCompare(b.date))
  for (const log of sorted) {
    for (const e of log.entries) {
      const kind = kindOf(state, e.name)
      if (kind === 'machine' || kind === 'band' || !e.sets?.length) continue
      const v = e1rm(e.sets, kind === 'bw' ? Number(bodyweight) || 0 : 0)
      if (!v) continue
      const top = e.sets.reduce((a, s) => (Number(s.kg) || 0) > (Number(a.kg) || 0) ? s : a, e.sets[0])
      ;(map[e.name] ||= { name: e.name, kind, points: [] }).points.push({ date: log.date, v, top, sets: e.sets })
    }
  }
  return Object.values(map)
}
