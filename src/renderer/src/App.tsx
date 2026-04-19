import { useEffect } from 'react'
import { Button } from './components/ui/button'
import { useVaultStore } from './stores/vaultStore'
import { useSettingsStore } from './stores/settingsStore'

function formatMtime(mtime: number): string {
  const d = new Date(mtime)
  const yyyy = d.getFullYear()
  const mm = String(d.getMonth() + 1).padStart(2, '0')
  const dd = String(d.getDate()).padStart(2, '0')
  const hh = String(d.getHours()).padStart(2, '0')
  const mi = String(d.getMinutes()).padStart(2, '0')
  return `${yyyy}-${mm}-${dd} ${hh}:${mi}`
}

function App(): React.JSX.Element {
  const { vaultPath, notes, loading, loadProgress, error, selectVault, loadVault } = useVaultStore()
  const { settings, load: loadSettings } = useSettingsStore()

  useEffect(() => {
    void (async () => {
      const loaded = await loadSettings()
      if (loaded.vaultPath) {
        useVaultStore.setState({ vaultPath: loaded.vaultPath })
        await loadVault(loaded.vaultPath, loaded.excludedFolders)
      }
    })()
  }, [loadSettings, loadVault])

  const handleSelectVault = async (): Promise<void> => {
    const path = await selectVault()
    if (path) {
      await loadVault(path, settings?.excludedFolders)
    }
  }

  return (
    <div className="min-h-screen bg-background text-foreground">
      <header className="border-b border-border px-6 py-4">
        <div className="flex items-center justify-between">
          <h1 className="text-lg font-semibold">Vault Kanban</h1>
          <div className="flex items-center gap-3">
            {vaultPath && (
              <span className="text-sm text-muted-foreground" title={vaultPath}>
                {vaultPath}
              </span>
            )}
            <Button variant="outline" size="sm" onClick={handleSelectVault}>
              Vault 폴더 선택
            </Button>
          </div>
        </div>
      </header>

      <main className="px-6 py-6">
        {error && (
          <div
            role="alert"
            className="mb-4 rounded border border-red-500 bg-red-50 px-4 py-3 text-sm text-red-900 dark:border-red-400 dark:bg-red-950 dark:text-red-100"
          >
            {error}
          </div>
        )}

        {!vaultPath && !loading && (
          <div className="flex flex-col items-center justify-center py-24 text-center">
            <p className="mb-4 text-base text-muted-foreground">
              표시할 vault가 없습니다. Obsidian vault 폴더를 선택하세요.
            </p>
            <Button onClick={handleSelectVault}>Vault 폴더 선택</Button>
          </div>
        )}

        {loading && (
          <div className="flex items-center justify-center py-24 text-sm text-muted-foreground">
            {loadProgress
              ? `로드 중 (${loadProgress.current}/${loadProgress.total})`
              : '로드 중...'}
          </div>
        )}

        {!loading && vaultPath && notes.length === 0 && !error && (
          <div className="py-24 text-center text-sm text-muted-foreground">노트가 없습니다.</div>
        )}

        {!loading && notes.length > 0 && (
          <div className="overflow-x-auto rounded border border-border">
            <table className="w-full text-sm">
              <thead className="bg-muted/50">
                <tr className="text-left">
                  <th className="px-4 py-2 font-medium text-muted-foreground">제목</th>
                  <th className="px-4 py-2 font-medium text-muted-foreground">status</th>
                  <th className="px-4 py-2 font-medium text-muted-foreground">수정일</th>
                </tr>
              </thead>
              <tbody>
                {notes.map((note) => (
                  <tr key={note.filePath} className="border-t border-border hover:bg-muted/30">
                    <td className="px-4 py-2" title={note.relativePath}>
                      {note.title}
                      {note.parseError && (
                        <span
                          className="ml-2 text-xs text-amber-700 dark:text-amber-400"
                          title={note.parseError}
                        >
                          (파싱 오류)
                        </span>
                      )}
                    </td>
                    <td className="px-4 py-2 text-muted-foreground">{note.status}</td>
                    <td className="px-4 py-2 text-muted-foreground">{formatMtime(note.mtime)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            <div className="border-t border-border bg-muted/30 px-4 py-2 text-xs text-muted-foreground">
              총 {notes.length}개
            </div>
          </div>
        )}
      </main>
    </div>
  )
}

export default App
