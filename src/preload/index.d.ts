import { ElectronAPI } from '@electron-toolkit/preload'
import type { Note, Settings } from '../main/utils/markdown'

export interface VaultApi {
  select: () => Promise<string | null>
  scan: (vaultPath: string, excludedFolders?: string[]) => Promise<Note[]>
  readNote: (filePath: string) => Promise<Note>
  writeNote: (note: Note) => Promise<void>
}

export interface SettingsApi {
  get: <K extends keyof Settings>(key: K) => Promise<Settings[K]>
  set: <K extends keyof Settings>(key: K, value: Settings[K]) => Promise<void>
  getAll: () => Promise<Settings>
}

export interface AppApi {
  vault: VaultApi
  settings: SettingsApi
}

declare global {
  interface Window {
    electron: ElectronAPI
    api: AppApi
  }
}
