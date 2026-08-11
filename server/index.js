import express from 'express'
import path from 'path'
import os from 'os'
import fs from 'fs'
import crypto from 'crypto'
import { fileURLToPath } from 'url'

const app = express()
app.use(express.json({ limit: '2mb' }))

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const CLIENT_DIST = path.join(__dirname, '..', 'client', 'dist')
const PORT = process.env.PORT || 4000
const JOB_DIR = process.env.JOB_DIR || path.join(os.tmpdir(), 'learning-agent-jobs')
fs.mkdirSync(JOB_DIR, { recursive: true })

const MODULES_DIR = process.env.MODULES_DIR || path.join(__dirname, 'data', 'modules')
fs.mkdirSync(MODULES_DIR, { recursive: true })

const jobs = new Map()
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
const MAX_JOBS = 100

/* ------------------------------------------------------------------ */
/* AI helpers                                                          */
/* ------------------------------------------------------------------ */

function normalizeBaseUrl(baseUrl) {
  let url = (baseUrl || 'https://api.openai.com/v1').trim()
  if (!/^https?:\/\//i.test(url)) url = 'https://' + url
  return url.replace(/\/+$/, '')
}

function classifyError(status, text) {
  return (
    status === 429 ||
    (status >= 500 && status <= 599) ||
    /resourceexhausted|rate.?limit|quota|too many|overloaded|temporarily|try again later/i.test(text)
  )
}

async function callChat({ baseUrl, apiKey, model, messages, temperature = 0.3, maxTokens = 4000, retries = 5, onRetry }) {
  if (!model) throw new Error('Missing AI model. Provide it in Settings.')
  const url = `${normalizeBaseUrl(baseUrl)}/chat/completions`
  let delay = 1000

  for (let attempt = 1; attempt <= retries; attempt++) {
    let res
    try {
      res = await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(apiKey ? { Authorization: `Bearer ${apiKey}` } : {})
        },
        body: JSON.stringify({ model, messages, temperature, max_tokens: maxTokens })
      })
    } catch (e) {
      if (attempt < retries) {
        onRetry?.(attempt, retries, `network error: ${e.message}`)
        await sleep(delay)
        delay = Math.min(delay * 2, 20000) + Math.random() * 500
        continue
      }
      throw new Error(`Could not reach AI endpoint ${url}: ${e.message}`)
    }

    if (res.ok) {
      const data = await res.json()
      const content = data?.choices?.[0]?.message?.content
      if (!content) throw new Error('AI returned no content')
      return content
    }

    const text = await res.text()
    const retryable = classifyError(res.status, text)
    if (retryable && attempt < retries) {
      const retryAfter = parseInt(res.headers.get('retry-after') || '', 10)
      if (retryAfter > 0) delay = retryAfter * 1000
      onRetry?.(attempt, retries, `HTTP ${res.status}: ${text.slice(0, 200)}`)
      await sleep(delay)
      delay = Math.min(delay * 2, 20000) + Math.random() * 500
      continue
    }

    const err = new Error(`AI request failed (${res.status}): ${text.slice(0, 500)}`)
    err.retryable = retryable
    throw err
  }

  throw new Error('AI request failed after exhausting retries')
}

