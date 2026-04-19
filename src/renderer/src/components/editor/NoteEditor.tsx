import { useState, useEffect, useCallback, useRef } from 'react'
import MDEditor from '@uiw/react-md-editor'
import { X, Save, ExternalLink, FolderOpen, Trash2, AlertTriangle } from 'lucide-react'
import { useVaultStore } from '../../stores/vaultStore'
import { useViewStore } from '../../stores/viewStore'
import { useSettingsStore } from '../../stores/settingsStore'
import { rehypeWikilinks } from '../../lib/rehypeWikilinks'
import type { Note, Status, Priority } from '@renderer/types'

const STATUS_OPTIONS: Status[] = ['백로그', '예정', '진행중', '검토', '완료']
const PRIORITY_OPTIONS: { value: Priority | ''; label: string }[] = [
  { value: '', label: '없음' },
  { value: 'high', label: 'high' },
  { value: 'mid', label: 'mid' },
  { value: 'low', label: 'low' }
]

interface ConflictState {
  externalNote: Note
}

export function NoteEditor(): JSX.Element | null {
  const { selectedNote, closeNote, updateNote } = useVaultStore()
  const { pushToast } = useViewStore()
  const { settings } = useSettingsStore()

  const [draft, setDraft] = useState<Note | null>(() => (selectedNote ? { ...selectedNote } : null))
  const [dirty, setDirty] = useState(false)
  const [saving, setSaving] = useState(false)
  const [conflict, setConflict] = useState<ConflictState | null>(null)
  const [tagInput, setTagInput] = useState('')
  const autosaveTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => {
    const unsubscribe = window.api.watcher.onChange((note) => {
      if (draft && note.filePath === draft.filePath) {
        setConflict({ externalNote: note })
      }
    })
    return unsubscribe
  }, [draft])

  const saveNote = useCallback(
    async (noteToSave: Note) => {
      if (!noteToSave) return
      setSaving(true)
      try {
        await window.api.vault.writeNote(noteToSave)
        updateNote(noteToSave)
        setDirty(false)
        setConflict(null)
      } catch (error) {
        pushToast(
          `저장 실패: ${error instanceof Error ? error.message : '알 수 없는 오류'}`,
          'error'
        )
      } finally {
        setSaving(false)
      }
    },
    [updateNote, pushToast]
  )

  const scheduleAutosave = useCallback(
    (note: Note) => {
      if (autosaveTimer.current) clearTimeout(autosaveTimer.current)
      autosaveTimer.current = setTimeout(() => saveNote(note), 3000)
    },
    [saveNote]
  )

  useEffect(() => {
    return () => {
      if (autosaveTimer.current) clearTimeout(autosaveTimer.current)
    }
  }, [])

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent): void => {
      if ((e.metaKey || e.ctrlKey) && e.key === 's') {
        e.preventDefault()
        if (draft && dirty) saveNote(draft)
      }
      if (e.key === 'Escape') closeNote()
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [draft, dirty, saveNote, closeNote])

  function updateDraft(patch: Partial<Note>): void {
    if (!draft) return
    const updated = { ...draft, ...patch }
    setDraft(updated)
    setDirty(true)
    scheduleAutosave(updated)
  }

  function handleTagAdd(): void {
    const tag = tagInput.trim().replace(/^#/, '')
    if (!tag || !draft) return
    if (!draft.tags.includes(tag)) {
      updateDraft({ tags: [...draft.tags, tag] })
    }
    setTagInput('')
  }

  function handleTagRemove(tag: string): void {
    if (!draft) return
    updateDraft({ tags: draft.tags.filter((t) => t !== tag) })
  }

  async function handleOpenObsidian(): Promise<void> {
    if (!draft) return
    const vaultName = settings?.vaultName ?? ''
    await window.api.obsidian.open(vaultName, draft.relativePath)
  }

  async function handleShowInFolder(): Promise<void> {
    if (!draft) return
    await window.api.system.showInFolder(draft.filePath)
  }

  async function handleDelete(): Promise<void> {
    if (!draft) return
    const ok = window.confirm(`"${draft.title}"을(를) 삭제할까요?`)
    if (!ok) return
    const result = await window.api.vault.deleteNote(draft.filePath)
    if (result.ok) {
      useVaultStore.getState().removeNote(draft.filePath)
      closeNote()
    } else {
      pushToast(`삭제 실패: ${result.error}`, 'error')
    }
  }

  if (!selectedNote || !draft) return null

  return (
    <div className="flex flex-col h-full border-l border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-950 w-[480px] flex-shrink-0">
      <div className="flex items-center justify-between px-4 py-2 border-b border-slate-200 dark:border-slate-800">
        <div className="flex items-center gap-2">
          {dirty && (
            <span className="text-xs text-amber-600 dark:text-amber-400 font-medium">
              {saving ? '저장 중…' : '수정됨'}
            </span>
          )}
        </div>
        <div className="flex items-center gap-1">
          <button
            onClick={() => draft && saveNote(draft)}
            disabled={!dirty || saving}
            title="저장 (Ctrl+S)"
            className="p-1.5 rounded hover:bg-slate-100 dark:hover:bg-slate-800 disabled:opacity-30 text-slate-600 dark:text-slate-400"
          >
            <Save size={15} />
          </button>
          <button
            onClick={handleOpenObsidian}
            title="Obsidian에서 열기"
            className="p-1.5 rounded hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-600 dark:text-slate-400"
          >
            <ExternalLink size={15} />
          </button>
          <button
            onClick={handleShowInFolder}
            title="파일 위치 열기"
            className="p-1.5 rounded hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-600 dark:text-slate-400"
          >
            <FolderOpen size={15} />
          </button>
          <button
            onClick={handleDelete}
            title="삭제"
            className="p-1.5 rounded hover:bg-red-50 dark:hover:bg-red-950 text-slate-600 dark:text-slate-400 hover:text-red-600 dark:hover:text-red-400"
          >
            <Trash2 size={15} />
          </button>
          <button
            onClick={closeNote}
            title="닫기 (Esc)"
            className="p-1.5 rounded hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-600 dark:text-slate-400"
          >
            <X size={15} />
          </button>
        </div>
      </div>

      {conflict && (
        <div className="flex items-center gap-2 px-4 py-2 bg-amber-50 dark:bg-amber-950 border-b border-amber-200 dark:border-amber-800 text-amber-700 dark:text-amber-300 text-xs">
          <AlertTriangle size={13} />
          <span className="flex-1">외부에서 파일이 변경되었습니다.</span>
          <button
            onClick={() => {
              setDraft({ ...conflict.externalNote })
              setDirty(false)
              setConflict(null)
              updateNote(conflict.externalNote)
            }}
            className="font-medium underline"
          >
            불러오기
          </button>
          <button onClick={() => setConflict(null)} className="opacity-60 hover:opacity-100">
            무시
          </button>
        </div>
      )}

      <div className="flex-1 overflow-y-auto">
        <div className="p-4 flex flex-col gap-3">
          <input
            type="text"
            value={draft.title}
            onChange={(e) => updateDraft({ title: e.target.value })}
            className="w-full text-base font-semibold bg-transparent border-0 border-b border-slate-200 dark:border-slate-700 pb-1 focus:outline-none focus:border-slate-400 dark:focus:border-slate-500 text-slate-900 dark:text-slate-100"
            placeholder="제목"
          />

          <div className="grid grid-cols-2 gap-3">
            <div className="flex flex-col gap-1">
              <label className="text-xs text-slate-500 dark:text-slate-400">상태</label>
              <select
                value={draft.status}
                onChange={(e) => updateDraft({ status: e.target.value as Status })}
                className="text-xs border border-slate-200 dark:border-slate-700 rounded px-2 py-1 bg-white dark:bg-slate-900 text-slate-800 dark:text-slate-200 focus:outline-none focus:ring-1 focus:ring-slate-400"
              >
                {STATUS_OPTIONS.map((s) => (
                  <option key={s} value={s}>
                    {s}
                  </option>
                ))}
              </select>
            </div>

            <div className="flex flex-col gap-1">
              <label className="text-xs text-slate-500 dark:text-slate-400">우선순위</label>
              <select
                value={draft.priority ?? ''}
                onChange={(e) =>
                  updateDraft({ priority: (e.target.value as Priority) || undefined })
                }
                className="text-xs border border-slate-200 dark:border-slate-700 rounded px-2 py-1 bg-white dark:bg-slate-900 text-slate-800 dark:text-slate-200 focus:outline-none focus:ring-1 focus:ring-slate-400"
              >
                {PRIORITY_OPTIONS.map((o) => (
                  <option key={o.value} value={o.value}>
                    {o.label}
                  </option>
                ))}
              </select>
            </div>

            <div className="flex flex-col gap-1">
              <label className="text-xs text-slate-500 dark:text-slate-400">마감일</label>
              <input
                type="date"
                value={draft.due ?? ''}
                onChange={(e) => updateDraft({ due: e.target.value || undefined })}
                className="text-xs border border-slate-200 dark:border-slate-700 rounded px-2 py-1 bg-white dark:bg-slate-900 text-slate-800 dark:text-slate-200 focus:outline-none focus:ring-1 focus:ring-slate-400"
              />
            </div>

            <div className="flex flex-col gap-1">
              <label className="text-xs text-slate-500 dark:text-slate-400">프로젝트</label>
              <input
                type="text"
                value={draft.project ?? ''}
                onChange={(e) => updateDraft({ project: e.target.value || undefined })}
                className="text-xs border border-slate-200 dark:border-slate-700 rounded px-2 py-1 bg-white dark:bg-slate-900 text-slate-800 dark:text-slate-200 focus:outline-none focus:ring-1 focus:ring-slate-400"
                placeholder="프로젝트명"
              />
            </div>
          </div>

          <div className="flex flex-col gap-1">
            <label className="text-xs text-slate-500 dark:text-slate-400">태그</label>
            <div className="flex flex-wrap gap-1 mb-1">
              {draft.tags.map((tag) => (
                <span
                  key={tag}
                  className="inline-flex items-center gap-1 text-xs px-2 py-0.5 rounded bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300"
                >
                  #{tag}
                  <button
                    onClick={() => handleTagRemove(tag)}
                    className="opacity-60 hover:opacity-100"
                  >
                    <X size={10} />
                  </button>
                </span>
              ))}
            </div>
            <div className="flex gap-1">
              <input
                type="text"
                value={tagInput}
                onChange={(e) => setTagInput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    e.preventDefault()
                    handleTagAdd()
                  }
                }}
                placeholder="태그 추가 (Enter)"
                className="flex-1 text-xs border border-slate-200 dark:border-slate-700 rounded px-2 py-1 bg-white dark:bg-slate-900 text-slate-800 dark:text-slate-200 focus:outline-none focus:ring-1 focus:ring-slate-400"
              />
            </div>
          </div>

          <div className="border-t border-slate-100 dark:border-slate-800 pt-3">
            <div data-color-mode="auto">
              <MDEditor
                value={draft.body}
                onChange={(val) => updateDraft({ body: val ?? '' })}
                preview="live"
                height={400}
                visibleDragbar={false}
                style={{ fontSize: 13 }}
                previewOptions={{ rehypePlugins: [[rehypeWikilinks]] }}
              />
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
