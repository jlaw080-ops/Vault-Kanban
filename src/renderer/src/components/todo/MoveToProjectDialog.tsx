import { useEffect, useMemo, useState } from 'react'
import { ChevronDown, ChevronRight, Folder } from 'lucide-react'
import type { Note } from '@renderer/types'
import type { FolderNode } from '../../../../main/ipc/vault'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle
} from '../ui/dialog'
import { useViewStore } from '../../stores/viewStore'
import { deriveProjectMeta, getSubProject, suggestProjectFolders } from '../../lib/todoModel'

interface Props {
  note: Note
  vaultPath: string
  projectsFolder: string
  preset: { projects: string[]; subProjects: string[] }
  open: boolean
  onOpenChange: (open: boolean) => void
  /** 이동이 끝난 뒤 원래 경로를 알려준다. 목록에서 노트를 지우는 데 쓴다. */
  onMoved: (oldPath: string) => void
}

const inputCls =
  'w-full text-xs bg-background text-foreground border border-border rounded-md px-2 py-1.5 dark:bg-background dark:text-foreground'

function flattenPaths(nodes: readonly FolderNode[], out: string[] = []): string[] {
  for (const node of nodes) {
    out.push(node.path)
    flattenPaths(node.children, out)
  }
  return out
}

/** projectsFolder 하위 서브트리만 남긴다. 못 찾으면 원본을 그대로 쓴다. */
function scopeToProjects(nodes: readonly FolderNode[], projectsFolder: string): FolderNode[] {
  const target = projectsFolder.replace(/\\/g, '/').replace(/^\/+|\/+$/g, '')
  const stack: FolderNode[] = [...nodes]
  while (stack.length > 0) {
    const node = stack.shift()!
    if (node.path === target) return node.children
    stack.push(...node.children)
  }
  return [...nodes]
}

function FolderRow({
  node,
  selected,
  onSelect,
  depth
}: {
  node: FolderNode
  selected: string
  onSelect: (path: string) => void
  depth: number
}): JSX.Element {
  const [open, setOpen] = useState(depth === 0)
  const isSelected = selected === node.path

  return (
    <div>
      <div
        className={`flex items-center gap-0.5 py-0.5 rounded px-1 ${
          isSelected
            ? 'bg-muted text-foreground dark:bg-muted dark:text-foreground'
            : 'hover:bg-muted/60 dark:hover:bg-muted/60'
        }`}
        style={{ paddingLeft: `${depth * 14 + 4}px` }}
      >
        {node.children.length > 0 ? (
          <button
            onClick={() => setOpen((o) => !o)}
            aria-label={open ? '접기' : '펼치기'}
            className="text-muted-foreground w-5 h-5 flex items-center justify-center shrink-0"
          >
            {open ? <ChevronDown size={12} /> : <ChevronRight size={12} />}
          </button>
        ) : (
          <span className="w-5 h-5 shrink-0" />
        )}
        <Folder size={12} className="text-muted-foreground mr-1 shrink-0" />
        <button
          onClick={() => onSelect(node.path)}
          className="text-xs text-foreground dark:text-foreground truncate text-left flex-1"
        >
          {node.name}
        </button>
      </div>
      {open &&
        node.children.map((child) => (
          <FolderRow
            key={child.path}
            node={child}
            selected={selected}
            onSelect={onSelect}
            depth={depth + 1}
          />
        ))}
    </div>
  )
}

