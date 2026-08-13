import express from 'express'
import path from 'path'
import os from 'os'
import fs from 'fs'
import crypto from 'crypto'
import { fileURLToPath } from 'url'
import { initAiLog, logInteraction, listLogs, getLog } from './ai-log.js'

const app = express()
app.use(express.json({ limit: '2mb' }))

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const CLIENT_DIST = path.join(__dirname, '..', 'client', 'dist')
const PORT = process.env.PORT || 4001
const JOB_DIR = process.env.JOB_DIR || path.join(os.tmpdir(), 'learning-agent-jobs')
fs.mkdirSync(JOB_DIR, { recursive: true })

const MODULES_DIR = process.env.MODULES_DIR || path.join(__dirname, 'data', 'modules')
fs.mkdirSync(MODULES_DIR, { recursive: true })

const AI_LOG_DIR = process.env.AI_LOG_DIR || path.join(__dirname, 'data', 'ai-logs')
initAiLog(AI_LOG_DIR)

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

/* Ollama serves its OpenAI-compatible API at /v1, not /api or the host root.
   Derive the bare host from a base URL that may end in /v1, /api, or nothing. */
function ollamaHost(baseUrl) {
  return normalizeBaseUrl(baseUrl).replace(/\/v1$|\/api$/i, '')
}

/* Build the chat completions URL. Corrects common Ollama mistakes so that
   http://host:11434, http://host:11434/api and http://host:11434/v1 all hit
   http://host:11434/v1/chat/completions; OpenAI-compatible bases are unchanged. */
