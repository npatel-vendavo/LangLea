import { useState } from 'react'
import { DEFAULT_CONFIG, loadConfig, saveConfig } from '../lib/storage.js'

export default function SetupForm({ onStart }) {
  const [topic, setTopic] = useState('')
  const [config, setConfig] = useState(loadConfig)
  const [showSettings, setShowSettings] = useState(false)

  const update = (key) => (e) => setConfig((c) => ({ ...c, [key]: e.target.value }))

  const submit = (e) => {
    e.preventDefault()
    if (!topic.trim()) return
    saveConfig(config)
    onStart(topic.trim(), config)
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

      <button className="btn primary" disabled={!topic.trim()} type="submit">
        Build my learning module
      </button>

      <button className="btn ghost" type="button" onClick={() => setShowSettings((s) => !s)}>
        {showSettings ? 'Hide' : 'Configure'} AI endpoint settings
      </button>

      {showSettings && (
        <div className="settings">
          <label className="field">
            <span className="field-label">Base URL</span>
            <input value={config.baseUrl} onChange={update('baseUrl')} placeholder={DEFAULT_CONFIG.baseUrl} />
          </label>
          <label className="field">
            <span className="field-label">Model</span>
            <input value={config.model} onChange={update('model')} placeholder={DEFAULT_CONFIG.model} />
          </label>
          <label className="field">
            <span className="field-label">API Key</span>
            <input
              type="password"
              value={config.apiKey}
              onChange={update('apiKey')}
              placeholder="sk-..."
              autoComplete="off"
            />
          </label>
          <p className="hint">
            The API key is stored only in your browser and sent to this app's backend, which talks to your endpoint.
            Any OpenAI-compatible endpoint ({'{baseUrl}'}/chat/completions) works.
          </p>
        </div>
      )}
    </form>
  )
}
