import { ElectronAPI } from '@electron-toolkit/preload'
import type { Note, Settings } from '../main/utils/markdown'

export interface VaultApi {
  select: () => Promise<string | null>
  scan: (vaultPath: string, excludedFolders?: string[]) => Promise<Note[]>
  readNote: (filePath: string) => Promise<Note>
  writeNote: (note: Note) => Promise<void>
  moveNote: (
    oldPath: string,
    newPath: string
  ) => Promise<{ ok: true } | { ok: false; error: string }>
  deleteNote: (filePath: string) => Promise<{ ok: boolean; error?: string }>
}

export interface WatcherApi {
  start: (vaultPath: string, excluded: string[]) => Promise<void>
  stop: () => Promise<void>
  onChange: (cb: (note: Note) => void) => () => void
  onUnlink: (cb: (filePath: string) => void) => () => void
}

export interface ObsidianApi {
  open: (vaultName: string, relativePath: string) => Promise<void>
}

export interface SystemApi {
  showInFolder: (filePath: string) => Promise<void>
}

export interface SettingsApi {
  get: <K extends keyof Settings>(key: K) => Promise<Settings[K]>
  set: <K extends keyof Settings>(key: K, value: Settings[K]) => Promise<void>
  getAll: () => Promise<Settings>
}

export interface AppApi {
  vault: VaultApi
  watcher: WatcherApi
  obsidian: ObsidianApi
  system: SystemApi
  settings: SettingsApi
}

declare global {
  interface Window {
    electron: ElectronAPI
    api: AppApi
  }
}
