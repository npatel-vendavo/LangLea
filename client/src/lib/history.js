const HISTORY_KEY = 'la-chat-history'
const CURRENT_KEY = 'la-chat-current'

export function loadHistory() {
  try {
    return JSON.parse(localStorage.getItem(HISTORY_KEY)) || []
  } catch {
    return []
  }
}

export function loadCurrentSession() {
  try {
    return JSON.parse(localStorage.getItem(CURRENT_KEY))
  } catch {
    return null
  }
}

export function startSession(subject) {
  const s = {
    id: Date.now().toString(36) + '-' + Math.random().toString(36).slice(2, 7),
    subject,
    createdAt: Date.now(),
    updatedAt: Date.now(),
    messages: []
  }
  saveCurrentSession(s)
  return s
}

export function appendMessage(session, message) {
  const s = {
    ...session,
    messages: [...session.messages, { ...message, createdAt: Date.now() }],
    updatedAt: Date.now()
  }
  saveCurrentSession(s)
  return s
}

export function loadSessionMessages(id) {
  try {
    const raw = localStorage.getItem('la-chat-session-' + id)
    return raw ? JSON.parse(raw).messages || [] : []
  } catch {
    return []
  }
}

function saveCurrentSession(session) {
  localStorage.setItem(CURRENT_KEY, JSON.stringify(session))
  localStorage.setItem('la-chat-session-' + session.id, JSON.stringify(session))
  const list = loadHistory()
  const idx = list.findIndex((x) => x.id === session.id)
  const entry = {
    id: session.id,
    subject: session.subject,
    createdAt: session.createdAt,
    updatedAt: session.updatedAt,
    messageCount: session.messages.length
  }
  if (idx === -1) list.unshift(entry)
  else list[idx] = entry
  localStorage.setItem(HISTORY_KEY, JSON.stringify(list))
}
