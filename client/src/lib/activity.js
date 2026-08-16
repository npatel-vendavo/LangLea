const ACTIVITY_KEY = 'la-activity'
const VIEWS_KEY = 'la-views'

export function loadActivity() {
  try {
    const a = JSON.parse(localStorage.getItem(ACTIVITY_KEY))
    return Array.isArray(a) ? a : []
  } catch {
    return []
  }
}

export function recordActivity({ subject, itemKey, action }) {
  const entry = { ts: Date.now(), day: new Date().toISOString().slice(0, 10), subject, itemKey, action }
  try {
    const list = loadActivity()
    list.push(entry)
    if (list.length > 20000) list.splice(0, list.length - 20000)
    localStorage.setItem(ACTIVITY_KEY, JSON.stringify(list))
  } catch { /* ignore */ }
  return entry
}

export function clearActivity() {
  try { localStorage.removeItem(ACTIVITY_KEY) } catch { /* ignore */ }
}

export function loadViews() {
  try {
    const v = JSON.parse(localStorage.getItem(VIEWS_KEY))
    return v && typeof v === 'object' ? v : {}
  } catch {
    return {}
  }
}

export function recordView(itemKey) {
  try {
    const views = loadViews()
    views[itemKey] = (views[itemKey] || 0) + 1
    localStorage.setItem(VIEWS_KEY, JSON.stringify(views))
  } catch { /* ignore */ }
}

export function clearViews() {
  try { localStorage.removeItem(VIEWS_KEY) } catch { /* ignore */ }
}
