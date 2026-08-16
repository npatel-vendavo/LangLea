import { useEffect, useState } from 'react'
import { loadModules, countItems, removeModule } from '../lib/modules.js'
import { moduleToMarkdown } from '../lib/export.js'
import { getDueReviews } from '../lib/spaced.js'
import ReviewModal from './ReviewModal.jsx'

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

const PRESET_TOPICS = [
  'React 19 & Next.js App Router',
  'Python Data Science & Machine Learning',
  'System Design & Microservices',
  'Personal Finance & Investing',
  'Quantum Computing Basics',
  'UI/UX Design Systems'
]

export default function Dashboard({ currentSubject, onOpen, onCreate, onHistory, onSettings, onLogs, onStartTopic, onAnalytics }) {
  const [items, setItems] = useState([])
  const [loaded, setLoaded] = useState(false)
  const [search, setSearch] = useState('')
  const [filterMode, setFilterMode] = useState('all') // 'all' | 'module' | 'roadmap'
  const [reviewCard, setReviewCard] = useState(null)
  const [dueReviews, setDueReviews] = useState(() => getDueReviews())

  const refreshDue = () => setDueReviews(getDueReviews())

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

  // Aggregate stats across all saved modules
  const totalSaved = items.length
  const totalNotes = items.reduce((acc, m) => acc + (m.notesCount ?? Object.keys(m.notes || {}).length), 0)
  const totalItems = items.reduce((acc, m) => acc + (m.items ?? countItems(m.module)), 0)

  // Filter items by search & category filter
  const filteredItems = items.filter((m) => {
    const matchesSearch = !search || m.subject.toLowerCase().includes(search.toLowerCase())
    const isRoadmap = m.mode === 'roadmap' || m.module?.mode === 'roadmap'
    const matchesFilter = filterMode === 'all' || (filterMode === 'roadmap' ? isRoadmap : !isRoadmap)
    return matchesSearch && matchesFilter
  })

  return (
    <div className="dashboard">
      <header className="dash-head">
        <div className="dash-title">
          <h1>Learning Agent</h1>
          <p>Your AI-powered knowledge hub. Explore existing modules or craft a new course.</p>
        </div>
        <div className="dash-actions">
          <button className="btn" onClick={onAnalytics} title="View Learning Analytics">📊 Analytics</button>
          <button className="btn" onClick={onSettings} title="Manage AI Models & Endpoints">⚙ Settings</button>
          <button className="btn" onClick={onLogs} title="Inspect AI Request Logs">📋 Logs</button>
          <button className="btn" onClick={onHistory} title="View Conversation History">💬 History</button>
          <button className="btn primary" onClick={onCreate}>+ New Topic</button>
        </div>
      </header>

      {/* Hero Stats Banner */}
      <div className="dash-stats">
        <div className="stat-card">
          <div className="stat-icon">📚</div>
          <div>
            <div className="stat-val">{totalSaved}</div>
            <div className="stat-lbl">Saved Courses</div>
          </div>
        </div>
        <div className="stat-card">
          <div className="stat-icon">📝</div>
          <div>
            <div className="stat-val">{totalNotes}</div>
            <div className="stat-lbl">Study Notes Generated</div>
          </div>
        </div>
        <div className="stat-card">
          <div className="stat-icon">🎯</div>
          <div>
            <div className="stat-val">{totalItems}</div>
            <div className="stat-lbl">Learning Lessons</div>
          </div>
        </div>
      </div>

      {/* Due for Review (spaced repetition) */}
      {dueReviews.length > 0 && (
        <div className="dash-due">
          <div className="dash-due-head">
            <div>
              <h3>Due for Review Today</h3>
              <p>Spaced repetition picks these up so they stick. Quick 1-minute reviews.</p>
            </div>
            <span className="dash-due-count">{dueReviews.length}</span>
          </div>
          <div className="dash-due-list">
            {dueReviews.map((card) => (
              <button key={card.key} className="dash-due-item" onClick={() => setReviewCard(card)}>
                <span className="dash-due-icon">🔁</span>
                <span className="dash-due-text">
                  <span className="dash-due-title">{card.item}</span>
                  <span className="dash-due-meta">{card.subject} · {card.mainTitle} › {card.subTitle}</span>
                </span>
                <span className="btn tiny">Review</span>
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Filter and Search Controls */}
      <div className="dash-controls">
        <div className="filter-pills">
          <button className={`filter-pill ${filterMode === 'all' ? 'active' : ''}`} onClick={() => setFilterMode('all')}>All ({items.length})</button>
          <button className={`filter-pill ${filterMode === 'module' ? 'active' : ''}`} onClick={() => setFilterMode('module')}>Modules</button>
          <button className={`filter-pill ${filterMode === 'roadmap' ? 'active' : ''}`} onClick={() => setFilterMode('roadmap')}>Goal Roadmaps</button>
        </div>
        <input
          className="search-input"
          type="text"
          placeholder="🔍 Search topics..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
      </div>

      {loaded && filteredItems.length === 0 ? (
        <div className="dash-empty">
          <div className="logo">🧠</div>
          <h2>{items.length === 0 ? 'No modules yet' : 'No matching modules'}</h2>
          <p>
            {items.length === 0
              ? 'Generate your first AI learning module or goal roadmap to build your personal knowledge base.'
              : `No saved module matched "${search}". Try clearing the search filter.`}
          </p>
          <button className="btn primary" onClick={onCreate}>Create your first module</button>

          {items.length === 0 && (
            <div style={{ marginTop: '24px', width: '100%' }}>
              <span className="field-label" style={{ display: 'block', marginBottom: '10px' }}>Or pick a popular topic to get started:</span>
              <div className="topic-starters" style={{ justifyContent: 'center' }}>
                {PRESET_TOPICS.map((t) => (
                  <button key={t} className="topic-chip" onClick={() => onStartTopic ? onStartTopic(t) : onCreate()}>{t}</button>
                ))}
              </div>
            </div>
          )}
        </div>
      ) : (
        <div className="dash-grid">
          {filteredItems.map((m) => {
            const itemCount = m.items ?? countItems(m.module)
            const noteCount = m.notesCount ?? Object.keys(m.notes || {}).length
            const isRoadmap = m.mode === 'roadmap' || m.module?.mode === 'roadmap'
            const formattedDate = m.savedAt ? new Date(m.savedAt).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' }) : 'Saved'

            return (
              <div className="dash-card" key={m.subject}>
                <div className="dash-card-main" onClick={() => onOpen(m)}>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '8px', width: '100%' }}>
                    <div style={{ display: 'flex', gap: '6px', alignItems: 'center' }}>
                      {isRoadmap ? (
                        <span className="current-tag roadmap-tag">Roadmap</span>
                      ) : (
                        <span className="current-tag" style={{ color: 'var(--accent)', borderColor: 'var(--accent)', background: 'rgba(99,102,241,0.1)' }}>Module</span>
                      )}
                    </div>
                    {m.subject === currentSubject && <span className="current-tag" style={{ color: 'var(--green)', borderColor: 'var(--green)', background: 'rgba(16,185,129,0.1)' }}>Active</span>}
                  </div>

                  <h3 className="dash-card-title">{m.subject}</h3>

                  <div className="dash-card-stats-row">
                    <span>📖 {itemCount} lessons</span>
                    <span>•</span>
                    <span>✏️ {noteCount} notes</span>
                    <span>•</span>
                    <span>📅 {formattedDate}</span>
                  </div>
                </div>

                <div className="dash-card-actions">
                  <button className="btn tiny primary" onClick={() => onOpen(m)}>Open Course →</button>
                  <div style={{ display: 'flex', gap: '6px' }}>
                    <button className="btn tiny" onClick={(e) => { e.stopPropagation(); downloadMarkdown(m); }} title="Download as Markdown file">📥 .md</button>
                    <button className="btn tiny danger" onClick={(e) => { e.stopPropagation(); handleDelete(m); }} title="Delete module">Delete</button>
                  </div>
                </div>
              </div>
            )
          })}
        </div>
      )}

      {reviewCard && (
        <ReviewModal
          card={reviewCard}
          onClose={() => setReviewCard(null)}
          onUpdated={refreshDue}
        />
      )}
    </div>
  )
}
