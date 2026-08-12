import { useEffect, useRef, useState } from 'react'
import SetupForm from './components/SetupForm.jsx'
import GenerationProgress from './components/GenerationProgress.jsx'
import TopicsPanel from './components/TopicsPanel.jsx'
import ContentPanel from './components/ContentPanel.jsx'
import ChatPanel from './components/ChatPanel.jsx'
import HistoryModal from './components/HistoryModal.jsx'
import SettingsModal from './components/SettingsModal.jsx'
import LogsPage from './components/LogsPage.jsx'
import Dashboard from './components/Dashboard.jsx'
import { itemKey, moduleToMarkdown } from './lib/export.js'
import { loadCurrentSession, startSession, appendMessage } from './lib/history.js'
import { getLastModule, saveModule } from './lib/modules.js'
import {
  loadProfiles,
  saveProfiles,
  loadSelection,
  saveSelection,
  resolveConfig,
  profileLabel
} from './lib/storage.js'

export default function App() {
  const lastModule = getLastModule()

  const [profiles, setProfiles] = useState(loadProfiles)
  const [selection, setSelection] = useState(() => loadSelection(loadProfiles()))
  const [phase, setPhase] = useState('dashboard')
  const [subject, setSubject] = useState(() => lastModule?.subject ?? '')
  const [logs, setLogs] = useState([])
  const [progress, setProgress] = useState({ done: 0, total: 0 })
  const [module, setModule] = useState(() => lastModule?.module ?? null)
  const [warnings, setWarnings] = useState(() => lastModule?.warnings ?? [])
  const [fatalError, setFatalError] = useState('')
  const [resuming, setResuming] = useState(false)

  const [notes, setNotes] = useState(() => lastModule?.notes ?? {})
  const [loadingNotes, setLoadingNotes] = useState({})
  const [noteErrors, setNoteErrors] = useState({})
  const [generatingAll, setGeneratingAll] = useState(false)

  const [selected, setSelected] = useState(null)
  const [leftOpen, setLeftOpen] = useState(true)
  const [rightOpen, setRightOpen] = useState(true)
  const [historyOpen, setHistoryOpen] = useState(false)
  const [settingsOpen, setSettingsOpen] = useState(false)
  const [logsOpen, setLogsOpen] = useState(false)

  const [altNote, setAltNote] = useState(null)
  const [altLoading, setAltLoading] = useState(false)
  const [altError, setAltError] = useState('')

  const [session, setSession] = useState(() => {
    const cur = loadCurrentSession()
    const subj = lastModule?.subject ?? ''
    if (cur && cur.subject === subj) return cur
    return startSession(subj)
  })
  const [chatBusy, setChatBusy] = useState(false)
  const [chatError, setChatError] = useState('')

  const streamRef = useRef({ jobId: null, cancelled: false, subscribing: false, finished: false })
  const subjectRef = useRef(lastModule?.subject ?? '')

  const selectedKey = selected ? itemKey(selected.main.title, selected.sub.title, selected.item) : null

  const genSelection = { profileId: selection.profileId, model: selection.model }
  const chatSelection = { profileId: selection.chatProfileId, model: selection.chatModel }
  const reviewSelection = { profileId: selection.reviewProfileId, model: selection.reviewModel }
  const genConfig = resolveConfig(profiles, genSelection)
  const chatConfig = resolveConfig(profiles, chatSelection)
  const altLabel = profileLabel(profiles, reviewSelection)

  const updateProfiles = (list) => {
    setProfiles(list)
    saveProfiles(list)
  }

  const updateSelection = (patch) => {
    setSelection((s) => {
      const next = { ...s, ...patch }
      saveSelection(next)
      return next
    })
  }

  const handleGenSelection = ({ profileId, model }) => updateSelection({ profileId, model })
  const handleChatSelection = ({ profileId, model }) => updateSelection({ chatProfileId: profileId, chatModel: model })
  const handleReviewSelection = ({ profileId, model }) => updateSelection({ reviewProfileId: profileId, reviewModel: model })

  /* keep selections valid if a profile/model is renamed or removed */
  useEffect(() => {
    setSelection((s) => {
      const p = profiles.find((x) => x.id === s.profileId) || profiles[0]
      const cp = profiles.find((x) => x.id === s.chatProfileId) || profiles[0]
      const rp = profiles.find((x) => x.id === s.reviewProfileId) || profiles[1] || profiles[0]
      const next = {
        profileId: p.id,
        model: p.models.includes(s.model) ? s.model : p.models[0],
        chatProfileId: cp.id,
        chatModel: cp.models.includes(s.chatModel) ? s.chatModel : cp.models[0],
        reviewProfileId: rp.id,
        reviewModel: rp.models.includes(s.reviewModel) ? s.reviewModel : rp.models[0]
      }
      if (JSON.stringify(next) !== JSON.stringify(s)) {
        saveSelection(next)
        return next
      }
      return s
    })
  }, [profiles])

  const stopStream = () => {
    streamRef.current.cancelled = true
    streamRef.current.finished = true
  }

  const setStreamIdle = () => {
    streamRef.current = { jobId: null, cancelled: true, subscribing: false, finished: true }
  }

  const ensureSession = (subj) => {
    const cur = loadCurrentSession()
    if (cur && cur.subject === subj) return cur
    return startSession(subj)
  }

  const openModule = (entry) => {
    if (!entry?.module) return
    subjectRef.current = entry.subject
    setSubject(entry.subject)
    setModule(entry.module)
    setNotes(entry.notes || {})
    setWarnings(entry.warnings || [])
    setFatalError('')
    setLogs([])
    setProgress({ done: entry.module.mainTopics.length, total: entry.module.mainTopics.length })
    setSelected(null)
    setAltNote(null)
    setAltError('')
    setSession(ensureSession(entry.subject))
    setStreamIdle()
    setPhase('module')
  }

  const openSaved = async (entry) => {
    if (entry.module) {
      openModule(entry)
      return
    }
    try {
      const res = await fetch(`/api/modules/${entry.slug}`)
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Failed to load module')
      openModule(data)
    } catch (e) {
      setFatalError(e.message)
    }
  }

  /* persist generated module + notes (localStorage + server .md) */
  useEffect(() => {
    if (phase !== 'module' || !module) return
    const t = setTimeout(() => {
      const md = moduleToMarkdown(module, notes)
      saveModule({ subject: subjectRef.current, module, notes, warnings })
      fetch('/api/modules/save', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ subject: subjectRef.current, module, notes, warnings, markdown: md })
      }).catch(() => { /* server unavailable */ })
    }, 500)
    return () => clearTimeout(t)
  }, [module, notes, warnings, phase])

  /* ---------------- generation ---------------- */

  const start = async (topic) => {
    const cfg = genConfig
    subjectRef.current = topic
    setSubject(topic)
    setModule(null)
    setNotes({})
    setNoteErrors({})
    setWarnings([])
    setFatalError('')
    setLogs([])
    setProgress({ done: 0, total: 0 })
    setSelected(null)
    setAltNote(null)
    setSession(ensureSession(topic))
    setPhase('generating')

    streamRef.current = { jobId: null, cancelled: false, subscribing: false, finished: false }

    try {
      const res = await fetch('/api/module/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ topic, config: cfg })
      })
      const body = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(body.error || `Request failed (${res.status})`)
      streamRef.current.jobId = body.id
      subscribe(body.id, cfg, 0)
    } catch (e) {
      setFatalError(e.message)
      setPhase('setup')
    }
  }

  const scheduleReconnect = (id, cfg, attempt, reason) => {
    const st = streamRef.current
    if (st.cancelled || st.finished || id !== st.jobId) return
    const delay = Math.min(1000 * Math.pow(2, attempt), 15000)
    setLogs((l) => [
      ...l,
      { type: 'status', message: `Connection lost${reason ? ` (${reason})` : ''} — reconnecting in ${Math.round(delay / 1000)}s…` }
    ])
    setTimeout(() => subscribe(id, cfg, attempt + 1), delay)
  }

  const subscribe = async (id, cfg, attempt) => {
    const st = streamRef.current
    if (st.cancelled || st.finished || st.subscribing || id !== st.jobId) return
    st.subscribing = true

    try {
      await fetch(`/api/module/${id}/config`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ config: cfg })
      })
    } catch { /* best-effort */ }

    let res
    try {
      res = await fetch(`/api/module/generate/${id}/events`)
    } catch (e) {
      st.subscribing = false
      scheduleReconnect(id, cfg, attempt, e.message)
      return
    }

    if (!res.ok) {
      st.subscribing = false
      if (res.status === 404) {
        setFatalError('Generation session expired. Please start again.')
        setPhase('setup')
        return
      }
      scheduleReconnect(id, cfg, attempt, `HTTP ${res.status}`)
      return
    }

    const reader = res.body.getReader()
    const decoder = new TextDecoder()
    let buffer = ''

    try {
      while (true) {
        const { done, value } = await reader.read()
        if (done) break
        buffer += decoder.decode(value, { stream: true })
        const lines = buffer.split('\n')
        buffer = lines.pop()
        for (const line of lines) {
          if (!line.startsWith('data: ')) continue
          let ev
          try { ev = JSON.parse(line.slice(6)) } catch { continue }
          handleEvent(ev)
          if (ev.type === 'done' || ev.type === 'error') st.finished = true
        }
      }
    } catch (e) {
      st.subscribing = false
      if (!st.cancelled && !st.finished) {
        scheduleReconnect(id, cfg, attempt, e.message)
        return
      }
      return
    }

    st.subscribing = false
    if (!st.cancelled && !st.finished) scheduleReconnect(id, cfg, attempt)
  }

  const handleEvent = (ev) => {
    switch (ev.type) {
      case 'snapshot': {
        const j = ev.job
        setLogs(j.logs || [])
        setProgress({ done: j.progress?.done ?? 0, total: j.progress?.total ?? 0 })
        if (j.module) setModule(j.module)
        setWarnings(j.warnings || [])
        if (j.fatalError) {
          setFatalError(j.fatalError)
          setPhase('setup')
        } else if (j.status === 'done') {
          setSession(ensureSession(subjectRef.current))
          setPhase('module')
        } else if (j.status === 'running') {
          setPhase('generating')
        }
        break
      }
      case 'status':
        setLogs((l) => [...l, { type: 'status', message: ev.message }])
        break
      case 'topics':
        setLogs((l) => [...l, { type: 'topics', topics: ev.topics }])
        break
      case 'progress':
        setProgress({ done: ev.done, total: ev.total })
        break
      case 'topicResult': {
        setModule((m) => {
          const next = m ? { ...m, mainTopics: m.mainTopics.slice() } : { subject: subjectRef.current, mainTopics: [] }
          const entry = { index: ev.index, title: ev.title, subtopics: ev.subtopics || [], ...(ev.error ? { error: ev.error } : {}) }
          const idx = next.mainTopics.findIndex((t) => t.title === ev.title)
          if (idx === -1) next.mainTopics.push(entry)
          else next.mainTopics[idx] = entry
          return next
        })
        break
      }
      case 'done':
        setModule(ev.module)
        setWarnings(ev.warnings || [])
        setSession(ensureSession(subjectRef.current))
        setPhase('module')
        break
      case 'error':
        setFatalError(ev.message)
        setPhase('setup')
        break
      default:
        break
    }
  }

  /* ---------------- study notes ---------------- */

  const generateNote = async (main, sub, item) => {
    const key = itemKey(main.title, sub.title, item)
    if (loadingNotes[key] || notes[key]) return
    setLoadingNotes((s) => ({ ...s, [key]: true }))
    setNoteErrors((s) => ({ ...s, [key]: undefined }))
    try {
      const res = await fetch('/api/module/note', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ item, subtopic: sub.title, mainTopic: main.title, subject, config: genConfig })
      })
      const body = await res.json()
      if (!res.ok) throw new Error(body.error || 'Failed to generate note')
      setNotes((s) => ({ ...s, [key]: body.note }))
    } catch (e) {
      setNoteErrors((s) => ({ ...s, [key]: e.message }))
    } finally {
      setLoadingNotes((s) => ({ ...s, [key]: false }))
    }
  }

  const handleSelect = (main, sub, item) => {
    setSelected({ main, sub, item })
    setAltNote(null)
    setAltError('')
    const key = itemKey(main.title, sub.title, item)
    if (!notes[key] && !loadingNotes[key] && !noteErrors[key]) generateNote(main, sub, item)
  }

  const generateAlternative = async () => {
    if (!selected || altLoading) return
    setAltLoading(true)
    setAltError('')
    try {
      const res = await fetch('/api/module/note/review', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          item: selected.item,
          subtopic: selected.sub.title,
          mainTopic: selected.main.title,
          subject,
          note: notes[selectedKey],
          config: genConfig,
          reviewConfig: resolveConfig(profiles, reviewSelection)
        })
      })
      const body = await res.json()
      if (!res.ok) throw new Error(body.error || 'Review failed')
      setAltNote(body.note)
    } catch (e) {
      setAltError(e.message)
    } finally {
      setAltLoading(false)
    }
  }

  const acceptAlternative = () => {
    if (!altNote || !selected) return
    const key = itemKey(selected.main.title, selected.sub.title, selected.item)
    setNotes((s) => ({ ...s, [key]: altNote }))
    setAltNote(null)
    setAltError('')
  }

  const generateAllNotes = async () => {
    const items = []
    sortedMainTopics(module).forEach((main) =>
      main.subtopics.forEach((sub) =>
        sub.items.forEach((item) => items.push({ main, sub, item }))
      )
    )
    setGeneratingAll(true)
    for (const it of items) {
      await generateNote(it.main, it.sub, it.item)
    }
    setGeneratingAll(false)
  }

  const retryFailed = async () => {
    const id = streamRef.current.jobId
    if (!id || resuming) return
    setResuming(true)
    setPhase('generating')
    setWarnings([])
    setModule((m) => (m ? { ...m, mainTopics: m.mainTopics.filter((t) => !(t.error && t.subtopics.length === 0)) } : m))
    try {
      const res = await fetch(`/api/module/${id}/resume`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ config: genConfig })
      })
      const body = await res.json()
      if (!res.ok) throw new Error(body.error || `Resume failed (${res.status})`)
      streamRef.current = { jobId: id, cancelled: false, subscribing: false, finished: false }
      subscribe(id, genConfig, 0)
    } catch (e) {
      setFatalError(e.message)
      setPhase('module')
    } finally {
      setResuming(false)
    }
  }

  /* ---------------- chat ---------------- */

  const buildChatMessages = (messages) => {
    let ctx = `You are a helpful learning tutor assisting a student who is learning "${subject}".`
    if (selected) {
      ctx += `\n\nThe student is currently studying this item: "${selected.item}" (section "${selected.sub.title}", module "${selected.main.title}").`
      const note = notes[selectedKey]
      if (note?.summary) {
        ctx += `\n\nStudy note they are reading:\n${note.summary}`
        if (note.keyPoints?.length) ctx += `\nKey points: ${note.keyPoints.join('; ')}`
      }
    }
    ctx += `\n\nAnswer clearly and concisely. If the question goes beyond this subject, still help, but keep the focus on the student's learning. When relevant, suggest a small practice exercise.`
    return [{ role: 'system', content: ctx }, ...messages]
  }

  const sendChat = async (text) => {
    const userMsg = { role: 'user', content: text }
    const nextMessages = [...(session?.messages || []), userMsg]
    setSession(appendMessage(session, userMsg))
    setChatBusy(true)
    setChatError('')
    try {
      const res = await fetch('/api/ai/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ config: chatConfig, messages: buildChatMessages(nextMessages) })
      })
      const body = await res.json()
      if (!res.ok) throw new Error(body.error || `Chat failed (${res.status})`)
      setSession((s) => appendMessage(s, { role: 'assistant', content: body.content }))
    } catch (e) {
      setChatError(e.message)
    } finally {
      setChatBusy(false)
    }
  }

  /* ---------------- export ---------------- */

  const exportMarkdown = () => {
    download(moduleToMarkdown(module, notes), 'application/markdown', `${slug(subject)}-module.md`)
  }

  const exportJson = () => {
    download(JSON.stringify({ module, notes }, null, 2), 'application/json', `${slug(subject)}-module.json`)
  }

  const download = (content, mime, filename) => {
    const blob = new Blob([content], { type: mime })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = filename
    a.click()
    URL.revokeObjectURL(url)
  }

  /* ---------------- render ---------------- */

  return (
    <div className="app">
      {phase === 'dashboard' && (
        <Dashboard
          currentSubject={subject}
          onOpen={openSaved}
          onCreate={() => setPhase('setup')}
          onHistory={() => setHistoryOpen(true)}
          onSettings={() => setSettingsOpen(true)}
          onLogs={() => setLogsOpen(true)}
        />
      )}

      {phase !== 'module' && phase !== 'dashboard' && (
        <div className="container">
          {phase === 'setup' && (
            <>
              <SetupForm
                profiles={profiles}
                selection={genSelection}
                onProfilesChange={updateProfiles}
                onSelectionChange={handleGenSelection}
                onStart={start}
              />
              {fatalError && <div className="fatal">{fatalError}</div>}
            </>
          )}

          {phase === 'generating' && (
            <>
              <GenerationProgress logs={logs} progress={progress} />
              <button className="btn ghost center" onClick={() => { stopStream(); setPhase('dashboard') }}>Cancel</button>
            </>
          )}
        </div>
      )}

      {phase === 'module' && module && (
        <div className="workspace">
          <header className="topbar">
            <div className="topbar-left">
              <button className="btn topbar-btn" onClick={() => setLeftOpen((o) => !o)} title="Toggle topics panel">
                <span className="topbar-arrow">{leftOpen ? '‹' : '›'}</span> Topics
              </button>
              <button className="btn topbar-btn" onClick={() => { stopStream(); setPhase('dashboard') }}>Modules</button>
            </div>
            <div className="topbar-title">Learning Agent{subject ? <span className="topbar-sub"> · {subject}</span> : ''}</div>
            <div className="topbar-actions">
              <button className="btn topbar-btn" onClick={() => setLogsOpen(true)} title="AI interaction logs">Logs</button>
              <button className="btn topbar-btn" onClick={() => setSettingsOpen(true)} title="AI endpoints">Settings</button>
              <button className="btn topbar-btn" onClick={() => { stopStream(); setPhase('setup') }}>New topic</button>
              <button className="btn topbar-btn" onClick={exportMarkdown} title="Export module to Markdown">Export</button>
              <button className="btn topbar-btn" onClick={() => setHistoryOpen(true)}>History</button>
              <button className="btn topbar-btn" onClick={() => setRightOpen((o) => !o)} title="Toggle chat panel">
                Chat <span className="topbar-arrow">{rightOpen ? '›' : '‹'}</span>
              </button>
            </div>
          </header>

          <div className="shell">
            {leftOpen && (
              <aside className="panel panel-left">
                <TopicsPanel
                  module={module}
                  notes={notes}
                  selectedKey={selectedKey}
                  onSelect={handleSelect}
                  warnings={warnings}
                  canRetry={!!streamRef.current.jobId}
                  onRetryFailed={retryFailed}
                  resuming={resuming}
                  onGenerateAll={generateAllNotes}
                  generatingAll={generatingAll}
                />
              </aside>
            )}

            <main className="center">
              <ContentPanel
                subject={subject}
                selected={selected}
                note={selectedKey ? notes[selectedKey] : undefined}
                loading={selectedKey ? !!loadingNotes[selectedKey] : false}
                error={selectedKey ? noteErrors[selectedKey] : undefined}
                onGenerate={selected ? () => generateNote(selected.main, selected.sub, selected.item) : undefined}
                noteCount={Object.keys(notes).length}
                profiles={profiles}
                reviewSelection={reviewSelection}
                onReviewSelectionChange={handleReviewSelection}
                altNote={altNote}
                altLoading={altLoading}
                altError={altError}
                onGenerateAlternative={generateAlternative}
                onAcceptAlternative={acceptAlternative}
                onDiscardAlternative={() => setAltNote(null)}
                altLabel={altLabel}
              />
            </main>

            {rightOpen && (
              <aside className="panel panel-right">
                <ChatPanel
                  session={session}
                  subject={subject}
                  profiles={profiles}
                  chatSelection={chatSelection}
                  onChatSelectionChange={handleChatSelection}
                  onSend={sendChat}
                  busy={chatBusy}
                  error={chatError}
                  onNewChat={() => setSession(startSession(subject))}
                />
              </aside>
            )}
          </div>
        </div>
      )}

      {historyOpen && <HistoryModal onClose={() => setHistoryOpen(false)} />}
      {settingsOpen && (
        <SettingsModal
          profiles={profiles}
          onProfilesChange={updateProfiles}
          onClose={() => setSettingsOpen(false)}
        />
      )}
      {logsOpen && <LogsPage onClose={() => setLogsOpen(false)} />}
    </div>
  )
}

function sortedMainTopics(module) {
  if (!module) return []
  return [...module.mainTopics].sort((a, b) => (a.index ?? 0) - (b.index ?? 0))
}

function slug(text) {
  return String(text).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 60) || 'learning'
}
