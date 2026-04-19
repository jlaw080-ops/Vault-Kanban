import { KanbanBoard } from '../kanban/KanbanBoard'
import { TopBar } from './TopBar'
import { ControlBar } from './ControlBar'
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
  const { notes, updateNote, selectVault, loadVault, vaultPath, loading } = useVaultStore()
  const { toasts, dismissToast } = useViewStore()

  async function handleOpenVault(): Promise<void> {
    const path = await selectVault()
    if (path) {
      await loadVault(path)
    }
  }

  return (
    <div className="flex flex-col h-screen bg-slate-50 dark:bg-slate-950 overflow-hidden">
      <TopBar />

      <div className="flex flex-1 overflow-hidden">
        <aside className="w-[200px] flex-shrink-0 border-r border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-950 flex flex-col p-3 gap-2">
          <button
            onClick={handleOpenVault}
            className="w-full text-left text-xs px-2 py-1.5 rounded-md hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-700 dark:text-slate-300 truncate"
          >
            {vaultPath ? `📂 ${vaultPath.split(/[\\/]/).pop()}` : '볼트 열기…'}
          </button>
        </aside>

        <main className="flex-1 overflow-hidden flex flex-col">
          <ControlBar />
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
          {!loading && (notes.length > 0 || vaultPath) && (
            <KanbanBoard notes={notes} columns={DEFAULT_COLUMNS} onNoteUpdate={updateNote} />
          )}
          </div>
        </main>
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
    </div>
  )
}
