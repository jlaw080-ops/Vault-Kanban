import { useState, useEffect, useCallback, useRef, useMemo } from 'react'
import MDEditor from '@uiw/react-md-editor'
import {
  X,
  Save,
  ExternalLink,
  FolderOpen,
  Trash2,
  AlertTriangle,
  Tag,
  Calendar,
  FolderKanban,
  CircleDot,
  Flag,
  Clock,
  Plus,
  Eye,
  Code,
  Columns2
} from 'lucide-react'
import { useVaultStore } from '../../stores/vaultStore'
import { useViewStore } from '../../stores/viewStore'
import { useSettingsStore } from '../../stores/settingsStore'
import { rehypeWikilinks } from '../../lib/rehypeWikilinks'
import { cn } from '../../lib/utils'
import type { Note, Status, Priority } from '@renderer/types'

type PreviewMode = 'edit' | 'live' | 'preview'

const STATUS_OPTIONS: Status[] = ['backlog', 'planned', 'in-progress', 'review', 'done']
const PRIORITY_OPTIONS: { value: Priority | ''; label: string }[] = [
  { value: '', label: '없음' },
  { value: 'high', label: 'high' },
  { value: 'mid', label: 'mid' },
  { value: 'low', label: 'low' }
]

interface ConflictState {
  externalNote: Note
}

function PropRow({
  icon,
  label,
  children
}: {
  icon: React.ReactNode
  label: string
  children: React.ReactNode
}): JSX.Element {
  return (
    <div className="flex items-center min-h-[28px] group">
      <div className="flex items-center gap-1.5 w-28 flex-shrink-0 text-muted-foreground text-xs py-0.5">
        {icon}
        <span>{label}</span>
      </div>
      <div className="flex-1 min-w-0">{children}</div>
    </div>
  )
}

const propInputCls =
  'w-full text-xs bg-transparent border-0 text-foreground focus:outline-none focus:bg-muted rounded px-1.5 py-0.5 hover:bg-muted transition-colors placeholder:text-muted-foreground/50'

const propSelectCls =
  'text-xs bg-transparent border-0 text-foreground focus:outline-none focus:bg-muted rounded px-1.5 py-0.5 hover:bg-muted transition-colors cursor-pointer'

