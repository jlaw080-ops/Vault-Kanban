export type Status = '백로그' | '예정' | '진행중' | '검토' | '완료'

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
}

export interface ColumnConfig {
  name: Status | string
  wipLimit: number | null
  policy: string
}

export interface Settings {
  vaultPath: string
  vaultName: string
  excludedFolders: string[]
  defaultGrouping: 'status' | 'tag' | 'folder' | 'project'
  defaultSort: 'modifiedDesc' | 'modifiedAsc' | 'createdDesc' | 'createdAsc' | 'titleAsc' | 'dueAsc'
  statusColumns: ColumnConfig[]
  stayTimeWarnings: { yellow: number; red: number }
  anthropicModel: string
  statusFieldName: string
}
