import { useMemo, useState } from 'react'
import { loadModules } from '../lib/modules.js'
import { loadActivity, loadViews } from '../lib/activity.js'
import { loadReviews, reviewStats } from '../lib/spaced.js'

function Heatmap({ counts }) {
  const today = new Date()
  const days = 119 // 17 weeks
  const cells = []
  const start = new Date(today)
  start.setDate(start.getDate() - days)
  start.setHours(0, 0, 0, 0)
  for (let i = 0; i <= days; i++) {
    const d = new Date(start)
    d.setDate(start.getDate() + i)
    const key = d.toISOString().slice(0, 10)
    cells.push({ key, count: counts[key] || 0, offset: d.getDay() })
  }
  const max = Math.max(1, ...cells.map((c) => c.count))
  const weeks = []
  for (let i = 0; i < cells.length; i += 7) weeks.push(cells.slice(i, i + 7))
  const monthLabels = []
  let lastMonth = -1
  weeks.forEach((week, wi) => {
    if (week.length && week[0].key.slice(5, 7) !== lastMonth) {
      lastMonth = week[0].key.slice(5, 7)
      monthLabels.push({ wi, label: new Date(week[0].key).toLocaleString(undefined, { month: 'short' }) })
    }
  })

  return (
    <div className="heatmap">
      <div className="heatmap-months">
        {weeks.map((_, wi) => {
          const ml = monthLabels.find((m) => m.wi === wi)
          return <div key={wi} className="heatmap-month-cell">{ml?.label || ''}</div>
        })}
      </div>
      <div className="heatmap-body">
        {weeks.map((week, wi) => (
          <div className="heatmap-col" key={wi}>
            {Array.from({ length: 7 }, (_, d) => {
              const cell = week.find((c) => c.offset === d)
              if (!cell) return <div key={d} className="heat-cell empty" />
              const level = cell.count === 0 ? 0 : cell.count >= max ? 4 : Math.max(1, Math.ceil((cell.count / max) * 3))
              return <div key={d} className={`heat-cell l${level}`} title={`${cell.key}: ${cell.count} activity`} />
            })}
          </div>
        ))}
      </div>
    </div>
  )
}

export default function AnalyticsModal({ onClose }) {
  const [activity] = useState(() => loadActivity())
  const [views] = useState(() => loadViews())
  const modules = useMemo(() => loadModules(), [])
  const reviews = useMemo(() => loadReviews(), [])
  const stats = reviewStats()

  const completedEvents = activity.filter((a) => a.action === 'done')
  const byDay = {}
  const counts = {}
  for (const a of activity) {
    counts[a.day] = (counts[a.day] || 0) + 1
    if (a.action === 'done') byDay[a.day] = (byDay[a.day] || 0) + 1
  }
  const dayKeys = Object.keys(byDay).sort()
  const daysActive = new Set(activity.map((a) => a.day)).size
  const velocity = daysActive ? (completedEvents.length / daysActive) : 0

  const streaks = []
  let run = 0
  const dates = dayKeys
  for (let i = 0; i < dates.length; i++) {
    if (i === 0 || new Date(dates[i]) - new Date(dates[i - 1]) === 86400000) run++
    else run = 1
    if (i === dates.length - 1) streaks.push(run)
  }
  const currentStreak = dates.length ? (() => {
    let n = 0
    const set = new Set(dayKeys)
    const d = new Date()
    while (true) {
      const key = d.toISOString().slice(0, 10)
      if (set.has(key)) { n++; d.setDate(d.getDate() - 1) }
      else break
    }
    return n
  })() : 0

  const topLessons = Object.entries(views)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 10)

  const moduleRows = modules.map((m) => {
    const total = m.module?.mainTopics?.filter((t) => t.title !== 'Roadmap').reduce(
      (a, t) => a + (t.subtopics || []).reduce((b, s) => b + (s.items || []).length, 0), 0) || 0
    const done = Object.values(m.progress || {}).filter((v) => v === 'done').length
    const pct = total ? Math.round((done / total) * 100) : 0
    return { subject: m.subject, total, done, pct }
  })

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal analytics-modal" onClick={(e) => e.stopPropagation()}>
        <div className="modal-head">
          <h3>Learning Analytics</h3>
          <button className="btn tiny" onClick={onClose}>Close</button>
        </div>
        <div className="modal-body">
          <div className="analytics-stats">
            <div className="analytics-stat"><span className="analytics-stat-val">{completedEvents.length}</span><span>Lessons completed</span></div>
            <div className="analytics-stat"><span className="analytics-stat-val">{daysActive}</span><span>Days studied</span></div>
            <div className="analytics-stat"><span className="analytics-stat-val">{velocity.toFixed(2)}</span><span>Velocity (done/day)</span></div>
            <div className="analytics-stat"><span className="analytics-stat-val">{currentStreak}</span><span>Day streak</span></div>
            <div className="analytics-stat"><span className="analytics-stat-val">{stats.due}</span><span>Reviews due</span></div>
          </div>

          <div className="analytics-section">
            <h4 className="note-h">Study activity heatmap (last 17 weeks)</h4>
            <Heatmap counts={counts} />
          </div>

          <div className="analytics-section">
            <h4 className="note-h">Per-module completion</h4>
            {moduleRows.length === 0 && <p className="hint">No saved modules yet.</p>}
            {moduleRows.map((r) => (
              <div className="analytics-module" key={r.subject}>
                <div className="analytics-module-head">
                  <span className="analytics-module-name">{r.subject}</span>
                  <span>{r.done}/{r.total} · {r.pct}%</span>
                </div>
                <div className="progress-track"><div className="progress-fill" style={{ width: `${r.pct}%` }} /></div>
              </div>
            ))}
          </div>

          <div className="analytics-section">
            <h4 className="note-h">Most-visited lessons</h4>
            {topLessons.length === 0 && <p className="hint">Nothing visited yet — open some lessons!</p>}
            <ul className="analytics-views">
              {topLessons.map(([key, n]) => (
                <li key={key}>
                  <span className="analytics-views-key">{key}</span>
                  <span className="analytics-views-count">{n} views</span>
                </li>
              ))}
            </ul>
          </div>
        </div>
      </div>
    </div>
  )
}
