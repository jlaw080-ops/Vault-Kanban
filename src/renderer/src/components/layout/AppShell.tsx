import { useEffect, useState, useRef, useCallback } from 'react'
import {
  BarChart3,
  Kanban,
  Settings,
  Brain,
  Link,
  ChevronLeft,
  ChevronRight,
  CalendarDays
} from 'lucide-react'
import { KanbanBoard } from '../kanban/KanbanBoard'
import { ControlBar } from './ControlBar'
import { NoteEditor } from '../editor/NoteEditor'
import { Dashboard } from '../dashboard/Dashboard'
import { SettingsPanel } from '../settings/SettingsPanel'
import { AiGroupingDialog } from '../ai/AiGroupingDialog'
import { RelatedNotesPanel } from '../ai/RelatedNotesPanel'
import { DailyCalendar } from '../daily/DailyCalendar'
import { useVaultStore } from '../../stores/vaultStore'
import { useViewStore } from '../../stores/viewStore'
import type { ColumnConfig, Status } from '@renderer/types'

const DEFAULT_COLUMNS: ColumnConfig[] = [
  { name: 'backlog' as Status, wipLimit: null, policy: '' },
  { name: 'planned' as Status, wipLimit: null, policy: '' },
  { name: 'in-progress' as Status, wipLimit: 3, policy: '' },
  { name: 'review' as Status, wipLimit: null, policy: '' },
  { name: 'done' as Status, wipLimit: null, policy: '' }
]

const MIN_EDITOR_WIDTH = 280
const MAX_EDITOR_WIDTH = 900
const DEFAULT_EDITOR_WIDTH = 480

