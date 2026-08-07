import { useMemo, useRef, useState, type PointerEvent as ReactPointerEvent } from 'react'
import {
  clampSwimlaneHeight,
  groupNotes,
  makeSwimlaneDroppableId,
  STATUS_COLUMNS,
  SWIMLANE_DEFAULT_HEIGHT
} from '../../lib/viewModel'
import { useViewStore } from '../../stores/viewStore'
import { KanbanColumn } from './KanbanColumn'
import type { Note } from '@renderer/types'

interface SwimlaneRowProps {
  laneIndex: number
  lane: string
  notes: Note[]
  pageSize: number
}

export function SwimlaneRow({ laneIndex, lane, notes, pageSize }: SwimlaneRowProps): JSX.Element {
  const grouped = useMemo(() => groupNotes(notes, 'status'), [notes])
  const storedHeight = useViewStore((s) => s.swimlaneHeights[lane])
  const setSwimlaneHeight = useViewStore((s) => s.setSwimlaneHeight)
  const resetSwimlaneHeight = useViewStore((s) => s.resetSwimlaneHeight)
  // 저장값이 범위 밖이어도 렌더 시 클램프 (스펙 6장 엣지 케이스)
  const height = clampSwimlaneHeight(storedHeight ?? SWIMLANE_DEFAULT_HEIGHT)

  const [isDragging, setIsDragging] = useState(false)
  const dragStart = useRef<{ y: number; height: number } | null>(null)

  const handlePointerDown = (e: ReactPointerEvent<HTMLDivElement>): void => {
    e.currentTarget.setPointerCapture(e.pointerId)
    dragStart.current = { y: e.clientY, height }
    setIsDragging(true)
  }

  const handlePointerMove = (e: ReactPointerEvent<HTMLDivElement>): void => {
    if (!dragStart.current) return
    setSwimlaneHeight(lane, dragStart.current.height + (e.clientY - dragStart.current.y))
  }

  const endDrag = (e: ReactPointerEvent<HTMLDivElement>): void => {
    if (!dragStart.current) return
    dragStart.current = null
    setIsDragging(false)
    if (e.currentTarget.hasPointerCapture(e.pointerId)) {
      e.currentTarget.releasePointerCapture(e.pointerId)
    }
  }

  return (
    <div className={`flex flex-col flex-shrink-0${isDragging ? ' select-none' : ''}`}>
      <div className="flex items-center gap-2 mb-1">
        <span className="text-xs font-bold text-foreground uppercase tracking-widest">
          {lane}
        </span>
        <span className="text-xs text-muted-foreground">{notes.length}</span>
      </div>
      <div className="flex gap-3 overflow-x-auto pb-2" style={{ height }}>
        {STATUS_COLUMNS.map((status) => (
          <KanbanColumn
            key={status}
            columnId={makeSwimlaneDroppableId(laneIndex, status)}
            label={status}
            notes={grouped.get(status) ?? []}
            column={undefined}
            pageSize={pageSize}
          />
        ))}
      </div>
      <div
        role="separator"
        aria-orientation="horizontal"
        aria-label={`${lane} 레인 높이 조절`}
        className="h-1.5 cursor-row-resize rounded-sm hover:bg-accent/40"
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={endDrag}
        onPointerCancel={endDrag}
        onDoubleClick={() => resetSwimlaneHeight(lane)}
      />
    </div>
  )
}
