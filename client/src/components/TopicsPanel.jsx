import { useState } from 'react'
import { itemKey } from '../lib/export.js'

export default function TopicsPanel({ module, notes, selectedKey, onSelect, warnings, canRetry, onRetryFailed, resuming, onGenerateAll, generatingAll }) {
  const mainTopics = [...module.mainTopics].sort((a, b) => (a.index ?? 0) - (b.index ?? 0))
  const [expandedMain, setExpandedMain] = useState(() => new Set(mainTopics.map((t) => t.title)))
  const [expandedSub, setExpandedSub] = useState(() => new Set())

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
  const totalItems = mainTopics.reduce((acc, t) => acc + t.subtopics.reduce((a, s) => a + s.items.length, 0), 0)
  const generatedCount = Object.keys(notes).length

  return (
    <div className="topics">
      <div className="panel-head">
        <span className="badge">Your module</span>
        <h3 className="panel-title">{module.subject}</h3>
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
      </div>

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
                {main.error && <div className="topic-error">{main.error}</div>}
                {main.subtopics.map((sub, si) => (
                  <div key={sub.title}>
                    <button className={`tree-sub ${expandedSub.has(sub.title) ? 'open' : ''}`} onClick={() => toggleSub(sub.title)}>
                      <span className="chevron">{expandedSub.has(sub.title) ? '▾' : '▸'}</span>
                      <span className="tree-label">{sub.title}</span>
                      <span className="count">{sub.items.length}</span>
                    </button>
                    {expandedSub.has(sub.title) && (
                      <ul className="tree-items">
                        {sub.items.map((item) => {
                          const key = itemKey(main.title, sub.title, item)
                          return (
                            <li key={key}>
                              <button className={`tree-item ${key === selectedKey ? 'active' : ''}`} onClick={() => onSelect(main, sub, item)}>
                                {notes[key] ? <span className="tree-check">✓</span> : <span className="tree-bullet">◦</span>}
                                <span className="tree-label">{item}</span>
                              </button>
                            </li>
                          )
                        })}
                      </ul>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  )
}
