export default function ModelSelector({ profiles, selection, onSelectionChange, compact }) {
  const profile = profiles.find((p) => p.id === selection?.profileId) || profiles[0]
  const models = profile?.models || []

  return (
    <div className={`model-selector${compact ? ' compact' : ''}`}>
      <select
        value={selection?.profileId || ''}
        onChange={(e) => onSelectionChange({ profileId: e.target.value, model: models[0] })}
        title="AI endpoint"
      >
        {profiles.map((p) => (
          <option key={p.id} value={p.id}>{p.name || p.baseUrl}</option>
        ))}
      </select>
      <select
        value={selection?.model || ''}
        onChange={(e) => onSelectionChange({ profileId: selection?.profileId, model: e.target.value })}
        title="Model"
      >
        {models.map((m) => (
          <option key={m} value={m}>{m}</option>
        ))}
      </select>
    </div>
  )
}
