# Learning Agent

An AI-powered learning module generator that acts as a learning agent. Tell it what you want to learn and it researches the subject into a complete, structured learning module — main topics, subtopics, concrete learning items, and per-item study notes — then saves it so you can come back to it anytime.

## Features Implemented

### Learning-agent generation pipeline
- Ask the user what they want to learn (any subject).
- The backend asks the AI (any OpenAI-compatible endpoint) for the main topics (6-10), streamed live.
- It then iterates through each main topic and asks the AI for its subtopics and concrete learning items, building the module tree in real time.
- Each learning item can be expanded into a deep-dive **study note** (summary, key points, practice exercise, resources). Study notes can be generated per item or for all items at once.

### Fault tolerance and resumability
- Generation runs as a **background job** with an id; progress is streamed to the client via SSE and the job state is persisted to disk (temp dir), so a dropped connection or a server restart does not lose the build.
- **Retries with exponential backoff** on every AI call for transient failures (429 / 5xx / rate-limit messages such as `ResourceExhausted`), honoring the `Retry-After` header.
- **Round-based recovery**: sections that still fail are retried in up to 4 rounds with a 3s cooldown between rounds, so a rate-limit spike no longer aborts the whole module.
- **Client auto-reconnect**: the UI reconnects to the job stream with exponential backoff and re-renders from a snapshot; the build continues in the background.
- **Retry failed sections**: sections that exhaust retries are flagged with warnings and can be retried individually via a resume endpoint once the endpoint frees up.

### Three-panel workspace
- **Left panel (collapsible)** — topics tree: main topics -> subtopics -> learning items, each expandable/collapsible. Click an item to select it.
- **Center panel** — content for the selected item: breadcrumb and its study note. Selecting an item auto-generates its note.
- **Right panel (collapsible)** — chat with the AI. Questions are answered with the current subject, selected item, and its study note as context.

### Persistent chat history
- Every chat session is logged in the browser (localStorage), one growing session per subject.
- The **History** modal lists all past sessions (subject, timestamp, message count); click any entry to read the full conversation.
- "New chat" starts a fresh session for the same subject.

### Module persistence (retrievable .md files)
- Every generated module is saved on the server as a real markdown file plus structured JSON:
  - `server/data/modules/<slug>/module.md` — human-readable export (includes study notes).
  - `server/data/modules/<slug>/module.json` — structured data used to restore the interactive UI.
  - `server/data/modules/index.json` — index of all saved modules.
- A copy is also cached in the browser (localStorage) so modules remain available even if the server files are unreachable.

### Dashboard landing page
- On open, the app shows a dashboard listing every topic for which content has already been generated (subject, saved date, item count, study-note count).
- Select an existing topic to restore its workspace, or create a new topic.
- Each card offers **Download .md** to retrieve the saved markdown file.

### AI endpoint configuration (multiple endpoints, multiple models)
- Any OpenAI-compatible chat-completions endpoint works (`{baseUrl}/chat/completions`).
- Manage endpoints in the **Settings** section (open from the dashboard, the setup screen, or the module topbar): add/remove/rename endpoints, and give each endpoint a Base URL, API key, and any number of models.
- Pick which endpoint + model to use for each purpose:
  - **Generate with** — used for building modules and study notes (setup screen).
  - **Chat with** — used by the AI tutor in the right panel.
  - **Review with** — used to generate alternative study notes (see below).
- API keys are stored only in the user's browser and sent per-request to the backend, never persisted server-side. Selections and endpoint definitions are stored in browser localStorage.
- Selections stay valid automatically: if an endpoint is renamed or removed, the app re-points each purpose to an existing endpoint/model.

### AI interaction logging
- Every request the server sends to an AI endpoint is recorded as a JSON file: the AI endpoint (base URL), model name, the query (messages sent), the answer received, timestamps, duration, and per-attempt details.
- Logs are stored under `server/data/ai-logs/<id>.json` with a capped `index.json` (latest 500).
- If an AI response can't be parsed as JSON, the system **retries automatically** and flags the interaction as unparseable in the log.
- The **Logs** page (dashboard or workspace topbar) lists all interactions — with a "Failures only" filter — and lets you inspect the full request, response, and attempt history. Unparseable outputs are highlighted.

### Review study notes with a second endpoint
- For any generated study note, the **Review with another endpoint** section lets you ask a different endpoint/model to produce an improved alternative.
- The alternative is shown side by side; you can **Replace current note**, discard it, or regenerate it.
- This is handy for cross-checking accuracy and for spreading load across endpoints to avoid rate limits.

