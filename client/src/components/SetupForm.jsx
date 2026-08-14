import { useState } from 'react'
import ModelSelector from './ModelSelector.jsx'
import SettingsModal from './SettingsModal.jsx'

const MODULE_SUGGESTIONS = [
  'Machine Learning & Neural Networks',
  'System Design & Microservices',
  'Quantum Computing Basics',
  'Personal Finance & Investing',
  'Rust Programming Language',
  'Data Structures & Algorithms'
]

const ROADMAP_SUGGESTIONS = [
  'Become a Frontend Engineer',
  'Full-Stack Web Developer (Node & React)',
  'Data Scientist & AI Specialist',
  'Cloud Solutions Architect (AWS/GCP)',
  'DevOps & Kubernetes Engineer'
]

const MANUAL_PLACEHOLDER = `# HTML and CSS
## HTML Basics
- What is HTML
- Common tags
## CSS Styling
- Selectors
- Flexbox
# JavaScript
## Core Concepts
- Variables
- Functions and scope`

export default function SetupForm({ profiles, selection, onProfilesChange, onSelectionChange, onStart, initialTopic = '' }) {
  const [topic, setTopic] = useState(initialTopic)
  const [mode, setMode] = useState('module')
  const [source, setSource] = useState('auto')
  const [manualText, setManualText] = useState('')
  const [parseError, setParseError] = useState('')
  const [parseIssues, setParseIssues] = useState([])
  const [validating, setValidating] = useState(false)
  const [showSettings, setShowSettings] = useState(false)

  const isRoadmap = mode === 'roadmap'
  const activeProfile = profiles.find((p) => p.id === selection?.profileId) || profiles[0]

  const submit = async (e) => {
    e.preventDefault()
    if (!topic.trim()) return
    setParseError('')
    setParseIssues([])
    if (source === 'auto') {
      onStart(topic.trim(), mode, 'auto')
      return
    }
    if (!manualText.trim()) {
      setParseError('Please paste your topics and subtopics, or switch back to Auto.')
      return
    }
    setValidating(true)
    try {
      const res = await fetch('/api/module/parse-topics', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text: manualText })
      })
      const data = await res.json()
      if (!res.ok || !data.ok) {
        setParseError(data.error || 'Could not parse your input')
        setParseIssues(data.issues || [])
        return
      }
      onStart(topic.trim(), mode, 'manual', data.topics)
    } catch (err) {
      setParseError(`Could not reach the server: ${err.message}`)
    } finally {
      setValidating(false)
    }
  }

  const handlePickPreset = (preset) => {
    setTopic(preset)
  }

  return (
    <form className="setup-card" onSubmit={submit}>
      <div className="brand">
        <span className="logo">🧠</span>
        <div>
          <h1>Create Learning Course</h1>
          <p>
            {isRoadmap
              ? 'Define your long-term goal — the AI will structure a complete sequence of learning modules.'
              : 'Specify any subject — the AI will research it into a comprehensive curriculum with deep-dive study notes.'}
          </p>
        </div>
      </div>

      <div className="field">
        <span className="field-label">Choose Learning Mode</span>
        <div className="mode-cards">
          <div
            className={`mode-card ${!isRoadmap ? 'active' : ''}`}
            onClick={() => setMode('module')}
          >
            <span className="mode-card-icon">📖</span>
            <div>
              <div className="mode-card-title">Learning Module</div>
              <div className="mode-card-sub">Deep dive into a single focused subject or skill</div>
            </div>
          </div>

          <div
            className={`mode-card ${isRoadmap ? 'active' : ''}`}
            onClick={() => setMode('roadmap')}
          >
            <span className="mode-card-icon">🚀</span>
            <div>
              <div className="mode-card-title">Goal Roadmap</div>
              <div className="mode-card-sub">Multi-course pathway to achieve a career or major skill goal</div>
            </div>
          </div>
        </div>
      </div>

      <div className="field">
        <span className="field-label">{isRoadmap ? 'What is your goal?' : 'What do you want to learn?'}</span>
        <input
          autoFocus
          value={topic}
          onChange={(e) => setTopic(e.target.value)}
          placeholder={
            isRoadmap
              ? 'e.g. Become a frontend engineer, Learn cloud architecture, Master data science...'
              : 'e.g. Machine learning, Guitar fundamentals, Photography, Personal finance...'
          }
        />
        
        {/* Clickable Preset Suggestions */}
        <div style={{ marginTop: '8px' }}>
          <span style={{ fontSize: '12px', color: 'var(--muted)', display: 'block', marginBottom: '6px' }}>
            💡 Quick Ideas:
          </span>
          <div className="topic-starters">
            {(isRoadmap ? ROADMAP_SUGGESTIONS : MODULE_SUGGESTIONS).map((s) => (
              <button
                type="button"
                key={s}
                className="topic-chip"
                onClick={() => handlePickPreset(s)}
              >
                {s}
              </button>
            ))}
          </div>
        </div>
      </div>

      <div className="field">
        <span className="field-label">How should the topics be created?</span>
        <div className="mode-toggle">
          <button type="button" className={`mode-btn ${source === 'auto' ? 'active' : ''}`} onClick={() => setSource('auto')}>
            ✨ Auto — AI designs it
          </button>
          <button type="button" className={`mode-btn ${source === 'manual' ? 'active' : ''}`} onClick={() => setSource('manual')}>
            📝 Manual — I provide outline
          </button>
        </div>
      </div>

      {source === 'manual' && (
        <div className="field">
          <span className="field-label">Your Custom Topics & Outline</span>
          <textarea
            className="manual-input"
            rows={9}
            value={manualText}
            onChange={(e) => setManualText(e.target.value)}
            placeholder={MANUAL_PLACEHOLDER}
            spellCheck={false}
          />
          <p className="hint">
            Format: <code># Main topic</code> for each topic, <code>## Subtopic</code> underneath it, and <code>- lesson item</code> for lessons.
          </p>
          {parseError && (
            <div className="parse-error">
              <p className="fetch-error">{parseError}</p>
              {parseIssues.length > 0 && (
                <ul>
                  {parseIssues.map((iss, i) => <li key={i}>{iss}</li>)}
                </ul>
              )}
            </div>
          )}
        </div>
      )}

      <div className="field">
        <div className="field-label-row">
          <span className="field-label">Generate with AI Model</span>
          {activeProfile && (
            <span className="active-endpoint-badge">
              <span className="pulse-dot" />
              {activeProfile.name} ({selection?.model})
            </span>
          )}
        </div>
        <ModelSelector profiles={profiles} selection={selection} onSelectionChange={onSelectionChange} />
        <p className="hint">Works with any OpenAI-compatible endpoint, including local Ollama servers.</p>
      </div>

      <div style={{ display: 'flex', gap: '12px', marginTop: '10px' }}>
        <button className="btn primary" style={{ flex: 1 }} disabled={!topic.trim() || validating} type="submit">
          {validating ? '⏳ Validating topics...' : isRoadmap ? '🚀 Build My Goal Roadmap' : '⚡ Research & Generate Module'}
        </button>
        <button className="btn ghost" type="button" onClick={() => setShowSettings(true)} title="Manage AI Endpoint Keys & Models">
          ⚙ Endpoints
        </button>
      </div>

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
