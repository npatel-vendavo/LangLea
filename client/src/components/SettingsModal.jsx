import ProfileManager from './ProfileManager.jsx'
import ModelSelector from './ModelSelector.jsx'

export default function SettingsModal({ profiles, selection, onSelectionChange, onProfilesChange, onClose }) {
  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <div className="modal-head">
          <h3>Settings — AI endpoints</h3>
          <button className="btn tiny" onClick={onClose}>Close</button>
        </div>
        <div className="modal-body settings-body">
          <p className="hint">
            Add OpenAI-compatible endpoints ({'{baseUrl}'}/chat/completions) — including Ollama — and choose which endpoint + model is the default for each job.
          </p>

          <div className="settings-section">
            <h4 className="note-h">Default endpoints</h4>
            <div className="default-row">
              <span className="field-label">Generate content with</span>
              <ModelSelector
                profiles={profiles}
                selection={selection && { profileId: selection.profileId, model: selection.model }}
                onSelectionChange={(patch) => onSelectionChange({ ...patch })}
              />
            </div>
            <div className="default-row">
              <span className="field-label">Chat with</span>
              <ModelSelector
                profiles={profiles}
                selection={selection && { profileId: selection.chatProfileId, model: selection.chatModel }}
                onSelectionChange={(patch) => onSelectionChange({ chatProfileId: patch.profileId, chatModel: patch.model })}
              />
            </div>
            <div className="default-row">
              <span className="field-label">Review notes with</span>
              <ModelSelector
                profiles={profiles}
                selection={selection && { profileId: selection.reviewProfileId, model: selection.reviewModel }}
                onSelectionChange={(patch) => onSelectionChange({ reviewProfileId: patch.profileId, reviewModel: patch.model })}
              />
            </div>
            <p className="hint">The defaults pre-fill the selectors in the setup screen and workspace panels.</p>
          </div>

          <div className="settings-section">
            <h4 className="note-h">Endpoints</h4>
            <ProfileManager profiles={profiles} onChange={onProfilesChange} />
          </div>
        </div>
      </div>
    </div>
  )
}
