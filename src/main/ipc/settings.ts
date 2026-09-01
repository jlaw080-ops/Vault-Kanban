import { ipcMain } from 'electron'
import Store from 'electron-store'
import type { Settings } from '../utils/markdown'

const DEFAULT_SETTINGS: Settings = {
  vaultPath: '',
  vaultName: '',
  excludedFolders: ['.obsidian', '.trash', '.git', 'node_modules'],
  displayExcludedFolders: [],
  defaultGrouping: 'status',
  defaultSort: 'modifiedDesc',
  statusColumns: [
    { name: 'backlog', wipLimit: null, policy: '' },
    { name: 'planned', wipLimit: null, policy: '' },
    { name: 'in-progress', wipLimit: 3, policy: '' },
    { name: 'review', wipLimit: null, policy: '' },
    { name: 'done', wipLimit: null, policy: '' }
  ],
  stayTimeWarnings: { yellow: 7, red: 14 },
  anthropicModel: 'claude-sonnet-4-6',
  statusFieldName: 'status',
  editorAutoSave: { enabled: true, idleSeconds: 2 },
  theme: 'system',
  columnPageSize: 5,
  todoFolder: '06_To Do',
  projectsFolder: '01_Projects',
  cardFields: ['priority', 'project', 'created']
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

export function getSettingValue<K extends keyof Settings>(key: K): Settings[K] {
  return getStore().get(key)
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
