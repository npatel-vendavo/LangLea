export default function GenerationProgress({ logs, progress }) {
  const pct = progress.total ? Math.round((progress.done / progress.total) * 100) : 0

  return (
    <div className="gen-card">
      <div className="gen-header">
        <span className="logo">🔎</span>
        <div>
          <h2>Researching your module…</h2>
          <p>{logs[logs.length - 1]?.message || 'Starting…'}</p>
        </div>
      </div>

      <div className="progress-track">
        <div className="progress-fill" style={{ width: `${pct}%` }} />
      </div>
      <div className="progress-meta">
        <span>Main topics expanded: {progress.done} / {progress.total}</span>
        <span>{pct}%</span>
      </div>

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
