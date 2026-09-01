import matter from 'gray-matter'
import type { Note, Status, Priority } from '@renderer/types'

const VALID_PRIORITIES: readonly Priority[] = ['high', 'mid', 'low']

const STATUS_PATTERNS: Array<[RegExp, Status]> = [
  [/^(in.?progress|진행중?|진행\s*중)$/i, 'in-progress'],
  [/^(done|완료됨?|finished|complete[d]?)$/i, 'done'],
  [/^(todo|backlog|백로그|to.?do)$/i, 'backlog'],
  [/^(planned?|예정|scheduled|upcoming)$/i, 'planned'],
  [/^(review|검토중?|검토\s*중|in.?review|reviewing)$/i, 'review']
]

function getBasename(filePath: string): string {
  const normalized = filePath.replace(/\\/g, '/')
  const lastSlash = normalized.lastIndexOf('/')
  return lastSlash >= 0 ? normalized.slice(lastSlash + 1) : normalized
}

function stripExtension(filename: string): string {
  const dot = filename.lastIndexOf('.')
  return dot > 0 ? filename.slice(0, dot) : filename
}

function normalizeStatus(value: unknown): Status {
  if (typeof value === 'string' && value.trim().length > 0) {
    const trimmed = value.trim()
    for (const [pattern, status] of STATUS_PATTERNS) {
      if (pattern.test(trimmed)) return status
    }
    return trimmed as Status
  }
  return 'backlog'
}

const KO_PRIORITY_MAP: Record<string, Priority> = {
  높음: 'high',
  중간: 'mid',
  낮음: 'low'
}

function normalizePriority(value: unknown): Priority | undefined {
  if (typeof value !== 'string') return undefined
  if ((VALID_PRIORITIES as readonly string[]).includes(value)) return value as Priority
  return KO_PRIORITY_MAP[value]
}

function normalizeTags(value: unknown): string[] {
  if (Array.isArray(value)) {
    return value.filter((t): t is string => typeof t === 'string')
  }
  if (typeof value === 'string' && value.trim().length > 0) {
    return [value.trim()]
  }
  return []
}

function normalizeDateField(value: unknown): string | undefined {
  if (typeof value === 'string') return value
  if (value instanceof Date) return value.toISOString().slice(0, 10)
  return undefined
}

function normalizeNullableDate(value: unknown): string | null | undefined {
  if (value === null) return null
  return normalizeDateField(value)
}

function getErrorMessage(error: unknown): string {
  if (error instanceof Error) return error.message
  return String(error)
}

const STATUS_FALLBACK_KEYS = ['status', '상태'] as const

function resolveStatusField(
  frontmatter: Record<string, unknown>,
  statusFieldName: string
): { key: string; value: unknown } {
  if (frontmatter[statusFieldName] !== undefined) {
    return { key: statusFieldName, value: frontmatter[statusFieldName] }
  }
  for (const fallback of STATUS_FALLBACK_KEYS) {
    if (fallback !== statusFieldName && frontmatter[fallback] !== undefined) {
      return { key: fallback, value: frontmatter[fallback] }
    }
  }
  return { key: statusFieldName, value: undefined }
}

