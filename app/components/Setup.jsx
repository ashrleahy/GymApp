'use client'
import { useState } from 'react'
import { CATALOG, DAYS, KIND_LABEL, DEFAULT_INC, kindOf, unitFor } from '../lib/catalog.js'
import { historyFor } from '../lib/progression.js'
import { importLegacy } from '../lib/store.js'

export default function Setup({ state, loc, update }) {
  const [day, setDay] = useState('upper')
  const [adding, setAdding] = useState('')
  const [newKind, setNewKind] = useState('machine')
  const [msg, setMsg] = useState('')
  const items = loc.program?.[day] || []
  const known = { ...CATALOG, ...(state.custom || {}) }
  const isNew = adding.trim() && !known[adding.trim()]

  const setLoc = fn => update(s => ({ ...s, locations: s.locations.map(l => l.id === loc.id ? fn(l) : l) }))
  const setItems = fn => setLoc(l => ({ ...l, program: { ...l.program, [day]: fn(l.program?.[day] || []) } }))
  const patchItem = (i, patch) => setItems(xs => xs.map((x, j) => j === i ? { ...x, ...patch } : x))
  const move = (i, dir) => setItems(xs => {
    const a = [...xs]; const j = i + dir
    if (j < 0 || j >= a.length) return a
    ;[a[i], a[j]] = [a[j], a[i]]; return a
  })

  function add() {
    const name = adding.trim()
    if (!name || items.some(x => x.name === name)) return
    update(s => {
      const custom = known[name] ? s.custom : { ...s.custom, [name]: newKind }
      return {
        ...s, custom,
        locations: s.locations.map(l => l.id === loc.id ? { ...l, program: { ...l.program, [day]: [...(l.program?.[day] || []), { name }] } } : l),
      }
    })
    setAdding('')
  }
  function addLocation() {
    const name = prompt('Name for the new location?')
    if (!name?.trim()) return
    const id = `loc-${Date.now().toString(36)}`
    update(s => ({ ...s, lastLoc: id, locations: [...s.locations, { id, name: name.trim(), program: JSON.parse(JSON.stringify(loc.program || {})) }] }))
  }
  function removeLocation() {
    if (state.locations.length < 2) return
    if (!confirm(`Remove ${loc.name}? Its logged sessions stay in history.`)) return
    update(s => {
      const locations = s.locations.filter(l => l.id !== loc.id)
      return { ...s, locations, lastLoc: locations[0].id }
    })
  }
  function copyFrom(id) {
    const src = state.locations.find(l => l.id === id)
    if (!src || !confirm(`Replace ${loc.name}'s ${DAYS.find(d => d.id === day).label} with ${src.name}'s?`)) return
    setItems(() => JSON.parse(JSON.stringify(src.program?.[day] || [])))
  }
  async function runImport() {
    setMsg('Importing…')
    try {
      const { state: next, count } = await importLegacy(state)
      if (count) update(() => next, true)
      setMsg(count ? `Imported ${count} old sessions.` : 'No old sessions found.')
    } catch { setMsg('Import failed — old data not reachable.') }
  }
  function exportJson() {
    const blob = new Blob([JSON.stringify(state, null, 2)], { type: 'application/json' })
    const a = document.createElement('a')
    a.href = URL.createObjectURL(blob); a.download = `gym-${new Date().toISOString().slice(0, 10)}.json`; a.click()
  }

  return (
    <div>
      <div className="card">
        <div className="row">
          <input className="grow" value={loc.name} aria-label="Location name"
            onChange={e => setLoc(l => ({ ...l, name: e.target.value }))} />
          <button className="btn small" onClick={addLocation}>+ Location</button>
        </div>
        <div className="tiny dim" style={{ marginTop: 8 }}>
          Each location has its own programme. Barbell and bodyweight lifts progress across all locations; dumbbell and machine weights are tracked per location.
        </div>
      </div>

      <div className="label">{loc.name} programme</div>
      <div className="seg">
        {DAYS.map(d => <button key={d.id} className={day === d.id ? 'on' : ''} onClick={() => setDay(d.id)}>{d.label}</button>)}
      </div>

      <div className="card" style={{ marginTop: 8, padding: '4px 14px' }}>
        {items.length === 0 && <div className="small muted" style={{ padding: '10px 0' }}>No exercises yet.</div>}
        {items.map((it, i) => {
          const kind = kindOf(state, it.name)
          const hasHistory = historyFor(state, it.name, loc.id).length > 0
          return (
            <div key={it.name} className="item" style={{ display: 'block' }}>
              <div className="row">
                <div className="grow">
                  <div className="small" style={{ fontWeight: 600 }}>{it.name}</div>
                  <div className="tiny dim">{KIND_LABEL[kind]}</div>
                </div>
                <button className="iconbtn" aria-label="Move up" onClick={() => move(i, -1)}>↑</button>
                <button className="iconbtn" aria-label="Move down" onClick={() => move(i, 1)}>↓</button>
                <button className="iconbtn" aria-label="Remove" onClick={() => setItems(xs => xs.filter((_, j) => j !== i))}>×</button>
              </div>
              <div className="row tiny muted" style={{ marginTop: 6, gap: 6 }}>
                <span>Sets</span>
                <input className="inc" type="number" inputMode="numeric" aria-label="Sets" placeholder="2" style={{ width: 44 }}
                  value={it.sets ?? ''} onChange={e => patchItem(i, { sets: e.target.value === '' ? undefined : Math.max(1, Math.min(6, Number(e.target.value))) })} />
                <span style={{ marginLeft: 6 }}>Step</span>
                <input className="inc" type="number" inputMode="decimal" aria-label="Increment" placeholder={String(DEFAULT_INC[kind])}
                  value={it.inc ?? ''} onChange={e => patchItem(i, { inc: e.target.value === '' ? undefined : e.target.value })} />
                {!hasHistory && <>
                  <span style={{ marginLeft: 6 }}>Start</span>
                  <input className="inc" type="number" inputMode="decimal" aria-label="Starting weight" placeholder={unitFor(kind)}
                    value={it.start?.kg ?? ''} onChange={e => patchItem(i, { start: e.target.value === '' ? undefined : { kg: e.target.value } })} />
                </>}
              </div>
            </div>
          )
        })}
      </div>
      <div className="tiny dim" style={{ marginTop: 6 }}>Step = how much the weight goes up when you hit 8 on every set. Start = optional first target until you've logged it here.</div>

      <div className="row" style={{ marginTop: 10 }}>
        <input className="grow" list="setup-ex" placeholder="Add exercise" value={adding} onChange={e => setAdding(e.target.value)} />
        {isNew && (
          <select value={newKind} onChange={e => setNewKind(e.target.value)} aria-label="Type">
            {Object.entries(KIND_LABEL).map(([k, v]) => <option key={k} value={k}>{v.split(' ')[0]}</option>)}
          </select>
        )}
        <button className="btn small" onClick={add} disabled={!adding.trim()}>Add</button>
        <datalist id="setup-ex">{Object.keys(known).map(n => <option key={n} value={n} />)}</datalist>
      </div>

      {state.locations.length > 1 && (
        <div className="row" style={{ marginTop: 10 }}>
          <span className="small muted">Copy this day from</span>
          <select className="grow" value="" onChange={e => copyFrom(e.target.value)}>
            <option value="">choose…</option>
            {state.locations.filter(l => l.id !== loc.id).map(l => <option key={l.id} value={l.id}>{l.name}</option>)}
          </select>
        </div>
      )}

      <div className="label">Settings</div>
      <div className="card stack">
        <div className="row between">
          <span className="small">Bodyweight (for pull-up/dip trends)</span>
          <input type="number" inputMode="decimal" style={{ width: 80, textAlign: 'center' }} placeholder="kg"
            value={state.bodyweight ?? ''} onChange={e => update(s => ({ ...s, bodyweight: e.target.value === '' ? undefined : Number(e.target.value) }))} />
        </div>
        <div className="row">
          <button className="btn small" onClick={runImport}>Import old app logs</button>
          <button className="btn small" onClick={exportJson}>Export JSON</button>
          {state.locations.length > 1 && <button className="btn small ghost" style={{ color: 'var(--red)' }} onClick={removeLocation}>Remove {loc.name}</button>}
        </div>
        {msg && <div className="tiny muted">{msg}</div>}
      </div>
    </div>
  )
}
