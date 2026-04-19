import { useEffect, useState } from 'react'
import { BarChart3, Kanban, Settings, Brain, Link } from 'lucide-react'
import { KanbanBoard } from '../kanban/KanbanBoard'
import { TopBar } from './TopBar'
import { ControlBar } from './ControlBar'
import { NoteEditor } from '../editor/NoteEditor'
import { Dashboard } from '../dashboard/Dashboard'
import { SettingsPanel } from '../settings/SettingsPanel'
import { AiGroupingDialog } from '../ai/AiGroupingDialog'
import { RelatedNotesPanel } from '../ai/RelatedNotesPanel'
import { useVaultStore } from '../../stores/vaultStore'
import { useViewStore } from '../../stores/viewStore'
import type { ColumnConfig, Status } from '@renderer/types'

const DEFAULT_COLUMNS: ColumnConfig[] = [
  { name: '백로그' as Status, wipLimit: null, policy: '' },
  { name: '예정' as Status, wipLimit: null, policy: '' },
  { name: '진행중' as Status, wipLimit: 3, policy: '' },
  { name: '검토' as Status, wipLimit: null, policy: '' },
  { name: '완료' as Status, wipLimit: null, policy: '' }
]

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

  useEffect(() => {
    const unsubscribe = window.api.watcher.onUnlink((filePath) => {
      removeNote(filePath)
    })
    return unsubscribe
  }, [removeNote])

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
    { key: 'dashboard', label: '대시보드', icon: BarChart3 },
    { key: 'settings', label: '설정', icon: Settings }
  ] as const

  return (
    <div className="flex flex-col h-screen bg-slate-50 dark:bg-slate-950 overflow-hidden">
      <TopBar />

      <div className="flex flex-1 overflow-hidden">
        <aside className="w-[200px] flex-shrink-0 border-r border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-950 flex flex-col p-3 gap-1">
          <button
            onClick={handleOpenVault}
            className="w-full text-left text-xs px-2 py-1.5 rounded-md hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-700 dark:text-slate-300 truncate mb-2"
          >
            {vaultPath ? `📂 ${vaultPath.split(/[\\/]/).pop()}` : '볼트 열기…'}
          </button>

          {navItems.map(({ key, label, icon: Icon }) => (
            <button
              key={key}
              onClick={() => setRoute(key)}
              className={`flex items-center gap-2 text-xs px-2 py-1.5 rounded-md w-full text-left ${
                route === key
                  ? 'bg-slate-100 dark:bg-slate-800 text-slate-900 dark:text-slate-100 font-medium'
                  : 'hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-600 dark:text-slate-400'
              }`}
            >
              <Icon size={14} />
              {label}
            </button>
          ))}

          <div className="flex-1" />

          {/* AI 기능 버튼 */}
          <div className="border-t border-slate-100 dark:border-slate-800 pt-2 space-y-1">
            <button
              onClick={() => setShowAiDialog(true)}
              disabled={notes.length === 0}
              className="flex items-center gap-2 text-xs px-2 py-1.5 rounded-md w-full text-left hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-600 dark:text-slate-400 disabled:opacity-30 disabled:cursor-not-allowed"
            >
              <Brain size={14} />
              AI 프로젝트 분류
            </button>
            <button
              onClick={handleFindRelated}
              disabled={!selectedNote}
              className="flex items-center gap-2 text-xs px-2 py-1.5 rounded-md w-full text-left hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-600 dark:text-slate-400 disabled:opacity-30 disabled:cursor-not-allowed"
            >
              <Link size={14} />
              관련 노트 찾기
            </button>
          </div>
        </aside>

        <main className="flex-1 overflow-hidden flex flex-col min-w-0">
          {route === 'kanban' && <ControlBar />}
          <div className="flex-1 overflow-hidden flex">
            <div className="flex-1 overflow-hidden p-4">
              {loading && (
                <div className="flex items-center justify-center flex-1">
                  <span className="text-sm text-slate-500 dark:text-slate-400">로딩 중…</span>
                </div>
              )}
              {!loading && notes.length === 0 && !vaultPath && (
                <div className="flex items-center justify-center flex-1">
                  <div className="text-center">
                    <p className="text-sm text-slate-500 dark:text-slate-400 mb-3">
                      Obsidian vault 폴더를 열어주세요.
                    </p>
                    <button
                      onClick={handleOpenVault}
                      className="text-sm px-3 py-1.5 bg-slate-900 dark:bg-slate-100 text-white dark:text-slate-900 rounded-md"
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
        {selectedNote && <NoteEditor key={selectedNote.filePath} />}
      </div>

      <div className="fixed bottom-4 right-4 flex flex-col gap-2 z-50">
        {toasts.map((toast) => (
          <div
            key={toast.id}
            className={`text-sm px-3 py-2 rounded-md shadow-md flex items-center gap-2 ${
              toast.variant === 'error'
                ? 'bg-red-50 dark:bg-red-950 text-red-700 dark:text-red-300 border border-red-200 dark:border-red-800'
                : toast.variant === 'success'
                  ? 'bg-emerald-50 dark:bg-emerald-950 text-emerald-700 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-800'
                  : 'bg-white dark:bg-slate-900 text-slate-700 dark:text-slate-300 border border-slate-200 dark:border-slate-800'
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
