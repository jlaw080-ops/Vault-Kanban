import { useSortable } from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import { AlertTriangle } from 'lucide-react'
import { Badge } from '../ui/badge'
import { cn } from '../../lib/utils'
import { getStayDays, getStayColor } from '../../lib/metrics'
import { useSettingsStore } from '../../stores/settingsStore'
import { useVaultStore } from '../../stores/vaultStore'
import type { Note, ColumnConfig, CardField } from '@renderer/types'

const PRIORITY_DOT: Record<string, string> = {
  high: 'bg-red-500',
  mid: 'bg-amber-500',
  low: 'bg-gray-500'
}

const STAY_BORDER: Record<string, string> = {
  default: 'border-border',
  yellow: 'border-amber-400',
  red: 'border-destructive'
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

function shortDate(dateStr: string | undefined | null): string | null {
  if (!dateStr) return null
  const d = new Date(dateStr)
  if (isNaN(d.getTime())) return null
  return `${d.getFullYear()}.${String(d.getMonth() + 1).padStart(2, '0')}.${String(d.getDate()).padStart(2, '0')}`
}

const DEFAULT_CARD_FIELDS: CardField[] = ['priority', 'project', 'created']

interface KanbanCardProps {
  note: Note
  column?: ColumnConfig
  isDragOverlay?: boolean
}

export function KanbanCard({ note, column, isDragOverlay = false }: KanbanCardProps): JSX.Element {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: note.filePath
  })
  const settings = useSettingsStore((s) => s.settings)
  const openNote = useVaultStore((s) => s.openNote)

  const style = {
    transform: CSS.Transform.toString(transform),
    transition
  }

  const cardFields = settings?.cardFields ?? DEFAULT_CARD_FIELDS
  const has = (f: CardField): boolean => cardFields.includes(f)

  const stayColor =
    column && settings
      ? getStayColor(getStayDays(note, column, new Date()), settings.stayTimeWarnings)
      : 'default'

  const visibleTags = note.tags.slice(0, MAX_TAGS)
  const extraTags = note.tags.length - MAX_TAGS
  const dueLabel = relativeDate(note.due)
  const folder = folderPath(note.filePath)
  const isDueOverdue = note.due ? new Date(note.due) < new Date() : false
  const createdLabel = shortDate(note.created)

  const showTagsRow = has('tags') && visibleTags.length > 0
  const metaItems = [
    has('due') && dueLabel
      ? { key: 'due', label: dueLabel, cls: isDueOverdue ? 'text-destructive' : 'text-muted-foreground' }
      : null,
    has('project') && note.project
      ? { key: 'project', label: note.project, cls: 'text-muted-foreground truncate max-w-[7rem]' }
      : null,
    has('created') && createdLabel
      ? { key: 'created', label: createdLabel, cls: 'text-muted-foreground' }
      : null,
    has('folder') && folder
      ? { key: 'folder', label: folder, cls: 'text-muted-foreground truncate max-w-[7rem]' }
      : null,
  ].filter(Boolean) as Array<{ key: string; label: string; cls: string }>

  return (
    <div
      ref={setNodeRef}
      style={style}
      {...attributes}
      {...listeners}
      onClick={() => {
        if (!isDragging) openNote(note)
      }}
      className={cn(
        'bg-card',
        'border',
        STAY_BORDER[stayColor],
        'rounded-md p-3 cursor-grab active:cursor-grabbing',
        'hover:shadow-[rgba(0,0,0,0.3)_0px_4px_8px] hover:border-muted-foreground',
        stayColor !== 'default' && 'hover:border-amber-500',
        stayColor === 'red' && 'hover:border-destructive',
        'select-none transition-shadow',
        isDragging && 'opacity-40',
        isDragOverlay && 'scale-105 shadow-[rgba(0,0,0,0.5)_0px_8px_24px]'
      )}
    >
      <div className="flex items-start justify-between gap-1">
        <p className="text-xs font-bold text-foreground line-clamp-2 flex-1 min-w-0">
          {note.title}
        </p>
        <div className="flex items-center gap-1 flex-shrink-0">
          {has('priority') && note.priority && (
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

      {showTagsRow && (
        <div className="mt-2 flex flex-wrap items-center gap-1">
          {visibleTags.map((tag) => (
            <Badge key={tag} variant="secondary" className="text-xs px-1.5 py-0">
              {tag}
            </Badge>
          ))}
          {extraTags > 0 && (
            <span className="text-xs text-muted-foreground">+{extraTags}</span>
          )}
        </div>
      )}

      {metaItems.length > 0 && (
        <div className="mt-2 flex items-center gap-2 flex-wrap">
          {metaItems.map((item) => (
            <span key={item.key} className={cn('text-xs', item.cls)}>
              {item.label}
            </span>
          ))}
        </div>
      )}
    </div>
  )
}
