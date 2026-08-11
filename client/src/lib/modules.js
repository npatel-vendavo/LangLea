const MODULES_KEY = 'la-modules'
const LAST_KEY = 'la-last-module'

export function loadModules() {
  try {
    return JSON.parse(localStorage.getItem(MODULES_KEY)) || []
  } catch {
    return []
  }
}

export function getLastModule() {
  try {
    return JSON.parse(localStorage.getItem(LAST_KEY))
  } catch {
    return null
  }
}

export function saveModule({ subject, module, notes, warnings }) {
  const entry = { subject, module, notes, warnings, savedAt: Date.now() }
  try {
    const list = loadModules()
    const idx = list.findIndex((m) => m.subject === subject)
    if (idx === -1) list.unshift(entry)
    else list[idx] = entry
    localStorage.setItem(MODULES_KEY, JSON.stringify(list))
    localStorage.setItem(LAST_KEY, JSON.stringify(entry))
    return true
  } catch (e) {
    console.warn('Could not persist module to localStorage', e)
    return false
  }
}

export function countItems(module) {
  if (!module?.mainTopics) return 0
  return module.mainTopics.reduce(
    (acc, t) => acc + t.subtopics.reduce((a, s) => a + s.items.length, 0),
    0
  )
}
