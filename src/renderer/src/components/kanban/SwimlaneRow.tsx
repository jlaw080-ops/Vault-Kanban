import { useMemo } from 'react'
import { groupNotes, makeSwimlaneDroppableId, STATUS_COLUMNS } from '../../lib/viewModel'
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

  return (
    <div className="flex flex-col flex-shrink-0">
      <div className="flex items-center gap-2 mb-1">
        <span className="text-xs font-bold text-foreground uppercase tracking-widest">
          {lane}
        </span>
        <span className="text-xs text-muted-foreground">{notes.length}</span>
      </div>
      <div className="flex gap-3 h-72 overflow-x-auto pb-2">
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
    </div>
  )
}
