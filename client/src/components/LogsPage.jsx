import { useEffect, useState } from 'react'

function statusOf(meta) {
  if (meta.kind === 'json' && meta.parsed === false) return 'parse-fail'
  if (meta.success) return 'ok'
  return 'fail'
}

function badge(meta) {
  const st = statusOf(meta)
  const label =
    st === 'parse-fail' ? 'unparseable'
    : st === 'ok' ? (meta.kind === 'json' ? 'ok' : 'ok')
    : 'failed'
  return <span className={`log-badge ${st}`}>{label}</span>
}

export default function LogsPage({ onClose }) {
  const [logs, setLogs] = useState([])
  const [loaded, setLoaded] = useState(false)
  const [failuresOnly, setFailuresOnly] = useState(false)
  const [selectedId, setSelectedId] = useState(null)
  const [detail, setDetail] = useState(null)
  const [detailLoading, setDetailLoading] = useState(false)

  useEffect(() => {
    let cancelled = false
    fetch('/api/logs')
      .then((r) => r.json())
      .then((data) => {
        if (!cancelled) setLogs(data.logs || [])
      })
      .catch(() => {})
      .finally(() => {
        if (!cancelled) setLoaded(true)
      })
    return () => { cancelled = true }
  }, [])

  const openDetail = async (id) => {
    setSelectedId(id)
    setDetail(null)
    setDetailLoading(true)
    try {
      const res = await fetch(`/api/logs/${id}`)
      const data = await res.json()
      setDetail(data)
    } catch (e) {
      setDetail({ error: e.message })
    } finally {
      setDetailLoading(false)
    }
  }

  const visible = failuresOnly ? logs.filter((l) => statusOf(l) !== 'ok') : logs

  return (
    <div className="logs-page">
      <header className="logs-head">
        <div>
          <h2>AI interaction logs</h2>
          <p className="hint">Every request the server sent to an AI endpoint, including the query, the answer, and whether it could be parsed.</p>
        </div>
        <div className="logs-actions">
          <label className="logs-toggle">
            <input type="checkbox" checked={failuresOnly} onChange={(e) => setFailuresOnly(e.target.checked)} />
            Failures only
          </label>
          <button className="btn" onClick={onClose}>Close</button>
        </div>
      </header>

      <div className="logs-layout">
        <aside className="logs-list">
          {!loaded && <p className="chat-empty">Loading…</p>}
          {loaded && visible.length === 0 && (
            <p className="chat-empty">{failuresOnly ? 'No failed interactions.' : 'No interactions logged yet.'}</p>
          )}
          {visible.map((l) => (
            <button
              key={l.id}
              className={`log-row ${selectedId === l.id ? 'selected' : ''}`}
              onClick={() => openDetail(l.id)}
            >
              <div className="log-row-top">
                {badge(l)}
                <span className="log-model">{l.model || '?'}</span>
              </div>
              <div className="log-endpoint" title={l.baseUrl}>{l.baseUrl || '?'}</div>
              <div className="log-row-meta">
                {new Date(l.time).toLocaleString()} · {l.kind}
                {l.durationMs != null ? ` · ${l.durationMs}ms` : ''}
              </div>
              {l.error && <div className="log-row-err">{l.error}</div>}
            </button>
          ))}
        </aside>

        <section className="logs-detail">
          {!selectedId && <p className="chat-empty">Select a log entry to inspect the full request and response.</p>}

          {detailLoading && <p className="chat-empty">Loading…</p>}

          {detail && (
            <div className="log-detail">
              <div className="log-detail-meta">
                {badge(detail)}
                <span>{detail.baseUrl || '?'}</span>
                <span>· model: {detail.model || '?'}</span>
                <span>· {new Date(detail.time).toLocaleString()}</span>
                {detail.durationMs != null && <span>· {detail.durationMs}ms</span>}
                <span>· attempts: {detail.attempts?.length ?? 0}</span>
              </div>

              {detail.error && <div className="log-detail-error">{detail.error}</div>}

              {detail.parsed === false && (
                <div className="log-detail-warn">
                  The AI returned text that could not be parsed as JSON. It was retried automatically; if all attempts failed you may want to review the endpoint's output format below.
                </div>
              )}

              <h4 className="note-h">Query (messages sent)</h4>
              <pre className="log-json">{JSON.stringify(detail.messages, null, 2)}</pre>

              <h4 className="note-h">Output (answer received)</h4>
              {detail.output ? (
                <pre className="log-json">{detail.output}</pre>
              ) : (
                <p className="chat-empty">No output — the request failed.</p>
              )}

              {detail.attempts?.length > 0 && (
                <>
                  <h4 className="note-h">Attempts</h4>
                  <ul className="log-attempts">
                    {detail.attempts.map((a, i) => (
                      <li key={i} className={a.ok ? 'attempt-ok' : 'attempt-fail'}>
                        attempt {a.attempt} · status {a.status ?? '–'}
                        {a.ok ? ' · returned content' : ` · ${a.error}`}
                        {a.parseError ? ` · parse failed: ${a.parseError}` : ''}
                      </li>
                    ))}
                  </ul>
                </>
              )}

              <div className="log-detail-files">
                <span className="hint">Stored as JSON in <code>server/data/ai-logs/{detail.id}.json</code></span>
              </div>
            </div>
          )}
        </section>
      </div>
    </div>
  )
}
