import { AlertTriangle, FolderInput } from 'lucide-react'
import type { Note, Priority, Status } from '@renderer/types'
import { getSubProject } from '../../lib/todoModel'

const PRIORITY_LABEL: Record<Priority, string> = { high: '높음', mid: '보통', low: '낮음' }

const cellCls = 'px-2 py-1.5 align-middle'
const selectCls =
  'w-full text-xs bg-background text-foreground border border-border rounded-md px-1.5 py-1 disabled:opacity-40 disabled:cursor-not-allowed dark:bg-background dark:text-foreground'

interface Props {
  note: Note
  statusOrder: readonly string[]
  onChange: (next: Note) => void
  onStatusChange: (next: Status) => void
  onOpen: () => void
  onMove: () => void
}

export function TodoRow({
  note,
  statusOrder,
  onChange,
  onStatusChange,
  onOpen,
  onMove
}: Props): JSX.Element {
  const disabled = Boolean(note.parseError)
  const subProject = getSubProject(note)

  return (
    <tr className="border-b border-border hover:bg-muted/40 dark:hover:bg-muted/40">
      <td className={cellCls}>
        <div className="flex items-center gap-1.5">
          {disabled && (
            <AlertTriangle
              size={12}
              className="text-destructive dark:text-destructive shrink-0"
              aria-label="파싱 오류"
            />
          )}
          <button
            onClick={onOpen}
            className="text-xs text-left text-foreground dark:text-foreground hover:underline truncate"
          >
            {note.title}
          </button>
        </div>
      </td>

      <td className={`${cellCls} text-xs text-muted-foreground dark:text-muted-foreground`}>
        <span className="truncate block">
          {note.project ?? '—'}
          {subProject ? ` · ${subProject}` : ''}
        </span>
      </td>

      <td className={cellCls}>
        <select
          aria-label="우선순위"
          disabled={disabled}
          value={note.priority ?? ''}
          onChange={(e) =>
            onChange({
              ...note,
              priority: e.target.value === '' ? undefined : (e.target.value as Priority)
            })
          }
          className={selectCls}
        >
          <option value="">없음</option>
          {(Object.keys(PRIORITY_LABEL) as Priority[]).map((p) => (
            <option key={p} value={p}>
              {PRIORITY_LABEL[p]}
            </option>
          ))}
        </select>
      </td>

      <td className={cellCls}>
        <select
          aria-label="상태"
          disabled={disabled}
          value={note.status}
          onChange={(e) => onStatusChange(e.target.value as Status)}
          className={selectCls}
        >
          {statusOrder.map((s) => (
            <option key={s} value={s}>
              {s}
            </option>
          ))}
          {!statusOrder.includes(note.status) && (
            <option value={note.status}>{note.status}</option>
          )}
        </select>
      </td>

      <td className={`${cellCls} text-xs text-muted-foreground dark:text-muted-foreground`}>
        {note.created || '—'}
      </td>

      <td className={cellCls}>
        <input
          type="date"
          aria-label="마감"
          disabled={disabled}
          value={note.due ?? ''}
          onChange={(e) =>
            onChange({ ...note, due: e.target.value === '' ? undefined : e.target.value })
          }
          className={selectCls}
        />
      </td>

      <td className={cellCls}>
        <button
          onClick={onMove}
          disabled={disabled}
          aria-label="프로젝트로 이동"
          title="프로젝트로 이동"
          className="p-1 rounded-md text-muted-foreground hover:bg-muted hover:text-foreground disabled:opacity-30 disabled:cursor-not-allowed dark:text-muted-foreground dark:hover:bg-muted dark:hover:text-foreground"
        >
          <FolderInput size={14} />
        </button>
      </td>
    </tr>
  )
}
