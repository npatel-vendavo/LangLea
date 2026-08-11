import { useEffect, useState } from 'react'
import { loadHistory, loadSessionMessages } from '../lib/history.js'

export default function HistoryModal({ onClose }) {
  const [history, setHistory] = useState([])
  const [openId, setOpenId] = useState(null)

  useEffect(() => {
    setHistory(loadHistory())
  }, [])

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <div className="modal-head">
          <h3>Chat history</h3>
          <button className="btn tiny" onClick={onClose}>Close</button>
        </div>

        {history.length === 0 && (
          <p className="chat-empty">No chat history yet. Chat with the AI on the right panel to build history.</p>
        )}

        <ul className="history-list">
          {history.map((h) => (
            <li key={h.id}>
              <button className="history-entry" onClick={() => setOpenId(openId === h.id ? null : h.id)}>
                <span className="history-subject">{h.subject}</span>
                <span className="history-meta">{new Date(h.updatedAt).toLocaleString()} · {h.messageCount} msg</span>
              </button>
              {openId === h.id && <SessionMessages id={h.id} />}
            </li>
          ))}
        </ul>
      </div>
    </div>
  )
}

function SessionMessages({ id }) {
  const [messages, setMessages] = useState([])

  useEffect(() => {
    setMessages(loadSessionMessages(id))
  }, [id])

  if (messages.length === 0) return <p className="chat-empty">No messages in this session.</p>

  return (
    <div className="history-msgs">
      {messages.map((m, i) => (
        <div key={i} className={`chat-msg ${m.role}`}>
          <div className="bubble">{m.content}</div>
        </div>
      ))}
    </div>
  )
}
