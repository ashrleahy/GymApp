'use client'
import { useMemo, useState } from 'react'
import { trends } from '../lib/progression.js'
import { fmt, parse, ymd } from '../lib/dates.js'

const RANGES = [['3M', 91], ['6M', 182], ['1Y', 365], ['All', 0]]
const setsText = sets => sets.map(s => `${s.kg}×${s.reps}`).join(', ')

function Line({ pts, w, h, big, active, setActive }) {
  if (pts.length < 2) return <div className="tiny dim" style={{ marginTop: 8 }}>Needs 2+ sessions to chart.</div>
  const pad = big ? { l: 34, r: 10, t: 12, b: 20 } : { l: 2, r: 2, t: 4, b: 4 }
  const xs = pts.map(p => parse(p.date).getTime()), vs = pts.map(p => p.v)
  const x0 = Math.min(...xs), x1 = Math.max(...xs)
  let y0 = Math.min(...vs), y1 = Math.max(...vs)
  const span = Math.max(y1 - y0, y1 * 0.04); y0 -= span * 0.15; y1 += span * 0.15
  const X = t => pad.l + (x1 === x0 ? 0.5 : (t - x0) / (x1 - x0)) * (w - pad.l - pad.r)
  const Y = v => pad.t + (1 - (v - y0) / (y1 - y0)) * (h - pad.t - pad.b)
  const d = pts.map((p, i) => `${i ? 'L' : 'M'}${X(xs[i]).toFixed(1)},${Y(p.v).toFixed(1)}`).join('')
  const ticks = big ? [y0 + (y1 - y0) * 0.2, y0 + (y1 - y0) * 0.8] : []
  return (
    <svg width="100%" viewBox={`0 0 ${w} ${h}`} style={{ display: 'block', overflow: 'visible' }} role="img"
      aria-label={`Estimated 1RM from ${vs[0]} to ${vs[vs.length - 1]} kg`}>
      {ticks.map((t, i) => (
        <g key={i}>
          <line x1={pad.l} x2={w - pad.r} y1={Y(t)} y2={Y(t)} stroke="rgba(255,255,255,0.06)" />
          <text x={pad.l - 6} y={Y(t) + 3} textAnchor="end" fontSize="10" fill="var(--t2)">{Math.round(t)}</text>
        </g>
      ))}
      {big && <>
        <text x={pad.l} y={h - 4} fontSize="10" fill="var(--t2)">{fmt(pts[0].date)}</text>
        <text x={w - pad.r} y={h - 4} fontSize="10" fill="var(--t2)" textAnchor="end">{fmt(pts[pts.length - 1].date)}</text>
      </>}
      <path d={d} fill="none" stroke="var(--blue)" strokeWidth="2" strokeLinejoin="round" strokeLinecap="round" />
      {big && pts.map((p, i) => (
        <g key={i}>
          <circle cx={X(xs[i])} cy={Y(p.v)} r={active === i ? 5 : 3.5} fill="var(--blue)" stroke="var(--s1)" strokeWidth="2" />
          <rect x={X(xs[i]) - 12} y={0} width={24} height={h} fill="transparent"
            onMouseEnter={() => setActive(i)} onClick={() => setActive(i)} />
        </g>
      ))}
      {!big && <circle cx={X(xs[xs.length - 1])} cy={Y(vs[vs.length - 1])} r="3" fill="var(--blue)" />}
    </svg>
  )
}

export default function Trends({ state }) {
  const [range, setRange] = useState(91)
  const [openName, setOpenName] = useState(null)
  const [active, setActive] = useState(null)
  const all = useMemo(() => trends(state, state.bodyweight), [state])
  const cutoff = range ? ymd(new Date(Date.now() - range * 86400000)) : '0000'
  const lifts = all.map(t => ({ ...t, pts: t.points.filter(p => p.date >= cutoff) }))
    .filter(t => t.pts.length)
    .sort((a, b) => b.pts[b.pts.length - 1].date.localeCompare(a.pts[a.pts.length - 1].date))

  return (
    <div>
      <div className="seg">
        {RANGES.map(([l, d]) => <button key={l} className={range === d ? 'on' : ''} onClick={() => setRange(d)}>{l}</button>)}
      </div>
      <div className="tiny dim" style={{ margin: '8px 0 12px' }}>
        Estimated 1RM from your best set each session. Free weights only; dumbbells per hand{state.bodyweight ? `; bodyweight lifts include ${state.bodyweight} kg` : ''}.
      </div>
      {lifts.length === 0 && <div className="empty">No free-weight sessions in this range yet.</div>}
      <div className="stack">
        {lifts.map(t => {
          const first = t.pts[0].v, last = t.pts[t.pts.length - 1].v
          const pct = first ? ((last - first) / first) * 100 : 0
          const cls = Math.abs(pct) < 0.5 ? 'flat' : pct > 0 ? 'pos' : 'neg'
          const lastPt = t.pts[t.pts.length - 1]
          const isOpen = openName === t.name
          return (
            <button key={t.name} className="trend" onClick={() => { setOpenName(isOpen ? null : t.name); setActive(null) }}>
              <div className="row">
                <div className="grow">
                  <div style={{ fontWeight: 600 }}>{t.name}</div>
                  <div className="tiny muted">Latest {setsText(lastPt.sets)} · {fmt(lastPt.date)}</div>
                </div>
                {!isOpen && <div style={{ width: 80 }}><Line pts={t.pts} w={80} h={28} /></div>}
                <div style={{ textAlign: 'right', minWidth: 62 }}>
                  <div className="v">{Math.round(last)}<span className="tiny muted"> kg</span></div>
                  <div className={`tiny delta ${cls}`}>{t.pts.length > 1 ? `${pct > 0 ? '+' : ''}${pct.toFixed(1)}%` : '—'}</div>
                </div>
              </div>
              {isOpen && (
                <div onClick={e => e.stopPropagation()}>
                  <div className="chart">
                    <Line pts={t.pts} w={400} h={160} big active={active} setActive={setActive} />
                    {active != null && t.pts[active] && (() => {
                      const p = t.pts[active]
                      return <div className="tip" style={{ left: '50%', top: 0 }}>{fmt(p.date)} · {setsText(p.sets)} · e1RM {Math.round(p.v)}</div>
                    })()}
                  </div>
                  <table className="tbl"><tbody>
                    {[...t.pts].reverse().slice(0, 6).map((p, i) => (
                      <tr key={i}><td>{fmt(p.date)}</td><td>{setsText(p.sets)}</td><td>{Math.round(p.v)}</td></tr>
                    ))}
                  </tbody></table>
                </div>
              )}
            </button>
          )
        })}
      </div>
    </div>
  )
}
