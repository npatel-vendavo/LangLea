import { itemKey } from '../lib/export.js'

export default function RoadmapView({ title, module, tracked, onOpenCourse }) {
  const courses = [...module.mainTopics]
    .filter((t) => t.title !== 'Roadmap')
    .sort((a, b) => (a.index ?? 0) - (b.index ?? 0))

  let totalItems = 0
  let totalDone = 0
  courses.forEach((main) =>
    main.subtopics.forEach((sub) =>
      sub.items.forEach((item) => {
        totalItems++
        if (tracked?.[itemKey(main.title, sub.title, item)] === 'done') totalDone++
      })
    )
  )
  const pct = totalItems ? Math.round((totalDone / totalItems) * 100) : 0

  return (
    <div className="roadmap">
      <span className="badge">Goal roadmap</span>
      <h2 className="roadmap-title">{title}</h2>
      <p className="roadmap-sub">
        {courses.length} courses to reach your goal{totalItems > 0 ? ` · ${totalDone}/${totalItems} lessons done (${pct}%)` : ''}
      </p>

      {totalItems > 0 && (
        <div className="progress-wrap">
          <div className="progress-bar"><div className="progress-fill" style={{ width: `${pct}%` }} /></div>
        </div>
      )}

      <div className="roadmap-cards">
        {courses.map((main, i) => {
          const subCount = main.subtopics.length
          const itemCount = main.subtopics.reduce((a, s) => a + s.items.length, 0)
          const doneCount = main.subtopics.reduce(
            (a, s) => a + s.items.filter((item) => tracked?.[itemKey(main.title, s.title, item)] === 'done').length,
            0
          )
          const startedCount = main.subtopics.reduce(
            (a, s) => a + s.items.filter((item) => tracked?.[itemKey(main.title, s.title, item)] === 'in-progress').length,
            0
          )
          const cardPct = itemCount ? Math.round((doneCount / itemCount) * 100) : 0
          return (
            <div className={`roadmap-card${main.error ? ' has-error' : ''}`} key={main.title}>
              <div className="roadmap-card-head">
                <span className="roadmap-num">{i + 1}</span>
                <div className="roadmap-card-title">{main.title}</div>
              </div>
              <div className="roadmap-card-meta">
                {subCount} subtopics · {itemCount} lessons
                {startedCount ? ` · ${startedCount} in progress` : ''}
              </div>
              {itemCount > 0 && (
                <div className="progress-wrap">
                  <div className="progress-bar"><div className="progress-fill" style={{ width: `${cardPct}%` }} /></div>
                  <span className="progress-text">{doneCount}/{itemCount} done</span>
                </div>
              )}
              {main.error && <p className="hint fetch-error">{main.error}</p>}
              <button className="btn primary" disabled={itemCount === 0} onClick={() => onOpenCourse(main)}>
                {itemCount === 0 ? 'Not expanded yet' : 'Open course'}
              </button>
            </div>
          )
        })}
      </div>
    </div>
  )
}
