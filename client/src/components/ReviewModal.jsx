import { useState } from 'react'
import { updateReview } from '../lib/spaced.js'

const QUALITY = [
  { q: 0, label: 'Again', hint: 'Complete blackout — forget it' },
  { q: 1, label: 'Hard', hint: 'Could not recall it' },
  { q: 3, label: 'Good', hint: 'Recalled with effort' },
  { q: 4, label: 'Easy', hint: 'Recalled immediately' },
  { q: 5, label: 'Too easy', hint: 'Boringly simple' }
]

function formatNext(ms) {
  const d = new Date(ms)
  const today = new Date()
  today.setHours(0, 0, 0, 0)
  d.setHours(0, 0, 0, 0)
  const days = Math.round((d - today) / 86400000)
  if (days <= 0) return 'today'
  if (days === 1) return 'tomorrow'
  return `in ${days} days`
}

export default function ReviewModal({ card, onClose, onUpdated }) {
  const [result, setResult] = useState(null)

  const answer = (q) => {
    const next = updateReview({ mainTitle: card.mainTitle, subTitle: card.subTitle, item: card.item }, q)
    setResult(next)
    onUpdated?.(next)
  }

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal review-modal" onClick={(e) => e.stopPropagation()}>
        <div className="modal-head">
          <h3>Spaced repetition review</h3>
          <button className="btn tiny" onClick={onClose}>Close</button>
        </div>
        <div className="modal-body">
          {!result ? (
            <>
              <p className="hint">{card.subject} · {card.mainTitle} › {card.subTitle}</p>
              <div className="review-prompt">{card.item}</div>
              <p className="hint">How well did you remember this lesson?</p>
              <div className="review-quality">
                {QUALITY.map((q) => (
                  <button key={q.q} className="btn" onClick={() => answer(q.q)}>
                    {q.label}
                    <span className="review-q-hint">{q.hint}</span>
                  </button>
                ))}
              </div>
            </>
          ) : (
            <div className="review-result">
              <p>Reviewed. Next review: <strong>{formatNext(result.nextReview)}</strong> (interval {result.interval}d, ease {result.ease}).</p>
              <div className="modal-actions">
                <button className="btn primary" onClick={onClose}>Done</button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