function buildCompletionsUrl(baseUrl) {
  let url = (baseUrl || 'https://api.openai.com/v1').trim()
  if (!/^https?:\/\//i.test(url)) url = 'https://' + url
  url = url.replace(/\/+$/, '')
  const path = url.replace(/^https?:\/\/[^/]+/, '').replace(/\/+$/, '').toLowerCase()
  if (path === '' || path === '/api') {
    return `${url.replace(/\/api$/i, '')}/v1/chat/completions`
  }
  return `${url}/chat/completions`
}

function classifyError(status, text) {
  return (
    status === 429 ||
    (status >= 500 && status <= 599) ||
    /resourceexhausted|rate.?limit|quota|too many|overloaded|temporarily|try again later/i.test(text)
  )
}

async function callChat({ baseUrl, apiKey, model, messages, temperature = 0.3, maxTokens = 4000, retries = 5, onRetry, parseJson = false }) {
  if (!model) throw new Error('Missing AI model. Provide it in Settings.')
  const url = buildCompletionsUrl(baseUrl)
  const started = Date.now()
  const entry = {
    time: new Date().toISOString(),
    baseUrl: url,
    model,
    kind: parseJson ? 'json' : 'chat',
    temperature,
    maxTokens,
    parseJson,
    messages,
    attempts: [],
    output: null,
    success: false,
    parsed: null,
    error: null
  }

  // Console activity logging
  const logActivity = (stage, details = {}) => {
    const elapsed = Date.now() - started
    console.log(`[AI:${stage}] ${model} | ${elapsed}ms | ${JSON.stringify(details)}`)
  }

  logActivity('REQUEST_START', { url, parseJson, messageCount: messages.length, maxTokens, temperature })

  const finish = (patch) => {
    Object.assign(entry, patch, { durationMs: Date.now() - started })
    logInteraction(entry)
  }
  let delay = 1000

  for (let attempt = 1; attempt <= retries; attempt++) {
    let res
    const attemptStart = Date.now()
    try {
      logActivity('FETCH_START', { attempt, retries })
      res = await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(apiKey ? { Authorization: `Bearer ${apiKey}` } : {})
        },
        body: JSON.stringify({ model, messages, temperature, max_tokens: maxTokens })
      })
      logActivity('FETCH_RESPONSE', { attempt, status: res.status, durationMs: Date.now() - attemptStart })
    } catch (e) {
      const durationMs = Date.now() - attemptStart
      logActivity('FETCH_ERROR', { attempt, error: e.message, durationMs })
      entry.attempts.push({ attempt, error: e.message })
      if (attempt < retries) {
        onRetry?.(attempt, retries, `network error: ${e.message}`)
        logActivity('RETRY_WAIT', { attempt, delayMs: delay, reason: `network error: ${e.message}` })
        await sleep(delay)
        delay = Math.min(delay * 2, 20000) + Math.random() * 500
        continue
      }
      const err = new Error(`Could not reach AI endpoint ${url}: ${e.message}`)
      finish({ error: err.message })
      logActivity('REQUEST_FAILED', { error: err.message, totalDurationMs: Date.now() - started })
      throw err
    }

    const text = await res.text()
    let content = null
    if (res.ok) {
      try {
        content = JSON.parse(text)?.choices?.[0]?.message?.content ?? null
      } catch {
        content = null
      }
    }

    if (content) {
      entry.output = content
      entry.attempts.push({
        attempt,
        status: res.status,
        ok: true,
        content: content.length > 12000 ? `${content.slice(0, 12000)}…` : content
      })
      entry.success = true

      if (!parseJson) {
        finish({ parsed: null })
        logActivity('REQUEST_SUCCESS', { totalDurationMs: Date.now() - started, contentLength: content.length })
        return content
      }

      try {
        extractJson(content)
        finish({ parsed: true })
        logActivity('REQUEST_SUCCESS_JSON', { totalDurationMs: Date.now() - started, contentLength: content.length })
        return content
      } catch (e) {
        entry.parsed = false
        entry.attempts[entry.attempts.length - 1].parseError = e.message
        const parseErr = `AI returned unparseable output (${e.message})`
        logActivity('PARSE_ERROR', { attempt, error: e.message })
        if (attempt < retries) {
          onRetry?.(attempt, retries, parseErr)
          logActivity('RETRY_WAIT', { attempt, delayMs: delay, reason: parseErr })
          await sleep(delay)
          delay = Math.min(delay * 2, 20000) + Math.random() * 500
          continue
        }
        const err = new Error(parseErr)
        err.retryable = true
        finish({ error: parseErr })
        logActivity('REQUEST_FAILED', { error: parseErr, totalDurationMs: Date.now() - started })
        throw err
      }
    }

    const retryable = classifyError(res.status, text)
    const errText = res.ok ? 'AI returned no content' : text
    entry.attempts.push({ attempt, status: res.status, ok: false, retryable, error: errText.slice(0, 500) })
    logActivity('REQUEST_ERROR', { attempt, status: res.status, retryable, error: errText.slice(0, 200) })
    if (retryable && attempt < retries) {
      const retryAfter = parseInt(res.headers.get('retry-after') || '', 10)
      if (retryAfter > 0) delay = retryAfter * 1000
      onRetry?.(attempt, retries, `HTTP ${res.status}: ${text.slice(0, 200)}`)
      logActivity('RETRY_WAIT', { attempt, delayMs: delay, reason: `HTTP ${res.status}: ${text.slice(0, 100)}` })
      await sleep(delay)
      delay = Math.min(delay * 2, 20000) + Math.random() * 500
      continue
    }

    const errMsg = res.ok ? 'AI returned no content' : `AI request failed (${res.status}): ${text.slice(0, 500)}`
    const err = new Error(errMsg)
    err.retryable = retryable
    finish({ error: errMsg })
    logActivity('REQUEST_FAILED', { error: errMsg, totalDurationMs: Date.now() - started })
    throw err
  }

  const err = new Error('AI request failed after exhausting retries')
  finish({ error: err.message })
  logActivity('REQUEST_FAILED', { error: err.message, totalDurationMs: Date.now() - started })
  throw err
}

