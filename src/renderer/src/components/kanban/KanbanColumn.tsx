import { useState } from 'react'
import { useDroppable } from '@dnd-kit/core'
import { SortableContext, verticalListSortingStrategy } from '@dnd-kit/sortable'
import { AlertTriangle, ChevronDown, ChevronUp } from 'lucide-react'
import { cn } from '../../lib/utils'
import { KanbanCard } from './KanbanCard'
import type { Note, ColumnConfig } from '@renderer/types'

const COLUMN_BAR: Record<string, string> = {
  backlog: 'bg-[#4d4d4d]',
  planned: 'bg-[#539df5]',
  'in-progress': 'bg-[#ffa42b]',
  review: 'bg-[#b3b3b3]',
  done: 'bg-accent'
}

interface KanbanColumnProps {
  columnId: string
  label: string
  notes: Note[]
  column?: ColumnConfig
  pageSize: number
}

export function KanbanColumn({
  columnId,
  label,
  notes,
  column,
  pageSize
}: KanbanColumnProps): JSX.Element {
  const { setNodeRef, isOver } = useDroppable({ id: columnId })
  const [visibleCount, setVisibleCount] = useState(pageSize)

  const wipLimit = column?.wipLimit ?? null
  const isOverWip = wipLimit !== null && notes.length > wipLimit
  const barClass = COLUMN_BAR[label] ?? 'bg-slate-400'

  const visibleNotes = notes.slice(0, visibleCount)
  const noteIds = visibleNotes.map((n) => n.filePath)
  const hasMore = visibleCount < notes.length
  const isExpanded = visibleCount > pageSize

  function loadMore(): void {
    setVisibleCount((c) => c + pageSize)
  }

  function collapse(): void {
    setVisibleCount(pageSize)
  }

  return (
    <div className="flex flex-col min-w-0 flex-1 overflow-hidden">
      <div className={cn('h-[3px] rounded-t-sm mb-0 flex-shrink-0', barClass)} />
      <div
        className={cn(
          'flex flex-col bg-card rounded-b-md rounded-tr-md p-3 flex-1 min-h-0 overflow-hidden',
          isOver && !isOverWip && 'ring-1 ring-muted-foreground',
          isOver && isOverWip && 'ring-1 ring-destructive'
        )}
      >
        <div
          className={cn(
            'flex items-center justify-between mb-2 rounded-sm px-1 py-0.5 -mx-1 flex-shrink-0',
            isOverWip && 'bg-destructive/10'
          )}
        >
          <div className="flex items-center gap-1 min-w-0">
            {isOverWip && (
              <AlertTriangle className="w-3 h-3 text-destructive flex-shrink-0" />
            )}
            <span className="text-xs font-bold text-foreground uppercase tracking-widest truncate">
              {label}
            </span>
          </div>

          <div className="flex items-center gap-1 flex-shrink-0">
            <span
              className={cn(
                'text-xs',
                isOverWip
                  ? 'text-destructive font-semibold'
                  : 'text-muted-foreground'
              )}
            >
              {wipLimit !== null ? `${notes.length}/${wipLimit}` : notes.length}
            </span>

          </div>
        </div>

        <div className="flex-1 overflow-y-auto min-h-0 kanban-scroll">
          <SortableContext items={noteIds} strategy={verticalListSortingStrategy}>
            <div ref={setNodeRef} className="flex flex-col gap-2">
              {visibleNotes.map((note) => (
                <KanbanCard key={note.filePath} note={note} column={column} />
              ))}
            </div>
          </SortableContext>

          {(hasMore || isExpanded) && (
            <div className="flex items-center justify-between mt-2 pt-2 border-t border-border">
              {hasMore ? (
                <button
                  onClick={loadMore}
                  className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground transition-colors"
                >
                  <ChevronDown className="w-3 h-3" />
                  더 불러오기 ({notes.length - visibleCount}개 남음)
                </button>
              ) : (
                <span />
              )}
              {isExpanded && (
                <button
                  onClick={collapse}
                  className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground transition-colors"
                >
                  <ChevronUp className="w-3 h-3" />
                  접기
                </button>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
