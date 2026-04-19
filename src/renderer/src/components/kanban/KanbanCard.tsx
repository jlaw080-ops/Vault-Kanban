import { useSortable } from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import { AlertTriangle } from 'lucide-react'
import { Badge } from '../ui/badge'
import { cn } from '../../lib/utils'
import type { Note } from '@renderer/types'

const PRIORITY_DOT: Record<string, string> = {
  high: 'bg-red-500',
  mid: 'bg-amber-500',
  low: 'bg-gray-500'
}

const MAX_TAGS = 3

function relativeDate(dateStr: string | undefined | null): string | null {
  if (!dateStr) return null
  const date = new Date(dateStr)
  if (isNaN(date.getTime())) return null
  const now = new Date()
  const diffDays = Math.ceil((date.getTime() - now.getTime()) / (1000 * 60 * 60 * 24))
  if (diffDays < 0) return `${Math.abs(diffDays)}일 초과`
  if (diffDays === 0) return '오늘'
  if (diffDays === 1) return '내일'
  return `${diffDays}일 후`
}

function folderPath(filePath: string): string {
  const normalized = filePath.replace(/\\/g, '/')
  const parts = normalized.split('/')
  if (parts.length <= 1) return ''
  return parts.slice(-2, -1)[0] ?? ''
}

interface KanbanCardProps {
  note: Note
  isDragOverlay?: boolean
}

export function KanbanCard({ note, isDragOverlay = false }: KanbanCardProps): JSX.Element {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: note.filePath
  })

  const style = {
    transform: CSS.Transform.toString(transform),
    transition
  }

  const visibleTags = note.tags.slice(0, MAX_TAGS)
  const extraTags = note.tags.length - MAX_TAGS
  const dueLabel = relativeDate(note.due)
  const folder = folderPath(note.filePath)
  const isDueOverdue = note.due ? new Date(note.due) < new Date() : false

  return (
    <div
      ref={setNodeRef}
      style={style}
      {...attributes}
      {...listeners}
      className={cn(
        'bg-white dark:bg-slate-900',
        'border border-slate-200 dark:border-slate-800',
        'rounded-md p-3 cursor-grab active:cursor-grabbing',
        'hover:border-slate-300 dark:hover:border-slate-700',
        'select-none',
        isDragging && 'opacity-40',
        isDragOverlay && 'scale-105 shadow-lg'
      )}
    >
      <div className="flex items-start justify-between gap-1">
        <p className="text-sm font-semibold text-slate-900 dark:text-slate-100 line-clamp-1 flex-1 min-w-0">
          {note.title}
        </p>
        <div className="flex items-center gap-1 flex-shrink-0">
          {note.priority && (
            <span
              className={cn('w-2 h-2 rounded-full flex-shrink-0', PRIORITY_DOT[note.priority])}
              title={note.priority}
            />
          )}
          {note.parseError && (
            <AlertTriangle
              className="w-3 h-3 text-amber-500 flex-shrink-0"
              aria-label={note.parseError}
            />
          )}
        </div>
      </div>

      {(visibleTags.length > 0 || folder) && (
        <div className="mt-2 flex flex-wrap items-center gap-1">
          {visibleTags.map((tag) => (
            <Badge key={tag} variant="secondary" className="text-xs px-1.5 py-0">
              {tag}
            </Badge>
          ))}
          {extraTags > 0 && (
            <span className="text-xs text-slate-400 dark:text-slate-500">+{extraTags}</span>
          )}
        </div>
      )}

      {(dueLabel || folder) && (
        <div className="mt-2 flex items-center justify-between">
          {dueLabel && (
            <span
              className={cn(
                'text-xs',
                isDueOverdue
                  ? 'text-red-500 dark:text-red-400'
                  : 'text-slate-500 dark:text-slate-400'
              )}
            >
              {dueLabel}
            </span>
          )}
          {folder && (
            <span className="text-xs text-slate-400 dark:text-slate-500 truncate max-w-[8rem]">
              {folder}
            </span>
          )}
        </div>
      )}
    </div>
  )
}
