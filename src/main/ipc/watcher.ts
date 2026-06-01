import { ipcMain, BrowserWindow, shell } from 'electron'
import chokidar, { FSWatcher } from 'chokidar'
import { readSingleNote, isRecentlyWrittenByApp, computeRelativePath } from './vault'
import { promises as fs } from 'fs'

let watcher: FSWatcher | null = null
let currentVaultPath = ''
const debounceTimers = new Map<string, ReturnType<typeof setTimeout>>()

function getMainWindow(): BrowserWindow | null {
  return BrowserWindow.getAllWindows()[0] ?? null
}

function debounce(filePath: string, fn: () => void, ms = 500): void {
  const existing = debounceTimers.get(filePath)
  if (existing) clearTimeout(existing)
  debounceTimers.set(
    filePath,
    setTimeout(() => {
      debounceTimers.delete(filePath)
      fn()
    }, ms)
  )
}

export function registerWatcherHandlers(): void {
  ipcMain.handle(
    'watcher:start',
    async (_event, vaultPath: string, excluded: string[]): Promise<void> => {
      currentVaultPath = vaultPath
      if (watcher) {
        await watcher.close()
        watcher = null
      }

      watcher = chokidar.watch(vaultPath, {
        ignored: (path: string) => {
          const parts = path.replace(/\\/g, '/').split('/')
          return parts.some((p) => excluded.includes(p))
        },
        persistent: true,
        ignoreInitial: true,
        awaitWriteFinish: { stabilityThreshold: 200, pollInterval: 100 }
      })

      watcher.on('change', (filePath: string) => {
        if (!filePath.toLowerCase().endsWith('.md')) return
        if (isRecentlyWrittenByApp(filePath)) return

        debounce(filePath, async () => {
          try {
            const note = await readSingleNote(filePath)
            const relativePath = currentVaultPath
              ? computeRelativePath(currentVaultPath, filePath)
              : note.relativePath
            const win = getMainWindow()
            win?.webContents.send('note:external-change', { ...note, relativePath })
          } catch {
            // ignore unreadable files
          }
        })
      })

      watcher.on('unlink', (filePath: string) => {
        if (!filePath.toLowerCase().endsWith('.md')) return
        const win = getMainWindow()
        win?.webContents.send('note:unlink', filePath)
      })
    }
  )

  ipcMain.handle('watcher:stop', async (): Promise<void> => {
    if (watcher) {
      await watcher.close()
      watcher = null
    }
    debounceTimers.forEach((t) => clearTimeout(t))
    debounceTimers.clear()
  })

  ipcMain.handle(
    'obsidian:open',
    async (_event, vaultName: string, relativePath: string): Promise<void> => {
      const path = relativePath.startsWith('/') ? relativePath.slice(1) : relativePath
      const withoutExt = path.endsWith('.md') ? path.slice(0, -3) : path
      const encodedVault = encodeURIComponent(vaultName)
      const encodedFile = withoutExt.split('/').map(encodeURIComponent).join('%2F')
      const uri = `obsidian://open?vault=${encodedVault}&file=${encodedFile}`
      await shell.openExternal(uri)
    }
  )

  ipcMain.handle('system:showInFolder', async (_event, filePath: string): Promise<void> => {
    shell.showItemInFolder(filePath)
  })

  ipcMain.handle(
    'vault:deleteNote',
    async (_event, filePath: string): Promise<{ ok: boolean; error?: string }> => {
      try {
        await fs.unlink(filePath)
        return { ok: true }
      } catch (error: unknown) {
        const message = error instanceof Error ? error.message : String(error)
        return { ok: false, error: message }
      }
    }
  )
}
