const PROFILES_KEY = 'la-ai-profiles'
const SELECTION_KEY = 'la-ai-selection'
const LEGACY_CONFIG_KEY = 'la-config-v1'

export const DEFAULT_CONFIG = {
  baseUrl: 'https://api.openai.com/v1',
  apiKey: '',
  model: 'gpt-4o-mini'
}

export function uid() {
  return Math.random().toString(36).slice(2, 10) + Date.now().toString(36).slice(-4)
}

export function createProfile(overrides = {}) {
  return {
    id: uid(),
    name: 'New endpoint',
    baseUrl: DEFAULT_CONFIG.baseUrl,
    apiKey: '',
    models: [DEFAULT_CONFIG.model],
    ...overrides
  }
}

export function loadProfiles() {
  try {
    const raw = localStorage.getItem(PROFILES_KEY)
    if (raw) {
      const list = JSON.parse(raw)
      if (Array.isArray(list) && list.length) return list
    }
  } catch { /* fall through */ }

  try {
    const legacy = JSON.parse(localStorage.getItem(LEGACY_CONFIG_KEY))
    if (legacy && (legacy.baseUrl || legacy.apiKey || legacy.model)) {
      const profile = createProfile({
        name: 'Default',
        baseUrl: legacy.baseUrl || DEFAULT_CONFIG.baseUrl,
        apiKey: legacy.apiKey || '',
        models: [legacy.model || DEFAULT_CONFIG.model]
      })
      saveProfiles([profile])
      return [profile]
    }
  } catch { /* ignore */ }

  return [createProfile({ name: 'Default' })]
}

export function saveProfiles(list) {
  try {
    localStorage.setItem(PROFILES_KEY, JSON.stringify(list))
  } catch { /* ignore */ }
}

export function loadSelection(profiles) {
  const p = profiles[0]
  const other = profiles[1] || p
  const defaults = {
    profileId: p.id,
    model: p.models[0],
    chatProfileId: p.id,
    chatModel: p.models[0],
    reviewProfileId: other.id,
    reviewModel: other.models[0]
  }
  try {
    const raw = localStorage.getItem(SELECTION_KEY)
    if (!raw) return defaults
    return { ...defaults, ...JSON.parse(raw) }
  } catch {
    return defaults
  }
}

export function saveSelection(selection) {
  try {
    localStorage.setItem(SELECTION_KEY, JSON.stringify(selection))
  } catch { /* ignore */ }
}

export function resolveConfig(profiles, selection) {
  const p = profiles.find((x) => x.id === selection?.profileId) || profiles[0]
  const model = selection?.model || p?.models?.[0]
  return {
    baseUrl: p?.baseUrl || DEFAULT_CONFIG.baseUrl,
    apiKey: p?.apiKey || '',
    model: model || DEFAULT_CONFIG.model
  }
}

export function profileLabel(profiles, selection) {
  const p = profiles.find((x) => x.id === selection?.profileId)
  return `${p?.name || 'Endpoint'} / ${selection?.model || p?.models?.[0] || '?'}`
}
