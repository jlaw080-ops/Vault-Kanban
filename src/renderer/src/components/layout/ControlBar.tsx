import { useMemo, useRef, useState } from 'react'
import { Filter, X } from 'lucide-react'
import { cn } from '../../lib/utils'
import { useViewStore } from '../../stores/viewStore'
import { useVaultStore } from '../../stores/vaultStore'
import type { Priority } from '@renderer/types'

const GROUPING_LABELS: Record<string, string> = {
  status: '상태',
  tag: '태그',
  folder: '폴더',
  project: '프로젝트'
}

const SORT_LABELS: Record<string, string> = {
  modifiedDesc: '수정일 ↓',
  modifiedAsc: '수정일 ↑',
  createdDesc: '생성일 ↓',
  createdAsc: '생성일 ↑',
  titleAsc: '제목 ↑',
  dueAsc: '마감일 ↑'
}

const PRIORITY_LABELS: Record<string, string> = {
  all: '전체',
  high: '높음',
  mid: '중간',
  low: '낮음',
  none: '없음'
}

export function ControlBar(): JSX.Element {
  const { grouping, sort, filters, setGrouping, setSort, setFilters, resetFilters } = useViewStore()
  const { notes } = useVaultStore()
  const [filterOpen, setFilterOpen] = useState(false)
  const popoverRef = useRef<HTMLDivElement>(null)

  const { allTags, allFolders } = useMemo(() => {
    const tagSet = new Set<string>()
    const folderSet = new Set<string>()
    for (const note of notes) {
      for (const tag of note.tags) tagSet.add(tag)
      const folder = note.relativePath.split('/')[0]
      if (note.relativePath.includes('/')) folderSet.add(folder)
    }
    return {
      allTags: [...tagSet].sort(),
      allFolders: [...folderSet].sort()
    }
  }, [notes])

  const activeFilterCount =
    filters.tags.length +
    filters.folders.length +
    (filters.priority !== 'all' ? 1 : 0) +
    (filters.keyword ? 1 : 0)

  function toggleTag(tag: string): void {
    const next = filters.tags.includes(tag)
      ? filters.tags.filter((t) => t !== tag)
      : [...filters.tags, tag]
    setFilters({ tags: next })
  }

  function toggleFolder(folder: string): void {
    const next = filters.folders.includes(folder)
      ? filters.folders.filter((f) => f !== folder)
      : [...filters.folders, folder]
    setFilters({ folders: next })
  }

  const selectClass =
    'text-xs px-2 py-1 rounded-md border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-700 dark:text-slate-300 focus:outline-none focus:ring-1 focus:ring-slate-400 dark:focus:ring-slate-600'

  return (
    <div className="flex items-center gap-2 px-4 py-2 border-b border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-950 flex-shrink-0">
      <select
        value={grouping}
        onChange={(e) => setGrouping(e.target.value as Parameters<typeof setGrouping>[0])}
        className={selectClass}
        aria-label="그룹핑"
      >
        {Object.entries(GROUPING_LABELS).map(([val, label]) => (
          <option key={val} value={val}>
            {label}
          </option>
        ))}
      </select>

      <select
        value={sort}
        onChange={(e) => setSort(e.target.value as Parameters<typeof setSort>[0])}
        className={selectClass}
        aria-label="정렬"
      >
        {Object.entries(SORT_LABELS).map(([val, label]) => (
          <option key={val} value={val}>
            {label}
          </option>
        ))}
      </select>

      <div className="relative" ref={popoverRef}>
        <button
          onClick={() => setFilterOpen((o) => !o)}
          className={cn(
            'flex items-center gap-1 text-xs px-2 py-1 rounded-md border focus:outline-none focus:ring-1',
            activeFilterCount > 0
              ? 'border-slate-500 dark:border-slate-400 bg-slate-100 dark:bg-slate-800 text-slate-800 dark:text-slate-200 focus:ring-slate-400'
              : 'border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-700 dark:text-slate-300 focus:ring-slate-400'
          )}
        >
          <Filter className="w-3 h-3" />
          필터
          {activeFilterCount > 0 && (
            <span className="ml-0.5 font-semibold">{activeFilterCount}</span>
          )}
        </button>

        {filterOpen && (
          <div className="absolute top-full left-0 mt-1 z-50 w-72 rounded-md border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 shadow-md p-3 flex flex-col gap-3">
            <div>
              <p className="text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wide mb-1.5">
                태그 (AND)
              </p>
              {allTags.length === 0 ? (
                <p className="text-xs text-slate-400 dark:text-slate-500">태그 없음</p>
              ) : (
                <div className="flex flex-wrap gap-1">
                  {allTags.map((tag) => (
                    <button
                      key={tag}
                      onClick={() => toggleTag(tag)}
                      className={cn(
                        'text-xs px-2 py-0.5 rounded-full border transition-colors',
                        filters.tags.includes(tag)
                          ? 'border-slate-700 dark:border-slate-300 bg-slate-800 dark:bg-slate-200 text-white dark:text-slate-900'
                          : 'border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-400 hover:border-slate-400'
                      )}
                    >
                      {tag}
                    </button>
                  ))}
                </div>
              )}
            </div>

            <div>
              <p className="text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wide mb-1.5">
                폴더 (OR)
              </p>
              {allFolders.length === 0 ? (
                <p className="text-xs text-slate-400 dark:text-slate-500">폴더 없음</p>
              ) : (
                <div className="flex flex-wrap gap-1">
                  {allFolders.map((folder) => (
                    <button
                      key={folder}
                      onClick={() => toggleFolder(folder)}
                      className={cn(
                        'text-xs px-2 py-0.5 rounded-full border transition-colors',
                        filters.folders.includes(folder)
                          ? 'border-slate-700 dark:border-slate-300 bg-slate-800 dark:bg-slate-200 text-white dark:text-slate-900'
                          : 'border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-400 hover:border-slate-400'
                      )}
                    >
                      {folder}
                    </button>
                  ))}
                </div>
              )}
            </div>

            <div>
              <p className="text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wide mb-1.5">
                우선순위
              </p>
              <div className="flex gap-1">
                {(Object.keys(PRIORITY_LABELS) as Array<Priority | 'none' | 'all'>).map((p) => (
                  <button
                    key={p}
                    onClick={() => setFilters({ priority: p })}
                    className={cn(
                      'text-xs px-2 py-0.5 rounded-full border transition-colors',
                      filters.priority === p
                        ? 'border-slate-700 dark:border-slate-300 bg-slate-800 dark:bg-slate-200 text-white dark:text-slate-900'
                        : 'border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-400 hover:border-slate-400'
                    )}
                  >
                    {PRIORITY_LABELS[p]}
                  </button>
                ))}
              </div>
            </div>

            {activeFilterCount > 0 && (
              <button
                onClick={() => {
                  resetFilters()
                  setFilterOpen(false)
                }}
                className="text-xs text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 self-start"
              >
                필터 초기화
              </button>
            )}
          </div>
        )}
      </div>

      <input
        type="text"
        placeholder="키워드 검색…"
        value={filters.keyword}
        onChange={(e) => setFilters({ keyword: e.target.value })}
        className={cn(
          selectClass,
          'w-40 placeholder:text-slate-400 dark:placeholder:text-slate-600'
        )}
      />

      {filters.keyword && (
        <button
          onClick={() => setFilters({ keyword: '' })}
          className="text-slate-400 dark:text-slate-500 hover:text-slate-600 dark:hover:text-slate-300"
          aria-label="키워드 지우기"
        >
          <X className="w-3 h-3" />
        </button>
      )}

      {filterOpen && <div className="fixed inset-0 z-40" onClick={() => setFilterOpen(false)} />}
    </div>
  )
}
