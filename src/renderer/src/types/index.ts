export type Status = 'backlog' | 'planned' | 'in-progress' | 'review' | 'done'

export type Priority = 'high' | 'mid' | 'low'

export interface Note {
  filePath: string
  relativePath: string
  title: string
  status: Status
  priority?: Priority
  due?: string
  tags: string[]
  project?: string
  created: string
  started?: string | null
  completed?: string | null
  body: string
  mtime: number
  parseError?: string
  originalKeyOrder?: string[]
  statusFieldKey?: string
}

export interface ColumnConfig {
  name: Status | string
  wipLimit: number | null
  policy: string
}

export type CardField = 'priority' | 'project' | 'created' | 'due' | 'tags' | 'folder'

export interface Settings {
  vaultPath: string
  vaultName: string
  excludedFolders: string[]
  displayExcludedFolders: string[]
  defaultGrouping: 'status' | 'tag' | 'folder' | 'project'
  defaultSort: 'modifiedDesc' | 'modifiedAsc' | 'createdDesc' | 'createdAsc' | 'titleAsc' | 'dueAsc' | 'priorityDesc'
  statusColumns: ColumnConfig[]
  stayTimeWarnings: { yellow: number; red: number }
  anthropicModel: string
  statusFieldName: string
  editorAutoSave: { enabled: boolean; idleSeconds: number }
  theme: 'system' | 'light' | 'dark'
  columnPageSize: number
  cardFields: CardField[]
}