## Architecture

Monorepo using npm workspaces with two packages:

- `server/` — Node.js + Express backend (`server/index.js`, `server/ai-log.js`)
  - AI proxy and generation orchestrator (job system, retries).
  - Module file persistence (`.md` + `.json`) under `server/data/modules/`.
  - AI interaction logging (JSON) under `server/data/ai-logs/`.
  - Serves the built client in production.
- `client/` — Vite + React frontend (`client/src/`)
  - `App.jsx` — app state machine, generation job subscription, persistence, chat.
  - `components/` — `Dashboard`, `SetupForm`, `GenerationProgress`, `TopicsPanel`, `ContentPanel`, `ChatPanel`, `HistoryModal`, `SettingsModal`, `ModelSelector`, `ProfileManager`.
  - `lib/` — `export.js` (markdown/JSON export), `history.js` (chat history), `modules.js` (module cache), `storage.js` (endpoint profiles + per-purpose selection).

### API endpoints

| Method | Path | Purpose |
| --- | --- | --- |
| GET | `/api/health` | Health check |
| GET | `/api/logs` | List AI interaction log entries (metadata) |
| GET | `/api/logs/:id` | Full AI interaction log entry |
| POST | `/api/module/generate` | Start a generation job, returns job id |
| GET | `/api/module/generate/:id/events` | SSE stream of job progress (snapshot + live events) |
| POST | `/api/module/:id/config` | Attach/refresh the AI config for a job |
| POST | `/api/module/:id/resume` | Retry failed sections of a finished job |
| POST | `/api/module/note` | Generate a deep-dive study note for an item |
| POST | `/api/module/note/review` | Generate an alternative study note using a (different) endpoint |
| POST | `/api/ai/chat` | Chat with the AI using current module context |
| GET | `/api/modules` | List saved modules |
| GET | `/api/modules/latest` | Full data of the most recently saved module |
| GET | `/api/modules/:slug` | Full data of a saved module |
| GET | `/api/modules/:slug/raw` | Download the saved `.md` file |
| POST | `/api/modules/save` | Save/update a module as `.md` + `.json` |

### Job/SSE events

- `snapshot` — full current job state (sent on every (re)connect).
- `status` — progress log message (including retry/cooldown notices).
- `topics` — the mapped main topics.
- `progress` — `{ done, total }` count of expanded sections.
- `topicResult` — an expanded section (subtopics + items), or its error.
- `done` — completed module plus warnings.
- `error` — fatal error (e.g., the main-topics call failed after retries).

## Getting Started

Prerequisites: Node.js 18+ (uses built-in `fetch`).

```bash
# Install dependencies (all workspaces)
npm install

# Development: backend on :4001, Vite client on :5173 (proxies /api to :4001)
npm run dev

# Production: build client, serve everything from :4001
npm start
```

Open the app and either pick a saved module or click **+ New topic**. In the **Settings** section, add at least one OpenAI-compatible endpoint (Base URL, model, and API key — the UI comes with a default "Default" profile pre-loaded). Pick the endpoint to **Generate with**, type the topic you want to learn, and click **Build my learning module**. Chat and review endpoints can be chosen later from the workspace panels.

## Configuration

Environment variables (optional):

| Variable | Default | Purpose |
| --- | --- | --- |
| `PORT` | `4001` | Backend/server port |
| `JOB_DIR` | OS temp dir | Where generation job state is persisted |
| `MODULES_DIR` | `server/data/modules` | Where saved modules (`module.md`, `module.json`) live |
| `AI_LOG_DIR` | `server/data/ai-logs` | Where AI interaction logs are stored (`<id>.json` + `index.json`) |

Client defaults (editable in the UI): a "Default" endpoint profile with base URL `https://api.openai.com/v1` and model `gpt-4o-mini`.

## Data storage summary

| What | Where | Notes |
| --- | --- | --- |
| AI endpoint profiles + per-purpose selection | Browser localStorage (`la-ai-profiles`, `la-ai-selection`) | Each profile has name, Base URL, API key, models[]; selection picks generation/chat/review profile + model |
| Chat history | Browser localStorage | Keyed per session, browsable in the History modal |
| Saved modules | `server/data/modules/<slug>/` | `module.md` + `module.json`, plus a localStorage cache |
| AI interaction logs | `server/data/ai-logs/` | One JSON file per AI call (endpoint, model, query, output, time), plus an `index.json` |
| Generation jobs | `JOB_DIR` temp dir | Resume-safe job state (API keys excluded) |
