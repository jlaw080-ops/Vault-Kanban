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

/**
 * 문서 뷰에서 이미지 target 을 실제 src 로 바꾸는 함수.
 * 로컬 뷰는 vault-img:// 를, 나중 웹 공유는 https URL 을 돌려주도록 갈아끼운다.
 */
export type AssetResolver = (notePath: string, target: string) => string
