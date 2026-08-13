import { useState } from 'react'
import { createProfile } from '../lib/storage.js'

export default function ProfileManager({ profiles, onChange }) {
  const [fetching, setFetching] = useState({})
  const [fetchError, setFetchError] = useState({})
  const [fetchNote, setFetchNote] = useState({})

  const updateProfile = (id, patch) => onChange(profiles.map((p) => (p.id === id ? { ...p, ...patch } : p)))
  const addProfile = () => onChange([...profiles, createProfile({ name: `Endpoint ${profiles.length + 1}` })])
  const removeProfile = (id) => onChange(profiles.filter((p) => p.id !== id))
  const profileById = (id) => profiles.find((p) => p.id === id)

  const updateModel = (pid, idx, value) => {
    const models = profileById(pid).models.map((m, i) => (i === idx ? value : m))
    updateProfile(pid, { models })
  }

  const removeModel = (pid, idx) => {
    const models = profileById(pid).models.filter((_, i) => i !== idx)
    updateProfile(pid, { models: models.length ? models : [''] })
  }

  const addModel = (pid) => updateProfile(pid, { models: [...profileById(pid).models, ''] })

  const fetchModelsFor = async (list, pid) => {
    const p = list.find((x) => x.id === pid)
    if (!p || !p.baseUrl.trim() || fetching[pid]) return
    setFetching((s) => ({ ...s, [pid]: true }))
    setFetchError((s) => ({ ...s, [pid]: '' }))
    setFetchNote((s) => ({ ...s, [pid]: '' }))
    try {
      const res = await fetch('/api/ai/discover-models', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ baseUrl: p.baseUrl.trim(), apiKey: p.apiKey })
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Failed to fetch models')
      if (!data.models.length) throw new Error('No models found at this endpoint')
      const merged = [...new Set([...(p.models || []).filter(Boolean), ...data.models])]
      const fixedBase = data.source === 'ollama' && data.ollamaBase && p.baseUrl.trim() !== data.ollamaBase
      onChange(list.map((x) => (x.id === pid ? { ...x, models: merged, ...(fixedBase ? { baseUrl: data.ollamaBase } : {}) } : x)))
      if (fixedBase) {
        setFetchNote((s) => ({ ...s, [pid]: `Ollama detected — base URL corrected to ${data.ollamaBase}` }))
      }
      return
    } catch (e) {
      setFetchError((s) => ({ ...s, [pid]: e.message }))
    } finally {
      setFetching((s) => ({ ...s, [pid]: false }))
    }
  }

  const addOllama = () => {
    const prof = createProfile({ name: 'Ollama', baseUrl: 'http://localhost:11434/v1', apiKey: '', models: [] })
    const next = [...profiles, prof]
    onChange(next)
    fetchModelsFor(next, prof.id)
  }

  return (
    <div className="endpoints">
      {profiles.map((p) => (
        <div className="profile-card" key={p.id}>
          <div className="profile-card-head">
            <input
              className="profile-name"
              value={p.name}
              onChange={(e) => updateProfile(p.id, { name: e.target.value })}
              placeholder="Endpoint name"
            />
            <button className="btn tiny danger" type="button" onClick={() => removeProfile(p.id)}>Remove</button>
          </div>

          <label className="field">
            <span className="field-label">Base URL</span>
            <input
              value={p.baseUrl}
              onChange={(e) => updateProfile(p.id, { baseUrl: e.target.value })}
              placeholder="Ollama: http://localhost:11434/v1 · OpenAI: https://api.openai.com/v1"
            />
          </label>

          <label className="field">
            <span className="field-label">API Key</span>
            <input
              type="password"
              value={p.apiKey}
              onChange={(e) => updateProfile(p.id, { apiKey: e.target.value })}
              placeholder="sk-... (leave empty for Ollama)"
              autoComplete="off"
            />
          </label>

          <div className="field">
            <div className="field-label-row">
              <span className="field-label">Models</span>
              <button
                className="btn tiny"
                type="button"
                disabled={fetching[p.id] || !p.baseUrl.trim()}
                onClick={() => fetchModelsFor(profiles, p.id)}
              >
                {fetching[p.id] ? 'Fetching…' : 'Fetch models'}
              </button>
            </div>
            <div className="models-list">
              {p.models.map((m, i) => (
                <div className="model-row" key={i}>
                  <input value={m} onChange={(e) => updateModel(p.id, i, e.target.value)} placeholder="model name" />
                  <button className="btn tiny" type="button" onClick={() => removeModel(p.id, i)}>Remove</button>
                </div>
              ))}
            </div>
            {fetchError[p.id] && <p className="hint fetch-error">{fetchError[p.id]}</p>}
            {fetchNote[p.id] && <p className="hint fetch-note">{fetchNote[p.id]}</p>}
            <div>
              <button className="btn tiny" type="button" onClick={() => addModel(p.id)}>Add model</button>
            </div>
          </div>
        </div>
      ))}

      <div className="endpoint-actions">
        <button className="btn" type="button" onClick={addProfile}>Add endpoint</button>
        <button className="btn" type="button" onClick={addOllama}>Add Ollama (local)</button>
      </div>

      <p className="hint">
        "Fetch models" auto-detects the model list — Ollama via <code>/api/tags</code> (works on localhost or another machine on your network, e.g. <code>http://192.168.1.20:11434/v1</code>), or OpenAI-compatible via <code>/models</code>. API keys are stored only in your browser and never persisted on the server.
      </p>
    </div>
  )
}
