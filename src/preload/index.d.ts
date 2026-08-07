import { ElectronAPI } from '@electron-toolkit/preload'
import type { Note, Settings } from '../main/utils/markdown'
import type { AiNoteInput, AiGroupResult, RelatedResult } from '../main/ipc/ai'
import type { FolderNode } from '../main/ipc/vault'
import type { PresetFieldValues } from '../main/utils/metadataMenu'

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
  listFolders: (vaultPath: string, excluded?: string[]) => Promise<FolderNode[]>
  getPresetFields: (vaultPath: string) => Promise<PresetFieldValues | null>
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

export interface ApiKeyApi {
  set: (plain: string) => Promise<{ ok: boolean; error?: string }>
  exists: () => Promise<boolean>
  test: () => Promise<{ ok: boolean; error?: string }>
  setModel: (model: string) => Promise<void>
  getModel: () => Promise<string>
}

export interface AiApi {
  groupNotes: (notes: AiNoteInput[]) => Promise<AiGroupResult | { error: string }>
  findRelated: (
    reference: AiNoteInput,
    candidates: AiNoteInput[]
  ) => Promise<RelatedResult | { error: string }>
  onProgress: (cb: (pct: number, label: string) => void) => () => void
}

export interface BackupEntry {
  name: string
  createdAt: Date
  sizeMb: number
}

export interface MigrationResult {
  ok: boolean
  backupPath: string
  migrated: number
  errors: string[]
}

export interface MigrationApi {
  execute: (
    vaultPath: string,
    mapping: Array<[string | null, string | 'skip']>,
    excluded: string[]
  ) => Promise<MigrationResult>
  listBackups: (vaultPath: string) => Promise<BackupEntry[]>
  restoreBackup: (vaultPath: string, backupName: string) => Promise<{ ok: boolean }>
}

export interface AppApi {
  vault: VaultApi
  watcher: WatcherApi
  obsidian: ObsidianApi
  system: SystemApi
  settings: SettingsApi
  apiKey: ApiKeyApi
  ai: AiApi
  migration: MigrationApi
}

declare global {
  interface Window {
    electron: ElectronAPI
    api: AppApi
  }
}
