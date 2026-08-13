import { useEffect, useState } from 'react'
import { loadModules, countItems, removeModule } from '../lib/modules.js'
import { moduleToMarkdown } from '../lib/export.js'

function downloadMarkdown(m) {
  if (m.module) {
    const md = moduleToMarkdown(m.module, m.notes || {})
    const blob = new Blob([md], { type: 'text/markdown' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `${m.subject.toLowerCase().replace(/[^a-z0-9]+/g, '-')}-module.md`
    a.click()
    URL.revokeObjectURL(url)
    return
  }
  window.open(`/api/modules/${m.slug}/raw`, '_blank')
}

export default function Dashboard({ currentSubject, onOpen, onCreate, onHistory, onSettings, onLogs }) {
  const [items, setItems] = useState([])
  const [loaded, setLoaded] = useState(false)

  const handleDelete = async (m) => {
    const label = m.mode === 'roadmap' || m.module?.mode === 'roadmap' ? 'roadmap' : 'module'
    if (!window.confirm(`Delete this ${label} "${m.subject}"?\n\nThis permanently removes it and all of its study notes.`)) return
    removeModule(m.subject)
    if (m.slug) {
      try { await fetch(`/api/modules/${encodeURIComponent(m.slug)}`, { method: 'DELETE' }) } catch { /* server unavailable */ }
    }
    setItems((prev) => prev.filter((x) => x.subject !== m.subject))
  }

  useEffect(() => {
    let cancelled = false
    const local = loadModules().map((m) => ({ ...m, local: true }))
    fetch('/api/modules')
      .then((r) => r.json())
      .then((serverList) => {
        if (cancelled) return
        const bySubject = new Map()
        for (const e of [...(Array.isArray(serverList) ? serverList : []), ...local]) {
          bySubject.set(e.subject, e)
        }
        setItems([...bySubject.values()])
      })
      .catch(() => {
        if (!cancelled) setItems(local)
      })
      .finally(() => {
        if (!cancelled) setLoaded(true)
      })
    return () => { cancelled = true }
  }, [])

  return (
    <div className="dashboard">
      <header className="dash-head">
        <div className="dash-title">
          <h1>Learning Agent</h1>
          <p>Your saved learning modules. Pick a topic to continue, or create a new one.</p>
        </div>
        <div className="dash-actions">
          <button className="btn" onClick={onSettings}>Settings</button>
          <button className="btn" onClick={onLogs}>Logs</button>
          <button className="btn" onClick={onHistory}>Chat history</button>
          <button className="btn primary" onClick={onCreate}>+ New topic</button>
        </div>
      </header>

      {loaded && items.length === 0 ? (
        <div className="dash-empty">
          <h2>No modules yet</h2>
          <p>Generate your first learning module and it will be saved here so you can come back to it any time.</p>
          <button className="btn primary" onClick={onCreate}>Create your first module</button>
        </div>
      ) : (
        <div className="dash-grid">
          {items.map((m) => {
            const itemCount = m.items ?? countItems(m.module)
            const noteCount = m.notesCount ?? Object.keys(m.notes || {}).length
            return (
              <div className="dash-card" key={m.subject}>
                <button className="dash-card-main" onClick={() => onOpen(m)}>
                  <span className="dash-card-title">{m.subject}</span>
                  {(m.mode === 'roadmap' || m.module?.mode === 'roadmap') && <span className="current-tag roadmap-tag">roadmap</span>}
                  {m.subject === currentSubject && <span className="current-tag">current</span>}
                  <span className="dash-card-meta">
                    {new Date(m.savedAt).toLocaleString()} · {itemCount} items · {noteCount} study notes
                  </span>
                </button>
                <div className="dash-card-actions">
                  <button className="btn tiny" onClick={() => downloadMarkdown(m)}>Download .md</button>
                  <button className="btn tiny danger" onClick={() => handleDelete(m)}>Delete</button>
                </div>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
