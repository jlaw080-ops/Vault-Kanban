import { useMemo } from 'react'
import type { Note, Status } from '@renderer/types'
import { useViewStore } from '../../stores/viewStore'
import {
  filterTodosByKeyword,
  selectTodoNotes,
  sortTodos,
  type TodoSortKey
} from '../../lib/todoModel'
import { apply } from '../../lib/statusTransition'
import { TodoRow } from './TodoRow'

const SORT_LABEL: Record<TodoSortKey, string> = {
  createdDesc: '생성일 최신',
  dueAsc: '마감 임박',
  priorityDesc: '우선순위',
  status: '상태'
}

const headCls =
  'px-2 py-1.5 text-left text-[11px] font-bold uppercase tracking-widest text-muted-foreground dark:text-muted-foreground'

interface Props {
  notes: Note[]
  todoFolder: string
  statusOrder: string[]
  onNoteUpdate: (note: Note) => void
  onOpenNote: (note: Note) => void
  onMoveNote?: (note: Note) => void
  onCreateTodo?: () => void
}

export function TodoView({
  notes,
  todoFolder,
  statusOrder,
  onNoteUpdate,
  onOpenNote,
  onMoveNote,
  onCreateTodo
}: Props): JSX.Element {
  const { todoSort, todoKeyword, setTodoSort, setTodoKeyword, pushToast } = useViewStore()

  const rows = useMemo(() => {
    const scoped = selectTodoNotes(notes, todoFolder)
    return sortTodos(filterTodosByKeyword(scoped, todoKeyword), todoSort, statusOrder)
  }, [notes, todoFolder, todoKeyword, todoSort, statusOrder])

  async function save(next: Note, previous: Note): Promise<void> {
    onNoteUpdate(next)
    try {
      await window.api.vault.writeNote(next)
    } catch (error) {
      pushToast(
        `파일 저장 실패: ${error instanceof Error ? error.message : '알 수 없는 오류'}`,
        'error'
      )
      onNoteUpdate(previous)
    }
  }

  return (
    <div className="flex flex-col h-full min-h-0">
      <div className="flex items-center gap-2 mb-3 flex-shrink-0">
        <input
          value={todoKeyword}
          onChange={(e) => setTodoKeyword(e.target.value)}
          placeholder="검색"
          className="text-xs bg-background text-foreground border border-border rounded-md px-2 py-1.5 w-56 dark:bg-background dark:text-foreground"
        />
        <select
          aria-label="정렬"
          value={todoSort}
          onChange={(e) => setTodoSort(e.target.value as TodoSortKey)}
          className="text-xs bg-background text-foreground border border-border rounded-md px-2 py-1.5 dark:bg-background dark:text-foreground"
        >
          {(Object.keys(SORT_LABEL) as TodoSortKey[]).map((k) => (
            <option key={k} value={k}>
              {SORT_LABEL[k]}
            </option>
          ))}
        </select>
        <div className="flex-1" />
        <span className="text-xs text-muted-foreground dark:text-muted-foreground">
          {rows.length}건
        </span>
        {onCreateTodo && (
          <button
            onClick={onCreateTodo}
            className="text-xs px-3 py-1.5 rounded-md border border-border text-foreground hover:bg-muted dark:text-foreground dark:hover:bg-muted"
          >
            새 할일
          </button>
        )}
      </div>

      {rows.length === 0 ? (
        <div className="flex-1 flex items-center justify-center">
          <p className="text-sm text-muted-foreground dark:text-muted-foreground">
            할일이 없습니다. `{todoFolder}` 폴더를 확인하세요.
          </p>
        </div>
      ) : (
        <div className="flex-1 overflow-auto border border-border rounded-md">
          <table className="w-full border-collapse">
            <thead className="sticky top-0 bg-card dark:bg-card">
              <tr className="border-b border-border">
                <th className={`${headCls} w-[34%]`}>제목</th>
                <th className={`${headCls} w-[22%]`}>프로젝트</th>
                <th className={`${headCls} w-[10%]`}>우선순위</th>
                <th className={`${headCls} w-[14%]`}>상태</th>
                <th className={`${headCls} w-[10%]`}>생성일</th>
                <th className={`${headCls} w-[10%]`}>마감</th>
                <th className={headCls} />
              </tr>
            </thead>
            <tbody>
              {rows.map((note) => (
                <TodoRow
                  key={note.filePath}
                  note={note}
                  statusOrder={statusOrder}
                  onChange={(next) => void save(next, note)}
                  onStatusChange={(status: Status) =>
                    void save(apply(note, status, new Date()), note)
                  }
                  onOpen={() => onOpenNote(note)}
                  onMove={() => onMoveNote?.(note)}
                />
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
