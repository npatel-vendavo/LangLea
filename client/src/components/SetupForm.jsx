import { useState } from 'react'
import ModelSelector from './ModelSelector.jsx'
import SettingsModal from './SettingsModal.jsx'

export default function SetupForm({ profiles, selection, onProfilesChange, onSelectionChange, onStart }) {
  const [topic, setTopic] = useState('')
  const [showSettings, setShowSettings] = useState(false)

  const submit = (e) => {
    e.preventDefault()
    if (!topic.trim()) return
    onStart(topic.trim())
  }

  return (
    <form className="setup-card" onSubmit={submit}>
      <div className="brand">
        <span className="logo">🧠</span>
        <div>
          <h1>Learning Agent</h1>
          <p>Tell me what you want to learn — I'll research it into a complete, structured learning module.</p>
        </div>
      </div>

      <label className="field">
        <span className="field-label">What do you want to learn?</span>
        <input
          autoFocus
          value={topic}
          onChange={(e) => setTopic(e.target.value)}
          placeholder="e.g. Machine learning, Photography, Investing, Guitar..."
        />
      </label>

      <div className="field">
        <span className="field-label">Generate with</span>
        <ModelSelector profiles={profiles} selection={selection} onSelectionChange={onSelectionChange} />
        <p className="hint">Any OpenAI-compatible endpoint ({'{baseUrl}'}/chat/completions) works.</p>
      </div>

      <button className="btn primary" disabled={!topic.trim()} type="submit">
        Build my learning module
      </button>

      <button className="btn ghost" type="button" onClick={() => setShowSettings(true)}>
        Manage AI endpoints
      </button>

      {showSettings && (
        <SettingsModal
          profiles={profiles}
          onProfilesChange={onProfilesChange}
          onClose={() => setShowSettings(false)}
        />
      )}
    </form>
  )
}
