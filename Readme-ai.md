# Learning Agent — AI Quick-Reference

Token-efficient guide for AI agents working on this repo. Read this file first, then jump straight to the relevant files below. Line numbers refer to the current `main`.

## What it is

An AI-powered learning-module / roadmap generator. User enters a topic (or a goal in **roadmap** mode); the app calls an LLM over an OpenAI-compatible endpoint to build a curriculum tree, generates per-lesson study notes, tracks progress, saves modules as `.md`+`.json`, and lets the user chat about the topic. Supports multiple AI endpoints (OpenAI-compatible + Ollama), AI-call logging, manual editing, and AI expansion.

Monorepo: `server/` (Node + Express, no framework deps beyond express) and `client/` (Vite + React, no router — phase-based state in `App.jsx`).

## Core data model

The heart of the app is the `module` object; nearly every feature reads/writes it.

```
module = {
  subject: string,                 // the topic/goal string
  mode: 'module' | 'roadmap',
  mainTopics: [{
    index: number,                 // sort order; -1 = special "Roadmap" entry section
    title: string,
    subtopics: [{ title: string, items: [string] }],
    error?: string                 // present when AI expansion failed
  }]
}
```

- Lesson identity key (used for notes, progress, selection): `itemKey = "${main.title}::${sub.title}::${item}"` — defined in `client/src/lib/export.js:itemKey`.
- `notes: { [itemKey]: { summary, keyPoints[], learnByDoing, resources[] } }`
- `tracked: { [itemKey]: 'todo' | 'in-progress' | 'done' }` (progress)
- **Roadmap special-case**: a `mode:'roadmap'` module gets a prepended main topic `{ index:-1, title:'Roadmap', subtopics:[{title:'Overview', items:['<roadmap title>']}] }` injected at the end of generation (`server/index.js:runJob`). The roadmap entry item is **not a lesson** — exclude `mainTopics` whose `title === 'Roadmap'` from lesson/progress counts everywhere (client + server) and treat its item as a navigation entry to the Roadmap overview page.

## Server (`server/index.js`) — all endpoints + AI logic in one file

| Line | What |
|---|---|
| 32–72 | URL/Ollama helpers: `normalizeBaseUrl`, `ollamaHost`, `buildCompletionsUrl` (maps `http://host`, `…/api`, `…/v1` → `…/v1/chat/completions`), `isOllamaEndpoint` (cached `/api/tags` probe) |
| 74 | `classifyError` — retryable = 429/5xx/text heuristics |
| 82 | `callChat` — the single AI call site: fetch, retry loop w/ backoff, **console activity logging** (`[AI:…]`), AI-log persistence. Ollama ⇒ short fixed backoff; non-Ollama ⇒ rate-limit backoff. All AI requests funnel through this. |
| 232 / 240 | `extractJson` / `callJson` (callChat with `parseJson:true` + JSON extraction) |
| 257 | `parseManualTopics(text)` — parses/validates user-pasted `# Topic` / `## Subtopic` / `- item` input → `{ok, topics}` or `{ok:false, error, issues}` (used by `/api/module/parse-topics` and manual generation) |
| ~312 | `resolveGen(gen)` — normalizes depth/breadth ranges (`{preset, topicMin/Max, subMin/Max, itemMin/Max}`); all prompt builders interpolate these ranges instead of hard-coding counts |
| 312–450 | Prompt builders: `mainTopicsPrompt(topic, mode, gen)` (module vs roadmap — roadmap returns `{title, topics[]}`), `subtopicsPrompt(mainTopic, subject, mode, gen)`, `itemsPrompt(mainTopic, subtopic, subject, gen)`, `deepDivePrompt`, `reviewPrompt` |
| 400 | `runPool(items, limit, fn)` — concurrency pool (Ollama uses limit 1) |
| 417–513 | Job manager: persist/load job JSON, `emit` (SSE fan-out), `createJob(topic, config, mode)` |
| 514 | `runJob` — async generator: if `source==='manual'` build `mainTopics` straight from `job.manualTopics` (no AI); else main-topics AI call → parallel subtopic expansion (retries, resume-on-failure) → roadmap-entry injection → `done` event |
| 627 | `resumeJob` — retry failed sections |
| 648–793 | Module file persistence: `slugify`, `moduleDir`, `countModuleItems` (skips Roadmap section), `generateMarkdown` (checkbox `[x]/[/]/[ ]` + progress summary), index read/write, `saveModuleRecord` (writes `module.json` + `module.md`, updates `index.json`) |
| 786–1041 | HTTP endpoints (below) |

