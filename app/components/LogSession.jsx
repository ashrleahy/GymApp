'use client'
import { useMemo, useState } from 'react'
import { CATALOG, dayById, kindOf, unitFor } from '../lib/catalog.js'
import { targetFor } from '../lib/progression.js'
import { today, daysAgo } from '../lib/dates.js'

const setsText = sets => {
  const kgs = [...new Set(sets.map(s => Number(s.kg)))]
  return kgs.length === 1 ? `${kgs[0]} × ${sets.map(s => s.reps).join(', ')}` : sets.map(s => `${s.kg}×${s.reps}`).join(', ')
}
const RULE = { up: ['up', '+ weight'], down: ['down', 'drop back'], hold: ['', 'add reps'], start: ['', 'start'], new: ['', 'first time'] }

export default function LogSession({ state, loc: currentLoc, day, logId, onCancel, onSave }) {
  const existing = logId ? state.logs.find(l => l.id === logId) : null
  const loc = existing ? state.locations.find(l => l.id === existing.locId) || currentLoc : currentLoc
  // targets are computed as if this session hadn't been logged yet
  const base = useMemo(() => existing ? { ...state, logs: state.logs.filter(l => l.id !== logId) } : state, [state, logId, existing])
  const review = useMemo(() => [...base.logs].filter(l => l.locId === loc.id && l.day === day && l.review)
    .sort((a, b) => b.date.localeCompare(a.date))[0]?.review, [base, loc.id, day])

  const [date, setDate] = useState(existing?.date || today())
  const [rows, setRows] = useState(() => {
    const program = loc.program?.[day] || []
    const names = existing ? [...existing.entries.map(e => e.name), ...program.map(p => p.name).filter(n => !existing.entries.some(e => e.name === n))] : program.map(p => p.name)
    return names.map(name => makeRow(name))
  })
  const [adding, setAdding] = useState('')

  function makeRow(name) {
    const item = (loc.program?.[day] || []).find(p => p.name === name) || { name }
    const t = targetFor(base, item, loc.id)
    const note = review?.notes?.find(n => n.name === name)
    const entry = existing?.entries.find(e => e.name === name)
    const tgt = { kg: t.kg, reps: t.reps }
    return {
      name, t, note, tgt,
      mark: entry ? (entry.mark === 'import' ? 'hit' : entry.mark || 'hit') : existing ? 'skip' : (t.kg == null ? 'new' : null),
      kg: entry ? entry.sets[0]?.kg ?? '' : t.kg ?? '',
      reps: entry ? entry.sets.map(s => s.reps) : t.reps.map(r => r ?? ''),
    }
  }

  const set = (i, patch) => setRows(rs => rs.map((r, j) => j === i ? { ...r, ...patch } : r))
  function mark(i, m) {
    const r = rows[i]
    if (r.mark === m) return set(i, { mark: null })
    if (m === 'hit' || (m !== 'skip' && r.mark !== 'up' && r.mark !== 'down')) set(i, { mark: m, kg: r.tgt.kg ?? '', reps: [...r.tgt.reps] })
    else set(i, { mark: m })
  }
  const useAi = i => setRows(rs => rs.map((r, j) => j === i ? { ...r, tgt: { ...r.tgt, kg: r.note.kg }, kg: r.note.kg, aiApplied: true } : r))

  const valid = r => r.mark && r.mark !== 'skip' && r.kg !== '' && r.reps.length && r.reps.every(x => x !== '' && Number(x) > 0)
  const pending = rows.filter(r => !r.mark).length
  const ready = rows.filter(valid)

  function allPlanned() {
    setRows(rs => rs.map(r => !r.mark && r.tgt.kg != null ? { ...r, mark: 'hit', kg: r.tgt.kg, reps: [...r.tgt.reps] } : r))
  }
  function save() {
    const entries = ready.map(r => ({
      name: r.name, kind: kindOf(state, r.name), mark: r.mark,
      sets: r.reps.map(x => ({ kg: Number(r.kg), reps: Number(x) })),
    }))
    onSave({ id: existing?.id || `${date}-${day}-${loc.id}-${Date.now().toString(36)}`, date, locId: loc.id, day, entries })
  }
  function addOneOff() {
    const name = adding.trim()
    if (!name || rows.some(r => r.name === name)) return
    setRows(rs => [...rs, makeRow(name)]); setAdding('')
  }

  const d = dayById(day)
  return (
    <div>
      <div className="row between" style={{ marginBottom: 12 }}>
        <div>
          <div style={{ fontWeight: 600, fontSize: 18, color: d.color }}>{d.label}</div>
          <div className="small muted">{loc.name}{existing ? ' · editing' : ''}</div>
        </div>
        <input type="date" value={date} max={today()} onChange={e => setDate(e.target.value)} style={{ width: 150 }} />
      </div>
      {rows.length === 0 && <div className="card small muted">No exercises in this programme yet — add them under Programmes, or add one below.</div>}

      <div className="stack">
        {rows.map((r, i) => {
          const [cls, txt] = RULE[r.t.rule] || ['', '']
          const editing = r.mark === 'up' || r.mark === 'down' || r.mark === 'new'
          return (
            <div key={r.name} className={`ex ${r.mark ? 'marked' : ''} ${r.mark === 'skip' ? 'skip' : ''}`}>
              <div className="row between">
                <div className="name grow">{r.name}</div>
                <div className="row" style={{ gap: 4 }}>
                  {r.t.stalled && <span className="badge stall">stalled</span>}
                  {txt && <span className={`badge ${cls}`}>{txt}</span>}
                </div>
              </div>
              {r.t.last && <div className="last">Last time ({daysAgo(r.t.last.date)}): {setsText(r.t.last.sets)}{r.t.kind === 'db' ? ' /hand' : r.t.kind === 'band' ? ' (level)' : ''}</div>}
              {r.tgt.kg != null && (
                <div className="tgt">
                  <span className="kg">{r.tgt.kg}<span className="small muted"> {unitFor(r.t.kind)}</span></span>
                  <span className="reps">× {r.tgt.reps.join(', ')}</span>
                  {r.aiApplied && <span className="badge" style={{ color: 'var(--purple)' }}>coach</span>}
                </div>
              )}
              {r.note && !r.aiApplied && (
                <div className="note">
                  <span className="grow">{r.note.note}</span>
                  {r.note.kg != null && r.note.kg !== r.tgt.kg && <button onClick={() => useAi(i)}>Use {r.note.kg} {unitFor(r.t.kind)}</button>}
                </div>
              )}
              {r.tgt.kg != null && (
                <div className="marks">
                  <button className={`mk hit ${r.mark === 'hit' ? 'on' : ''}`} aria-label="Did it as planned" onClick={() => mark(i, 'hit')}>✓</button>
                  <button className={`mk up ${r.mark === 'up' ? 'on' : ''}`} aria-label="Beat it" onClick={() => mark(i, 'up')}>↑</button>
                  <button className={`mk down ${r.mark === 'down' ? 'on' : ''}`} aria-label="Fell short" onClick={() => mark(i, 'down')}>↓</button>
                  <button className={`mk skip ${r.mark === 'skip' ? 'on' : ''}`} aria-label="Skipped" onClick={() => mark(i, 'skip')} style={{ fontSize: 13 }}>–</button>
                </div>
              )}
              {editing && (
                <div className="edit" style={{ '--n': r.reps.length }}>
                  <div><label>{r.t.kind === 'band' ? 'level' : 'kg'}{r.t.kind === 'db' ? '/hand' : r.t.kind === 'bw' ? ' added' : ''}</label>
                    <input type="number" inputMode="decimal" value={r.kg} onChange={e => set(i, { kg: e.target.value })} /></div>
                  {r.reps.map((x, k) => (
                    <div key={k}><label>Set {k + 1}</label>
                      <input type="number" inputMode="numeric" value={x}
                        onChange={e => set(i, { reps: r.reps.map((y, m) => m === k ? e.target.value : y) })} /></div>
                  ))}
                </div>
              )}
              {r.mark === 'new' && <div className="tiny dim" style={{ marginTop: 6 }}>First time here — enter what you did; targets start from this.</div>}
            </div>
          )
        })}
      </div>

      <div className="row" style={{ marginTop: 12 }}>
        <input className="grow" list="all-ex" placeholder="One-off exercise (this session only)" value={adding} onChange={e => setAdding(e.target.value)} />
        <button className="btn small" onClick={addOneOff} disabled={!adding.trim()}>Add</button>
        <datalist id="all-ex">{[...Object.keys(CATALOG), ...Object.keys(state.custom || {})].map(n => <option key={n} value={n} />)}</datalist>
      </div>
      <div style={{ height: 70 }} />

      <div className="savebar">
        <button className="btn" onClick={onCancel}>Cancel</button>
        {pending > 0 && <button className="btn grow" onClick={allPlanned}>✓ Rest ({pending})</button>}
        <button className="btn primary grow" onClick={save} disabled={!ready.length}>Save · {ready.length}</button>
      </div>
    </div>
  )
}