function extractJson(text) {
  const cleaned = String(text).replace(/```(?:json)?/gi, '').trim()
  const start = cleaned.indexOf('{')
  const end = cleaned.lastIndexOf('}')
  if (start === -1 || end === -1) throw new Error('No JSON found in AI response')
  return JSON.parse(cleaned.slice(start, end + 1))
}

async function callJson(opts) {
  const text = await callChat({ ...opts, parseJson: true })
  return extractJson(text)
}

/* ------------------------------------------------------------------ */
/* Prompts                                                             */
/* ------------------------------------------------------------------ */

function mainTopicsPrompt(topic, mode = 'module') {
  if (mode === 'roadmap') {
    return `You are a career and learning coach designing a step-by-step ROADMAP to achieve the goal: "${topic}".

Analyze what it takes to reach this goal and identify ALL the COURSES / subject areas the learner must complete — the full set of knowledge and skills, from foundations to advanced to applied.

Return ONLY valid JSON in this exact shape (no markdown, no extra text):
{
  "title": "A short, catchy name for the whole roadmap, e.g. \"Frontend Engineering Roadmap\"",
  "topics": ["course 1", "course 2", "..."]
}

Requirements:
- "title": Name the roadmap. For the goal "become a frontend engineer" use "Frontend Engineering Roadmap".
- "topics": Include 8-12 courses. For "become a frontend engineer" this would include things like HTML/CSS, JavaScript, React, Next.js, state management, GraphQL/APIs, testing, tooling, and deployment.
- Order strictly by dependency: foundations first, then intermediate, advanced, and finally applied/specialized.
- Each course title must be descriptive and specific.
- Courses should be mutually exclusive but collectively exhaustive for reaching the goal.`
  }

  return `You are an expert curriculum designer creating a comprehensive learning module. A student wants to master: "${topic}".

Design the MAIN TOPICS (modules/chapters) for a complete, structured learning path that takes a learner from absolute beginner to confident practitioner.

Return ONLY valid JSON in this exact shape (no markdown, no extra text):
{
  "topics": ["topic 1", "topic 2", "..."]
}

Requirements:
- Include 7-10 main topics (not 6, aim for completeness)
- Order strictly from fundamentals → intermediate → advanced → specialized/applied
- Each topic title must be descriptive and specific (e.g., not just "Variables" but "Variables, Data Types, and Type Systems")
- Cover the full breadth: core concepts, patterns/practices, tools/ecosystem, real-world application, and emerging topics
- Topics should be mutually exclusive but collectively exhaustive for the subject
`
}

function subtopicsPrompt(mainTopic, subject, mode = 'module') {
  const intro =
    mode === 'roadmap'
      ? `You are designing a course for the learning roadmap "${subject}".

For the course "${mainTopic}", create a comprehensive breakdown of MODULES and LESSONS that a student must master.`
      : `You are an expert curriculum designer building a detailed learning module for "${subject}".

For the main topic "${mainTopic}", create a comprehensive breakdown of SUBTOPICS and LEARNING ITEMS that a student must master.`

  return `${intro}

Return ONLY valid JSON in this exact shape (no markdown, no extra text):
{
  "subtopics": [
    { "title": "descriptive subtopic title", "items": ["specific learning item 1", "specific learning item 2", "..."] }
  ]
}

Requirements:
- Create 5-7 subtopics per main topic (not just 4)
- Each subtopic title must be descriptive and self-contained (e.g., not "Basics" but "Fundamental Syntax and Core Constructs")
- Provide 3-5 concrete learning items per subtopic (not just 2-4)
- Items must be specific, actionable, and measurable (e.g., not "Understand loops" but "Write for-loops, while-loops, and loop control statements (break/continue) with proper exit conditions")
- Items should cover: key concepts/definitions, syntax/patterns, common pitfalls, best practices, and practical applications
- Progress logically within the main topic: foundations → core techniques → patterns/idioms → advanced nuances → practical application
- Avoid generic filler; every item should represent something a learner can actually practice or demonstrate`
}

function itemsPrompt(mainTopic, subtopic, subject) {
  return `You are an expert curriculum designer. For the subject "${subject}", within the course/module "${mainTopic}", create the learning items (lessons/topics) for the subtopic: "${subtopic}".

Return ONLY valid JSON in this exact shape (no markdown, no extra text):
{
  "items": ["specific learning item 1", "specific learning item 2", "..."]
}

Requirements:
- Provide 5-7 concrete learning items
- Items must be specific, actionable, and measurable
- Cover: key concepts, syntax/patterns, common pitfalls, best practices, and practical application
- Avoid generic filler; every item should represent something a learner can actually practice or demonstrate`
}

function deepDivePrompt(item, subtopic, mainTopic, subject) {
  return `You are an expert tutor writing a comprehensive study note for a learner. The student is studying "${subject}" → "${mainTopic}" → "${subtopic}".

Create a detailed study note for the specific learning item: "${item}".

Return ONLY valid JSON in this exact shape (no markdown, no extra text):
{
  "summary": "4-6 sentence thorough explanation covering what it is, why it matters, how it works, and when to use it. Include a concrete example or analogy.",
  "keyPoints": [
    "Essential concept/definition (1-2 items)",
    "Critical syntax, patterns, or rules (1-2 items)",
    "Common mistakes, edge cases, or gotchas (1-2 items)",
    "Best practices or pro tips (1-2 items)",
    "How it connects to related concepts (1 item)"
  ],
  "learnByDoing": "A specific, hands-on exercise with clear steps and success criteria. Example: 'Create a function that takes an array and returns a new array with only even numbers, using filter(). Test with [1,2,3,4,5,6]. Expected output: [2,4,6].'",
  "resources": [
    "Primary authoritative reference (official docs, spec, or canonical book chapter with section)",
    "Supplementary practical guide, tutorial, or deep-dive article with specific URL or title"
  ]
}

Requirements:
- Summary: 4-6 sentences minimum. Make it substantial enough to stand alone as a reference.
- Key points: 5-7 items covering concepts, syntax, pitfalls, best practices, and connections.
- Exercise: Must be concrete, runnable/verifiable, and directly practice the item.
- Resources: 2 specific references with enough detail to find them (title + section/chapter, or full URL).`
}

function reviewPrompt(item, subtopic, mainTopic, subject, note) {
  return `You are an expert tutor reviewing and improving a study note. The student is learning "${subject}" → "${mainTopic}" → "${subtopic}".

A different AI assistant wrote this study note for: "${item}".

ORIGINAL NOTE:
${JSON.stringify(note, null, 2)}

Write a SIGNIFICANTLY IMPROVED study note. Your version must be more thorough, accurate, and practically useful. Address any gaps, inaccuracies, or oversimplifications in the original.

Return ONLY valid JSON in this exact shape (no markdown, no extra text):
{
  "summary": "5-7 sentence comprehensive explanation: what it is, why it matters, how it works internally, when to use it vs alternatives, a concrete example, and a common misconception clarified.",
  "keyPoints": [
    "Precise definition with technical accuracy (1 item)",
    "Core mechanics / syntax / patterns with nuances (1-2 items)",
    "Critical edge cases, pitfalls, or anti-patterns to avoid (1-2 items)",
    "Best practices, idioms, or performance considerations (1-2 items)",
    "How it relates to / differs from similar concepts (1 item)",
    "Real-world scenario where this is the right tool (1 item)"
  ],
  "learnByDoing": "A multi-step hands-on exercise that builds understanding progressively. Include: (1) a simple starter task, (2) a variation that tests edge cases, (3) a realistic mini-project applying it. Example: '1. Write a function using map() to double array elements. 2. Modify it to handle nested arrays. 3. Build a data pipeline that fetches JSON, transforms it with map/filter/reduce, and outputs a summary report.'",
  "resources": [
    "Authoritative primary source (official specification, RFC, or canonical textbook with chapter/section)",
    "High-quality practical guide or deep-dive (specific article title + URL, or book chapter)",
    "Reference for advanced/related topic (e.g., design patterns, performance, or ecosystem tooling)"
  ]
}

Requirements:
- Summary: 5-7 sentences. Go deeper than the original.
- Key points: 6-8 items. Include things the original missed.
- Exercise: Multi-part, progressive difficulty, realistic.
- Resources: 3 specific, high-quality references.`
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
      roadmapTitle: job.roadmapTitle,
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

function createJob(topic, config, mode = 'module') {
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
    mode,
    status: 'running',
    logs: [],
    topics: [],
    roadmapTitle: '',
    module: { subject: topic, mode, mainTopics: [] },
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
          messages: [{ role: 'user', content: mainTopicsPrompt(job.topic, job.mode) }]
        })
        const topics = Array.isArray(data.topics) ? data.topics.map(String).map(s => s.trim()).filter(Boolean) : []
        if (topics.length === 0) throw new Error('AI returned no topics. Check your endpoint and try again.')
        if (typeof data.title === 'string' && data.title.trim()) job.roadmapTitle = data.title.trim()
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
            messages: [{ role: 'user', content: subtopicsPrompt(title, job.topic, job.mode) }]
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

    if (job.mode === 'roadmap' && !job.module.mainTopics.some((t) => t.title === 'Roadmap')) {
      const roadmapItem = job.roadmapTitle || `${job.topic} Roadmap`
      job.module.mainTopics.unshift({
        index: -1,
        title: 'Roadmap',
        subtopics: [{ title: 'Overview', items: [roadmapItem] }]
      })
      job.roadmapTitle = roadmapItem
    }

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
  return module.mainTopics
    .filter((t) => t.title !== 'Roadmap')
    .reduce((a, t) => a + t.subtopics.reduce((b, s) => b + s.items.length, 0), 0)
}

function generateMarkdown(module, notes, progress) {
  const lines = []
  lines.push(`# ${module.subject}`)
  lines.push('')
  lines.push(`> Generated by Learning Agent at ${new Date().toLocaleString()}`)
  lines.push('')
  if (progress) {
    const keys = Object.keys(progress || {})
    const done = keys.filter((k) => progress[k] === 'done').length
    const started = keys.filter((k) => progress[k] === 'in-progress').length
    const total = countModuleItems(module)
    if (total > 0) {
      lines.push(`**Progress:** ${done}/${total} lessons done (${started} in progress)`)
      lines.push('')
    }
  }
  ;[...module.mainTopics].sort((a, b) => (a.index ?? 0) - (b.index ?? 0)).forEach((main, mi) => {
    lines.push(`## ${mi + 1}. ${main.title}`)
    lines.push('')
    main.subtopics.forEach((sub, si) => {
      lines.push(`### ${mi + 1}.${si + 1} ${sub.title}`)
      lines.push('')
      sub.items.forEach((item, ii) => {
        const key = `${main.title}::${sub.title}::${item}`
        const mark = progress?.[key] === 'done' ? '[x]' : progress?.[key] === 'in-progress' ? '[/]' : '[ ]'
        lines.push(`- ${mark} **${mi + 1}.${si + 1}.${ii + 1}. ${item}**`)
        const note = notes?.[key]
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

function saveModuleRecord({ subject, module, notes, warnings, progress, markdown }) {
  const slug = slugify(subject)
  fs.mkdirSync(moduleDir(slug), { recursive: true })
  const record = { subject, slug, module, notes: notes || {}, warnings: warnings || [], progress: progress || {}, savedAt: Date.now() }
  fs.writeFileSync(path.join(moduleDir(slug), 'module.json'), JSON.stringify(record))
  fs.writeFileSync(path.join(moduleDir(slug), 'module.md'), markdown || generateMarkdown(module, notes || {}, progress))
  const index = readModuleIndex()
  const idx = index.findIndex((e) => e.slug === slug)
  const entry = {
    subject,
    slug,
    mode: module.mode || 'module',
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
        mode: rec.module?.mode || 'module',
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

/* ----- AI interaction logs ----- */

app.get('/api/logs', (_req, res) => {
  res.json({ logs: listLogs() })
})

app.get('/api/logs/:id', (req, res) => {
  const log = getLog(req.params.id)
  if (!log) return res.status(404).json({ error: 'Log entry not found' })
  res.json(log)
})

/* ----- model discovery (Ollama /api/tags, OpenAI-compatible /models) ----- */

app.post('/api/ai/discover-models', async (req, res) => {
  const { baseUrl, apiKey } = req.body || {}
  if (!baseUrl) return res.status(400).json({ error: 'Missing baseUrl' })
  const base = normalizeBaseUrl(baseUrl)
  const models = []
  let source = null
  let ollamaBase = null

  const hostRoot = ollamaHost(baseUrl)
  try {
    const r = await fetch(`${hostRoot}/api/tags`, { signal: AbortSignal.timeout(5000) })
    if (r.ok) {
      const data = await r.json()
      for (const m of data.models || []) {
        const name = String(m.name || '').replace(/:latest$/, '')
        if (name) models.push(name)
      }
      source = 'ollama'
      ollamaBase = `${hostRoot}/v1`
    }
  } catch { /* not ollama */ }

  if (models.length === 0) {
    try {
      const r = await fetch(`${base}/models`, {
        headers: apiKey ? { Authorization: `Bearer ${apiKey}` } : {},
        signal: AbortSignal.timeout(5000)
      })
      if (r.ok) {
        const data = await r.json()
        for (const m of data.data || []) {
          if (m && m.id) models.push(String(m.id))
        }
        source = 'openai'
      }
    } catch { /* unreachable */ }
  }

  res.json({ models, source, base, ...(ollamaBase ? { ollamaBase } : {}) })
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

app.delete('/api/modules/:slug', (req, res) => {
  const slug = slugify(req.params.slug)
  try {
    fs.rmSync(moduleDir(slug), { recursive: true, force: true })
    const index = readModuleIndex().filter((e) => e.slug !== slug)
    writeModuleIndex(index)
    res.json({ ok: true })
  } catch (e) {
    res.status(500).json({ error: e.message })
  }
})

app.post('/api/modules/save', (req, res) => {
  const { subject, module, notes, warnings, progress, markdown } = req.body || {}
  if (!subject || !module) return res.status(400).json({ error: 'Missing subject or module' })
  try {
    const record = saveModuleRecord({ subject, module, notes: notes || {}, warnings: warnings || [], progress: progress || {}, markdown })
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
  const { topic, config, mode } = req.body || {}
  if (!topic || !config) return res.status(400).json({ error: 'Missing topic or AI config' })
  const job = createJob(topic, config, mode === 'roadmap' ? 'roadmap' : 'module')
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

app.post('/api/module/note/review', async (req, res) => {
  const { item, subtopic, mainTopic, subject, note, config, reviewConfig } = req.body || {}
  const cfg = reviewConfig || config
  if (!item || !note || !cfg) return res.status(400).json({ error: 'Missing item, note, or config' })
  try {
    const reviewed = await callJson({
      ...cfg,
      retries: 5,
      messages: [{ role: 'user', content: reviewPrompt(item, subtopic, mainTopic, subject, note) }]
    })
    res.json({ note: reviewed })
  } catch (e) {
    res.status(500).json({ error: e.message })
  }
})

app.post('/api/ai/expand', async (req, res) => {
  const { kind, config, subject, mainTopic, subtopic } = req.body || {}
  if (!kind || !config) return res.status(400).json({ error: 'Missing kind or config' })
  try {
    if (kind === 'subtopics') {
      if (!mainTopic) return res.status(400).json({ error: 'Missing mainTopic' })
      const data = await callJson({
        ...config,
        retries: 3,
        messages: [{ role: 'user', content: subtopicsPrompt(mainTopic, subject || '') }]
      })
      const subtopics = (Array.isArray(data.subtopics) ? data.subtopics : [])
        .map((s) => ({
          title: String(s.title || '').trim(),
          items: (Array.isArray(s.items) ? s.items : []).map(String).map((x) => x.trim()).filter(Boolean)
        }))
        .filter((s) => s.title && s.items.length)
      res.json({ subtopics })
    } else if (kind === 'items') {
      if (!mainTopic || !subtopic) return res.status(400).json({ error: 'Missing mainTopic or subtopic' })
      const data = await callJson({
        ...config,
        retries: 3,
        messages: [{ role: 'user', content: itemsPrompt(mainTopic, subtopic, subject || '') }]
      })
      const items = (Array.isArray(data.items) ? data.items : []).map(String).map((x) => x.trim()).filter(Boolean)
      res.json({ items })
    } else {
      res.status(400).json({ error: `Unknown kind: ${kind}` })
    }
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
