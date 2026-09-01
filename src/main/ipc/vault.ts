import { dialog, ipcMain, BrowserWindow } from 'electron'
import { promises as fs } from 'fs'
import { join, dirname } from 'path'
import { parseNote, serializeNote, type Note } from '../utils/markdown'
import { readPresetFields } from '../utils/metadataMenu'
import { getSettingValue } from './settings'

const DEFAULT_EXCLUDED_FOLDERS: readonly string[] = [
  '.obsidian',
  '.trash',
  '.git',
  'node_modules',
  '.DS_Store'
]

export const RECENT_WRITE_TTL_MS = 1000

export const recentlyWrittenByApp: Set<string> = new Set<string>()

const writeTimers: Map<string, ReturnType<typeof setTimeout>> = new Map()

export function isRecentlyWrittenByApp(filePath: string): boolean {
  return recentlyWrittenByApp.has(filePath)
}

function scheduleEviction(filePath: string): void {
  const existing = writeTimers.get(filePath)
  if (existing) {
    clearTimeout(existing)
  }
  const timer = setTimeout(() => {
    recentlyWrittenByApp.delete(filePath)
    writeTimers.delete(filePath)
  }, RECENT_WRITE_TTL_MS)
  writeTimers.set(filePath, timer)
}

export async function writeNoteToDisk(note: Note): Promise<void> {
  if (!note.filePath || note.filePath.length === 0) {
    throw new Error('writeNoteToDisk: note.filePath is required')
  }

  const statusFieldName = getSettingValue('statusFieldName')
  const markdown = serializeNote(note, statusFieldName)
  recentlyWrittenByApp.add(note.filePath)
  scheduleEviction(note.filePath)
  await fs.writeFile(note.filePath, markdown, 'utf-8')
}

export type FileOpResult =
  | { ok: true }
  | { ok: false; code: 'exists' | 'io'; error: string }

export interface ProjectPatch {
  project: string
  /** null 이면 sub_project 를 건드리지 않는다 (기존 값 유지, 없으면 만들지 않음). */
  subProject: string | null
}

async function pathExists(target: string): Promise<boolean> {
  try {
    await fs.access(target)
    return true
  } catch {
    return false
  }
}

function toMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}

/**
 * 새 경로에 먼저 쓰고 원본을 지운다. 중간에 실패해도 원본이 남는다.
 * 덮어쓰기는 하지 않는다.
 */
export async function moveNoteToProject(
  oldPath: string,
  newPath: string,
  patch: ProjectPatch
): Promise<FileOpResult> {
  try {
    if (await pathExists(newPath)) {
      return { ok: false, code: 'exists', error: `이미 같은 이름의 파일이 있습니다: ${newPath}` }
    }

    const note = await readSingleNote(oldPath)
    const extra = { ...(note.extraFrontmatter ?? {}) }
    if (patch.subProject !== null) {
      extra.sub_project = patch.subProject
    }
    const updated: Note = { ...note, project: patch.project, extraFrontmatter: extra }
    const markdown = serializeNote(updated, getSettingValue('statusFieldName'))

    await fs.mkdir(dirname(newPath), { recursive: true })
    recentlyWrittenByApp.add(newPath)
    scheduleEviction(newPath)
    await fs.writeFile(newPath, markdown, 'utf-8')

    try {
      recentlyWrittenByApp.add(oldPath)
      scheduleEviction(oldPath)
      await fs.unlink(oldPath)
    } catch (error: unknown) {
      await fs.rm(newPath, { force: true })
      return { ok: false, code: 'io', error: toMessage(error) }
    }

    return { ok: true }
  } catch (error: unknown) {
    return { ok: false, code: 'io', error: toMessage(error) }
  }
}

