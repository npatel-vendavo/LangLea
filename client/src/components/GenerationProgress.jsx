const STATUS_ICON = {
  done: '✓',
  working: '⟳',
  error: '⚠',
  pending: '○'
}

function SubtopicsList({ subtopics }) {
  return (
    <div className="gen-subs">
      {subtopics.map((sub) => (
        <div className="gen-sub" key={sub.title}>
          <span className="gen-sub-title">{sub.title}</span>
          {sub.items.length > 0 && (
            <span className="gen-sub-meta">{sub.items.length} item{sub.items.length > 1 ? 's' : ''}</span>
          )}
        </div>
      ))}
    </div>
  )
}

export default function GenerationProgress({ logs, progress, topics, module, mode }) {
  const pct = progress.total ? Math.round((progress.done / progress.total) * 100) : 0
  const isRoadmap = mode === 'roadmap'

  const lessonTopics = (module?.mainTopics || []).filter((t) => t.title !== 'Roadmap')
  const byTitle = new Map(lessonTopics.map((t) => [t.title, t]))

  const expected = topics && topics.length ? topics : lessonTopics.map((t) => t.title)

  const statusOf = (title) => {
    const t = byTitle.get(title)
    if (!t) return 'pending'
    if (t.error && t.subtopics.length === 0) return 'error'
    return t.subtopics.length > 0 ? 'done' : 'working'
  }

  const doneCount = expected.filter((t) => statusOf(t) === 'done').length

  return (
    <div className="gen-card">
      <div className="gen-header">
        <span className="logo">🔎</span>
        <div>
          <h2>{isRoadmap ? 'Building your roadmap…' : 'Researching your module…'}</h2>
          <p>{logs[logs.length - 1]?.message || 'Starting…'}</p>
        </div>
      </div>

      <div className="progress-track">
        <div className="progress-fill" style={{ width: `${pct}%` }} />
      </div>
      <div className="progress-meta">
        <span>{isRoadmap ? 'Courses created' : 'Main topics expanded'}: {doneCount} / {expected.length}</span>
        <span>{pct}%</span>
      </div>

      {expected.length > 0 && (
        <div className="gen-topics">
          <div className="gen-topics-head">
            <span>{isRoadmap ? 'Modules to create' : 'Main topics'}</span>
            <span className="gen-hint">live from the AI as each section is expanded</span>
          </div>
          {expected.map((title, i) => {
            const status = statusOf(title)
            const topic = byTitle.get(title)
            return (
              <div className={`gen-topic ${status}`} key={title}>
                <span className="gen-status">{STATUS_ICON[status]}</span>
                <span className="gen-num">{i + 1}</span>
                <span className="gen-topic-title">{title}</span>
                {status === 'error' && <span className="gen-topic-error" title={topic?.error}>failed</span>}
                {status === 'done' && topic?.subtopics.length > 0 && <SubtopicsList subtopics={topic.subtopics} />}
              </div>
            )
          })}
        </div>
      )}

      <ul className="gen-log">
        {logs.map((log, i) => (
          <li key={i}>
            <span className="log-dot">{log.type === 'topics' ? '📚' : '✓'}</span>
            {log.type === 'topics'
              ? `Mapped ${log.topics.length} main topics`
              : log.message}
          </li>
        ))}
      </ul>
    </div>
  )
}
