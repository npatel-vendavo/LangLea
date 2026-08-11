import ProfileManager from './ProfileManager.jsx'

export default function SettingsModal({ profiles, onProfilesChange, onClose }) {
  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <div className="modal-head">
          <h3>Settings — AI endpoints</h3>
          <button className="btn tiny" onClick={onClose}>Close</button>
        </div>
        <div className="modal-body settings-body">
          <p className="hint">
            Add OpenAI-compatible endpoints ({'{baseUrl}'}/chat/completions). Each endpoint can expose multiple models — you'll pick which to use for generation, chat, and review.
          </p>
          <ProfileManager profiles={profiles} onChange={onProfilesChange} />
        </div>
      </div>
    </div>
  )
}
