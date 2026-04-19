import { ipcMain } from 'electron'
import Store from 'electron-store'
import type { Settings } from '../utils/markdown'

const DEFAULT_SETTINGS: Settings = {
  vaultPath: '',
  vaultName: '',
  excludedFolders: ['.obsidian', '.trash', '.git', 'node_modules'],
  defaultGrouping: 'status',
  defaultSort: 'modifiedDesc',
  statusColumns: [
    { name: '백로그', wipLimit: null, policy: '' },
    { name: '예정', wipLimit: null, policy: '' },
    { name: '진행중', wipLimit: 3, policy: '' },
    { name: '검토', wipLimit: null, policy: '' },
    { name: '완료', wipLimit: null, policy: '' }
  ],
  stayTimeWarnings: { yellow: 7, red: 14 },
  anthropicModel: 'claude-sonnet-4-6',
  statusFieldName: 'status'
}

let store: Store<Settings> | null = null

function getStore(): Store<Settings> {
  if (!store) {
    store = new Store<Settings>({
      name: 'settings',
      defaults: DEFAULT_SETTINGS
    })
  }
  return store
}

export function registerSettingsHandlers(): void {
  ipcMain.handle('settings:get', <K extends keyof Settings>(_event: unknown, key: K) => {
    return getStore().get(key)
  })

  ipcMain.handle(
    'settings:set',
    <K extends keyof Settings>(_event: unknown, key: K, value: Settings[K]) => {
      getStore().set(key, value)
    }
  )

  ipcMain.handle('settings:getAll', () => {
    return getStore().store
  })
}
