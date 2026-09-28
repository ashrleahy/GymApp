import { historyFor, targetFor } from './progression.js'
import { dayById } from './catalog.js'

const fmtSets = sets => sets.map(s => `${s.kg}kg×${s.reps}`).join(', ')

// After a session is saved: the rule has already set next targets; Claude checks them.
export async function reviewSession(state, log) {
  const loc = state.locations.find(l => l.id === log.locId)
  const blocks = log.entries.map(e => {
    const hist = historyFor(state, e.name, log.locId).slice(-6)
    const next = targetFor(state, { name: e.name }, log.locId)
    return `${e.name} [${next.kind}]\n  history: ${hist.map(h => `${h.date} ${fmtSets(h.sets)}`).join(' | ')}\n  rule next target: ${next.kg}kg × ${next.reps.join(',')} (${next.rule}${next.stalled ? ', STALLED' : ''})`
  }).join('\n')
  const system = `You are a strength coach checking an automated progression rule for a lifter doing 2 sets of 5-8 reps (double progression: all sets at 8 -> add weight; any set under 5 -> drop weight). Dumbbell weights are per hand; bodyweight exercises show added kg. Only comment where you'd change the rule's target or something needs attention (stall, too-fast jump, an exercise to swap). Respond ONLY with JSON, no markdown: {"summary": "max 20 words", "notes": [{"name": "exact exercise name", "note": "max 14 words", "kg": number or null}]}. Use kg only when recommending a different next weight than the rule. Empty notes array is fine.`
  const user = `${dayById(log.day)?.label} at ${loc?.name} on ${log.date}.\n${blocks}`
  const res = await fetch('/api/ai', {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ system, messages: [{ role: 'user', content: user }], maxTokens: 600 }),
  })
  const d = await res.json()
  if (!d.text) throw new Error(d.error || 'no response')
  const parsed = JSON.parse(d.text.replace(/```json|```/g, '').trim())
  return { at: new Date().toISOString(), summary: parsed.summary || '', notes: Array.isArray(parsed.notes) ? parsed.notes : [] }
}
