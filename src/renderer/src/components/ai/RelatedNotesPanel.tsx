import { useState, useEffect, useRef } from 'react'
import { Loader2, X, ExternalLink } from 'lucide-react'
import type { Note } from '@renderer/types'
import type { AiNoteInput } from '../../../../main/ipc/ai'

const CACHE_TTL_MS = 5 * 60 * 1000

interface CacheEntry {
  result: RelatedItem[]
  mtime: number
  expireAt: number
}

interface RelatedItem {
  noteId: string
  score: number
  reason: string
}

interface Props {
  referenceNote: Note
  allNotes: Note[]
  onOpenNote: (note: Note) => void
  onClose: () => void
}

function toAiInput(note: Note): AiNoteInput {
  return {
    id: note.filePath,
    title: note.title,
    tags: note.tags,
    folder: note.relativePath.split('/').slice(0, -1).join('/'),
    preview: note.body.slice(0, 200)
  }
}

export function RelatedNotesPanel({ referenceNote, allNotes, onOpenNote, onClose }: Props): JSX.Element {
  const [loading, setLoading] = useState(false)
  const [items, setItems] = useState<RelatedItem[]>([])
  const [error, setError] = useState('')
  const cacheRef = useRef(new Map<string, CacheEntry>())

  useEffect(() => {
    async function load(): Promise<void> {
      const cacheKey = referenceNote.filePath
      const cached = cacheRef.current.get(cacheKey)

      if (cached && cached.mtime === referenceNote.mtime && Date.now() < cached.expireAt) {
        setItems(cached.result)
        return
      }

      setLoading(true)
      setError('')
      setItems([])

      const reference = toAiInput(referenceNote)
      const candidates = allNotes
        .filter((n) => n.filePath !== referenceNote.filePath)
        .map(toAiInput)

      const result = await window.api.ai.findRelated(reference, candidates)
      setLoading(false)

      if ('error' in result) {
        setError(result.error)
        return
      }

      cacheRef.current.set(cacheKey, {
        result: result.related,
        mtime: referenceNote.mtime,
        expireAt: Date.now() + CACHE_TTL_MS
      })
      setItems(result.related)
    }

    load()
  }, [referenceNote, allNotes])

  function noteById(id: string): Note | undefined {
    return allNotes.find((n) => n.filePath === id)
  }

  return (
    <div className="w-[280px] flex-shrink-0 border-l border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-950 flex flex-col">
      <div className="flex items-center justify-between px-4 py-3 border-b border-slate-200 dark:border-slate-800">
        <h3 className="text-xs font-semibold text-slate-700 dark:text-slate-300">관련 노트</h3>
        <button
          onClick={onClose}
          className="text-slate-400 hover:text-slate-600 dark:hover:text-slate-200"
        >
          <X size={14} />
        </button>
      </div>

      <div className="text-xs text-slate-500 dark:text-slate-400 px-4 py-2 border-b border-slate-100 dark:border-slate-800 truncate">
        기준: {referenceNote.title}
      </div>

      <div className="flex-1 overflow-auto">
        {loading && (
          <div className="flex items-center justify-center py-8 gap-2 text-slate-400 text-xs">
            <Loader2 size={14} className="animate-spin" />
            분석 중…
          </div>
        )}

        {error && (
          <div className="px-4 py-4 text-xs text-red-600 dark:text-red-400">{error}</div>
        )}

        {!loading && !error && items.length === 0 && (
          <div className="px-4 py-8 text-xs text-slate-400 text-center">관련 노트 없음</div>
        )}

        {!loading && items.length > 0 && (
          <ul className="divide-y divide-slate-100 dark:divide-slate-800">
            {items.map((item, idx) => {
              const note = noteById(item.noteId)
              if (!note) return null
              return (
                <li key={item.noteId}>
                  <button
                    onClick={() => onOpenNote(note)}
                    className="w-full text-left px-4 py-3 hover:bg-slate-50 dark:hover:bg-slate-900 transition-colors"
                  >
                    <div className="flex items-start justify-between gap-2 mb-1">
                      <span className="text-xs font-medium text-slate-800 dark:text-slate-200 truncate flex-1">
                        {note.title}
                      </span>
                      <ExternalLink size={10} className="text-slate-300 dark:text-slate-600 flex-shrink-0 mt-0.5" />
                    </div>

                    {/* Score bar */}
                    <div className="flex items-center gap-2 mb-1">
                      <div className="flex-1 h-1 bg-slate-100 dark:bg-slate-800 rounded-full overflow-hidden">
                        <div
                          className="h-1 bg-slate-500 dark:bg-slate-400 rounded-full"
                          style={{ width: `${Math.round(item.score * 100)}%` }}
                        />
                      </div>
                      <span className="text-xs text-slate-400 w-6 text-right">
                        {Math.round(item.score * 100)}
                      </span>
                      <span className="text-xs text-slate-300 dark:text-slate-600">
                        #{idx + 1}
                      </span>
                    </div>

                    <p className="text-xs text-slate-500 dark:text-slate-400 line-clamp-2">
                      {item.reason}
                    </p>
                  </button>
                </li>
              )
            })}
          </ul>
        )}
      </div>

      <div className="px-4 py-2 border-t border-slate-100 dark:border-slate-800 text-xs text-slate-300 dark:text-slate-600">
        캐시 5분 유지
      </div>
    </div>
  )
}