export function MoveToProjectDialog({
  note,
  vaultPath,
  projectsFolder,
  preset,
  open,
  onOpenChange,
  onMoved
}: Props): JSX.Element {
  const pushToast = useViewStore((s) => s.pushToast)
  const [tree, setTree] = useState<FolderNode[]>([])
  const [selected, setSelected] = useState('')
  const [project, setProject] = useState('')
  const [subProject, setSubProject] = useState('')
  const [offPreset, setOffPreset] = useState({ project: false, subProject: false })
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    if (!open || !vaultPath) return
    window.api.vault
      .listFolders(vaultPath)
      .then((nodes) => setTree(scopeToProjects(nodes, projectsFolder)))
      .catch(() => setTree([]))
  }, [open, vaultPath, projectsFolder])

  const suggestions = useMemo(
    () => suggestProjectFolders(flattenPaths(tree), note.project),
    [tree, note.project]
  )

  function handleSelect(path: string): void {
    setSelected(path)
    const meta = deriveProjectMeta(path, projectsFolder, preset)
    setProject(meta.project)
    setSubProject(meta.subProject ?? getSubProject(note) ?? '')
    setOffPreset(meta.offPreset)
  }

  async function handleMove(): Promise<void> {
    const fileName = note.filePath.replace(/\\/g, '/').split('/').pop()!
    const root = vaultPath.replace(/\\/g, '/').replace(/\/+$/, '')
    const oldPath = note.filePath.replace(/\\/g, '/')
    const newPath = `${root}/${selected}/${fileName}`
    const before = { project: note.project ?? '', subProject: getSubProject(note) }

    setBusy(true)
    const result = await window.api.vault.moveNoteToProject(oldPath, newPath, {
      project,
      subProject: subProject.length > 0 ? subProject : null
    })
    setBusy(false)

    if (!result.ok) {
      pushToast(`이동 실패: ${result.error}`, 'error', 6000)
      return
    }

    onMoved(oldPath)
    onOpenChange(false)
    pushToast(`"${note.title}"을(를) ${selected}(으)로 옮겼습니다.`, 'success', 10000, {
      label: '되돌리기',
      onClick: () => {
        void window.api.vault
          .moveNoteToProject(newPath, oldPath, before)
          .then((undone) => {
            if (!undone.ok) {
              pushToast(`되돌리기 실패: ${undone.error}`, 'error', 6000)
            }
          })
      }
    })
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-xl">
        <DialogHeader>
          <DialogTitle>프로젝트로 이동</DialogTitle>
          <DialogDescription>
            파일을 옮기고 frontmatter 의 project · sub_project 를 함께 바꿉니다.
          </DialogDescription>
        </DialogHeader>

        {suggestions.length > 0 && (
          <div className="flex flex-wrap gap-1.5">
            <span className="text-xs text-muted-foreground dark:text-muted-foreground self-center">
              추천
            </span>
            {suggestions.map((path) => (
              <button
                key={path}
                onClick={() => handleSelect(path)}
                className="text-xs px-2 py-0.5 rounded-full border border-border text-foreground hover:bg-muted dark:text-foreground dark:hover:bg-muted"
              >
                {path}
              </button>
            ))}
          </div>
        )}

        <div className="border border-border rounded-md max-h-52 overflow-y-auto bg-muted/20 dark:bg-muted/20 py-1">
          {tree.length === 0 ? (
            <p className="text-xs text-muted-foreground dark:text-muted-foreground px-2 py-1">
              폴더를 불러오는 중입니다.
            </p>
          ) : (
            tree.map((node) => (
              <FolderRow
                key={node.path}
                node={node}
                selected={selected}
                onSelect={handleSelect}
                depth={0}
              />
            ))
          )}
        </div>

        <div className="grid grid-cols-2 gap-3">
          <label className="space-y-1.5">
            <span className="block text-xs font-medium text-muted-foreground dark:text-muted-foreground">
              project
            </span>
            <input
              aria-label="project"
              list="move-project-options"
              value={project}
              onChange={(e) => setProject(e.target.value)}
              className={inputCls}
            />
            <datalist id="move-project-options">
              {preset.projects.map((p) => (
                <option key={p} value={p} />
              ))}
            </datalist>
          </label>

          <label className="space-y-1.5">
            <span className="block text-xs font-medium text-muted-foreground dark:text-muted-foreground">
              sub_project
            </span>
            <input
              aria-label="sub_project"
              list="move-subproject-options"
              value={subProject}
              onChange={(e) => setSubProject(e.target.value)}
              className={inputCls}
            />
            <datalist id="move-subproject-options">
              {preset.subProjects.map((p) => (
                <option key={p} value={p} />
              ))}
            </datalist>
          </label>
        </div>

        {(offPreset.project || offPreset.subProject) && (
          <p className="text-xs text-destructive dark:text-destructive">
            preset에 없는 값입니다. 목록에서 고르거나 그대로 진행할 수 있습니다.
          </p>
        )}

        <DialogFooter>
          <button
            onClick={() => onOpenChange(false)}
            className="text-xs px-3 py-2 rounded-md border border-border text-muted-foreground hover:bg-muted dark:hover:bg-muted"
          >
            취소
          </button>
          <button
            onClick={() => void handleMove()}
            disabled={selected.length === 0 || project.length === 0 || busy}
            className="text-xs px-3 py-2 rounded-md bg-accent text-accent-foreground font-bold disabled:opacity-30 disabled:cursor-not-allowed hover:brightness-110"
          >
            이동
          </button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
