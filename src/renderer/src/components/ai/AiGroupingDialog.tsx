import { useState, useEffect, useCallback } from 'react'
import { Loader2, ChevronDown, ChevronUp } from 'lucide-react'
import { useViewStore } from '../../stores/viewStore'
import type { Note } from '@renderer/types'
import type { AiNoteInput, AiGroupResult } from '../../../../main/ipc/ai'

const MAX_NOTES_HARD = 1000
const MAX_NOTES_WARN = 500
const COST_PER_NOTE_USD = 0.0003

interface GroupProject {
  name: string
  noteIds: string[]
  reason: string
  selected: boolean
  editingName: string
}

interface Props {
  notes: Note[]
  onClose: () => void
  onApplied: () => void
}

function toAiInput(note: Note): AiNoteInput {
  return {
    id: note.filePath,
    title: note.title,
    tags: note.tags,
    folder: note.relativePath.split('/').slice(0, -1).join('/'),
    preview: note.body.slice(0, 500)
  }
}

type Phase = 'confirm' | 'progress' | 'preview' | 'done'

export function AiGroupingDialog({ notes, onClose, onApplied }: Props): JSX.Element {
  const { pushToast, setGrouping } = useViewStore()
  const [phase, setPhase] = useState<Phase>('confirm')
  const [progressPct, setProgressPct] = useState(0)
  const [progressLabel, setProgressLabel] = useState('')
  const [projects, setProjects] = useState<GroupProject[]>([])
  const [applying, setApplying] = useState(false)
  const [expandedProject, setExpandedProject] = useState<string | null>(null)
  const [failedChunks, setFailedChunks] = useState(0)

  const noteCount = notes.length
  const estimatedCost = (noteCount * COST_PER_NOTE_USD).toFixed(2)
  const isBlocked = noteCount > MAX_NOTES_HARD
  const showWarning = noteCount > MAX_NOTES_WARN && !isBlocked

  useEffect(() => {
    const unsubscribe = window.api.ai.onProgress((pct, label) => {
      setProgressPct(pct)
      setProgressLabel(label)
    })
    return unsubscribe
  }, [])

  const handleStart = useCallback(async () => {
    setPhase('progress')
    const inputs = notes.map(toAiInput)
    const result = await window.api.ai.groupNotes(inputs)

    if ('error' in result) {
      pushToast(result.error, 'error')
      onClose()
      return
    }

    const typedResult = result as AiGroupResult & { failedChunks?: number }
    if (typedResult.failedChunks) {
      setFailedChunks(typedResult.failedChunks)
    }

    setProjects(
      typedResult.projects.map((p) => ({
        ...p,
        selected: true,
        editingName: p.name
      }))
    )
    setPhase('preview')
  }, [notes, pushToast, onClose])

  async function handleApply(): Promise<void> {
    setApplying(true)
    const selected = projects.filter((p) => p.selected)
    const noteToProject = new Map<string, string>()
    for (const proj of selected) {
      for (const noteId of proj.noteIds) {
        noteToProject.set(noteId, proj.editingName)
      }
    }

    let successCount = 0
    for (const note of notes) {
      const projectName = noteToProject.get(note.filePath)
      if (projectName !== undefined && projectName !== (note.project ?? '')) {
        const updated: Note = { ...note, project: projectName }
        try {
          await window.api.vault.writeNote(updated)
          successCount++
        } catch {
          // continue with remaining notes
        }
      }
    }

    setApplying(false)
    setPhase('done')
    setGrouping('project')
    pushToast(`${successCount}개 노트에 프로젝트 태그가 적용되었습니다.`, 'success')
    onApplied()
  }

  function toggleProject(name: string): void {
    setProjects((prev) =>
      prev.map((p) => (p.name === name ? { ...p, selected: !p.selected } : p))
    )
  }

  function renameProject(name: string, newName: string): void {
    setProjects((prev) =>
      prev.map((p) => (p.name === name ? { ...p, editingName: newName } : p))
    )
  }

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
      <div className="bg-white dark:bg-slate-900 rounded-lg shadow-xl w-[560px] max-h-[80vh] flex flex-col border border-slate-200 dark:border-slate-700">
        <div className="px-5 py-4 border-b border-slate-200 dark:border-slate-700">
          <h2 className="text-sm font-semibold text-slate-800 dark:text-slate-200">
            AI 프로젝트 자동 분류
          </h2>
        </div>

        <div className="flex-1 overflow-auto px-5 py-4">
          {phase === 'confirm' && (
            <div className="space-y-4">
              <p className="text-sm text-slate-700 dark:text-slate-300">
                노트 <strong>{noteCount}개</strong>를 분석해 프로젝트로 자동 그룹핑합니다.
                <br />
                예상 비용: <strong>약 ${estimatedCost}</strong>
              </p>

              {isBlocked && (
                <div className="p-3 rounded-md bg-red-50 dark:bg-red-950 border border-red-200 dark:border-red-800 text-xs text-red-700 dark:text-red-300">
                  노트가 1,000개를 초과합니다. 제외 폴더를 설정하거나 범위를 축소해주세요.
                </div>
              )}

              {showWarning && (
                <div className="p-3 rounded-md bg-amber-50 dark:bg-amber-950 border border-amber-200 dark:border-amber-800 text-xs text-amber-700 dark:text-amber-300">
                  노트가 500개를 초과합니다. 처리 시간과 비용이 높아질 수 있습니다.
                </div>
              )}

              <p className="text-xs text-slate-500 dark:text-slate-400">
                결과는 미리보기로 확인 후 직접 선택·적용합니다. AI가 자동으로 변경하지 않습니다.
              </p>
            </div>
          )}

          {phase === 'progress' && (
            <div className="flex flex-col items-center gap-4 py-6">
              <Loader2 size={24} className="animate-spin text-slate-500" />
              <p className="text-sm text-slate-600 dark:text-slate-400">{progressLabel}</p>
              <div className="w-full bg-slate-100 dark:bg-slate-800 rounded-full h-1.5">
                <div
                  className="bg-slate-600 dark:bg-slate-300 h-1.5 rounded-full transition-all"
                  style={{ width: `${progressPct}%` }}
                />
              </div>
              <p className="text-xs text-slate-400">{progressPct}%</p>
            </div>
          )}

          {phase === 'preview' && (
            <div className="space-y-3">
              {failedChunks > 0 && (
                <p className="text-xs text-amber-600 dark:text-amber-400">
                  {failedChunks}개 청크 처리 실패 — 나머지 결과만 표시됩니다.
                </p>
              )}
              {projects.length === 0 && (
                <p className="text-sm text-slate-500 dark:text-slate-400">
                  분류 결과가 없습니다.
                </p>
              )}
              {projects.map((proj) => (
                <div
                  key={proj.name}
                  className={`border rounded-md ${
                    proj.selected
                      ? 'border-slate-300 dark:border-slate-600'
                      : 'border-slate-100 dark:border-slate-800 opacity-50'
                  }`}
                >
                  <div className="flex items-center gap-2 px-3 py-2">
                    <input
                      type="checkbox"
                      checked={proj.selected}
                      onChange={() => toggleProject(proj.name)}
                      className="accent-slate-700 dark:accent-slate-300"
                    />
                    <input
                      type="text"
                      value={proj.editingName}
                      onChange={(e) => renameProject(proj.name, e.target.value)}
                      className="flex-1 text-xs font-medium bg-transparent text-slate-800 dark:text-slate-200 focus:outline-none border-b border-transparent focus:border-slate-300 dark:focus:border-slate-600"
                    />
                    <span className="text-xs text-slate-400">{proj.noteIds.length}개</span>
                    <button
                      onClick={() =>
                        setExpandedProject(expandedProject === proj.name ? null : proj.name)
                      }
                      className="text-slate-400 hover:text-slate-600 dark:hover:text-slate-200"
                    >
                      {expandedProject === proj.name ? (
                        <ChevronUp size={12} />
                      ) : (
                        <ChevronDown size={12} />
                      )}
                    </button>
                  </div>
                  {expandedProject === proj.name && (
                    <div className="px-3 pb-2 space-y-1">
                      <p className="text-xs text-slate-500 dark:text-slate-400 italic">
                        {proj.reason}
                      </p>
                      <ul className="space-y-0.5">
                        {proj.noteIds
                          .map((id) => notes.find((n) => n.filePath === id))
                          .filter(Boolean)
                          .slice(0, 8)
                          .map((note) => (
                            <li
                              key={note!.filePath}
                              className="text-xs text-slate-600 dark:text-slate-400 truncate"
                            >
                              {note!.title}
                            </li>
                          ))}
                        {proj.noteIds.length > 8 && (
                          <li className="text-xs text-slate-400">
                            외 {proj.noteIds.length - 8}개…
                          </li>
                        )}
                      </ul>
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}

          {phase === 'done' && (
            <p className="text-sm text-emerald-600 dark:text-emerald-400">적용이 완료되었습니다.</p>
          )}
        </div>

        <div className="px-5 py-3 border-t border-slate-200 dark:border-slate-700 flex justify-end gap-2">
          <button
            onClick={onClose}
            className="text-xs px-3 py-1.5 rounded-md border border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800"
          >
            {phase === 'done' ? '닫기' : '취소'}
          </button>
          {phase === 'confirm' && (
            <button
              onClick={handleStart}
              disabled={isBlocked}
              className="text-xs px-3 py-1.5 rounded-md bg-slate-800 dark:bg-slate-100 text-white dark:text-slate-900 hover:bg-slate-700 dark:hover:bg-slate-200 disabled:opacity-40 disabled:cursor-not-allowed"
            >
              분류 시작
            </button>
          )}
          {phase === 'preview' && (
            <button
              onClick={handleApply}
              disabled={applying || projects.filter((p) => p.selected).length === 0}
              className="flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-md bg-slate-800 dark:bg-slate-100 text-white dark:text-slate-900 hover:bg-slate-700 dark:hover:bg-slate-200 disabled:opacity-40 disabled:cursor-not-allowed"
            >
              {applying && <Loader2 size={10} className="animate-spin" />}
              선택 항목 적용
            </button>
          )}
        </div>
      </div>
    </div>
  )
}
