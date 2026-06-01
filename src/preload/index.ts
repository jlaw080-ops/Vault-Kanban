import { contextBridge, ipcRenderer } from 'electron'
import { electronAPI } from '@electron-toolkit/preload'
import type { Note, Settings } from '../main/utils/markdown'
import type { AiNoteInput, AiGroupResult, RelatedResult } from '../main/ipc/ai'
import type { FolderNode } from '../main/ipc/vault'

const vault = {
  select: (): Promise<string | null> => ipcRenderer.invoke('vault:select'),
  scan: (vaultPath: string, excludedFolders?: string[]): Promise<Note[]> =>
    ipcRenderer.invoke('vault:scan', vaultPath, excludedFolders),
  readNote: (filePath: string): Promise<Note> => ipcRenderer.invoke('vault:readNote', filePath),
  writeNote: (note: Note): Promise<void> => ipcRenderer.invoke('vault:writeNote', note),
  moveNote: (
    oldPath: string,
    newPath: string
  ): Promise<{ ok: true } | { ok: false; error: string }> =>
    ipcRenderer.invoke('vault:moveNote', oldPath, newPath),
  deleteNote: (filePath: string): Promise<{ ok: boolean; error?: string }> =>
    ipcRenderer.invoke('vault:deleteNote', filePath),
  listFolders: (vaultPath: string, excluded?: string[]): Promise<FolderNode[]> =>
    ipcRenderer.invoke('vault:listFolders', vaultPath, excluded)
}

const watcher = {
  start: (vaultPath: string, excluded: string[]): Promise<void> =>
    ipcRenderer.invoke('watcher:start', vaultPath, excluded),
  stop: (): Promise<void> => ipcRenderer.invoke('watcher:stop'),
  onChange: (cb: (note: Note) => void): (() => void) => {
    const handler = (_event: Electron.IpcRendererEvent, note: Note): void => cb(note)
    ipcRenderer.on('note:external-change', handler)
    return () => ipcRenderer.removeListener('note:external-change', handler)
  },
  onUnlink: (cb: (filePath: string) => void): (() => void) => {
    const handler = (_event: Electron.IpcRendererEvent, filePath: string): void => cb(filePath)
    ipcRenderer.on('note:unlink', handler)
    return () => ipcRenderer.removeListener('note:unlink', handler)
  }
}

const obsidian = {
  open: (vaultName: string, relativePath: string): Promise<void> =>
    ipcRenderer.invoke('obsidian:open', vaultName, relativePath)
}

const system = {
  showInFolder: (filePath: string): Promise<void> =>
    ipcRenderer.invoke('system:showInFolder', filePath)
}

const settings = {
  get: <K extends keyof Settings>(key: K): Promise<Settings[K]> =>
    ipcRenderer.invoke('settings:get', key),
  set: <K extends keyof Settings>(key: K, value: Settings[K]): Promise<void> =>
    ipcRenderer.invoke('settings:set', key, value),
  getAll: (): Promise<Settings> => ipcRenderer.invoke('settings:getAll')
}

const apiKey = {
  set: (plain: string): Promise<{ ok: boolean; error?: string }> =>
    ipcRenderer.invoke('apiKey:set', plain),
  exists: (): Promise<boolean> => ipcRenderer.invoke('apiKey:exists'),
  test: (): Promise<{ ok: boolean; error?: string }> => ipcRenderer.invoke('apiKey:test'),
  setModel: (model: string): Promise<void> => ipcRenderer.invoke('apiKey:setModel', model),
  getModel: (): Promise<string> => ipcRenderer.invoke('apiKey:getModel')
}

const ai = {
  groupNotes: (notes: AiNoteInput[]): Promise<AiGroupResult | { error: string }> =>
    ipcRenderer.invoke('ai:groupNotes', notes),
  findRelated: (
    reference: AiNoteInput,
    candidates: AiNoteInput[]
  ): Promise<RelatedResult | { error: string }> =>
    ipcRenderer.invoke('ai:findRelated', reference, candidates),
  onProgress: (cb: (pct: number, label: string) => void): (() => void) => {
    const handler = (_event: Electron.IpcRendererEvent, pct: number, label: string): void =>
      cb(pct, label)
    ipcRenderer.on('ai:progress', handler)
    return () => ipcRenderer.removeListener('ai:progress', handler)
  }
}

type MappingEntry = [string | null, string | 'skip']

const migration = {
  execute: (
    vaultPath: string,
    mapping: MappingEntry[],
    excluded: string[]
  ): Promise<{ ok: boolean; backupPath: string; migrated: number; errors: string[] }> =>
    ipcRenderer.invoke('migration:execute', vaultPath, mapping, excluded),
  listBackups: (
    vaultPath: string
  ): Promise<Array<{ name: string; createdAt: Date; sizeMb: number }>> =>
    ipcRenderer.invoke('backup:list', vaultPath),
  restoreBackup: (vaultPath: string, backupName: string): Promise<{ ok: boolean }> =>
    ipcRenderer.invoke('backup:restore', vaultPath, backupName)
}

const api = { vault, watcher, obsidian, system, settings, apiKey, ai, migration }

if (process.contextIsolated) {
  try {
    contextBridge.exposeInMainWorld('electron', electronAPI)
    contextBridge.exposeInMainWorld('api', api)
  } catch (error) {
    console.error(error)
  }
} else {
  // @ts-ignore (define in dts)
  window.electron = electronAPI
  // @ts-ignore (define in dts)
  window.api = api
}

export type Api = typeof api
