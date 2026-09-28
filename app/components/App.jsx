'use client'
import { useCallback, useEffect, useRef, useState } from 'react'
import { loadState, saveState } from '../lib/store.js'
import { reviewSession } from '../lib/coach.js'
import Week from './Week.jsx'
import LogSession from './LogSession.jsx'
import Trends from './Trends.jsx'
import Setup from './Setup.jsx'

export default function App() {
  const [state, setState] = useState(null)
  const [synced, setSynced] = useState(true)
  const [tab, setTab] = useState('log')
  const [open, setOpen] = useState(null) // { day, logId? }
  const [reviewing, setReviewing] = useState(false)
  const latest = useRef(null)
  const timer = useRef(null)

  useEffect(() => {
    loadState().then(({ state, synced, fresh }) => {
      setState(state); setSynced(synced); latest.current = state
      if (fresh) setTab('setup')
    })
  }, [])

  const persist = useCallback((next, immediate) => {
    latest.current = next
    clearTimeout(timer.current)
    const run = () => saveState(latest.current).then(setSynced)
    if (immediate) return run()
    timer.current = setTimeout(run, 600)
  }, [])

  const update = useCallback((fn, immediate) => {
    // latest.current is always the freshest state, so updates compose synchronously
    const next = fn(latest.current)
    setState(next)
    persist(next, immediate)
  }, [persist])

  async function saveLog(log) {
    update(s => ({ ...s, logs: [...s.logs.filter(l => l.id !== log.id), log] }), true)
    setOpen(null)
    // AI overlay check on the rule's new targets
    setReviewing(true)
    try {
      const review = await reviewSession(latest.current, log)
      update(s => ({ ...s, logs: s.logs.map(l => l.id === log.id ? { ...l, review } : l) }), true)
    } catch (e) {
      console.error('review failed', e)
    } finally { setReviewing(false) }
  }

  if (!state) return <div className="app"><div className="empty">Loading…</div></div>

  const loc = state.locations.find(l => l.id === state.lastLoc) || state.locations[0]
  const setLoc = id => update(s => ({ ...s, lastLoc: id }))

  return (
    <div className="app">
      <div className="top">
        <div className="brand">
          <h1>Gym</h1>
          <span className={`sync ${synced ? '' : 'bad'}`}>{synced ? 'Synced' : 'Offline · saved on device'}</span>
        </div>
        {tab !== 'trends' && (
          <div className="chips">
            {state.locations.map(l => (
              <button key={l.id} className={`chip ${l.id === loc.id ? 'on' : ''}`} onClick={() => setLoc(l.id)}>{l.name}</button>
            ))}
          </div>
        )}
      </div>

      {tab === 'log' && !open && (
        <Week state={state} loc={loc} reviewing={reviewing} onOpen={setOpen}
          onDelete={id => update(s => ({ ...s, logs: s.logs.filter(l => l.id !== id) }), true)} />
      )}
      {tab === 'log' && open && (
        <LogSession key={`${loc.id}-${open.day}-${open.logId || ''}`} state={state} loc={loc} day={open.day}
          logId={open.logId} onCancel={() => setOpen(null)} onSave={saveLog} />
      )}
      {tab === 'trends' && <Trends state={state} />}
      {tab === 'setup' && <Setup state={state} loc={loc} update={update} />}

      <nav className="nav">
        {[['log', 'Log'], ['trends', 'Trends'], ['setup', 'Programmes']].map(([id, label]) => (
          <button key={id} className={tab === id ? 'on' : ''} onClick={() => { setTab(id); if (id !== 'log') setOpen(null) }}>{label}</button>
        ))}
      </nav>
    </div>
  )
}
