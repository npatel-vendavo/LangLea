import { useEffect, useMemo, useRef, useState } from 'react'
import { itemKey } from '../lib/export.js'

function FlatCommand({ label, hint, group, onRun }) {
  return { type: 'cmd', label, hint, group, onRun }
}

function LessonCommand({ label, hint, group, onRun, key }) {
  return { type: 'lesson', label, hint, group, onRun, key }
}

export default function CommandPalette({
  open,
  onClose,
  phase,
  module,
  subject,
  notes,
  tracked,
  onSelect,
  savedModules,
  onOpenModule,
  onNewTopic,
  onExport,
  onExportAnki,
  onGenerateAll,
  onOpenSettings,
  onOpenLogs,
  onOpenHistory,
  onOpenAnalytics,
  onToggleTopics,
  onToggleChat
}) {
  const [query, setQuery] = useState('')
  const [cursor, setCursor] = useState(0)
  const inputRef = useRef(null)

  const commands = useMemo(() => {
    const cmds = []
    if (phase === 'module' && module?.mainTopics) {
      cmds.push(...module.mainTopics
        .filter((t) => t.title !== 'Roadmap')
        .flatMap((main) =>
          (main.subtopics || []).flatMap((sub) =>
            (sub.items || []).map((item) => {
              const key = itemKey(main.title, sub.title, item)
              const done = tracked?.[key] === 'done'
              const hasNote = !!notes[key]
              return LessonCommand({
                label: item,
                hint: `${main.title} › ${sub.title}${done ? ' · done' : ''}${hasNote ? ' · has note' : ''}`,
                group: 'Jump to lesson',
                key,
                onRun: () => onSelect(main, sub, item)
              })
            })
          )
        ))
      cmds.push(FlatCommand({ label: 'Generate all notes', hint: 'Batch-create notes for every lesson', group: 'Actions', onRun: onGenerateAll }))
    }
    if (phase === 'module') {
      cmds.push(FlatCommand({ label: 'Export module to Markdown', group: 'Actions', onRun: onExport }))
      cmds.push(FlatCommand({ label: 'Export to Anki (.csv)', group: 'Actions', onRun: onExportAnki }))
      cmds.push(FlatCommand({ label: 'Toggle Topics panel', group: 'View', onRun: onToggleTopics }))
      cmds.push(FlatCommand({ label: 'Toggle Chat panel', group: 'View', onRun: onToggleChat }))
    }
    cmds.push(FlatCommand({ label: 'New topic / generate new module', hint: 'Back to setup', group: 'Actions', onRun: onNewTopic }))
    cmds.push(FlatCommand({ label: 'Open settings (AI endpoints)', group: 'Navigate', onRun: onOpenSettings }))
    cmds.push(FlatCommand({ label: 'Open AI interaction logs', group: 'Navigate', onRun: onOpenLogs }))
    cmds.push(FlatCommand({ label: 'Open chat history', group: 'Navigate', onRun: onOpenHistory }))
    cmds.push(FlatCommand({ label: 'Open learning analytics', group: 'Navigate', onRun: onOpenAnalytics }))
    for (const m of savedModules || []) {
      cmds.push(FlatCommand({
        label: `Open module: ${m.subject}`,
        hint: m.mode === 'roadmap' ? 'Goal roadmap' : 'Learning module',
        group: 'Saved modules',
        onRun: () => onOpenModule(m)
      }))
    }
    return cmds
  }, [phase, module, subject, notes, tracked, onSelect, onGenerateAll, onExport, onExportAnki, onNewTopic, onOpenSettings, onOpenLogs, onOpenHistory, onOpenAnalytics, onToggleTopics, onToggleChat, savedModules, onOpenModule])

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase()
    if (!q) return commands
    return commands.filter(
      (c) => c.label.toLowerCase().includes(q) || (c.hint || '').toLowerCase().includes(q) || c.group.toLowerCase().includes(q)
    )
  }, [commands, query])

  useEffect(() => {
    if (open) {
      setQuery('')
      setCursor(0)
      setTimeout(() => inputRef.current?.focus(), 10)
    }
  }, [open])

  useEffect(() => setCursor(0), [query])

  if (!open) return null

  const groups = []
  for (const c of filtered) {
    const last = groups[groups.length - 1]
    if (!last || last.group !== c.group) groups.push({ group: c.group, items: [c] })
    else last.items.push(c)
  }

  const flatItems = filtered
  const runAt = (i) => {
    const cmd = flatItems[i]
    if (!cmd) return
    onClose()
    cmd.onRun()
  }

  const onKeyDown = (e) => {
    if (e.key === 'ArrowDown') { e.preventDefault(); setCursor((c) => Math.min(c + 1, flatItems.length - 1)) }
    else if (e.key === 'ArrowUp') { e.preventDefault(); setCursor((c) => Math.max(c - 1, 0)) }
    else if (e.key === 'Enter') { e.preventDefault(); runAt(cursor) }
    else if (e.key === 'Escape') { e.preventDefault(); onClose() }
  }

  return (
    <div className="palette-overlay" onClick={onClose}>
      <div className="palette" onClick={(e) => e.stopPropagation()} onKeyDown={onKeyDown}>
        <div className="palette-input-row">
          <span className="palette-prompt">›</span>
          <input
            ref={inputRef}
            className="palette-input"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Type a lesson, action, or module name…"
          />
          <span className="palette-esc">esc</span>
        </div>
        <div className="palette-list">
          {flatItems.length === 0 && <div className="palette-empty">No matches for “{query}”.</div>}
          {groups.map((g) => (
            <div className="palette-group" key={g.group}>
              <div className="palette-group-label">{g.group}</div>
              {g.items.map((c) => {
                const idx = flatItems.indexOf(c)
                return (
                  <button
                    key={c.type === 'lesson' ? c.key : c.label}
                    className={`palette-item${idx === cursor ? ' active' : ''}`}
                    onMouseEnter={() => setCursor(idx)}
                    onClick={() => runAt(idx)}
                  >
                    <span className="palette-label">{c.label}</span>
                    {c.hint && <span className="palette-hint">{c.hint}</span>}
                  </button>
                )
              })}
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