export function NoteEditor(): JSX.Element | null {
  const { selectedNote, closeNote, updateNote, notes } = useVaultStore()
  const { pushToast } = useViewStore()
  const { settings } = useSettingsStore()

  const allProjects = useMemo(() => {
    const s = new Set<string>()
    for (const n of notes) {
      if (n.project) s.add(n.project)
    }
    return [...s].sort()
  }, [notes])

  const [draft, setDraft] = useState<Note | null>(() => (selectedNote ? { ...selectedNote } : null))
  const [dirty, setDirty] = useState(false)
  const [saving, setSaving] = useState(false)
  const [conflict, setConflict] = useState<ConflictState | null>(null)
  const [tagInput, setTagInput] = useState('')
  const [preview, setPreview] = useState<PreviewMode>('edit')
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

  const iconProps = { size: 13, className: 'flex-shrink-0' }

  return (
    <div className="flex flex-col h-full border-l border-border bg-background w-full">

      {/* Toolbar */}
      <div className="flex items-center justify-between px-3 py-2 border-b border-border bg-card flex-shrink-0">
        <div className="flex items-center gap-1.5">
          {dirty && (
            <span className="text-xs text-amber-500 font-medium">
              {saving ? '저장 중…' : '●'}
            </span>
          )}
        </div>
        <div className="flex items-center gap-0.5">
          {/* Preview mode toggles */}
          <div className="flex items-center mr-2 border border-border rounded-md overflow-hidden">
            {([
              { mode: 'edit' as const, icon: <Code size={12} />, title: '편집' },
              { mode: 'live' as const, icon: <Columns2 size={12} />, title: '분할' },
              { mode: 'preview' as const, icon: <Eye size={12} />, title: '미리보기' }
            ]).map(({ mode, icon, title }) => (
              <button
                key={mode}
                onClick={() => setPreview(mode)}
                title={title}
                className={cn(
                  'px-2 py-1 text-xs transition-colors',
                  preview === mode
                    ? 'bg-accent text-accent-foreground'
                    : 'text-muted-foreground hover:bg-muted'
                )}
              >
                {icon}
              </button>
            ))}
          </div>

          <button
            onClick={() => draft && saveNote(draft)}
            disabled={!dirty || saving}
            title="저장 (Ctrl+S)"
            className="p-1.5 rounded hover:bg-muted disabled:opacity-30 text-muted-foreground transition-colors"
          >
            <Save size={14} />
          </button>
          <button
            onClick={handleOpenObsidian}
            title="Obsidian에서 열기"
            className="p-1.5 rounded hover:bg-muted text-muted-foreground transition-colors"
          >
            <ExternalLink size={14} />
          </button>
          <button
            onClick={handleShowInFolder}
            title="파일 위치 열기"
            className="p-1.5 rounded hover:bg-muted text-muted-foreground transition-colors"
          >
            <FolderOpen size={14} />
          </button>
          <button
            onClick={handleDelete}
            title="삭제"
            className="p-1.5 rounded hover:bg-muted text-muted-foreground hover:text-destructive transition-colors"
          >
            <Trash2 size={14} />
          </button>
          <button
            onClick={closeNote}
            title="닫기 (Esc)"
            className="p-1.5 rounded hover:bg-muted text-muted-foreground transition-colors"
          >
            <X size={14} />
          </button>
        </div>
      </div>

      {/* Conflict banner */}
      {conflict && (
        <div className="flex items-center gap-2 px-4 py-2 bg-amber-950/30 border-b border-amber-800/40 text-amber-400 text-xs flex-shrink-0">
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

      {/* Scrollable content */}
      <div className="flex-1 min-h-0 overflow-auto flex flex-col">

        {/* Title */}
        <div className="px-5 pt-5 pb-2 flex-shrink-0">
          <input
            type="text"
            value={draft.title}
            onChange={(e) => updateDraft({ title: e.target.value })}
            className="w-full text-xl font-bold bg-transparent border-0 focus:outline-none text-foreground placeholder:text-muted-foreground/40"
            placeholder="제목 없음"
          />
        </div>

        {/* Properties — Obsidian style */}
        <div className="px-5 py-2 flex flex-col gap-0.5 flex-shrink-0">
          <PropRow icon={<FolderKanban {...iconProps} />} label="project">
            <input
              type="text"
              list="project-list"
              value={draft.project ?? ''}
              onChange={(e) => updateDraft({ project: e.target.value || undefined })}
              className={propInputCls}
              placeholder="값 없음"
            />
            <datalist id="project-list">
              {allProjects.map((p) => <option key={p} value={p} />)}
            </datalist>
          </PropRow>

          <PropRow icon={<Tag {...iconProps} />} label="tags">
            <div className="flex flex-wrap items-center gap-1 px-1.5 py-0.5 rounded hover:bg-muted transition-colors">
              {draft.tags.map((tag) => (
                <span
                  key={tag}
                  className="inline-flex items-center gap-0.5 text-xs px-1.5 py-0.5 rounded-full bg-muted text-foreground"
                >
                  #{tag}
                  <button
                    onClick={() => handleTagRemove(tag)}
                    className="opacity-50 hover:opacity-100 ml-0.5"
                  >
                    <X size={9} />
                  </button>
                </span>
              ))}
              <input
                type="text"
                value={tagInput}
                onChange={(e) => setTagInput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') { e.preventDefault(); handleTagAdd() }
                }}
                placeholder={draft.tags.length === 0 ? '태그 추가 (Enter)' : ''}
                className="flex-1 min-w-[80px] text-xs bg-transparent border-0 focus:outline-none text-foreground placeholder:text-muted-foreground/40"
              />
            </div>
          </PropRow>

          <PropRow icon={<CircleDot {...iconProps} />} label="상태">
            <select
              value={draft.status}
              onChange={(e) => updateDraft({ status: e.target.value as Status })}
              className={propSelectCls}
            >
              {STATUS_OPTIONS.map((s) => (
                <option key={s} value={s}>{s}</option>
              ))}
            </select>
          </PropRow>

          <PropRow icon={<Flag {...iconProps} />} label="priority">
            <select
              value={draft.priority ?? ''}
              onChange={(e) => updateDraft({ priority: (e.target.value as Priority) || undefined })}
              className={propSelectCls}
            >
              {PRIORITY_OPTIONS.map((o) => (
                <option key={o.value} value={o.value}>{o.label}</option>
              ))}
            </select>
          </PropRow>

          <PropRow icon={<Calendar {...iconProps} />} label="마감일">
            <input
              type="date"
              value={draft.due ?? ''}
              onChange={(e) => updateDraft({ due: e.target.value || undefined })}
              className={propInputCls}
            />
          </PropRow>

          <PropRow icon={<Clock {...iconProps} />} label="created">
            <span className="text-xs text-muted-foreground px-1.5 py-0.5">
              {draft.created ? draft.created.slice(0, 10) : '값 없음'}
            </span>
          </PropRow>

          <button className="flex items-center gap-1.5 mt-1 text-xs text-muted-foreground/60 hover:text-muted-foreground transition-colors px-1.5 py-0.5 rounded hover:bg-muted w-fit">
            <Plus size={12} />
            속성 추가
          </button>
        </div>

        {/* Divider */}
        <div className="mx-5 border-t border-border flex-shrink-0" />

        {/* Body editor */}
        <div className="flex-1 min-h-0" data-color-mode="dark">
          <MDEditor
            value={draft.body}
            onChange={(val) => updateDraft({ body: val ?? '' })}
            preview={preview}
            height="100%"
            visibleDragbar={false}
            style={{ fontSize: 13 }}
            previewOptions={{ rehypePlugins: [[rehypeWikilinks]] }}
          />
        </div>
      </div>
    </div>
  )
}
