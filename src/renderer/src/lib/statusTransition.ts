import type { Note, Status } from '../types'

const COMPLETED_STATUS: Status = 'done'
const IN_PROGRESS_STATUS: Status = 'in-progress'

export function apply(note: Readonly<Note>, newStatus: Status, now: Date): Note {
  const next: Note = { ...note, status: newStatus }

  if (note.status === newStatus) {
    return next
  }

  const nowIso = now.toISOString()

  if (newStatus === IN_PROGRESS_STATUS && note.started == null) {
    next.started = nowIso
  }

  if (newStatus === COMPLETED_STATUS) {
    next.completed = nowIso
  }

  if (note.status === COMPLETED_STATUS && newStatus !== COMPLETED_STATUS) {
    next.completed = null
  }

  return next
}
