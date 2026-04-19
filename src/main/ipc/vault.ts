import { dialog, ipcMain, BrowserWindow } from 'electron'
import { promises as fs } from 'fs'
import { join } from 'path'
import { parseNote, type Note } from '../utils/markdown'

const DEFAULT_EXCLUDED_FOLDERS: readonly string[] = [
  '.obsidian',
  '.trash',
  '.git',
  'node_modules',
  '.DS_Store'
]

async function selectVault(): Promise<string | null> {
  const focused = BrowserWindow.getFocusedWindow()
  const result = focused
    ? await dialog.showOpenDialog(focused, { properties: ['openDirectory'] })
    : await dialog.showOpenDialog({ properties: ['openDirectory'] })

  if (result.canceled || result.filePaths.length === 0) return null
  return result.filePaths[0]
}

async function walkMarkdown(
  dir: string,
  excluded: readonly string[],
  out: string[]
): Promise<void> {
  const entries = await fs.readdir(dir, { withFileTypes: true })
  for (const entry of entries) {
    if (excluded.includes(entry.name)) continue

    const full = join(dir, entry.name)
    if (entry.isDirectory()) {
      await walkMarkdown(full, excluded, out)
    } else if (entry.isFile() && entry.name.toLowerCase().endsWith('.md')) {
      out.push(full)
    }
  }
}

async function readSingleNote(filePath: string): Promise<Note> {
  const [raw, stat] = await Promise.all([fs.readFile(filePath, 'utf-8'), fs.stat(filePath)])
  return parseNote(filePath, raw, stat.mtimeMs)
}

async function scanVault(
  vaultPath: string,
  excludedFolders: readonly string[] = DEFAULT_EXCLUDED_FOLDERS
): Promise<Note[]> {
  const files: string[] = []
  await walkMarkdown(vaultPath, excludedFolders, files)

  const notes = await Promise.all(
    files.map(async (file) => {
      try {
        return await readSingleNote(file)
      } catch (error: unknown) {
        const message = error instanceof Error ? error.message : String(error)
        const fallback = parseNote(file, '', 0)
        return { ...fallback, parseError: message }
      }
    })
  )

  return notes
}

export function registerVaultHandlers(): void {
  ipcMain.handle('vault:select', async () => {
    return selectVault()
  })

  ipcMain.handle('vault:scan', async (_event, vaultPath: string, excludedFolders?: string[]) => {
    return scanVault(vaultPath, excludedFolders ?? DEFAULT_EXCLUDED_FOLDERS)
  })

  ipcMain.handle('vault:readNote', async (_event, filePath: string) => {
    return readSingleNote(filePath)
  })

  ipcMain.handle('vault:writeNote', async () => {
    return
  })
}