/** 배타적 생성(wx). 이미 있으면 덮지 않고 exists 를 돌려준다. */
export async function createNote(filePath: string, content: string): Promise<FileOpResult> {
  try {
    await fs.mkdir(dirname(filePath), { recursive: true })
    recentlyWrittenByApp.add(filePath)
    scheduleEviction(filePath)
    await fs.writeFile(filePath, content, { encoding: 'utf-8', flag: 'wx' })
    return { ok: true }
  } catch (error: unknown) {
    const code = (error as NodeJS.ErrnoException).code
    if (code === 'EEXIST') {
      return { ok: false, code: 'exists', error: `이미 존재합니다: ${filePath}` }
    }
    return { ok: false, code: 'io', error: toMessage(error) }
  }
}

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

export async function readSingleNote(filePath: string): Promise<Note> {
  const statusFieldName = getSettingValue('statusFieldName')
  const [raw, stat] = await Promise.all([fs.readFile(filePath, 'utf-8'), fs.stat(filePath)])
  return parseNote(filePath, raw, stat.mtimeMs, statusFieldName)
}

export function computeRelativePath(vaultPath: string, filePath: string): string {
  const normalizedVault = vaultPath.replace(/\\/g, '/').replace(/\/$/, '')
  const normalizedFile = filePath.replace(/\\/g, '/')
  if (normalizedFile.startsWith(normalizedVault + '/')) {
    return normalizedFile.slice(normalizedVault.length + 1)
  }
  const lastSlash = normalizedFile.lastIndexOf('/')
  return lastSlash >= 0 ? normalizedFile.slice(lastSlash + 1) : normalizedFile
}

export interface FolderNode {
  name: string
  path: string
  children: FolderNode[]
}

async function walkFolders(
  dir: string,
  relativePath: string,
  excluded: readonly string[]
): Promise<FolderNode[]> {
  const entries = await fs.readdir(dir, { withFileTypes: true })
  const nodes: FolderNode[] = []
  for (const entry of entries) {
    if (!entry.isDirectory()) continue
    if (excluded.includes(entry.name)) continue
    const childPath = relativePath ? `${relativePath}/${entry.name}` : entry.name
    const children = await walkFolders(join(dir, entry.name), childPath, excluded)
    nodes.push({ name: entry.name, path: childPath, children })
  }
  return nodes
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
        const note = await readSingleNote(file)
        return { ...note, relativePath: computeRelativePath(vaultPath, file) }
      } catch (error: unknown) {
        const message = error instanceof Error ? error.message : String(error)
        const statusFieldName = getSettingValue('statusFieldName')
        const fallback = parseNote(file, '', 0, statusFieldName)
        return { ...fallback, parseError: message, relativePath: computeRelativePath(vaultPath, file) }
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

  ipcMain.handle('vault:writeNote', async (_event, note: Note) => {
    await writeNoteToDisk(note)
  })

  ipcMain.handle(
    'vault:listFolders',
    async (_event, vaultPath: string, excluded?: string[]): Promise<FolderNode[]> => {
      return walkFolders(vaultPath, '', excluded ?? DEFAULT_EXCLUDED_FOLDERS)
    }
  )

  ipcMain.handle('vault:getPresetFields', async (_event, vaultPath: string) => {
    return readPresetFields(vaultPath)
  })

  ipcMain.handle(
    'vault:moveNote',
    async (
      _event,
      oldPath: string,
      newPath: string
    ): Promise<{ ok: true } | { ok: false; error: string }> => {
      try {
        await fs.rename(oldPath, newPath)
        return { ok: true }
      } catch (error: unknown) {
        const message = error instanceof Error ? error.message : String(error)
        return { ok: false, error: message }
      }
    }
  )

  ipcMain.handle(
    'vault:moveNoteToProject',
    async (
      _event,
      oldPath: string,
      newPath: string,
      patch: ProjectPatch
    ): Promise<FileOpResult> => {
      return moveNoteToProject(oldPath, newPath, patch)
    }
  )

  ipcMain.handle(
    'vault:createNote',
    async (_event, filePath: string, content: string): Promise<FileOpResult> => {
      return createNote(filePath, content)
    }
  )
}
