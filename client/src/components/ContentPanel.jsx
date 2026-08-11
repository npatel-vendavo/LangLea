export default function ContentPanel({ subject, selected, note, loading, error, onGenerate, noteCount }) {
  return (
    <div className="content">
      {!selected ? (
        <div className="content-empty">
          <span className="badge">Your learning module</span>
          <h2>{subject}</h2>
          <p>Select a topic item from the left panel to load its content here.</p>
        </div>
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

          {note && (
            <div className="note">
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
