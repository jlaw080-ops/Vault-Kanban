import type { Note } from '@renderer/types'

type Status = Note['status']
type MappingValue = Status | 'skip'

const STANDARD: Status[] = ['backlog', 'planned', 'in-progress', 'review', 'done']

const SUGGEST_TABLE: Array<[RegExp, Status]> = [
  [/^(in.?progress|진행중?|진행\s*중)$/i, 'in-progress'],
  [/^(done|완료됨?|finished|complete[d]?)$/i, 'done'],
  [/^(todo|backlog|백로그|to.?do)$/i, 'backlog'],
  [/^(planned?|예정|scheduled|upcoming)$/i, 'planned'],
  [/^(review|검토중?|in.?review|reviewing)$/i, 'review']
]

export function scanStatusValues(notes: Note[]): Map<string | null, number> {
  const counts = new Map<string | null, number>()
  for (const note of notes) {
    const val: string | null =
      note.status === undefined || note.status === null || (note.status as string) === ''
        ? null
        : (note.status as string)
    counts.set(val, (counts.get(val) ?? 0) + 1)
  }
  return counts
}

export function suggestMapping(value: string | null): MappingValue | 'ask' {
  if (value === null || value === '') return 'skip'
  if ((STANDARD as string[]).includes(value)) return value as Status
  for (const [pattern, mapped] of SUGGEST_TABLE) {
    if (pattern.test(value)) return mapped
  }
  return 'ask'
}

export function applyMapping(note: Note, mapping: Map<string | null, MappingValue>): Note {
  const key: string | null =
    note.status === undefined || note.status === null || (note.status as string) === ''
      ? null
      : (note.status as string)
  const mapped = mapping.get(key)
  if (mapped === undefined || mapped === 'skip') return note
  return { ...note, status: mapped }
}
