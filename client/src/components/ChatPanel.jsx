import { useEffect, useRef, useState } from 'react'

export default function ChatPanel({ session, subject, onSend, busy, error, onNewChat }) {
  const [input, setInput] = useState('')
  const listRef = useRef(null)

  useEffect(() => {
    if (listRef.current) listRef.current.scrollTop = listRef.current.scrollHeight
  }, [session?.messages.length, busy])

  const submit = (e) => {
    if (e) e.preventDefault()
    const text = input.trim()
    if (!text || busy) return
    setInput('')
    onSend(text)
  }

  return (
    <div className="chat">
      <div className="panel-head chat-head">
        <div>
          <span className="badge">Ask AI</span>
          <h3 className="panel-title">Chat</h3>
        </div>
        <button className="btn tiny" onClick={onNewChat} title="Start a fresh chat for this subject">New chat</button>
      </div>

      <div className="chat-msgs" ref={listRef}>
        {(!session || session.messages.length === 0) && (
          <p className="chat-empty">
            Ask follow-up questions about {subject || 'your topic'}. Your module and the item you're viewing are used as context.
          </p>
        )}
        {session?.messages.map((m, i) => (
          <div key={i} className={`chat-msg ${m.role}`}>
            <div className="bubble">{m.content}</div>
            {m.createdAt && <span className="time">{new Date(m.createdAt).toLocaleTimeString()}</span>}
          </div>
        ))}
        {busy && <div className="chat-msg assistant"><div className="bubble typing">Thinking…</div></div>}
      </div>

      {error && <div className="chat-error">{error}</div>}

      <form className="chat-form" onSubmit={submit}>
        <textarea
          rows={2}
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder="Ask anything about this topic…"
          onKeyDown={(e) => {
            if (e.key === 'Enter' && !e.shiftKey) {
              e.preventDefault()
              submit()
            }
          }}
        />
        <button className="btn primary" disabled={!input.trim() || busy}>Send</button>
      </form>
    </div>
  )
}