### HTTP API

| Method/Path | Purpose | ~Line |
|---|---|---|
| GET `/api/health` | health | 786 |
| GET `/api/logs`, `/api/logs/:id` | AI interaction logs | 792 |
| POST `/api/ai/discover-models` | model list: Ollama `/api/tags` or `/models`; returns `source`, `ollamaBase` | 804 |
| GET `/api/modules` / `…/latest` / `…/:slug` / `…/:slug/raw` | list/read/download saved modules | 947–955 |
| DELETE `/api/modules/:slug` | delete a saved module (files + index) | 964 |
| POST `/api/modules/save` | save/update module (`.md` + `.json`) | 976 |
| POST `/api/ai/chat` | free chat with module context | 987 |
| POST `/api/module/generate` | start generation job (`mode:'module'\|'roadmap'`, `source:'auto'\|'manual'` + `manualTopics[]`) → `{id}` | 998 |
| POST `/api/module/parse-topics` | validate user-pasted topics (`#`/`##`/`-` format) → `{ok,topics}` or `{ok:false,error,issues}` | 1010 |
| GET `/api/module/generate/:id/events` | SSE: `snapshot/status/topics/progress/topicResult/done/error` | 1019 |
| POST `/api/module/:id/config`, `…/:id/resume` | attach config / retry failed | 1050, 1062 |
| POST `/api/module/note` | generate a study note for an item | 1072 |
| POST `/api/module/note/review` | alternative note from a second endpoint | 1087 |
| POST `/api/ai/expand` | expand main→subtopics or subtopic→items (`kind`) | 1103 |

`server/ai-log.js`: `initAiLog`, `logInteraction`, `listLogs`, `getLog` — one JSON file per AI call under `server/data/ai-logs/`, index capped at 500.

## Client — feature → file map

| Feature | File(s) |
|---|---|
| App state machine, SSE subscription, notes/progress/manual-edit/expand handlers, selection, chat | `client/src/App.jsx` (single source of app state; phases: `dashboard`/`setup`/`generating`/`module`) |
| Dashboard: saved-module grid, roadmap badge, Download/Delete, **Due for Review Today** (spaced repetition) | `client/src/components/Dashboard.jsx` |
| Setup form: topic input, Learning module ↔ Goal roadmap toggle, **Auto ↔ Manual (bring your own topics)** source selector + format-validated textarea, **Depth & Breadth presets** (Quick/Standard/Deep dive/Custom sliders) | `client/src/components/SetupForm.jsx`, `client/src/lib/gen.js` |
| Generation live view: progress bar + live topic/course tree (pending→working→done) | `client/src/components/GenerationProgress.jsx` |
| Workspace left panel: tree, inline add, **Expand with AI**, status cycle, progress bar, Expand/Collapse all, AI-fetch highlight | `client/src/components/TopicsPanel.jsx` |
| Center panel: note view, review-with-second-endpoint, **Roadmap overview page**, **inline text-selection → "Ask AI about this"** (annotations) | `client/src/components/ContentPanel.jsx`, `client/src/components/RoadmapView.jsx` |
| Chat panel (right) + **teaching personas** (Tutor/Socratic/ELI5/Expert peer/Rubber duck) | `client/src/components/ChatPanel.jsx`, `client/src/lib/personas.js` |
| Settings modal: endpoint profiles + default per-purpose selection | `client/src/components/SettingsModal.jsx`, `client/src/components/ProfileManager.jsx` (Add Ollama, Fetch models), `client/src/components/ModelSelector.jsx` |
| Logs page (AI interactions, failures filter) | `client/src/components/LogsPage.jsx` |
| Chat history modal | `client/src/components/HistoryModal.jsx` |
| **Command palette** (Ctrl/Cmd+K) | `client/src/components/CommandPalette.jsx` |
| **Analytics modal** (heatmap, velocity, streaks, per-module %, most-visited) | `client/src/components/AnalyticsModal.jsx`, `client/src/lib/activity.js` |
| **Spaced-repetition review** (SM-2) + self-grade modal | `client/src/lib/spaced.js`, `client/src/components/ReviewModal.jsx` |
| Export (`moduleToMarkdown`, `moduleToAnkiCsv`, `itemKey`) | `client/src/lib/export.js` |
| Local module cache (`loadModules/saveModule/removeModule/getLastModule`) | `client/src/lib/modules.js` |
| Endpoint profiles/selection (`la-ai-profiles`, `la-ai-selection`, legacy migration, `resolveConfig`) | `client/src/lib/storage.js` |
| Chat sessions (`startSession/appendMessage/loadCurrentSession`) | `client/src/lib/history.js` |
| All styling (incl. roadmap cards, gen-tree, ai-fetching pulse, palette, heatmap, annotations) | `client/src/styles.css` |

