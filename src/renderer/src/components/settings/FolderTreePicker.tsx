import { useState, useEffect } from 'react'
import { ChevronRight, ChevronDown, Folder } from 'lucide-react'

interface FolderNode {
  name: string
  path: string
  children: FolderNode[]
}

interface FolderRowProps {
  node: FolderNode
  value: string[]
  onChange: (value: string[]) => void
  depth: number
}

function FolderRow({ node, value, onChange, depth }: FolderRowProps): JSX.Element {
  const [open, setOpen] = useState(depth === 0)
  const isChecked = value.includes(node.path)

  function toggle(): void {
    if (isChecked) {
      onChange(value.filter((p) => p !== node.path))
    } else {
      onChange([...value, node.path])
    }
  }

  return (
    <div>
      <div
        className="flex items-center gap-0.5 py-0.5 hover:bg-muted/60 rounded px-1"
        style={{ paddingLeft: `${depth * 14 + 4}px` }}
      >
        {node.children.length > 0 ? (
          <button
            onClick={() => setOpen((o) => !o)}
            className="text-muted-foreground w-5 h-5 flex items-center justify-center shrink-0"
          >
            {open ? <ChevronDown size={12} /> : <ChevronRight size={12} />}
          </button>
        ) : (
          <span className="w-5 h-5 shrink-0" />
        )}
        <input
          type="checkbox"
          checked={isChecked}
          onChange={toggle}
          className="mr-1 shrink-0 accent-accent cursor-pointer"
        />
        <Folder size={12} className="text-muted-foreground mr-1 shrink-0" />
        <span className="text-xs text-foreground truncate">{node.name}</span>
      </div>
      {open &&
        node.children.map((child) => (
          <FolderRow
            key={child.path}
            node={child}
            value={value}
            onChange={onChange}
            depth={depth + 1}
          />
        ))}
    </div>
  )
}

interface Props {
  vaultPath: string
  excludedScanFolders: string[]
  value: string[]
  onChange: (value: string[]) => void
}

export function FolderTreePicker({
  vaultPath,
  excludedScanFolders,
  value,
  onChange
}: Props): JSX.Element {
  const [tree, setTree] = useState<FolderNode[]>([])
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    if (!vaultPath) return
    setLoading(true)
    window.api.vault
      .listFolders(vaultPath, excludedScanFolders)
      .then(setTree)
      .catch(() => setTree([]))
      .finally(() => setLoading(false))
  }, [vaultPath])

  if (!vaultPath) {
    return (
      <p className="text-xs text-muted-foreground">Vault 경로가 설정되어 있지 않습니다.</p>
    )
  }

  if (loading) {
    return <p className="text-xs text-muted-foreground">폴더 목록 로딩 중...</p>
  }

  if (tree.length === 0) {
    return <p className="text-xs text-muted-foreground">표시할 폴더가 없습니다.</p>
  }

  return (
    <div className="border border-border rounded-md max-h-52 overflow-y-auto bg-muted/20 py-1">
      {tree.map((node) => (
        <FolderRow key={node.path} node={node} value={value} onChange={onChange} depth={0} />
      ))}
    </div>
  )
}
