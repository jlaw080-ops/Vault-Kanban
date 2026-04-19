import { useState } from 'react'
import {
  DndContext,
  DragOverlay,
  PointerSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
  type DragStartEvent
} from '@dnd-kit/core'
import { apply } from '../../lib/statusTransition'
import { KanbanColumn } from './KanbanColumn'
import { KanbanCard } from './KanbanCard'
import { useViewStore } from '../../stores/viewStore'
import type { Note, Status, ColumnConfig } from '@renderer/types'

const STATUS_COLUMNS: readonly Status[] = ['백로그', '예정', '진행중', '검토', '완료']

interface KanbanBoardProps {
  notes: Note[]
  columns: ColumnConfig[]
  onNoteUpdate: (updated: Note) => void
}

export function KanbanBoard({ notes, onNoteUpdate }: KanbanBoardProps): JSX.Element {
  const [activeNote, setActiveNote] = useState<Note | null>(null)
  const { pushToast } = useViewStore()

  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 5 } }))

  const notesByStatus = (status: Status): Note[] => notes.filter((n) => n.status === status)

  function findNoteById(id: string): Note | undefined {
    return notes.find((n) => n.filePath === id)
  }

  function findStatusById(id: string): Status | undefined {
    if ((STATUS_COLUMNS as readonly string[]).includes(id)) return id as Status
    return findNoteById(id)?.status
  }

  function handleDragStart(event: DragStartEvent): void {
    const note = findNoteById(String(event.active.id))
    setActiveNote(note ?? null)
  }

  async function handleDragEnd(event: DragEndEvent): Promise<void> {
    setActiveNote(null)
    const { active, over } = event
    if (!over) return

    const draggedNote = findNoteById(String(active.id))
    if (!draggedNote) return

    const targetStatus = findStatusById(String(over.id))
    if (!targetStatus || targetStatus === draggedNote.status) return

    const updated = apply(draggedNote, targetStatus, new Date())

    onNoteUpdate(updated)

    try {
      await window.api.vault.writeNote(updated)
    } catch (error) {
      pushToast(
        `파일 저장 실패: ${error instanceof Error ? error.message : '알 수 없는 오류'}`,
        'error'
      )
      onNoteUpdate(draggedNote)
    }
  }

  return (
    <DndContext sensors={sensors} onDragStart={handleDragStart} onDragEnd={handleDragEnd}>
      <div className="flex gap-3 h-full overflow-x-auto pb-2">
        {STATUS_COLUMNS.map((status) => (
          <KanbanColumn key={status} status={status} notes={notesByStatus(status)} />
        ))}
      </div>

      <DragOverlay>{activeNote && <KanbanCard note={activeNote} isDragOverlay />}</DragOverlay>
    </DndContext>
  )
}
