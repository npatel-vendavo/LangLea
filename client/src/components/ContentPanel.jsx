import { useRef, useState } from 'react'
import ModelSelector from './ModelSelector.jsx'
import RoadmapView from './RoadmapView.jsx'

function NoteBody({ note }) {
  return (
    <>
      <p className="note-summary">{note.summary}</p>
      {note.keyPoints?.length > 0 && (
        <>
          <h4 className="note-h">Key points</h4>
          <ul className="note-keys">
            {note.keyPoints.map((k, i) => <li key={i}>{k}</li>)}
          </ul>
        </>
      )}
      {note.learnByDoing && (
        <p className="note-doing"><strong>Practice:</strong> {note.learnByDoing}</p>
      )}
      {note.resources?.length > 0 && (
        <p className="note-resources"><strong>Resources:</strong> {note.resources.join(' · ')}</p>
      )}
    </>
  )
}

function Annotations({ annotations }) {
  if (!annotations?.length) return null
  return (
    <div className="annotations">
      <h4 className="note-h">Ask-AI annotations</h4>
      {annotations.map((a, i) => (
        <div className="annotation" key={i}>
          <blockquote className="annotation-quote">“{a.quote}”</blockquote>
          <p className="annotation-answer">{a.answer}</p>
          <span className="annotation-time">{new Date(a.ts).toLocaleString()}</span>
        </div>
      ))}
    </div>
  )
}

function SelectableNote({ note, onAskSelection }) {
  const [selection, setSelection] = useState(null)
  const ref = useRef(null)

  const handleMouseUp = () => {
    const sel = window.getSelection && window.getSelection()
    if (!sel || sel.isCollapsed) { setSelection(null); return }
    const text = sel.toString().trim()
    if (!text) { setSelection(null); return }
    if (ref.current && ref.current.contains(sel.anchorNode)) {
      const rect = sel.getRangeAt(0).getBoundingClientRect()
      setSelection({ text, x: rect.left, y: rect.bottom })
    } else {
      setSelection(null)
    }
  }

  const ask = () => {
    if (selection) onAskSelection(selection.text)
    setSelection(null)
  }

  return (
    <div className="selectable-note" ref={ref} onMouseUp={handleMouseUp}>
      <NoteBody note={note} />
      {selection && (
        <div
          className="ask-ai-fab"
          style={{ left: `${selection.x}px`, top: `${selection.y + 6}px` }}
          onClick={ask}
        >
          Ask AI about this
        </div>
      )}
      <Annotations annotations={note.annotations} />
    </div>
  )
}

export default function ContentPanel({
  subject,
  selected,
  note,
  loading,
  error,
  onGenerate,
  noteCount,
  profiles,
  reviewSelection,
  onReviewSelectionChange,
  altNote,
  altLoading,
  altError,
  onGenerateAlternative,
  onAcceptAlternative,
  onDiscardAlternative,
  altLabel,
  roadmapEntry,
  module,
  tracked,
  onOpenCourse,
  onAskSelection
}) {
  return (
    <div className="content">
      {!selected ? (
        <div className="content-empty">
          <span className="badge">Your learning module</span>
          <h2>{subject}</h2>
          <p>Select a topic item from the left panel to load its content here.</p>
        </div>
      ) : roadmapEntry ? (
        <RoadmapView
          title={selected.item}
          module={module}
          tracked={tracked}
          onOpenCourse={onOpenCourse}
        />
      ) : (
        <div className="content-body">
          <nav className="breadcrumb">{selected.main.title} / {selected.sub.title}</nav>
          <h2 className="content-title">{selected.item}</h2>

          {loading && <div className="note loading">Generating study note…</div>}

          {!loading && error && (
            <div className="note error">
              <span>{error}</span>
              <button className="btn tiny" onClick={onGenerate}>Retry</button>
            </div>
          )}

          {!loading && !error && !note && (
            <div className="content-empty">
              <p>No study note yet for this item.</p>
              <button className="btn primary" onClick={onGenerate}>Generate study note</button>
            </div>
          )}

          {note && !loading && (
            <div className="note">
              <SelectableNote note={note} onAskSelection={onAskSelection} />
            </div>
          )}

          {note && (
            <div className="compare">
              <h4 className="note-h">Review with another endpoint</h4>
              <div className="compare-controls">
                <ModelSelector
                  profiles={profiles}
                  selection={reviewSelection}
                  onSelectionChange={onReviewSelectionChange}
                  compact
                />
                <button className="btn" onClick={onGenerateAlternative} disabled={altLoading}>
                  {altLoading ? 'Generating…' : altNote ? 'Regenerate alternative' : 'Generate alternative'}
                </button>
              </div>

              {altError && <div className="note error"><span>{altError}</span></div>}

              {altNote && (
                <div className="alt-note">
                  <div className="alt-head">Alternative from {altLabel}</div>
                  <div className="alt-body">
                    <NoteBody note={altNote} />
                  </div>
                  <div className="alt-actions">
                    <button className="btn primary" onClick={onAcceptAlternative}>Replace current note</button>
                    <button className="btn" onClick={onDiscardAlternative}>Discard</button>
                  </div>
                </div>
              )}
            </div>
          )}

          {noteCount > 0 && (
            <p className="content-foot">Study notes available: {noteCount}</p>
          )}
        </div>
      )}
    </div>
  )
}
