import { useState } from 'react'
import { useDroppable } from '@dnd-kit/core'
import { SortableContext, verticalListSortingStrategy } from '@dnd-kit/sortable'
import { AlertTriangle, Info } from 'lucide-react'
import { cn } from '../../lib/utils'
import { Popover } from '../ui/popover'
import { KanbanCard } from './KanbanCard'
import type { Note, ColumnConfig } from '@renderer/types'

const COLUMN_BAR: Record<string, string> = {
  백로그: 'bg-slate-400',
  예정: 'bg-blue-500',
  진행중: 'bg-amber-500',
  검토: 'bg-violet-500',
  완료: 'bg-emerald-500'
}

interface KanbanColumnProps {
  columnId: string
  label: string
  notes: Note[]
  column?: ColumnConfig
}

export function KanbanColumn({ columnId, label, notes, column }: KanbanColumnProps): JSX.Element {
  const { setNodeRef, isOver } = useDroppable({ id: columnId })
  const noteIds = notes.map((n) => n.filePath)
  const [policyOpen, setPolicyOpen] = useState(false)

  const wipLimit = column?.wipLimit ?? null
  const isOverWip = wipLimit !== null && notes.length > wipLimit
  const barClass = COLUMN_BAR[label] ?? 'bg-slate-400'

  return (
    <div className="flex flex-col min-w-0 flex-1">
      <div className={cn('h-[3px] rounded-t-sm mb-0', barClass)} />
      <div
        className={cn(
          'flex flex-col bg-slate-50 dark:bg-slate-900 rounded-b-md rounded-tr-md p-3 flex-1 min-h-[120px]',
          isOver && !isOverWip && 'ring-1 ring-slate-400 dark:ring-slate-600',
          isOver && isOverWip && 'ring-1 ring-red-400 dark:ring-red-600'
        )}
      >
        <div
          className={cn(
            'flex items-center justify-between mb-2 rounded-sm px-1 py-0.5 -mx-1',
            isOverWip && 'bg-red-50 dark:bg-red-950'
          )}
        >
          <div className="flex items-center gap-1 min-w-0">
            {isOverWip && (
              <AlertTriangle className="w-3 h-3 text-red-500 dark:text-red-400 flex-shrink-0" />
            )}
            <span className="text-xs font-semibold text-slate-700 dark:text-slate-300 uppercase tracking-wide truncate">
              {label}
            </span>
          </div>

          <div className="flex items-center gap-1 flex-shrink-0">
            <span
              className={cn(
                'text-xs',
                isOverWip
                  ? 'text-red-500 dark:text-red-400 font-semibold'
                  : 'text-slate-400 dark:text-slate-500'
              )}
            >
              {wipLimit !== null ? `${notes.length}/${wipLimit}` : notes.length}
            </span>

            {column && (
              <Popover
                open={policyOpen}
                onClose={() => setPolicyOpen(false)}
                trigger={
                  <button
                    onClick={() => setPolicyOpen((o) => !o)}
                    className="text-slate-400 dark:text-slate-500 hover:text-slate-600 dark:hover:text-slate-300 focus:outline-none"
                    aria-label={`${label} 정책 보기`}
                  >
                    <Info className="w-3 h-3" />
                  </button>
                }
                className="w-64 text-xs"
              >
                <p className="font-semibold text-slate-700 dark:text-slate-300 mb-1.5">
                  {label} 정책
                </p>
                {column.policy ? (
                  <p className="text-slate-600 dark:text-slate-400 whitespace-pre-wrap leading-relaxed">
                    {column.policy}
                  </p>
                ) : (
                  <p className="text-slate-400 dark:text-slate-500">
                    정책이 아직 설정되지 않았습니다.
                  </p>
                )}
              </Popover>
            )}
          </div>
        </div>

        <SortableContext items={noteIds} strategy={verticalListSortingStrategy}>
          <div ref={setNodeRef} className="flex flex-col gap-2 flex-1">
            {notes.map((note) => (
              <KanbanCard key={note.filePath} note={note} column={column} />
            ))}
          </div>
        </SortableContext>
      </div>
    </div>
  )
}
