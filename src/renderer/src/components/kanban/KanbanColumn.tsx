import { useDroppable } from '@dnd-kit/core'
import { SortableContext, verticalListSortingStrategy } from '@dnd-kit/sortable'
import { cn } from '../../lib/utils'
import { KanbanCard } from './KanbanCard'
import type { Note, Status } from '@renderer/types'

const COLUMN_BAR: Record<Status, string> = {
  백로그: 'bg-slate-400',
  예정: 'bg-blue-500',
  진행중: 'bg-amber-500',
  검토: 'bg-violet-500',
  완료: 'bg-emerald-500'
}

interface KanbanColumnProps {
  status: Status
  notes: Note[]
}

export function KanbanColumn({ status, notes }: KanbanColumnProps): JSX.Element {
  const { setNodeRef, isOver } = useDroppable({ id: status })
  const noteIds = notes.map((n) => n.filePath)

  return (
    <div className="flex flex-col min-w-0 flex-1">
      <div className={cn('h-[3px] rounded-t-sm mb-0', COLUMN_BAR[status])} />
      <div
        className={cn(
          'flex flex-col bg-slate-50 dark:bg-slate-900 rounded-b-md rounded-tr-md p-3 flex-1 min-h-[120px]',
          isOver && 'ring-1 ring-slate-400 dark:ring-slate-600'
        )}
      >
        <div className="flex items-center justify-between mb-2">
          <span className="text-xs font-semibold text-slate-700 dark:text-slate-300 uppercase tracking-wide">
            {status}
          </span>
          <span className="text-xs text-slate-400 dark:text-slate-500">{notes.length}</span>
        </div>

        <SortableContext items={noteIds} strategy={verticalListSortingStrategy}>
          <div ref={setNodeRef} className="flex flex-col gap-2 flex-1">
            {notes.map((note) => (
              <KanbanCard key={note.filePath} note={note} />
            ))}
          </div>
        </SortableContext>
      </div>
    </div>
  )
}
