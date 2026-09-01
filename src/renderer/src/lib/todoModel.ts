import matter from 'gray-matter'
import type { Note, Priority } from '@renderer/types'

export type TodoSortKey = 'createdDesc' | 'dueAsc' | 'priorityDesc' | 'status'

export interface ProjectMeta {
  project: string
  subProject: string | null
  /** preset 목록으로 보정하지 못한 값. 대화상자에서 경고를 띄운다. */
  offPreset: { project: boolean; subProject: boolean }
}

const NUMERIC_PREFIX = /^\d+[_-]\s*/
const FORBIDDEN_FILENAME_CHARS = /[\\/:*?"<>|]/g
const MAX_TITLE_LENGTH = 120
const MIN_SUGGEST_SEGMENT = 2

const PRIORITY_RANK: Record<Priority, number> = { high: 0, mid: 1, low: 2 }
const NO_PRIORITY_RANK = 99

function normalizePath(p: string): string {
  return p.replace(/\\/g, '/')
}

function trimSlashes(p: string): string {
  return p.replace(/^\/+|\/+$/g, '')
}

function pad2(n: number): string {
  return String(n).padStart(2, '0')
}

function stripNumericPrefix(segment: string): string {
  return segment.replace(NUMERIC_PREFIX, '').trim()
}

/** note.extraFrontmatter.sub_project 를 문자열일 때만 돌려준다. */
export function getSubProject(note: Note): string | null {
  const raw = note.extraFrontmatter?.sub_project
  return typeof raw === 'string' && raw.length > 0 ? raw : null
}

export function selectTodoNotes(notes: readonly Note[], todoFolder: string): Note[] {
  const folder = trimSlashes(normalizePath(todoFolder))
  if (folder.length === 0) return []
  const prefix = `${folder}/`
  return notes.filter((n) => normalizePath(n.relativePath).startsWith(prefix))
}

/** preset 목록에서 후보와 같거나 후보를 포함하는 항목이 정확히 하나면 그 표기를 돌려준다. */
function correctWithPreset(candidate: string, preset: readonly string[]): string | null {
  if (candidate.length === 0) return null
  if (preset.includes(candidate)) return candidate
  const contains = preset.filter((p) => p.includes(candidate))
  return contains.length === 1 ? contains[0] : null
}

export function deriveProjectMeta(
  destRelPath: string,
  projectsFolder: string,
  preset: { projects: readonly string[]; subProjects: readonly string[] }
): ProjectMeta {
  const dest = trimSlashes(normalizePath(destRelPath))
  const root = trimSlashes(normalizePath(projectsFolder))

  let rest = dest
  if (root.length > 0) {
    if (dest === root) rest = ''
    else if (dest.startsWith(`${root}/`)) rest = dest.slice(root.length + 1)
  }

  const segments = rest
    .split('/')
    .filter((s) => s.length > 0)
    .map(stripNumericPrefix)

  if (segments.length === 0) {
    return { project: '', subProject: null, offPreset: { project: true, subProject: false } }
  }

  const projectCandidate = segments[0]
  const projectCorrected = correctWithPreset(projectCandidate, preset.projects)

  let subProject: string | null = null
  let subOffPreset = false
  if (segments.length >= 2) {
    const subCandidate = segments[segments.length - 1]
    // 보정에 실패하면 값을 지어내지 않는다. 폴더 2단계가 항상 sub_project 개념은 아니다.
    subProject = correctWithPreset(subCandidate, preset.subProjects)
    subOffPreset = subProject === null
  }

  return {
    project: projectCorrected ?? projectCandidate,
    subProject,
    offPreset: { project: projectCorrected === null, subProject: subOffPreset }
  }
}

export function suggestProjectFolders(
  folderPaths: readonly string[],
  currentProject: string | undefined
): string[] {
  const key = (currentProject ?? '').trim()
  if (key.length === 0) return []
  return folderPaths.filter((path) =>
    normalizePath(path)
      .split('/')
      .filter((s) => s.length > 0)
      .map(stripNumericPrefix)
      .some((seg) => seg.length >= MIN_SUGGEST_SEGMENT && (seg.includes(key) || key.includes(seg)))
  )
}

function byTitle(a: Note, b: Note): number {
  return a.title.localeCompare(b.title, 'ko')
}

/** 빈 값을 항상 뒤로 보내는 문자열 비교. dir 이 -1 이면 내림차순. */
function compareOptionalText(a: string, b: string, dir: 1 | -1): number | null {
  if (a === b) return null
  if (a.length === 0) return 1
  if (b.length === 0) return -1
  return a.localeCompare(b) * dir
}

export function sortTodos(
  notes: readonly Note[],
  key: TodoSortKey,
  statusOrder: readonly string[]
): Note[] {
  const copy = [...notes]
  copy.sort((a, b) => {
    if (key === 'createdDesc') {
      return compareOptionalText(a.created ?? '', b.created ?? '', -1) ?? byTitle(a, b)
    }
    if (key === 'dueAsc') {
      return compareOptionalText(a.due ?? '', b.due ?? '', 1) ?? byTitle(a, b)
    }
    if (key === 'priorityDesc') {
      const ar = a.priority ? PRIORITY_RANK[a.priority] : NO_PRIORITY_RANK
      const br = b.priority ? PRIORITY_RANK[b.priority] : NO_PRIORITY_RANK
      return ar === br ? byTitle(a, b) : ar - br
    }
    const ai = statusOrder.indexOf(a.status)
    const bi = statusOrder.indexOf(b.status)
    const an = ai === -1 ? NO_PRIORITY_RANK : ai
    const bn = bi === -1 ? NO_PRIORITY_RANK : bi
    return an === bn ? byTitle(a, b) : an - bn
  })
  return copy
}

export function filterTodosByKeyword(notes: readonly Note[], keyword: string): Note[] {
  const k = keyword.trim().toLowerCase()
  if (k.length === 0) return [...notes]
  return notes.filter((n) => {
    const haystack = [n.title, n.project ?? '', getSubProject(n) ?? ''].join('\n').toLowerCase()
    return haystack.includes(k)
  })
}

export function sanitizeTodoTitle(title: string): string {
  const cleaned = title.replace(FORBIDDEN_FILENAME_CHARS, '').trim()
  if (cleaned.length === 0) return '무제'
  return cleaned.slice(0, MAX_TITLE_LENGTH)
}

export function buildTodoFilePath(
  vaultPath: string,
  todoFolder: string,
  title: string,
  now: Date
): string {
  const root = normalizePath(vaultPath).replace(/\/+$/, '')
  const folder = trimSlashes(normalizePath(todoFolder))
  const month = `${now.getFullYear()}-${pad2(now.getMonth() + 1)}`
  const day = `${pad2(now.getMonth() + 1)}${pad2(now.getDate())}`
  return `${root}/${folder}/${month}/${day}_${sanitizeTodoTitle(title)}.md`
}

const TODO_BODY = ['## 업무 개요', '- ', '', '## 출처', '- ', '', '## 배경', '- '].join('\n')

export function buildTodoNoteContent(input: {
  title: string
  project?: string
  subProject?: string
  priority: Priority
  now: Date
}): string {
  const { now } = input
  const created = `${now.getFullYear()}-${pad2(now.getMonth() + 1)}-${pad2(now.getDate())}`
  const data: Record<string, unknown> = {
    project: input.project ?? null,
    sub_project: input.subProject ?? null,
    priority: input.priority,
    category: 'action',
    status: 'planned',
    works: null,
    tags: [],
    created,
    updated: null,
    completed: null
  }
  // 파일 오브젝트를 넘겨 gray-matter 가 본문을 다시 파싱하지 않게 한다 (noteParser.ts 와 같은 이유).
  return matter.stringify(
    { content: TODO_BODY, data: {} } as unknown as matter.GrayMatterFile<string>,
    data
  )
}
