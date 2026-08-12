import fs from 'fs'
import path from 'path'
import crypto from 'crypto'

let logDir = null
const INDEX_CAP = 500

export function initAiLog(dir) {
  logDir = dir
  fs.mkdirSync(logDir, { recursive: true })
}

function indexPath() {
  return path.join(logDir, 'index.json')
}

function readIndex() {
  try {
    return JSON.parse(fs.readFileSync(indexPath(), 'utf8'))
  } catch {
    return []
  }
}

function writeIndex(list) {
  try {
    fs.writeFileSync(indexPath(), JSON.stringify(list, null, 2))
  } catch { /* best-effort */ }
}

export function logInteraction(entry) {
  if (!logDir || !entry) return
  const id = crypto.randomUUID()
  const record = { id, ...entry }
  try {
    fs.writeFileSync(path.join(logDir, `${id}.json`), JSON.stringify(record, null, 2))
    const list = readIndex()
    list.unshift({
      id,
      time: record.time,
      baseUrl: record.baseUrl,
      model: record.model,
      kind: record.kind,
      success: !!record.success,
      parsed: record.parsed === undefined ? null : record.parsed,
      durationMs: record.durationMs || null,
      error: record.error ? String(record.error).slice(0, 200) : null
    })
    writeIndex(list.slice(0, INDEX_CAP))
  } catch { /* best-effort */ }
}

export function listLogs() {
  return readIndex()
}

export function getLog(id) {
  try {
    return JSON.parse(fs.readFileSync(path.join(logDir, `${id}.json`), 'utf8'))
  } catch {
    return null
  }
}
