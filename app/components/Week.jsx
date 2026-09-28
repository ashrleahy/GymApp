'use client'
import { DAYS, dayById } from '../lib/catalog.js'
import { weekStart, fmt, daysAgo } from '../lib/dates.js'

export default function Week({ state, loc, reviewing, onOpen, onDelete }) {
  const ws = weekStart()
  const byDate = [...state.logs].sort((a, b) => b.date.localeCompare(a.date))
  const locName = id => state.locations.find(l => l.id === id)?.name || '—'
  const weekCount = byDate.filter(l => l.date >= ws).length
  const lastReviewed = byDate.find(l => l.review)

  return (
    <div>
      <div className="row between">
        <div className="label" style={{ marginTop: 0 }}>This week · from Sat</div>
        <div className="label" style={{ marginTop: 0 }}>{weekCount} session{weekCount === 1 ? '' : 's'}</div>
      </div>
      <div className="days">
        {DAYS.map(d => {
          const wk = byDate.filter(l => l.day === d.id && l.date >= ws)
          const thisWeek = wk[0]
          const last = byDate.find(l => l.day === d.id)
          return (
            <button key={d.id} className={`day ${thisWeek ? 'done' : ''}`} style={{ '--c': d.color }}
              onClick={() => onOpen({ day: d.id })}>
              <div className="n">{d.label}</div>
              <div className="s">
                {thisWeek ? `✓ ${wk.length}× this week · last ${daysAgo(thisWeek.date)}` : last ? `Last ${daysAgo(last.date)} · ${locName(last.locId)}` : 'Not logged yet'}
              </div>
            </button>
          )
        })}
      </div>
      <div className="small dim" style={{ marginTop: 8 }}>Tap a day to log it at {loc.name}.</div>

      {(reviewing || lastReviewed) && (
        <>
          <div className="label">Coach check</div>
          <div className="card coach">
            {reviewing ? <div className="small muted">Checking your last session…</div> : (
              <>
                <div className="h">{dayById(lastReviewed.day)?.label} · {fmt(lastReviewed.date)}</div>
                <div className="small">{lastReviewed.review.summary}</div>
                {lastReviewed.review.notes?.map((n, i) => (
                  <div key={i} className="tiny muted" style={{ marginTop: 6 }}>
                    <b style={{ color: 'var(--text)' }}>{n.name}</b> — {n.note}{n.kg != null ? ` (next: ${n.kg} kg)` : ''}
                  </div>
                ))}
              </>
            )}
          </div>
        </>
      )}

      <div className="label">Recent</div>
      {byDate.length === 0 && <div className="card small muted">Nothing logged yet.</div>}
      <div className="stack">
        {byDate.slice(0, 10).map(l => (
          <div key={l.id} className="card row" style={{ padding: '10px 14px' }}>
            <div className="grow">
              <div className="small" style={{ fontWeight: 600 }}>{dayById(l.day)?.label}</div>
              <div className="tiny muted">{fmt(l.date)} · {locName(l.locId)} · {l.entries.length} exercises</div>
            </div>
            <button className="btn small ghost" onClick={() => onOpen({ day: l.day, logId: l.id })}>Edit</button>
            <button className="iconbtn" aria-label="Delete session"
              onClick={() => confirm(`Delete ${dayById(l.day)?.label} on ${fmt(l.date)}?`) && onDelete(l.id)}>×</button>
          </div>
        ))}
      </div>
    </div>
  )
}
