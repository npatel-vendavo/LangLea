import { useEffect, useRef, useState } from 'react'
import SetupForm from './components/SetupForm.jsx'
import GenerationProgress from './components/GenerationProgress.jsx'
import TopicsPanel from './components/TopicsPanel.jsx'
import ContentPanel from './components/ContentPanel.jsx'
import ChatPanel from './components/ChatPanel.jsx'
import HistoryModal from './components/HistoryModal.jsx'
import Dashboard from './components/Dashboard.jsx'
import { itemKey, moduleToMarkdown } from './lib/export.js'
import { loadCurrentSession, startSession, appendMessage } from './lib/history.js'
import { getLastModule, saveModule } from './lib/modules.js'
import { loadConfig } from './lib/storage.js'

export default function App() {
  const lastModule = getLastModule()

  const [phase, setPhase] = useState('dashboard')
  const [subject, setSubject] = useState(() => lastModule?.subject ?? '')
  const [config, setConfig] = useState(loadConfig)
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

  const start = async (topic, cfg) => {
    subjectRef.current = topic
    setSubject(topic)
    setConfig(cfg)
    setModule(null)
    setNotes({})
    setNoteErrors({})
    setWarnings([])
    setFatalError('')
    setLogs([])
    setProgress({ done: 0, total: 0 })
    setSelected(null)
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
        body: JSON.stringify({ item, subtopic: sub.title, mainTopic: main.title, subject, config })
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
    const key = itemKey(main.title, sub.title, item)
    if (!notes[key] && !loadingNotes[key] && !noteErrors[key]) generateNote(main, sub, item)
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
        body: JSON.stringify({ config })
      })
      const body = await res.json()
      if (!res.ok) throw new Error(body.error || `Resume failed (${res.status})`)
      streamRef.current = { jobId: id, cancelled: false, subscribing: false, finished: false }
      subscribe(id, config, 0)
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
        body: JSON.stringify({ config, messages: buildChatMessages(nextMessages) })
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
        />
      )}

      {phase !== 'module' && phase !== 'dashboard' && (
        <div className="container">
          {phase === 'setup' && (
            <>
              <SetupForm onStart={start} />
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
              />
            </main>

            {rightOpen && (
              <aside className="panel panel-right">
                <ChatPanel
                  session={session}
                  subject={subject}
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
