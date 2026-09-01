import { useState } from 'react'
import type { Note, Priority } from '@renderer/types'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle
} from '../ui/dialog'
import { useViewStore } from '../../stores/viewStore'
import { buildTodoFilePath, buildTodoNoteContent } from '../../lib/todoModel'

interface Props {
  vaultPath: string
  todoFolder: string
  preset: { projects: string[]; subProjects: string[] }
  open: boolean
  onOpenChange: (open: boolean) => void
  onCreated: (note: Note) => void
}

const inputCls =
  'w-full text-xs bg-background text-foreground border border-border rounded-md px-2 py-1.5 dark:bg-background dark:text-foreground'

const labelCls = 'block text-xs font-medium text-muted-foreground dark:text-muted-foreground'

export function NewTodoDialog({
  vaultPath,
  todoFolder,
  preset,
  open,
  onOpenChange,
  onCreated
}: Props): JSX.Element {
  const pushToast = useViewStore((s) => s.pushToast)
  const [title, setTitle] = useState('')
  const [project, setProject] = useState('')
  const [subProject, setSubProject] = useState('')
  const [priority, setPriority] = useState<Priority>('mid')
  const [busy, setBusy] = useState(false)

  async function handleCreate(): Promise<void> {
    const now = new Date()
    const filePath = buildTodoFilePath(vaultPath, todoFolder, title, now)
    const content = buildTodoNoteContent({
      title,
      project: project.length > 0 ? project : undefined,
      subProject: subProject.length > 0 ? subProject : undefined,
      priority,
      now
    })

    try {
      setBusy(true)
      const result = await window.api.vault.createNote(filePath, content)

      if (!result.ok) {
        pushToast(`할일 생성 실패: ${result.error}`, 'error', 6000)
        return
      }

      try {
        const created = await window.api.vault.readNote(filePath)
        onCreated(created)
      } catch (error) {
        pushToast(
          `생성은 됐지만 읽지 못했습니다: ${error instanceof Error ? error.message : '알 수 없는 오류'}`,
          'error',
          6000
        )
      }
      onOpenChange(false)
    } finally {
      setBusy(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>새 할일</DialogTitle>
          <DialogDescription>
            `{todoFolder}` 아래 이번 달 폴더에 노트를 만듭니다.
          </DialogDescription>
        </DialogHeader>

        <label className="space-y-1.5 block">
          <span className={labelCls}>제목</span>
          <input
            aria-label="제목"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            className={inputCls}
            placeholder="무엇을 해야 하는지"
          />
        </label>

        <div className="grid grid-cols-2 gap-3">
          <label className="space-y-1.5 block">
            <span className={labelCls}>project</span>
            <input
              aria-label="project"
              list="new-todo-project-options"
              value={project}
              onChange={(e) => setProject(e.target.value)}
              className={inputCls}
            />
            <datalist id="new-todo-project-options">
              {preset.projects.map((p) => (
                <option key={p} value={p} />
              ))}
            </datalist>
          </label>

          <label className="space-y-1.5 block">
            <span className={labelCls}>sub_project</span>
            <input
              aria-label="sub_project"
              list="new-todo-subproject-options"
              value={subProject}
              onChange={(e) => setSubProject(e.target.value)}
              className={inputCls}
            />
            <datalist id="new-todo-subproject-options">
              {preset.subProjects.map((p) => (
                <option key={p} value={p} />
              ))}
            </datalist>
          </label>
        </div>

        <label className="space-y-1.5 block">
          <span className={labelCls}>우선순위</span>
          <select
            aria-label="우선순위"
            value={priority}
            onChange={(e) => setPriority(e.target.value as Priority)}
            className={inputCls}
          >
            <option value="high">높음</option>
            <option value="mid">보통</option>
            <option value="low">낮음</option>
          </select>
        </label>

        <DialogFooter>
          <button
            onClick={() => onOpenChange(false)}
            className="text-xs px-3 py-2 rounded-md border border-border text-muted-foreground hover:bg-muted dark:hover:bg-muted"
          >
            취소
          </button>
          <button
            onClick={() => void handleCreate()}
            disabled={title.trim().length === 0 || busy}
            className="text-xs px-3 py-2 rounded-md bg-accent text-accent-foreground font-bold disabled:opacity-30 disabled:cursor-not-allowed hover:brightness-110"
          >
            만들기
          </button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
