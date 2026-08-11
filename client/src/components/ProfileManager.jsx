import { createProfile } from '../lib/storage.js'

export default function ProfileManager({ profiles, onChange }) {
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
              placeholder="https://api.openai.com/v1"
            />
          </label>

          <label className="field">
            <span className="field-label">API Key</span>
            <input
              type="password"
              value={p.apiKey}
              onChange={(e) => updateProfile(p.id, { apiKey: e.target.value })}
              placeholder="sk-..."
              autoComplete="off"
            />
          </label>

          <div className="field">
            <span className="field-label">Models</span>
            <div className="models-list">
              {p.models.map((m, i) => (
                <div className="model-row" key={i}>
                  <input value={m} onChange={(e) => updateModel(p.id, i, e.target.value)} placeholder="model name" />
                  <button className="btn tiny" type="button" onClick={() => removeModel(p.id, i)}>Remove</button>
                </div>
              ))}
            </div>
            <div>
              <button className="btn tiny" type="button" onClick={() => addModel(p.id)}>Add model</button>
            </div>
          </div>
        </div>
      ))}

      <div>
        <button className="btn" type="button" onClick={addProfile}>Add endpoint</button>
      </div>

      <p className="hint">
        API keys are stored only in your browser and sent to this app's backend, which talks to your endpoints. Keys are never persisted on the server.
      </p>
    </div>
  )
}
