import { useEffect, useState } from 'react'
import { itemKey } from '../lib/export.js'

function InlineAdd({ placeholder, onAdd, onCancel, small }) {
  const [value, setValue] = useState('')
  const submit = () => {
    if (value.trim()) onAdd(value.trim())
    setValue('')
  }
  return (
    <div className={`inline-add${small ? ' small' : ''}`}>
      <input
        autoFocus
        value={value}
        onChange={(e) => setValue(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter') submit()
          if (e.key === 'Escape') onCancel()
        }}
        placeholder={placeholder}
      />
      <button className="btn tiny primary" onClick={submit}>Add</button>
      <button className="btn tiny" onClick={onCancel}>Cancel</button>
    </div>
  )
}

function StatusButton({ status, onClick }) {
  const glyph = status === 'done' ? '●' : status === 'in-progress' ? '◐' : '○'
  const label = status === 'done' ? 'Mark as not started' : status === 'in-progress' ? 'Mark as done' : 'Mark as in progress'
  return (
    <button className={`status-btn ${status}`} onClick={(e) => { e.stopPropagation(); onClick() }} title={label}>
      {glyph}
    </button>
  )
}

export default function TopicsPanel({
  module, notes, tracked, selectedKey, onSelect, warnings, canRetry, onRetryFailed, resuming,
  onGenerateAll, generatingAll,
  onAddMainTopic, onAddSubtopic, onAddItem, onExpandMain, onExpandSub, expandBusy, expandErrors, onCycleStatus,
  reveal
}) {
  const mainTopics = [...module.mainTopics].sort((a, b) => (a.index ?? 0) - (b.index ?? 0))
  const lessonTopics = mainTopics.filter((t) => t.title !== 'Roadmap')
  const [expandedMain, setExpandedMain] = useState(() => new Set(mainTopics.map((t) => t.title)))
  const [expandedSub, setExpandedSub] = useState(() => new Set())
  const [addingMain, setAddingMain] = useState(false)
  const [addingSub, setAddingSub] = useState(null)
  const [addingItem, setAddingItem] = useState(null)

  useEffect(() => {
    if (!reveal) return
    setExpandedMain((s) => { const n = new Set(s); n.add(reveal.main); return n })
    setExpandedSub((s) => { const n = new Set(s); n.add(reveal.sub); return n })
    let el = null
    try { el = document.querySelector(`[data-itemkey="${reveal.key}"]`) } catch { /* ignore */ }
    if (el) el.scrollIntoView({ behavior: 'smooth', block: 'center' })
  }, [reveal])

  const toggleMain = (title) => setExpandedMain((s) => {
    const next = new Set(s)
    if (next.has(title)) next.delete(title)
    else next.add(title)
    return next
  })

  const toggleSub = (title) => setExpandedSub((s) => {
    const next = new Set(s)
    if (next.has(title)) next.delete(title)
    else next.add(title)
    return next
  })

  const failed = module.mainTopics.filter((t) => t.error && t.subtopics.length === 0)
  const totalItems = lessonTopics.reduce((acc, t) => acc + t.subtopics.reduce((a, s) => a + s.items.length, 0), 0)
  const generatedCount = Object.keys(notes).length
  const doneCount = lessonTopics.reduce((acc, t) => acc + t.subtopics.reduce((a, s) => a + s.items.filter((i) => tracked?.[itemKey(t.title, s.title, i)] === 'done').length, 0), 0)
  const startedCount = lessonTopics.reduce((acc, t) => acc + t.subtopics.reduce((a, s) => a + s.items.filter((i) => tracked?.[itemKey(t.title, s.title, i)] === 'in-progress').length, 0), 0)
  const pct = totalItems ? Math.round((doneCount / totalItems) * 100) : 0

  return (
    <div className="topics">
      <div className="panel-head">
        <span className="badge">{module.mode === 'roadmap' ? 'Learning roadmap' : 'Your module'}</span>
        <h3 className="panel-title">{module.subject}</h3>
        {totalItems > 0 && (
          <div className="progress-wrap">
            <div className="progress-bar"><div className="progress-fill" style={{ width: `${pct}%` }} /></div>
            <span className="progress-text">{doneCount}/{totalItems} done{startedCount ? ` · ${startedCount} in progress` : ''}</span>
          </div>
        )}
      </div>

      {warnings.length > 0 && failed.length > 0 && (
        <div className="warnings">
          <p>⚠ {failed.length} section{failed.length > 1 ? 's' : ''} failed to expand</p>
          {canRetry && (
            <button className="btn tiny" onClick={onRetryFailed} disabled={resuming}>
              {resuming ? 'Retrying…' : 'Retry failed sections'}
            </button>
          )}
        </div>
      )}

      <div className="topic-actions">
        <button className="btn tiny" onClick={onGenerateAll} disabled={generatingAll || (totalItems > 0 && generatedCount >= totalItems)}>
          {generatingAll
            ? `Generating notes… ${generatedCount}/${totalItems}`
            : totalItems > 0 && generatedCount >= totalItems
              ? 'All notes generated ✓'
              : `Generate all notes (${totalItems})`}
        </button>
        <button className="btn tiny" onClick={() => setAddingMain((s) => !s)}>+ Topic</button>
      </div>

      {addingMain && (
        <InlineAdd
          placeholder="New main topic / course title"
          onAdd={onAddMainTopic}
          onCancel={() => setAddingMain(false)}
        />
      )}

      <div className="tree">
        {mainTopics.map((main, mi) => (
          <div className="tree-main" key={main.title}>
            <button className={`tree-head ${expandedMain.has(main.title) ? 'open' : ''}`} onClick={() => toggleMain(main.title)}>
              <span className="chevron">{expandedMain.has(main.title) ? '▾' : '▸'}</span>
              <span className="tree-num">{mi + 1}</span>
              <span className="tree-label">{main.title}</span>
              {main.error && <span className="tree-fail">⚠</span>}
              <span className="count">{main.subtopics.length}</span>
            </button>

            {expandedMain.has(main.title) && (
              <div className="tree-subs">
                <div className="tree-actions">
                  <button className="btn tiny" onClick={() => setAddingSub(addingSub === main.title ? null : main.title)}>+ Subtopic</button>
                  <button className="btn tiny" onClick={() => onExpandMain(main)} disabled={expandBusy[main.title]}>
                    {expandBusy[main.title] ? 'Expanding…' : 'Expand with AI'}
                  </button>
                </div>
                {expandErrors[main.title] && <p className="hint fetch-error">{expandErrors[main.title]}</p>}

                {addingSub === main.title && (
                  <InlineAdd small placeholder="New subtopic title" onAdd={(t) => { onAddSubtopic(main.title, t); setAddingSub(null) }} onCancel={() => setAddingSub(null)} />
                )}

                {main.error && <div className="topic-error">{main.error}</div>}
                {main.subtopics.map((sub, si) => {
                  const subKey = `${main.title}::${sub.title}`
                  return (
                    <div key={sub.title}>
                      <button className={`tree-sub ${expandedSub.has(sub.title) ? 'open' : ''}`} onClick={() => toggleSub(sub.title)}>
                        <span className="chevron">{expandedSub.has(sub.title) ? '▾' : '▸'}</span>
                        <span className="tree-label">{sub.title}</span>
                        <span className="count">{sub.items.length}</span>
                      </button>
                      {expandedSub.has(sub.title) && (
                        <div className="tree-sub-body">
                          <div className="tree-actions">
                            <button className="btn tiny" onClick={() => setAddingItem(addingItem === subKey ? null : subKey)}>+ Item</button>
                            <button className="btn tiny" onClick={() => onExpandSub(main.title, sub)} disabled={expandBusy[subKey]}>
                              {expandBusy[subKey] ? 'Expanding…' : 'Expand with AI'}
                            </button>
                          </div>
                          {expandErrors[subKey] && <p className="hint fetch-error">{expandErrors[subKey]}</p>}
                          {addingItem === subKey && (
                            <InlineAdd small placeholder="New item / lesson title" onAdd={(t) => { onAddItem(main.title, sub.title, t); setAddingItem(null) }} onCancel={() => setAddingItem(null)} />
                          )}
                          <ul className="tree-items">
                            {sub.items.map((item) => {
                              const key = itemKey(main.title, sub.title, item)
                              const status = tracked?.[key] || 'todo'
                              return (
                                <li key={key} className="tree-item-row" data-itemkey={key}>
                                  <StatusButton status={status} onClick={() => onCycleStatus(key)} />
                                  <button className={`tree-item ${key === selectedKey ? 'active' : ''}`} onClick={() => onSelect(main, sub, item)}>
                                    {notes[key] ? <span className="tree-check">✓</span> : <span className="tree-bullet">◦</span>}
                                    <span className="tree-label">{item}</span>
                                  </button>
                                </li>
                              )
                            })}
                          </ul>
                        </div>
                      )}
                    </div>
                  )
                })}
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  )
}