export function AppShell(): JSX.Element {
  const {
    notes,
    updateNote,
    selectVault,
    loadVault,
    vaultPath,
    loading,
    selectedNote,
    openNote,
    removeNote
  } = useVaultStore()
  const { toasts, dismissToast, route, setRoute, pushToast } = useViewStore()
  const [showAiDialog, setShowAiDialog] = useState(false)
  const [showRelated, setShowRelated] = useState(false)
  const [sidebarOpen, setSidebarOpen] = useState(true)
  const [editorWidth, setEditorWidth] = useState(DEFAULT_EDITOR_WIDTH)
  const isDragging = useRef(false)
  const dragStartX = useRef(0)
  const dragStartWidth = useRef(0)

  useEffect(() => {
    const unsubscribe = window.api.watcher.onUnlink((filePath) => {
      removeNote(filePath)
    })
    return unsubscribe
  }, [removeNote])

  useEffect(() => {
    const unsubscribe = window.api.watcher.onChange((note) => {
      updateNote(note)
    })
    return unsubscribe
  }, [updateNote])

  useEffect(() => {
    function onMouseMove(e: MouseEvent): void {
      if (!isDragging.current) return
      const delta = dragStartX.current - e.clientX
      const next = Math.min(MAX_EDITOR_WIDTH, Math.max(MIN_EDITOR_WIDTH, dragStartWidth.current + delta))
      setEditorWidth(next)
    }
    function onMouseUp(): void {
      if (isDragging.current) {
        isDragging.current = false
        document.body.style.cursor = ''
        document.body.style.userSelect = ''
      }
    }
    window.addEventListener('mousemove', onMouseMove)
    window.addEventListener('mouseup', onMouseUp)
    return () => {
      window.removeEventListener('mousemove', onMouseMove)
      window.removeEventListener('mouseup', onMouseUp)
    }
  }, [])

  const handleResizeStart = useCallback((e: React.MouseEvent) => {
    e.preventDefault()
    isDragging.current = true
    dragStartX.current = e.clientX
    dragStartWidth.current = editorWidth
    document.body.style.cursor = 'col-resize'
    document.body.style.userSelect = 'none'
  }, [editorWidth])

  async function handleOpenVault(): Promise<void> {
    const path = await selectVault()
    if (path) {
      await loadVault(path)
    }
  }

  function handleFindRelated(): void {
    if (!selectedNote) {
      pushToast('먼저 노트를 선택하세요.', 'info')
      return
    }
    setShowRelated(true)
  }

  const navItems = [
    { key: 'kanban', label: '칸반', icon: Kanban },
    { key: 'daily', label: '데일리', icon: CalendarDays },
    { key: 'dashboard', label: '대시보드', icon: BarChart3 },
    { key: 'settings', label: '설정', icon: Settings }
  ] as const

  return (
    <div className="flex flex-col h-screen bg-background overflow-hidden">
      <div className="flex flex-1 overflow-hidden">
        {/* 사이드바 */}
        {sidebarOpen ? (
          <aside className="w-[200px] flex-shrink-0 border-r border-border bg-card flex flex-col p-3 gap-1">
            <div className="flex items-center justify-between mb-2">
              <button
                onClick={handleOpenVault}
                className="flex-1 text-left text-xs px-2 py-1.5 rounded-md hover:bg-muted text-muted-foreground truncate"
              >
                {vaultPath ? `📂 ${vaultPath.split(/[\\/]/).pop()}` : '볼트 열기…'}
              </button>
              <button
                onClick={() => setSidebarOpen(false)}
                className="ml-1 p-1 rounded-md hover:bg-muted text-muted-foreground flex-shrink-0"
                title="사이드바 숨기기"
              >
                <ChevronLeft size={14} />
              </button>
            </div>

            {navItems.map(({ key, label, icon: Icon }) => (
              <button
                key={key}
                onClick={() => setRoute(key)}
                className={`flex items-center gap-2 text-xs px-2 py-1.5 rounded-md w-full text-left transition-colors ${
                  route === key
                    ? 'bg-muted text-foreground font-bold'
                    : 'hover:bg-muted text-muted-foreground'
                }`}
              >
                <Icon size={14} />
                {label}
              </button>
            ))}

            <div className="flex-1" />

            <div className="border-t border-border pt-2 space-y-1">
              <button
                onClick={() => setShowAiDialog(true)}
                disabled={notes.length === 0}
                className="flex items-center gap-2 text-xs px-2 py-1.5 rounded-md w-full text-left hover:bg-muted text-muted-foreground disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
              >
                <Brain size={14} />
                AI 프로젝트 분류
              </button>
              <button
                onClick={handleFindRelated}
                disabled={!selectedNote}
                className="flex items-center gap-2 text-xs px-2 py-1.5 rounded-md w-full text-left hover:bg-muted text-muted-foreground disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
              >
                <Link size={14} />
                관련 노트 찾기
              </button>
            </div>
          </aside>
        ) : (
          /* 사이드바 축소 상태 — 열기 버튼만 표시 */
          <div className="flex-shrink-0 border-r border-border bg-card flex flex-col items-center py-3">
            <button
              onClick={() => setSidebarOpen(true)}
              className="p-1.5 rounded-md hover:bg-muted text-muted-foreground"
              title="사이드바 열기"
            >
              <ChevronRight size={14} />
            </button>
          </div>
        )}

        <main className="flex-1 overflow-hidden flex flex-col min-w-0">
          {route === 'kanban' && <ControlBar />}
          <div className="flex-1 overflow-hidden flex">
            <div className={`flex-1 ${route === 'daily' ? 'overflow-hidden p-0' : route === 'settings' ? 'overflow-auto p-4' : 'overflow-hidden p-4'}`}>
              {loading && (
                <div className="flex items-center justify-center flex-1">
                  <span className="text-sm text-muted-foreground">로딩 중…</span>
                </div>
              )}
              {!loading && notes.length === 0 && !vaultPath && (
                <div className="flex items-center justify-center flex-1">
                  <div className="text-center">
                    <p className="text-sm text-muted-foreground mb-3">
                      Obsidian vault 폴더를 열어주세요.
                    </p>
                    <button
                      onClick={handleOpenVault}
                      className="text-sm px-4 py-2 bg-accent text-accent-foreground rounded-full font-bold uppercase tracking-widest hover:brightness-110 transition-all"
                    >
                      볼트 열기
                    </button>
                  </div>
                </div>
              )}
              {!loading && (notes.length > 0 || vaultPath) && route === 'kanban' && (
                <KanbanBoard notes={notes} columns={DEFAULT_COLUMNS} onNoteUpdate={updateNote} />
              )}
              {!loading && route === 'dashboard' && <Dashboard notes={notes} />}
              {route === 'daily' && <DailyCalendar />}
              {route === 'settings' && <SettingsPanel />}
            </div>
            {showRelated && selectedNote && (
              <RelatedNotesPanel
                referenceNote={selectedNote}
                allNotes={notes}
                onOpenNote={(note) => openNote(note)}
                onClose={() => setShowRelated(false)}
              />
            )}
          </div>
        </main>

        {/* 노트 에디터 + 리사이즈 핸들 */}
        {selectedNote && (
          <>
            {/* 드래그 핸들 */}
            <div
              onMouseDown={handleResizeStart}
              className="w-1 flex-shrink-0 cursor-col-resize bg-border hover:bg-muted-foreground transition-colors"
              title="드래그하여 크기 조절"
            />
            <div style={{ width: editorWidth, flexShrink: 0 }} className="flex flex-col h-full overflow-hidden">
              <NoteEditor key={selectedNote.filePath} />
            </div>
          </>
        )}
      </div>

      <div className="fixed bottom-4 right-4 flex flex-col gap-2 z-50">
        {toasts.map((toast) => (
          <div
            key={toast.id}
            className={`text-sm px-3 py-2 rounded-md flex items-center gap-2 shadow-[rgba(0,0,0,0.5)_0px_8px_24px] ${
              toast.variant === 'error'
                ? 'bg-popover text-destructive border border-destructive/40'
                : toast.variant === 'success'
                  ? 'bg-popover text-accent border border-accent/40'
                  : 'bg-popover text-foreground border border-border'
            }`}
          >
            <span className="flex-1">{toast.message}</span>
            <button
              onClick={() => dismissToast(toast.id)}
              className="text-xs opacity-60 hover:opacity-100 ml-1"
            >
              ✕
            </button>
          </div>
        ))}
      </div>

      {showAiDialog && (
        <AiGroupingDialog
          notes={notes}
          onClose={() => setShowAiDialog(false)}
          onApplied={() => setShowAiDialog(false)}
        />
      )}
    </div>
  )
}
