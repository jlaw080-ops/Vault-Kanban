import { useCallback, useEffect, useMemo, useState } from 'react'
import * as DialogPrimitive from '@radix-ui/react-dialog'
import { Printer, X } from 'lucide-react'
import { Dialog, DialogPortal, DialogOverlay } from '../ui/dialog'
import { MarkdownDocument } from './MarkdownDocument'
import { noteToDocument } from '../../lib/docRender/noteToDocument'
import { localResolver } from '../../lib/docRender/resolveAsset'
import { cn } from '../../lib/utils'
import type { Note } from '@renderer/types'

interface DocumentViewProps {
  note: Note
  open: boolean
  onOpenChange: (open: boolean) => void
}

const MERMAID_FENCE_RE = /^\s*```mermaid/gm

function countMermaidBlocks(markdown: string): number {
  MERMAID_FENCE_RE.lastIndex = 0
  return markdown.match(MERMAID_FENCE_RE)?.length ?? 0
}

export function DocumentView({ note, open, onOpenChange }: DocumentViewProps): JSX.Element {
  const doc = useMemo(() => noteToDocument(note), [note])
  const mermaidCount = useMemo(() => countMermaidBlocks(doc.markdown), [doc.markdown])
  const [settledCount, setSettledCount] = useState(0)
  const [gatedMarkdown, setGatedMarkdown] = useState(doc.markdown)

  // 문서가 바뀌면 게이트를 다시 잠근다. effect 가 아니라 렌더 중에 조정하는 이유:
  // effect 에서 setState 를 부르면 렌더가 한 번 더 돌고, 그 사이 이전 문서의
  // 완료 카운트로 인쇄 버튼이 잠깐 열린다. (react-hooks/set-state-in-effect 도 걸린다)
  if (gatedMarkdown !== doc.markdown) {
    setGatedMarkdown(doc.markdown)
    setSettledCount(0)
  }

  const canPrint = settledCount >= mermaidCount

  // print.css 가 인쇄 시 #root 를 숨기는 데 쓰는 훅.
  useEffect(() => {
    if (!open) return
    document.body.classList.add('doc-view-open')
    return () => {
      document.body.classList.remove('doc-view-open')
    }
  }, [open])

  const handleMermaidSettled = useCallback(() => {
    setSettledCount((n) => n + 1)
  }, [])

  const handlePrint = useCallback(() => {
    window.print()
  }, [])

  // Ctrl/Cmd+P 를 가로채 같은 인쇄 경로로 보낸다.
  useEffect(() => {
    if (!open) return
    const onKeyDown = (e: KeyboardEvent): void => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'p') {
        e.preventDefault()
        if (canPrint) window.print()
      }
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [open, canPrint])

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogPortal>
        <DialogOverlay className="doc-overlay" />
        <DialogPrimitive.Content
          className="doc-modal fixed inset-0 z-50 flex flex-col focus-visible:outline-none"
          aria-describedby={undefined}
        >
          <DialogPrimitive.Title className="sr-only">{doc.title}</DialogPrimitive.Title>

          {/* 툴바 — 인쇄에서 제외 */}
          <div className="no-print flex items-center justify-between gap-3 border-b border-border bg-card px-4 py-2">
            <span className="truncate text-sm font-medium text-foreground">{doc.title}</span>
            <div className="flex items-center gap-1">
              <button
                onClick={handlePrint}
                disabled={!canPrint}
                title={canPrint ? '인쇄 / PDF로 저장 (Ctrl+P)' : '다이어그램 렌더 중…'}
                className="flex items-center gap-1.5 rounded-md px-2.5 py-1.5 text-xs text-muted-foreground transition-colors hover:bg-muted hover:text-foreground disabled:opacity-30"
              >
                <Printer size={14} />
                인쇄 / PDF
              </button>
              <DialogPrimitive.Close
                title="닫기 (Esc)"
                aria-label="닫기"
                className="rounded-md p-1.5 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
              >
                <X size={14} />
              </DialogPrimitive.Close>
            </div>
          </div>

          {/* 지면 영역 */}
          <div className={cn('flex-1 min-h-0 overflow-auto bg-muted py-8')}>
            <article className="doc-sheet">
              <MarkdownDocument
                markdown={doc.markdown}
                notePath={note.relativePath}
                resolveAsset={localResolver}
                onMermaidSettled={handleMermaidSettled}
              />
            </article>
          </div>
        </DialogPrimitive.Content>
      </DialogPortal>
    </Dialog>
  )
}
