import type { Note, Priority, Status } from '@renderer/types'

type Grouping = 'status' | 'tag' | 'folder' | 'project'
type SortKey = 'modifiedDesc' | 'modifiedAsc' | 'createdDesc' | 'createdAsc' | 'titleAsc' | 'dueAsc' | 'priorityDesc'

export interface Filters {
  tags: string[]
  folders: string[]
  projects: string[]
  priority: Priority | 'none' | 'all'
  keyword: string
}

export function groupNotes(notes: Note[], grouping: Grouping): Map<string, Note[]> {
  const map = new Map<string, Note[]>()

  const addTo = (key: string, note: Note): void => {
    const existing = map.get(key)
    if (existing) {
      existing.push(note)
    } else {
      map.set(key, [note])
    }
  }

  for (const note of notes) {
    if (grouping === 'status') {
      addTo(note.status, note)
    } else if (grouping === 'tag') {
      if (note.tags.length === 0) {
        addTo('(태그 없음)', note)
      } else {
        for (const tag of note.tags) {
          addTo(tag, note)
        }
      }
    } else if (grouping === 'folder') {
      const parts = note.relativePath.replace(/\\/g, '/').split('/')
      const folder = parts.length > 1 ? parts[0] : '(루트)'
      addTo(folder, note)
    } else if (grouping === 'project') {
      addTo(note.project ?? '(미분류)', note)
    }
  }

  return map
}

export function sortNotes(notes: Note[], sort: SortKey): Note[] {
  const copy = [...notes]

  switch (sort) {
    case 'modifiedDesc':
      return copy.sort((a, b) => b.mtime - a.mtime)
    case 'modifiedAsc':
      return copy.sort((a, b) => a.mtime - b.mtime)
    case 'createdDesc':
      return copy.sort((a, b) => new Date(b.created).getTime() - new Date(a.created).getTime())
    case 'createdAsc':
      return copy.sort((a, b) => new Date(a.created).getTime() - new Date(b.created).getTime())
    case 'titleAsc':
      return copy.sort((a, b) => a.title.localeCompare(b.title, 'ko'))
    case 'dueAsc':
      return copy.sort((a, b) => {
        if (!a.due && !b.due) return 0
        if (!a.due) return 1
        if (!b.due) return -1
        return a.due.localeCompare(b.due)
      })
    case 'priorityDesc': {
      const order: Record<string, number> = { high: 0, mid: 1, low: 2 }
      return copy.sort((a, b) => {
        const oa = a.priority !== undefined ? order[a.priority] : 3
        const ob = b.priority !== undefined ? order[b.priority] : 3
        return oa - ob
      })
    }
  }
}

export function filterNotes(notes: Note[], filters: Filters): Note[] {
  let result = notes

  if (filters.keyword) {
    const kw = filters.keyword.toLowerCase()
    result = result.filter(
      (n) => n.title.toLowerCase().includes(kw) || n.body.toLowerCase().includes(kw)
    )
  }

  if (filters.tags.length > 0) {
    result = result.filter((n) => filters.tags.every((t) => n.tags.includes(t)))
  }

  if (filters.folders.length > 0) {
    result = result.filter((n) => {
      const folder = n.relativePath.replace(/\\/g, '/').split('/')[0]
      return filters.folders.includes(folder)
    })
  }

  if ((filters.projects?.length ?? 0) > 0) {
    result = result.filter((n) => {
      const proj = n.project ?? '(미분류)'
      return filters.projects.includes(proj)
    })
  }

  if (filters.priority !== 'all') {
    if (filters.priority === 'none') {
      result = result.filter((n) => !n.priority)
    } else {
      result = result.filter((n) => n.priority === filters.priority)
    }
  }

  return result
}

export const ETC_LANE = '(기타)'

export const STATUS_COLUMNS: readonly Status[] = [
  'backlog',
  'planned',
  'in-progress',
  'review',
  'done'
]

export interface SwimlaneGroup {
  lane: string
  notes: Note[]
}

const SWIMLANE_ID_SEP = '::'

export function makeSwimlaneDroppableId(laneIndex: number, status: string): string {
  return `${laneIndex}${SWIMLANE_ID_SEP}${status}`
}

export function parseSwimlaneDroppableId(
  id: string
): { laneIndex: number; status: string } | null {
  const sepAt = id.indexOf(SWIMLANE_ID_SEP)
  if (sepAt <= 0) return null
  const lanePart = id.slice(0, sepAt)
  const status = id.slice(sepAt + SWIMLANE_ID_SEP.length)
  if (!/^\d+$/.test(lanePart) || status.length === 0) return null
  return { laneIndex: Number(lanePart), status }
}

export interface SwimlaneDropDecision {
  statusChanged: boolean
  nextStatus: Status
  projectChanged: boolean
  nextProject: string | undefined
}

export function decideSwimlaneDrop(
  note: Note,
  laneName: string,
  targetStatus: Status
): SwimlaneDropDecision | null {
  const statusChanged = targetStatus !== note.status
  const projectChanged = laneName !== ETC_LANE && note.project !== laneName
  if (!statusChanged && !projectChanged) return null
  return {
    statusChanged,
    nextStatus: targetStatus,
    projectChanged,
    nextProject: projectChanged ? laneName : note.project
  }
}

export function mergeProjectOptions(preset: string[], derived: string[]): string[] {
  const merged = [...new Set(preset)]
  const seen = new Set(merged)
  const extras = [...new Set(derived)].filter((d) => !seen.has(d))
  extras.sort((a, b) => a.localeCompare(b, 'ko'))
  return [...merged, ...extras]
}

const APP_PRIORITIES: readonly string[] = ['low', 'mid', 'high']

function sameSet(a: readonly string[], b: readonly string[]): boolean {
  const as = new Set(a)
  const bs = new Set(b)
  return as.size === bs.size && [...as].every((x) => bs.has(x))
}

export function presetMismatchMessage(preset: {
  statuses: string[]
  priorities: string[]
}): string | null {
  const diffs: string[] = []
  if (preset.statuses.length > 0 && !sameSet(preset.statuses, STATUS_COLUMNS)) {
    diffs.push(`status: [${preset.statuses.join(', ')}]`)
  }
  if (preset.priorities.length > 0 && !sameSet(preset.priorities, APP_PRIORITIES)) {
    diffs.push(`priority: [${preset.priorities.join(', ')}]`)
  }
  if (diffs.length === 0) return null
  return `Metadata Menu의 status/priority 정의가 앱과 다릅니다 — ${diffs.join(' / ')}`
}

export function groupNotesBySwimlane(
  notes: Note[],
  selectedProjects: string[]
): SwimlaneGroup[] {
  const lanes: SwimlaneGroup[] = selectedProjects.map((p) => ({ lane: p, notes: [] }))
  const etc: SwimlaneGroup = { lane: ETC_LANE, notes: [] }
  const indexByProject = new Map(selectedProjects.map((p, i) => [p, i]))

  for (const note of notes) {
    const idx = note.project !== undefined ? indexByProject.get(note.project) : undefined
    if (idx !== undefined) {
      lanes[idx].notes.push(note)
    } else {
      etc.notes.push(note)
    }
  }

  return [...lanes, etc]
}
