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
import {
  groupNotes,
  sortNotes,
  filterNotes,
  groupNotesBySwimlane,
  parseSwimlaneDroppableId,
  decideSwimlaneDrop,
  ETC_LANE,
  STATUS_COLUMNS
} from '../../lib/viewModel'
import { KanbanColumn } from './KanbanColumn'
import { KanbanCard } from './KanbanCard'
import { SwimlaneRow } from './SwimlaneRow'
import { useViewStore } from '../../stores/viewStore'
import { useSettingsStore } from '../../stores/settingsStore'
import type { Note, Status, ColumnConfig } from '@renderer/types'

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
  const { grouping, sort, filters, pushToast, swimlaneEnabled, swimlaneProjects, showEtcLane } =
    useViewStore()
  const { settings } = useSettingsStore()
  const pageSize = settings?.columnPageSize ?? 5

  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 5 } }))

  const displayNotes = useMemo(() => {
    const excluded = settings?.displayExcludedFolders ?? []
    if (excluded.length === 0) return notes
    return notes.filter((n) => {
      const normPath = n.relativePath.replace(/\\/g, '/')
      return !excluded.some((ex) => normPath === ex || normPath.startsWith(ex + '/'))
    })
  }, [notes, settings?.displayExcludedFolders])

  const filteredNotes = useMemo(() => filterNotes(displayNotes, filters), [displayNotes, filters])
  const sortedNotes = useMemo(() => sortNotes(filteredNotes, sort), [filteredNotes, sort])
  const grouped = useMemo(() => groupNotes(sortedNotes, grouping), [sortedNotes, grouping])

  const swimlaneActive = grouping === 'status' && swimlaneEnabled && swimlaneProjects.length > 0

  const lanes = useMemo(
    () => (swimlaneActive ? groupNotesBySwimlane(sortedNotes, swimlaneProjects) : []),
    [swimlaneActive, sortedNotes, swimlaneProjects]
  )

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

  function resolveSwimlaneTarget(id: string): { laneIndex: number; status: Status } | null {
    const parsed = parseSwimlaneDroppableId(id)
    if (
      parsed &&
      parsed.laneIndex < lanes.length &&
      (STATUS_COLUMNS as readonly string[]).includes(parsed.status)
    ) {
      return { laneIndex: parsed.laneIndex, status: parsed.status as Status }
    }
    // 카드 위에 드롭: 카드가 속한 레인·컬럼으로 해석
    for (let i = 0; i < lanes.length; i++) {
      const hit = lanes[i].notes.find((n) => n.filePath === id)
      if (hit) return { laneIndex: i, status: hit.status }
    }
    return null
  }

  async function handleSwimlaneDrop(
    draggedNote: Note,
    target: { laneIndex: number; status: Status }
  ): Promise<void> {
    const decision = decideSwimlaneDrop(draggedNote, lanes[target.laneIndex].lane, target.status)
    if (!decision) return

    let updated: Note = draggedNote
    if (decision.statusChanged) updated = apply(updated, decision.nextStatus, new Date())
    if (decision.projectChanged) updated = { ...updated, project: decision.nextProject }

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

    if (swimlaneActive) {
      const target = resolveSwimlaneTarget(String(over.id))
      if (target) await handleSwimlaneDrop(draggedNote, target)
      return
    }

    const targetColId = resolveTargetColumn(String(over.id))
    if (!targetColId) return

    if (grouping === 'status') await handleStatusDrop(draggedNote, targetColId)
    else if (grouping === 'folder') await handleFolderDrop(draggedNote, targetColId)
    else if (grouping === 'tag') await handleTagDrop(draggedNote, targetColId)
    else if (grouping === 'project') await handleProjectDrop(draggedNote, targetColId)
  }

  return (
    <DndContext sensors={sensors} onDragStart={handleDragStart} onDragEnd={handleDragEnd}>
      {swimlaneActive ? (
        <div className="flex flex-col gap-4 h-full overflow-y-auto pb-2">
          {lanes.map((laneGroup, i) => {
            if (laneGroup.lane === ETC_LANE && !showEtcLane) return null
            return (
              <SwimlaneRow
                key={laneGroup.lane}
                laneIndex={i}
                lane={laneGroup.lane}
                notes={laneGroup.notes}
                pageSize={pageSize}
              />
            )
          })}
        </div>
      ) : (
        <div className="flex gap-3 h-full overflow-x-auto pb-2">
          {columnEntries.map((col) => (
            <KanbanColumn
              key={col.id}
              columnId={col.id}
              label={col.label}
              notes={col.notes}
              column={col.config}
              pageSize={pageSize}
            />
          ))}
        </div>
      )}
      <DragOverlay>{activeNote && <KanbanCard note={activeNote} isDragOverlay />}</DragOverlay>
    </DndContext>
  )
}
