import { useState } from 'react'
import ModelSelector from './ModelSelector.jsx'
import SettingsModal from './SettingsModal.jsx'

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

export default function SetupForm({ profiles, selection, onProfilesChange, onSelectionChange, onStart }) {
  const [topic, setTopic] = useState('')
  const [mode, setMode] = useState('module')
  const [source, setSource] = useState('auto')
  const [manualText, setManualText] = useState('')
  const [parseError, setParseError] = useState('')
  const [parseIssues, setParseIssues] = useState([])
  const [validating, setValidating] = useState(false)
  const [showSettings, setShowSettings] = useState(false)

  const isRoadmap = mode === 'roadmap'

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
        <span className="field-label">How should the topics be created?</span>
        <div className="mode-toggle">
          <button type="button" className={`mode-btn ${source === 'auto' ? 'active' : ''}`} onClick={() => setSource('auto')}>
            Auto — AI designs it
          </button>
          <button type="button" className={`mode-btn ${source === 'manual' ? 'active' : ''}`} onClick={() => setSource('manual')}>
            Manual — I provide it
          </button>
        </div>
      </div>

      {source === 'manual' && (
        <div className="field">
          <span className="field-label">Your topics, subtopics, and lessons</span>
          <textarea
            className="manual-input"
            rows={9}
            value={manualText}
            onChange={(e) => setManualText(e.target.value)}
            placeholder={MANUAL_PLACEHOLDER}
            spellCheck={false}
          />
          <p className="hint">
            Format: <code># Main topic</code> for each topic, <code>## Subtopic</code> underneath it, and <code>- lesson item</code> for lessons. Subtopics and lessons are optional.
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
        <span className="field-label">Generate with</span>
        <ModelSelector profiles={profiles} selection={selection} onSelectionChange={onSelectionChange} />
        <p className="hint">Any OpenAI-compatible endpoint ({'{baseUrl}'}/chat/completions) works.</p>
      </div>

      <button className="btn primary" disabled={!topic.trim() || validating} type="submit">
        {validating ? 'Checking your topics…' : isRoadmap ? 'Build my roadmap' : 'Build my learning module'}
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