## Key flows

**Generate module/roadmap:** `SetupForm.onStart` → `App.start(topic, mode, source, manualTopics, gen)` → `POST /api/module/generate` → subscribe to SSE (`App.subscribe`) → `handleEvent` updates `module`/`progress`/`topics` state live → `done` sets phase `module`. The `gen` payload (from Depth & Breadth presets) is resolved by `resolveGen` and interpolated into prompts; for manual source the AI calls are skipped entirely. For roadmap, AI returns `{title, topics[]}`; server builds one main topic per course, then injects the `Roadmap` entry section.

**Select a lesson:** `TopicsPanel` item click → `App.handleSelect` → records a view (`lib/activity.js`) → generates note via `POST /api/module/note` if absent → `ContentPanel` renders it. Roadmap-entry item (`main.title==='Roadmap'`) skips note generation; `ContentPanel` renders `<RoadmapView>` which lists courses w/ per-course progress and `openCourse` jumps in (scrolls tree via `reveal` prop).

**Mark a lesson done:** `App.cycleStatus(key)` cycles `todo → in-progress → done → todo`, records activity (`lib/activity.js`), and seeds/drops an SM-2 review card (`lib/spaced.js`) on done/undo. Dashboard "Due for Review Today" lists `getDueReviews()`; `ReviewModal` self-grades (0-5) → `updateReview` computes next interval/ease.

**Ask about note text:** select text in a note → `ContentPanel` "Ask AI about this" → `App.askAboutSelection` opens chat pre-quoted → after reply, answer is saved as `note.annotations[]`.

**Persistence:** every module change debounces 500ms → localStorage (`saveModule`) + `POST /api/modules/save`. Server writes `server/data/modules/<slug>/module.json` + `module.md`; `index.json` lists them for the dashboard.

## Critical gotchas

- **Port is 4001**, not 4000 (dev server + Vite proxy + README). Preview: `https://4001-8c7af4a15f5eefc3.monkeycode-ai.live`.
- **Env vars:** `PORT`, `JOB_DIR` (default `server/data/jobs`), `MODULES_DIR` (default `server/data/modules`), `AI_LOG_DIR`. `server/data/` is gitignored.
- **API keys are browser-only** — never persist to server. Server config `{baseUrl, apiKey, model}` has `apiKey` stripped on job save/load.
- **Ollama**: detected via `/api/tags` (cached); generation serialized (pool limit 1), short fixed retry backoff, no rate-limit semantics. Don't add rate-limit waits for Ollama.
- **Mock AI** for local testing: `node e2e/mock-ai.mjs` on `:5001` (`/api/tags`, `/v1/models`, chat; roadmap path returns `{title:'Frontend Engineering Roadmap', topics:[…]}`). A dev copy used to live at `/tmp/opencode/mock-ai.mjs`.
- **E2E tests:** `npx playwright install chromium && npm run test:e2e`. Config (`playwright.config.js`) boots the mock AI (:5001) + the real server (:4111, temp dirs); tests seed a mock endpoint profile via `page.addInitScript` before load. Never point these at a real LLM.
- Build client before previewing server changes to the UI: `npm run build` (Vite → `client/dist`, served by server). Dev mode: `npm run dev` (concurrently).
- Item keys contain `::` and spaces — when selecting in DOM use a `data-itemkey` attribute, not `#id`.
- `la-activity` / `la-views` / `la-reviews` / `la-persona` localStorage keys back the analytics, spaced-repetition, and persona features; they're client-side only and never sent to the server.
