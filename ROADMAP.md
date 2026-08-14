# LangLea — Enhancement Suggestions

> Based on analysis of `Readme-ai.md`, `ROADMAP.md`, and the current codebase structure.

---

## 🧠 AI & Learning Intelligence

### 1. Spaced Repetition & Review Scheduler *(High Impact)*
Integrate a spaced repetition algorithm (SM-2 or FSRS) so the app surfaces items for review at optimal intervals. Each `itemKey` already has `tracked` state — extend it to store `{ease, interval, nextReview}`. Add a **"Due for Review Today"** section on the Dashboard.

### 2. Adaptive Learning Paths
After a user marks several lessons as `done`, have the AI analyze patterns and suggest skipping/accelerating topics. If a user struggles in chat (detected by repeated questions on the same item), the AI recommends deeper dives or prerequisite detours.

### 3. AI-Generated Quizzes with Scoring *(already in ROADMAP as P1)*
Extend the existing `reviewPrompt` to produce structured Q&A with difficulty ratings. Add a **Quiz Mode** panel that walks through questions, records answers, and feeds results back into `tracked` state and the spaced-repetition scheduler.

### 4. Concept Graph / Knowledge Map
After a module is generated, run a second AI pass to extract relationships between items (e.g., "requires", "related to", "leads to"). Render an interactive graph (using D3 or vis.js) — clicking a node navigates the tree. Stored in `module.conceptGraph[]`.

### 5. Multi-Modal Note Generation
Extend `deepDivePrompt` to optionally request:
- **Code examples** (already mentioned in ROADMAP)
- **Mermaid diagrams** embedded in the markdown note — the ContentPanel can detect and render them
- **Analogy cards** — one-liner plain-English analogies stored separately for quick recall

---

## 📊 Progress & Analytics

