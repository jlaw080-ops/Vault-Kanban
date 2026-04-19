import { useState, useMemo } from 'react'
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
import { groupNotes, sortNotes, filterNotes } from '../../lib/viewModel'
import { KanbanColumn } from './KanbanColumn'
import { KanbanCard } from './KanbanCard'
import { useViewStore } from '../../stores/viewStore'
import type { Note, Status, ColumnConfig } from '@renderer/types'

const STATUS_COLUMNS: readonly Status[] = ['백로그', '예정', '진행중', '검토', '완료']

interface ColumnEntry {
  id: string
  label: string
  notes: Note[]
  config?: ColumnConfig
}

interface KanbanBoardProps {
  notes: Note[]
  columns: ColumnConfig[]
  onNoteUpdate: (updated: Note) => void
}

export function KanbanBoard({ notes, columns, onNoteUpdate }: KanbanBoardProps): JSX.Element {
  const [activeNote, setActiveNote] = useState<Note | null>(null)
  const { grouping, sort, filters, pushToast } = useViewStore()

  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 5 } }))

  const filteredNotes = useMemo(() => filterNotes(notes, filters), [notes, filters])
  const sortedNotes = useMemo(() => sortNotes(filteredNotes, sort), [filteredNotes, sort])
  const grouped = useMemo(() => groupNotes(sortedNotes, grouping), [sortedNotes, grouping])

  const columnEntries: ColumnEntry[] = useMemo(() => {
    if (grouping === 'status') {
      return STATUS_COLUMNS.map((status) => ({
        id: status,
        label: status,
        notes: grouped.get(status) ?? [],
        config: columns.find((c) => c.name === status)
      }))
    }
    return [...grouped.entries()].map(([key, colNotes]) => ({
      id: key,
      label: key,
      notes: colNotes,
      config: undefined
    }))
  }, [grouping, grouped, columns])

  function findNoteById(id: string): Note | undefined {
    return notes.find((n) => n.filePath === id)
  }

  function resolveTargetColumn(id: string): string | undefined {
    if (columnEntries.some((c) => c.id === id)) return id
    for (const col of columnEntries) {
      if (col.notes.some((n) => n.filePath === id)) return col.id
    }
    return undefined
  }

  function currentColumnOf(note: Note): string | undefined {
    for (const col of columnEntries) {
      if (col.notes.some((n) => n.filePath === note.filePath)) return col.id
    }
    return undefined
  }

  function handleDragStart(event: DragStartEvent): void {
    setActiveNote(findNoteById(String(event.active.id)) ?? null)
  }

  async function handleStatusDrop(draggedNote: Note, targetColId: string): Promise<void> {
    const targetStatus = targetColId as Status
    if (targetStatus === draggedNote.status) return

    const targetConfig = columns.find((c) => c.name === targetStatus)
    const currentCount = (grouped.get(targetStatus) ?? []).length

    if (
      targetConfig?.wipLimit !== null &&
      targetConfig?.wipLimit !== undefined &&
      currentCount >= targetConfig.wipLimit
    ) {
      const ok = window.confirm(
        `"${targetStatus}" 컬럼의 WIP 한도(${targetConfig.wipLimit})를 초과합니다. 계속할까요?`
      )
      if (!ok) return
    }

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

  async function handleFolderDrop(draggedNote: Note, targetColId: string): Promise<void> {
    if (currentColumnOf(draggedNote) === targetColId) return

    const ok = window.confirm(`"${draggedNote.title}"을(를) "${targetColId}" 폴더로 이동할까요?`)
    if (!ok) return

    const oldPath = draggedNote.filePath.replace(/\\/g, '/')
    const fileName = oldPath.split('/').pop()!
    const depthInRelative = draggedNote.relativePath.split('/').length
    const vaultRoot = oldPath.split('/').slice(0, -depthInRelative).join('/')
    const newPath =
      targetColId === '(루트)'
        ? `${vaultRoot}/${fileName}`
        : `${vaultRoot}/${targetColId}/${fileName}`

    const result = await window.api.vault.moveNote(oldPath, newPath)
    if (!result.ok) {
      pushToast(`파일 이동 실패: ${result.error}`, 'error')
    }
  }

  async function handleTagDrop(draggedNote: Note, targetColId: string): Promise<void> {
    const currentColId = currentColumnOf(draggedNote)
    if (currentColId === targetColId) return

    const oldTag = currentColId === '(태그 없음)' ? null : (currentColId ?? null)
    const newTag = targetColId === '(태그 없음)' ? null : targetColId

    const newTags = draggedNote.tags.filter((t) => t !== oldTag)
    if (newTag) newTags.push(newTag)

    const updated: Note = { ...draggedNote, tags: newTags }
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

  async function handleProjectDrop(draggedNote: Note, targetColId: string): Promise<void> {
    if (currentColumnOf(draggedNote) === targetColId) return

    const newProject = targetColId === '(미분류)' ? undefined : targetColId
    const updated: Note = { ...draggedNote, project: newProject }
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

  async function handleDragEnd(event: DragEndEvent): Promise<void> {
    setActiveNote(null)
    const { active, over } = event
    if (!over) return

    const draggedNote = findNoteById(String(active.id))
    if (!draggedNote) return

    const targetColId = resolveTargetColumn(String(over.id))
    if (!targetColId) return

    if (grouping === 'status') await handleStatusDrop(draggedNote, targetColId)
    else if (grouping === 'folder') await handleFolderDrop(draggedNote, targetColId)
    else if (grouping === 'tag') await handleTagDrop(draggedNote, targetColId)
    else if (grouping === 'project') await handleProjectDrop(draggedNote, targetColId)
  }

  return (
    <DndContext sensors={sensors} onDragStart={handleDragStart} onDragEnd={handleDragEnd}>
      <div className="flex gap-3 h-full overflow-x-auto pb-2">
        {columnEntries.map((col) => (
          <KanbanColumn
            key={col.id}
            columnId={col.id}
            label={col.label}
            notes={col.notes}
            column={col.config}
          />
        ))}
      </div>
      <DragOverlay>{activeNote && <KanbanCard note={activeNote} isDragOverlay />}</DragOverlay>
    </DndContext>
  )
}
