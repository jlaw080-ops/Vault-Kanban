import { contextBridge, ipcRenderer } from 'electron'
import { electronAPI } from '@electron-toolkit/preload'
import type { Note, Settings } from '../main/utils/markdown'

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
    ipcRenderer.invoke('vault:deleteNote', filePath)
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

const api = { vault, watcher, obsidian, system, settings }

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