function extractJson(text) {
  const cleaned = String(text).replace(/```(?:json)?/gi, '').trim()
  const start = cleaned.indexOf('{')
  const end = cleaned.lastIndexOf('}')
  if (start === -1 || end === -1) throw new Error('No JSON found in AI response')
  return JSON.parse(cleaned.slice(start, end + 1))
}

async function callJson(opts) {
  const text = await callChat(opts)
  return extractJson(text)
}

/* ------------------------------------------------------------------ */
/* Prompts                                                             */
/* ------------------------------------------------------------------ */

function mainTopicsPrompt(topic) {
  return `You are a knowledgeable learning agent. A student wants to learn: "${topic}".

List the main topics that a complete learning module on this subject should cover, ordered from fundamentals to advanced.

Return ONLY valid JSON in this exact shape (no markdown, no extra text):
{
  "topics": ["topic 1", "topic 2", "..."]
}

Include between 6 and 10 main topics. Be comprehensive and specific.`
}

function subtopicsPrompt(mainTopic, subject) {
  return `You are a knowledgeable learning agent building a learning module for the subject "${subject}".

For the main topic "${mainTopic}", list the subtopics (learning units) a student must cover, and under each subtopic give concrete learning items (specific concepts, skills, or knowledge to learn).

Return ONLY valid JSON in this exact shape (no markdown, no extra text):
{
  "subtopics": [
    { "title": "subtopic title", "items": ["specific item 1", "specific item 2", "..."] }
  ]
}

Include 4 to 7 subtopics, and 2 to 4 items under each. Items must be concrete, actionable, and specific.`
}

function deepDivePrompt(item, subtopic, mainTopic, subject) {
  return `You are a knowledgeable learning agent. A student is learning "${subject}" (module: "${mainTopic}", section: "${subtopic}").

Write a concise study note for the learning item: "${item}".

Return ONLY valid JSON in this exact shape (no markdown, no extra text):
{
  "summary": "2-4 sentence plain-language explanation of the concept",
  "keyPoints": ["key point 1", "key point 2", "..."],
  "learnByDoing": "one concrete hands-on exercise the student can do to practice it",
  "resources": ["1-2 book/chapter or link references a learner can use"]
}`
}

/* ------------------------------------------------------------------ */
/* Concurrency pool                                                    */
/* ------------------------------------------------------------------ */

async function runPool(items, limit, fn) {
  const results = new Array(items.length)
  let idx = 0
  async function worker() {
    while (idx < items.length) {
      const i = idx++
      results[i] = await fn(items[i], i)
    }
  }
  await Promise.all(Array.from({ length: Math.min(limit, Math.max(items.length, 1)) }, worker))
  return results
}

/* ------------------------------------------------------------------ */
/* Job manager                                                         */
/* ------------------------------------------------------------------ */

function persistPath(id) {
  return path.join(JOB_DIR, `${id}.json`)
}

function emit(job, event) {
  job.events.push(event)
  const payload = `data: ${JSON.stringify(event)}\n\n`
  for (const res of job.listeners) {
    if (!res.writableEnded) res.write(payload)
  }
  saveJob(job)
}

function saveJob(job) {
  try {
    const clone = {
      id: job.id,
      topic: job.topic,
      status: job.status,
      logs: job.logs,
      topics: job.topics,
      module: job.module,
      progress: job.progress,
      pending: job.pending,
      errors: job.errors,
      warnings: job.warnings,
      fatalError: job.fatalError,
      config: { baseUrl: job.config?.baseUrl, model: job.config?.model }
    }
    fs.writeFileSync(persistPath(job.id), JSON.stringify(clone))
  } catch {
    /* non-fatal */
  }
}

function loadJob(id) {
  try {
    const raw = fs.readFileSync(persistPath(id), 'utf8')
    const data = JSON.parse(raw)
    const job = {
      ...data,
      config: { baseUrl: data.config?.baseUrl || '', model: data.config?.model || '', apiKey: '' },
      events: [],
      listeners: new Set(),
      running: false
    }
    jobs.set(job.id, job)
    return job
  } catch {
    return null
  }
}

function getJob(id) {
  return jobs.get(id) || loadJob(id)
}

function createJob(topic, config) {
  if (jobs.size >= MAX_JOBS) {
    const oldest = jobs.keys().next().value
    if (oldest) {
      jobs.delete(oldest)
      try { fs.unlinkSync(persistPath(oldest)) } catch { /* ignore */ }
    }
  }
  const job = {
    id: crypto.randomUUID(),
    topic,
    config,
    status: 'running',
    logs: [],
    topics: [],
    module: { subject: topic, mainTopics: [] },
    progress: { done: 0, total: 0 },
    pending: [],
    errors: {},
    warnings: [],
    fatalError: null,
    events: [],
    listeners: new Set(),
    running: false
  }
  jobs.set(job.id, job)
  saveJob(job)
  return job
}

/* ------------------------------------------------------------------ */
/* Job runner (retries + resume)                                       */
/* ------------------------------------------------------------------ */

const MAX_ROUNDS = 4
const ROUND_DELAY = 3000

async function runJob(job) {
  if (job.running) return
  job.running = true
  try {
    if (job.status === 'error') {
      job.status = 'running'
      job.fatalError = null
    }

    if (job.topics.length === 0) {
      emit(job, { type: 'status', message: 'Analyzing your topic and mapping the main topics...' })
      try {
        const data = await callJson({
          ...job.config,
          retries: 5,
          onRetry: (a, t, why) => emit(job, { type: 'status', message: `Main topics call rate-limited — retrying (${a}/${t})… ${why}` }),
          messages: [{ role: 'user', content: mainTopicsPrompt(job.topic) }]
        })
        const topics = Array.isArray(data.topics) ? data.topics.map(String).map(s => s.trim()).filter(Boolean) : []
        if (topics.length === 0) throw new Error('AI returned no topics. Check your endpoint and try again.')
        job.topics = topics
        job.pending = topics.map((title, index) => ({ title, index }))
        job.progress = { done: 0, total: topics.length }
        emit(job, { type: 'topics', topics })
        emit(job, { type: 'status', message: `Found ${topics.length} main topics. Building the subtopic tree...` })
      } catch (e) {
        job.status = 'error'
        job.fatalError = e.message
        emit(job, { type: 'error', message: e.message })
        return
      }
    }

    let round = 0
    while (job.pending.length > 0 && round < MAX_ROUNDS) {
      round++
      const batch = job.pending.slice()
      job.pending = []
      emit(job, { type: 'status', message: `Expanding sections (round ${round}/${MAX_ROUNDS})…` })

      await runPool(batch, 3, async ({ title, index }) => {
        try {
          const subData = await callJson({
            ...job.config,
            retries: 5,
            onRetry: (a, t, why) => emit(job, { type: 'status', message: `Rate-limited on "${title}" — retrying (${a}/${t})… ${why}` }),
            messages: [{ role: 'user', content: subtopicsPrompt(title, job.topic) }]
          })
          const subtopics = Array.isArray(subData.subtopics) ? subData.subtopics : []
          const cleaned = subtopics
            .map((s) => ({
              title: String(s.title || '').trim(),
              items: (Array.isArray(s.items) ? s.items : []).map(String).map(x => x.trim()).filter(Boolean)
            }))
            .filter((s) => s.title && s.items.length > 0)
          job.module.mainTopics.push({ index, title, subtopics: cleaned })
          job.progress.done++
          emit(job, { type: 'topicResult', index, title, subtopics: cleaned })
        } catch (e) {
          job.errors[title] = e.message
          if (e.retryable) {
            job.pending.push({ title, index })
          } else {
            job.module.mainTopics.push({ index, title, subtopics: [], error: e.message })
            job.progress.done++
            emit(job, { type: 'topicResult', index, title, subtopics: [], error: e.message })
          }
        }
        emit(job, { type: 'progress', done: job.progress.done, total: job.progress.total })
      })

      if (job.pending.length > 0 && round < MAX_ROUNDS) {
        emit(job, {
          type: 'status',
          message: `Waiting ${Math.round(ROUND_DELAY / 1000)}s for the rate limit to cool down (${job.pending.length} section${job.pending.length > 1 ? 's' : ''} still pending)…`
        })
        await sleep(ROUND_DELAY)
      }
    }

    for (const { title, index } of job.pending) {
      const msg = job.errors[title] || 'Failed after multiple attempts'
      job.module.mainTopics.push({ index, title, subtopics: [], error: msg })
      job.progress.done++
      emit(job, { type: 'topicResult', index, title, subtopics: [], error: msg })
    }
    job.pending = []

    job.warnings = job.module.mainTopics.filter((t) => t.error).map((t) => `${t.title}: ${t.error}`)
    job.status = 'done'
    emit(job, { type: 'done', module: job.module, warnings: job.warnings })
  } finally {
    job.running = false
    saveJob(job)
  }
}

function resumeJob(job, config) {
  if (config) {
    job.config = { ...job.config, ...config }
    saveJob(job)
  }
  const failed = job.module.mainTopics.filter((t) => t.error && t.subtopics.length === 0)
  const idxMap = new Map(job.topics.map((t, i) => [t, i]))
  job.module.mainTopics = job.module.mainTopics.filter((t) => !(t.error && t.subtopics.length === 0))
  job.errors = {}
  job.pending = failed.map((t) => ({ title: t.title, index: idxMap.get(t.title) ?? 0 }))
  job.progress = { done: job.topics.length - job.pending.length, total: job.topics.length }
  job.warnings = []
  job.status = 'running'
  emit(job, { type: 'status', message: `Retrying ${job.pending.length} failed section${job.pending.length > 1 ? 's' : ''}…` })
  runJob(job)
}

/* ------------------------------------------------------------------ */
/* Module file persistence (.md + .json)                              */
/* ------------------------------------------------------------------ */

function slugify(text) {
  return String(text).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 60) || 'module'
}

function moduleDir(slug) {
  return path.join(MODULES_DIR, slug)
}

function countModuleItems(module) {
  if (!module?.mainTopics) return 0
  return module.mainTopics.reduce((a, t) => a + t.subtopics.reduce((b, s) => b + s.items.length, 0), 0)
}

function generateMarkdown(module, notes) {
  const lines = []
  lines.push(`# ${module.subject}`)
  lines.push('')
  lines.push(`> Generated by Learning Agent at ${new Date().toLocaleString()}`)
  lines.push('')
  ;[...module.mainTopics].sort((a, b) => (a.index ?? 0) - (b.index ?? 0)).forEach((main, mi) => {
    lines.push(`## ${mi + 1}. ${main.title}`)
    lines.push('')
    main.subtopics.forEach((sub, si) => {
      lines.push(`### ${mi + 1}.${si + 1} ${sub.title}`)
      lines.push('')
      sub.items.forEach((item, ii) => {
        lines.push(`**${mi + 1}.${si + 1}.${ii + 1}. ${item}**`)
        const note = notes?.[`${main.title}::${sub.title}::${item}`]
        if (note) {
          lines.push('')
          lines.push(note.summary || '')
          if (note.keyPoints?.length) {
            lines.push('')
            lines.push('Key points:')
            note.keyPoints.forEach((kp) => lines.push(`- ${kp}`))
          }
          if (note.learnByDoing) {
            lines.push('')
            lines.push(`*Practice:* ${note.learnByDoing}`)
          }
          if (note.resources?.length) {
            lines.push('')
            lines.push('Resources:')
            note.resources.forEach((r) => lines.push(`- ${r}`))
          }
        }
        lines.push('')
      })
    })
  })
  return lines.join('\n')
}

function readModuleIndex() {
  try {
    return JSON.parse(fs.readFileSync(path.join(MODULES_DIR, 'index.json'), 'utf8')) || []
  } catch {
    return []
  }
}

function writeModuleIndex(index) {
  try {
    fs.writeFileSync(path.join(MODULES_DIR, 'index.json'), JSON.stringify(index))
  } catch { /* ignore */ }
}

function loadModuleRecord(slug) {
  try {
    return JSON.parse(fs.readFileSync(path.join(moduleDir(slug), 'module.json'), 'utf8'))
  } catch {
    return null
  }
}

function saveModuleRecord({ subject, module, notes, warnings, markdown }) {
  const slug = slugify(subject)
  fs.mkdirSync(moduleDir(slug), { recursive: true })
  const record = { subject, slug, module, notes: notes || {}, warnings: warnings || [], savedAt: Date.now() }
  fs.writeFileSync(path.join(moduleDir(slug), 'module.json'), JSON.stringify(record))
  fs.writeFileSync(path.join(moduleDir(slug), 'module.md'), markdown || generateMarkdown(module, notes || {}))
  const index = readModuleIndex()
  const idx = index.findIndex((e) => e.slug === slug)
  const entry = {
    subject,
    slug,
    savedAt: record.savedAt,
    items: countModuleItems(module),
    notesCount: Object.keys(notes || {}).length
  }
  if (idx === -1) index.unshift(entry)
  else index[idx] = entry
  writeModuleIndex(index)
  return record
}

function rebuildModuleIndex() {
  let index
  try {
    index = fs.readdirSync(MODULES_DIR, { withFileTypes: true })
      .filter((d) => d.isDirectory())
      .map((d) => loadModuleRecord(d.name))
      .filter(Boolean)
      .map((rec) => ({
        subject: rec.subject,
        slug: rec.slug,
        savedAt: rec.savedAt,
        items: countModuleItems(rec.module),
        notesCount: Object.keys(rec.notes || {}).length
      }))
      .sort((a, b) => b.savedAt - a.savedAt)
  } catch {
    index = []
  }
  if (index.length) writeModuleIndex(index)
  return index
}

/* ------------------------------------------------------------------ */
/* Endpoints                                                           */
/* ------------------------------------------------------------------ */

app.get('/api/health', (_req, res) => {
  res.json({ ok: true })
})

/* ----- saved modules (.md files) ----- */

app.get('/api/modules', (_req, res) => {
  let index = readModuleIndex()
  if (index.length === 0) index = rebuildModuleIndex()
  res.json(index)
})

app.get('/api/modules/latest', (_req, res) => {
  let index = readModuleIndex()
  if (index.length === 0) index = rebuildModuleIndex()
  if (index.length === 0) return res.json(null)
  res.json(loadModuleRecord(index[0].slug))
})

app.get('/api/modules/:slug', (req, res) => {
  const rec = loadModuleRecord(slugify(req.params.slug))
  if (!rec) return res.status(404).json({ error: 'Module not found' })
  res.json(rec)
})

app.get('/api/modules/:slug/raw', (req, res) => {
  const slug = slugify(req.params.slug)
  const file = path.join(moduleDir(slug), 'module.md')
  if (!fs.existsSync(file)) return res.status(404).json({ error: 'Module file not found' })
  res.type('text/markdown')
  res.setHeader('Content-Disposition', `attachment; filename="${slug}-module.md"`)
  res.sendFile(file)
})

app.post('/api/modules/save', (req, res) => {
  const { subject, module, notes, warnings, markdown } = req.body || {}
  if (!subject || !module) return res.status(400).json({ error: 'Missing subject or module' })
  try {
    const record = saveModuleRecord({ subject, module, notes: notes || {}, warnings: warnings || [], markdown })
    res.json({ ok: true, slug: record.slug, savedAt: record.savedAt })
  } catch (e) {
    res.status(500).json({ error: e.message })
  }
})

app.post('/api/ai/chat', async (req, res) => {
  const { config, messages, temperature } = req.body || {}
  if (!config || !messages) return res.status(400).json({ error: 'Missing config or messages' })
  try {
    const content = await callChat({ ...config, messages, temperature })
    res.json({ content })
  } catch (e) {
    res.status(500).json({ error: e.message })
  }
})

app.post('/api/module/generate', (req, res) => {
  const { topic, config } = req.body || {}
  if (!topic || !config) return res.status(400).json({ error: 'Missing topic or AI config' })
  const job = createJob(topic, config)
  runJob(job)
  res.json({ id: job.id })
})

app.get('/api/module/generate/:id/events', (req, res) => {
  const { id } = req.params
  const job = getJob(id)
  if (!job) return res.status(404).json({ error: 'Generation session not found' })

  res.writeHead(200, {
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache',
    Connection: 'keep-alive'
  })
  const snapshot = {
    type: 'snapshot',
    job: {
      status: job.status,
      logs: job.logs,
      topics: job.topics,
      module: job.module,
      progress: job.progress,
      warnings: job.warnings,
      fatalError: job.fatalError,
      pending: job.pending
    }
  }
  res.write(`data: ${JSON.stringify(snapshot)}\n\n`)

  job.listeners.add(res)
  req.on('close', () => job.listeners.delete(res))

  if (job.status === 'running' && !job.running) runJob(job)
})

app.post('/api/module/:id/config', (req, res) => {
  const { id } = req.params
  const { config } = req.body || {}
  const job = getJob(id)
  if (!job) return res.status(404).json({ error: 'Generation session not found' })
  if (config) {
    job.config = { ...job.config, ...config }
    saveJob(job)
  }
  res.json({ ok: true })
})

app.post('/api/module/:id/resume', (req, res) => {
  const { id } = req.params
  const { config } = req.body || {}
  const job = getJob(id)
  if (!job) return res.status(404).json({ error: 'Generation session not found' })
  if (job.status === 'running') return res.status(409).json({ error: 'Generation is already running' })
  resumeJob(job, config)
  res.json({ id: job.id })
})

app.post('/api/module/note', async (req, res) => {
  const { item, subtopic, mainTopic, subject, config } = req.body || {}
  if (!item || !config) return res.status(400).json({ error: 'Missing item or config' })
  try {
    const note = await callJson({
      ...config,
      retries: 5,
      messages: [{ role: 'user', content: deepDivePrompt(item, subtopic, mainTopic, subject) }]
    })
    res.json({ note })
  } catch (e) {
    res.status(500).json({ error: e.message })
  }
})

/* ------------------------------------------------------------------ */
/* Static client                                                       */
/* ------------------------------------------------------------------ */

app.use(express.static(CLIENT_DIST))
app.get('*', (_req, res) => {
  res.sendFile(path.join(CLIENT_DIST, 'index.html'))
})

app.listen(PORT, () => {
  console.log(`Learning Agent server listening on http://localhost:${PORT}`)
})
