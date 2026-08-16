import { useEffect, useRef, useState } from 'react'
import ModelSelector from './ModelSelector.jsx'
import { PERSONAS } from '../lib/personas.js'

export default function ChatPanel({ session, subject, profiles, chatSelection, onChatSelectionChange, onSend, busy, error, onNewChat, persona, onPersonaChange, prefilledText }) {
  const [input, setInput] = useState('')
  const listRef = useRef(null)

  useEffect(() => {
    if (prefilledText) {
      setInput((cur) => (cur ? cur : prefilledText))
    }
  }, [prefilledText])

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

      <div className="chat-selector">
        <span className="field-label">Chat with</span>
        <ModelSelector
          profiles={profiles}
          selection={chatSelection}
          onSelectionChange={onChatSelectionChange}
          compact
        />
      </div>

      <div className="chat-selector persona-row">
        <span className="field-label">Persona</span>
        <select
          className="persona-select"
          value={persona}
          onChange={(e) => onPersonaChange(e.target.value)}
          title="Teaching persona"
        >
          {Object.entries(PERSONAS).map(([key, p]) => (
            <option key={key} value={key}>{p.icon} {p.label}</option>
          ))}
        </select>
      </div>
      <p className="persona-desc">{PERSONAS[persona]?.desc}</p>

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
