import type { Note, Priority } from '@renderer/types'

type Grouping = 'status' | 'tag' | 'folder' | 'project'
type SortKey = 'modifiedDesc' | 'modifiedAsc' | 'createdDesc' | 'createdAsc' | 'titleAsc' | 'dueAsc'

export interface Filters {
  tags: string[]
  folders: string[]
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
      const parts = note.relativePath.split('/')
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
      const folder = n.relativePath.split('/')[0]
      return filters.folders.includes(folder)
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
