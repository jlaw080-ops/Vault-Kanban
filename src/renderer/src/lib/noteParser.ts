import matter from 'gray-matter'
import type { Note, Status, Priority } from '@renderer/types'

const VALID_STATUSES: readonly Status[] = ['백로그', '예정', '진행중', '검토', '완료']
const VALID_PRIORITIES: readonly Priority[] = ['high', 'mid', 'low']

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
  if (typeof value === 'string' && (VALID_STATUSES as readonly string[]).includes(value)) {
    return value as Status
  }
  return '백로그'
}

function normalizePriority(value: unknown): Priority | undefined {
  if (typeof value === 'string' && (VALID_PRIORITIES as readonly string[]).includes(value)) {
    return value as Priority
  }
  return undefined
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

export function parseNote(filePath: string, raw: string, mtime: number): Note {
  const basename = getBasename(filePath)
  const titleFromFilename = stripExtension(basename)

  let frontmatter: Record<string, unknown> = {}
  let body = raw
  let parseError: string | undefined

  try {
    const parsed = matter(raw)
    frontmatter = (parsed.data ?? {}) as Record<string, unknown>
    body = parsed.content.replace(/^\n+/, '').replace(/\n+$/, '')
  } catch (error: unknown) {
    parseError = getErrorMessage(error)
    body = raw
  }

  const title =
    typeof frontmatter.title === 'string' && frontmatter.title.trim().length > 0
      ? frontmatter.title
      : titleFromFilename

  const status = parseError ? '백로그' : normalizeStatus(frontmatter.status)

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

  const priority = normalizePriority(frontmatter.priority)
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

  return note
}

export function serializeNote(note: Note): string {
  const data: Record<string, unknown> = {
    title: note.title,
    status: note.status,
    tags: note.tags,
    created: note.created
  }

  if (note.priority) data.priority = note.priority
  if (note.due) data.due = note.due
  if (note.project) data.project = note.project
  if (note.started !== undefined) data.started = note.started
  if (note.completed !== undefined) data.completed = note.completed

  return matter.stringify(note.body, data)
}
