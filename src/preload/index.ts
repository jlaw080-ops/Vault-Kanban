import { contextBridge, ipcRenderer } from 'electron'
import { electronAPI } from '@electron-toolkit/preload'
import type { Note, Settings } from '../main/utils/markdown'

const vault = {
  select: (): Promise<string | null> => ipcRenderer.invoke('vault:select'),
  scan: (vaultPath: string, excludedFolders?: string[]): Promise<Note[]> =>
    ipcRenderer.invoke('vault:scan', vaultPath, excludedFolders),
  readNote: (filePath: string): Promise<Note> => ipcRenderer.invoke('vault:readNote', filePath),
  writeNote: (note: Note): Promise<void> => ipcRenderer.invoke('vault:writeNote', note)
}

const settings = {
  get: <K extends keyof Settings>(key: K): Promise<Settings[K]> =>
    ipcRenderer.invoke('settings:get', key),
  set: <K extends keyof Settings>(key: K, value: Settings[K]): Promise<void> =>
    ipcRenderer.invoke('settings:set', key, value),
  getAll: (): Promise<Settings> => ipcRenderer.invoke('settings:getAll')
}

const api = { vault, settings }

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