### 6. Learning Analytics Dashboard
Add a dedicated analytics page/panel with:
- Per-module completion %, time-to-complete estimates
- "Velocity" (lessons completed per day, via timestamps on `tracked` changes)
- A heatmap calendar (like GitHub's contribution graph) showing study activity
- Most-visited lessons (track `ContentPanel` renders per `itemKey`)

### 7. Milestone & Streak System
Track consecutive days with at least one `done` transition. Show streaks and milestone badges on the Dashboard. Store in `localStorage` with server sync via a lightweight `POST /api/progress/streak`.

### 8. Module Comparison View
Side-by-side comparison between two saved modules. Useful when a user generates the same topic multiple times with different AI endpoints or prompts — they can pick the best structure.

---

## 🔌 Integrations & Export

### 9. Anki Flashcard Export *(ROADMAP P2 partial)*
The item notes already have `keyPoints[]` and `learnByDoing`. Map each item to an Anki `.apkg` or `.csv` (front: `item title`, back: `keyPoints` + `learnByDoing`). Add an **"Export to Anki"** button in the module toolbar.

### 10. Notion / Obsidian Sync
Add export options that produce Notion-compatible pages (via Notion API) or Obsidian vault files (markdown + YAML frontmatter with tags, links, and `[[wikilinks]]` between related items). Credentials handled like existing AI endpoint profiles.

### 11. GitHub-Based Module Backup
Allow users to specify a GitHub repo + token. Modules are pushed as commits (markdown + JSON). Each `saveModuleRecord` triggers an optional `git push` via the Octokit REST API. Enables cross-device sync without a full backend.

### 12. Webhook / Zapier Integration
POST module progress events (`lesson_completed`, `module_finished`) to a user-defined webhook URL. Enables automations like "send me a Slack message when I finish a module."

---

## 🗣️ Chat Enhancements

### 13. Chat Personas / Teaching Styles
Let users set a **teaching persona** per chat session:
- `Socratic` — the AI asks questions instead of giving answers
- `ELI5` — explain like I'm 5
- `Expert peer` — assumes full domain knowledge, no hand-holding
- `Rubber duck` — just listens and asks clarifying questions

Stored in the endpoint profile or per-session config.

### 14. Inline Note Annotation via Chat
Highlight any text in a study note → click **"Ask AI about this"** → the chat panel opens with the selected snippet pre-quoted. The AI response can optionally be saved back as an annotation on the note.

### 15. Voice Input/Output
Add Web Speech API support:
- **Voice input** in the chat panel (`SpeechRecognition`)
- **Text-to-speech** for note summaries and chat responses (`SpeechSynthesis`)
Useful for commute / hands-free study sessions.

---

## ⚙️ Generation & Quality

### 16. Depth & Breadth Presets *(ROADMAP P0)*
Surface the hidden generation constraints as a UI control. Offer named presets:
- `Quick overview` → 3-5 topics, 2-3 subtopics, 1-2 items
- `Standard` → current defaults
- `Deep dive` → 10-15 topics, 6-8 subtopics, 4-6 items
- `Custom` → numeric sliders

### 17. Template Library
Pre-built topic templates for common learning goals (e.g., "Frontend Engineer", "ML Practitioner", "AWS Cert prep"). Users can pick a template, the app pre-populates the `manualTopics` textarea, and they tweak before generating.

### 18. Generation Quality Score
After generation, run a quick AI eval prompt: "Rate the completeness, clarity, and logical ordering of this curriculum on a scale of 1-10, with suggestions." Display the score and let the user trigger a **"Refine"** pass.

### 19. Parallel Endpoint Racing
When multiple endpoint profiles are configured, allow "race mode" for note generation: fire the same prompt at two endpoints simultaneously, take whichever completes first. Useful for slow or rate-limited APIs.

---

## 🖥️ UX & Platform

### 20. Command Palette (`⌘K` / `Ctrl+K`)
A keyboard-accessible command palette (like VS Code's) for power users:
- Jump to any lesson by typing its name
- Trigger "Generate note", "Start chat", "Export module", "Open settings"
- Filter saved modules

### 21. Focus / Pomodoro Mode
A distraction-free reading mode with a built-in Pomodoro timer (25-min study / 5-min break). During a session, only the current lesson's note is visible. Timer state persists across browser refreshes via `localStorage`.

### 22. Offline PWA *(ROADMAP P2)*
Add a service worker that:
- Caches all saved modules from `localStorage` for offline access
- Queues AI requests when offline and replays them on reconnect
- Shows "offline" badge in the header

### 23. Mobile Drawer Layout *(ROADMAP P1)*
On small screens, convert the three-panel layout to a bottom-sheet / drawer pattern:
- Swipe right for the Topics tree
- Swipe left for the Chat panel
- Center is always the note
Add a floating action button for quick lesson navigation.

### 24. Embeddable Widget
Generate a shareable, embeddable `<iframe>` snippet for a saved module. The embed shows a read-only curriculum tree + notes with a "Copy to LangLea" CTA. Useful for sharing learning paths in blogs or docs.

---

## 🔒 Reliability & Dev Experience

### 25. End-to-End Test Suite
Add Playwright tests covering:
- Full module generation flow (using the existing mock AI on `:5001`)
- Note generation + progress tracking
- Save/load from dashboard

The mock AI server is already in place — just need the test harness.

### 26. Server-Sent Events Reconnection
If the SSE connection drops mid-generation, the client should auto-reconnect and resume from the last received event index (using `Last-Event-ID` header). Currently the client has no reconnect logic.

### 27. Job Queue with Priorities
Replace the current in-memory job map with a persistent queue (e.g., `better-queue` or a simple SQLite table). Allow multiple concurrent module generations with a global concurrency cap, and expose queue position to the client via SSE.

---

## Priority Recommendation

| # | Enhancement | Impact | Effort | Suggested Priority |
|---|---|---|---|---|
| 16 | Depth & Breadth Presets | High | Low | **P0** |
| 20 | Command Palette | High | Medium | **P0** |
| 6  | Learning Analytics | High | Medium | **P1** |
| 1  | Spaced Repetition | Very High | High | **P1** |
| 9  | Anki Export | Medium | Low | **P1** |
| 13 | Chat Personas | High | Low | **P1** |
| 14 | Inline Note Annotation | High | Medium | **P1** |
| 4  | Concept Graph | Very High | High | **P2** |
| 11 | GitHub Backup | Medium | Medium | **P2** |
| 21 | Pomodoro Focus Mode | Medium | Low | **P2** |
| 15 | Voice Input/Output | Medium | Low | **P2** |
| 25 | E2E Test Suite | High (DX) | Medium | **P1** |
