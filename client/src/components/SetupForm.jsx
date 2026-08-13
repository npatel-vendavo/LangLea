import { useState } from 'react'
import ModelSelector from './ModelSelector.jsx'
import SettingsModal from './SettingsModal.jsx'

export default function SetupForm({ profiles, selection, onProfilesChange, onSelectionChange, onStart }) {
  const [topic, setTopic] = useState('')
  const [mode, setMode] = useState('module')
  const [showSettings, setShowSettings] = useState(false)

  const isRoadmap = mode === 'roadmap'

  const submit = (e) => {
    e.preventDefault()
    if (!topic.trim()) return
    onStart(topic.trim(), mode)
  }

  return (
    <form className="setup-card" onSubmit={submit}>
      <div className="brand">
        <span className="logo">🧠</span>
        <div>
          <h1>Learning Agent</h1>
          <p>{isRoadmap ? 'Tell me your goal — I\'ll design the full roadmap of courses to get you there.' : 'Tell me what you want to learn — I\'ll research it into a complete, structured learning module.'}</p>
        </div>
      </div>

      <div className="field">
        <span className="field-label">What are you building?</span>
        <div className="mode-toggle">
          <button type="button" className={`mode-btn ${!isRoadmap ? 'active' : ''}`} onClick={() => setMode('module')}>
            Learning module
          </button>
          <button type="button" className={`mode-btn ${isRoadmap ? 'active' : ''}`} onClick={() => setMode('roadmap')}>
            Goal roadmap
          </button>
        </div>
      </div>

      <label className="field">
        <span className="field-label">{isRoadmap ? 'What is your goal?' : 'What do you want to learn?'}</span>
        <input
          autoFocus
          value={topic}
          onChange={(e) => setTopic(e.target.value)}
          placeholder={isRoadmap ? 'e.g. Become a frontend engineer, Get into data science, Build and launch a SaaS...' : 'e.g. Machine learning, Photography, Investing, Guitar...'}
        />
      </label>

      <div className="field">
        <span className="field-label">Generate with</span>
        <ModelSelector profiles={profiles} selection={selection} onSelectionChange={onSelectionChange} />
        <p className="hint">Any OpenAI-compatible endpoint ({'{baseUrl}'}/chat/completions) works.</p>
      </div>

      <button className="btn primary" disabled={!topic.trim()} type="submit">
        {isRoadmap ? 'Build my roadmap' : 'Build my learning module'}
      </button>

      <button className="btn ghost" type="button" onClick={() => setShowSettings(true)}>
        Manage AI endpoints
      </button>

      {showSettings && (
        <SettingsModal
          profiles={profiles}
          selection={selection}
          onSelectionChange={onSelectionChange}
          onProfilesChange={onProfilesChange}
          onClose={() => setShowSettings(false)}
        />
      )}
    </form>
  )
}