export function parseNote(filePath: string, raw: string, mtime: number, statusFieldName = 'status'): Note {
  const basename = getBasename(filePath)
  const titleFromFilename = stripExtension(basename)

  let frontmatter: Record<string, unknown> = {}
  let originalKeyOrder: string[] = []
  let body = raw
  let parseError: string | undefined

  try {
    const parsed = matter(raw)
    frontmatter = (parsed.data ?? {}) as Record<string, unknown>
    originalKeyOrder = Object.keys(frontmatter)
    body = parsed.content.replace(/^\n+/, '').replace(/\n+$/, '')
  } catch (error: unknown) {
    parseError = getErrorMessage(error)
    // matter.stringify re-parses the body, so body must not contain frontmatter.
    // Strip the frontmatter block by finding the closing --- delimiter.
    if (raw.startsWith('---')) {
      const fmClose = raw.indexOf('\n---', 3)
      body = fmClose >= 0 ? raw.slice(fmClose + 4).replace(/^\n+/, '') : raw
    } else {
      body = raw
    }
  }

  const title =
    typeof frontmatter.title === 'string' && frontmatter.title.trim().length > 0
      ? frontmatter.title
      : titleFromFilename

  const { key: effectiveStatusKey, value: rawStatusValue } = resolveStatusField(frontmatter, statusFieldName)
  const status = parseError ? 'backlog' : normalizeStatus(rawStatusValue)

  const note: Note = {
    filePath,
    relativePath: basename,
    title,
    status,
    tags: normalizeTags(frontmatter.tags),
    created: normalizeDateField(frontmatter.created) ?? '',
    body,
    mtime
  }

  const priority = normalizePriority(frontmatter.priority) ?? normalizePriority(frontmatter['우선순위'])
  if (priority) note.priority = priority

  const due = normalizeDateField(frontmatter.due)
  if (due) note.due = due

  if (typeof frontmatter.project === 'string') {
    note.project = frontmatter.project
  }

  const started = normalizeNullableDate(frontmatter.started)
  if (started !== undefined) note.started = started

  const completed = normalizeNullableDate(frontmatter.completed)
  if (completed !== undefined) note.completed = completed

  if (parseError) note.parseError = parseError

  const extra: Record<string, unknown> = {}
  for (const [key, value] of Object.entries(frontmatter)) {
    if ((KNOWN_KEYS as readonly string[]).includes(key)) continue
    if (key === effectiveStatusKey) continue
    if ((ALIAS_KEYS as readonly string[]).includes(key)) continue
    extra[key] = value
  }
  if (Object.keys(extra).length > 0) note.extraFrontmatter = extra

  if (originalKeyOrder.length > 0) note.originalKeyOrder = originalKeyOrder
  note.statusFieldKey = effectiveStatusKey

  return note
}

const KNOWN_KEYS = [
  'title',
  'status',
  'priority',
  'due',
  'tags',
  'project',
  'created',
  'started',
  'completed'
] as const

/** 알려진 키의 한국어 별칭 — 값이 이미 KNOWN_KEYS 쪽으로 기록되므로 extra 로 중복 보관하지 않는다. */
const ALIAS_KEYS = ['우선순위', '상태'] as const

/** 원본 frontmatter 에 title 이 있었을 때만 다시 쓴다. frontmatter 자체가 없던 노트는 기존 동작 유지. */
function shouldWriteTitle(note: Note): boolean {
  if (!note.originalKeyOrder || note.originalKeyOrder.length === 0) return true
  return note.originalKeyOrder.includes('title')
}

function buildFrontmatterMap(note: Note, statusFieldName: string): Record<string, unknown> {
  const effectiveKey = note.statusFieldKey ?? statusFieldName
  const data: Record<string, unknown> = {}
  if (shouldWriteTitle(note)) data.title = note.title
  data[effectiveKey] = note.status
  if (note.priority !== undefined) data.priority = note.priority
  if (note.due !== undefined) data.due = note.due
  data.tags = note.tags
  if (note.project !== undefined) data.project = note.project
  data.created = note.created
  if (note.started !== undefined) data.started = note.started
  if (note.completed !== undefined) data.completed = note.completed

  // 미지 키 복원 — 알려진 키를 덮지 않는다.
  for (const [key, value] of Object.entries(note.extraFrontmatter ?? {})) {
    if (key in data) continue
    data[key] = value
  }

  return data
}

const DEFAULT_KEY_ORDER: readonly string[] = ['title', 'status', 'tags', 'created']

export function serializeNote(note: Note, statusFieldName = 'status'): string {
  const fullData = buildFrontmatterMap(note, statusFieldName)
  const ordered: Record<string, unknown> = {}
  const seen = new Set<string>()

  const orderSource =
    note.originalKeyOrder && note.originalKeyOrder.length > 0
      ? note.originalKeyOrder
      : DEFAULT_KEY_ORDER

  for (const key of orderSource) {
    if (key in fullData) {
      ordered[key] = fullData[key]
      seen.add(key)
    }
  }

  for (const key of KNOWN_KEYS) {
    if (!seen.has(key) && key in fullData) {
      ordered[key] = fullData[key]
      seen.add(key)
    }
  }

  for (const key of Object.keys(fullData)) {
    if (!seen.has(key)) {
      ordered[key] = fullData[key]
      seen.add(key)
    }
  }

  // Pass a file-object (not a string) so gray-matter skips re-parsing the body.
  // matter.stringify(string, data) internally calls matter(string) which would try
  // to interpret any "---" horizontal rules in the body as YAML front-matter delimiters.
  return matter.stringify(
    { content: note.body ?? '', data: {} } as unknown as matter.GrayMatterFile<string>,
    ordered
  )
}
