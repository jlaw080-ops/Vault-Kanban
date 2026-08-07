import { useMemo, useRef, useState } from 'react'
import { Filter, X, ChevronDown, ChevronRight, RefreshCw, Rows3 } from 'lucide-react'
import { cn } from '../../lib/utils'
import { mergeProjectOptions } from '../../lib/viewModel'
import { useViewStore } from '../../stores/viewStore'
import { useVaultStore } from '../../stores/vaultStore'
import { useSettingsStore } from '../../stores/settingsStore'
import type { Priority } from '@renderer/types'

const GROUPING_LABELS: Record<string, string> = {
  status: '상태',
  folder: '폴더',
  project: '프로젝트'
}

const SORT_LABELS: Record<string, string> = {
  modifiedDesc: '수정일 ↓',
  modifiedAsc: '수정일 ↑',
  createdDesc: '생성일 ↓',
  createdAsc: '생성일 ↑',
  titleAsc: '제목 ↑',
  dueAsc: '마감일 ↑',
  priorityDesc: '우선순위 ↓'
}

const PRIORITY_LABELS: Record<string, string> = {
  all: '전체',
  high: '높음',
  mid: '중간',
  low: '낮음',
  none: '없음'
}

export function ControlBar(): JSX.Element {
  const {
    grouping,
    sort,
    filters,
    setGrouping,
    setSort,
    setFilters,
    resetFilters,
    swimlaneEnabled,
    swimlaneProjects,
    showEtcLane,
    setSwimlaneEnabled,
    toggleSwimlaneProject,
    setShowEtcLane
  } = useViewStore()
  const { notes, vaultPath, loading, loadVault, presetProjects } = useVaultStore()
  const { settings } = useSettingsStore()
  const [filterOpen, setFilterOpen] = useState(false)
  const [swimlaneOpen, setSwimlaneOpen] = useState(false)
  const [tagsExpanded, setTagsExpanded] = useState(false)
  const popoverRef = useRef<HTMLDivElement>(null)

  const { allTags, allFolders, allProjects } = useMemo(() => {
    const tagSet = new Set<string>()
    const folderSet = new Set<string>()
    const projectSet = new Set<string>()
    for (const note of notes) {
      for (const tag of note.tags) tagSet.add(tag)
      const folder = note.relativePath.split('/')[0]
      if (note.relativePath.includes('/')) folderSet.add(folder)
      if (note.project) projectSet.add(note.project)
    }
    return {
      allTags: [...tagSet].sort(),
      allFolders: [...folderSet].sort(),
      allProjects: [...projectSet].sort()
    }
  }, [notes])

  const laneProjectOptions = useMemo(
    () =>
      mergeProjectOptions(presetProjects, [...new Set([...allProjects, ...swimlaneProjects])]),
    [presetProjects, allProjects, swimlaneProjects]
  )

  const projectFilterOptions = useMemo(
    () => mergeProjectOptions(presetProjects, allProjects),
    [presetProjects, allProjects]
  )

  const activeFilterCount =
    filters.tags.length +
    filters.folders.length +
    (filters.projects?.length ?? 0) +
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

  function toggleProject(project: string): void {
    const next = filters.projects.includes(project)
      ? filters.projects.filter((p) => p !== project)
      : [...filters.projects, project]
    setFilters({ projects: next })
  }

  const selectClass =
    'text-xs px-2 py-1 rounded-md border border-border bg-muted text-foreground focus:outline-none focus:ring-1 focus:ring-accent'

  const chipBase = 'text-xs px-2 py-0.5 rounded-full border transition-colors'
  const chipActive = 'border-accent bg-accent text-accent-foreground font-semibold'
  const chipInactive = 'border-border text-muted-foreground hover:border-muted-foreground'

  return (
    <div className="flex items-center gap-2 px-4 py-2 border-b border-border bg-card flex-shrink-0">
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
            'flex items-center gap-1 text-xs px-2 py-1 rounded-md border focus:outline-none focus:ring-1 focus:ring-accent transition-colors',
            activeFilterCount > 0
              ? 'border-accent bg-accent/10 text-accent'
              : 'border-border bg-muted text-muted-foreground'
          )}
        >
          <Filter className="w-3 h-3" />
          필터
          {activeFilterCount > 0 && (
            <span className="ml-0.5 font-semibold">{activeFilterCount}</span>
          )}
        </button>

        {filterOpen && (
          <div className="absolute top-full left-0 mt-1 z-50 w-72 max-h-[70vh] overflow-y-auto rounded-md border border-border bg-popover shadow-[rgba(0,0,0,0.5)_0px_8px_24px] p-3 flex flex-col gap-3">

            {/* 프로젝트 */}
            <div>
              <p className="text-xs font-bold text-muted-foreground uppercase tracking-widest mb-1.5">
                프로젝트 (OR)
              </p>
              {projectFilterOptions.length === 0 ? (
                <p className="text-xs text-muted-foreground">프로젝트 없음</p>
              ) : (
                <div className="flex flex-wrap gap-1">
                  {projectFilterOptions.map((project) => (
                    <button
                      key={project}
                      onClick={() => toggleProject(project)}
                      className={cn(chipBase, filters.projects.includes(project) ? chipActive : chipInactive)}
                    >
                      {project}
                    </button>
                  ))}
                </div>
              )}
            </div>

            {/* 우선순위 */}
            <div>
              <p className="text-xs font-bold text-muted-foreground uppercase tracking-widest mb-1.5">
                우선순위
              </p>
              <div className="flex gap-1">
                {(Object.keys(PRIORITY_LABELS) as Array<Priority | 'none' | 'all'>).map((p) => (
                  <button
                    key={p}
                    onClick={() => setFilters({ priority: p })}
                    className={cn(chipBase, filters.priority === p ? chipActive : chipInactive)}
                  >
                    {PRIORITY_LABELS[p]}
                  </button>
                ))}
              </div>
            </div>

            {/* 폴더 */}
            <div>
              <p className="text-xs font-bold text-muted-foreground uppercase tracking-widest mb-1.5">
                폴더 (OR)
              </p>
              {allFolders.length === 0 ? (
                <p className="text-xs text-muted-foreground">폴더 없음</p>
              ) : (
                <div className="flex flex-wrap gap-1">
                  {allFolders.map((folder) => (
                    <button
                      key={folder}
                      onClick={() => toggleFolder(folder)}
                      className={cn(chipBase, filters.folders.includes(folder) ? chipActive : chipInactive)}
                    >
                      {folder}
                    </button>
                  ))}
                </div>
              )}
            </div>

            {/* 태그 — 클릭 시 펼침 */}
            <div>
              <button
                onClick={() => setTagsExpanded((v) => !v)}
                className="flex items-center gap-1 text-xs font-bold text-muted-foreground uppercase tracking-widest mb-1.5 hover:text-foreground w-full text-left transition-colors"
              >
                {tagsExpanded ? <ChevronDown className="w-3 h-3" /> : <ChevronRight className="w-3 h-3" />}
                태그 (AND)
                {filters.tags.length > 0 && (
                  <span className="ml-1 normal-case font-normal text-muted-foreground">
                    {filters.tags.length}개 선택
                  </span>
                )}
              </button>
              {tagsExpanded && (
                allTags.length === 0 ? (
                  <p className="text-xs text-muted-foreground">태그 없음</p>
                ) : (
                  <div className="flex flex-wrap gap-1">
                    {allTags.map((tag) => (
                      <button
                        key={tag}
                        onClick={() => toggleTag(tag)}
                        className={cn(chipBase, filters.tags.includes(tag) ? chipActive : chipInactive)}
                      >
                        {tag}
                      </button>
                    ))}
                  </div>
                )
              )}
            </div>

            {activeFilterCount > 0 && (
              <button
                onClick={() => {
                  resetFilters()
                  setTagsExpanded(false)
                  setFilterOpen(false)
                }}
                className="text-xs text-muted-foreground hover:text-foreground self-start transition-colors"
              >
                필터 초기화
              </button>
            )}
          </div>
        )}
      </div>

      <div className="relative">
        <button
          onClick={() => setSwimlaneOpen((o) => !o)}
          disabled={grouping !== 'status'}
          title={grouping !== 'status' ? '상태 그룹핑에서만 사용 가능' : '스윔레인 설정'}
          className={cn(
            'flex items-center gap-1 text-xs px-2 py-1 rounded-md border focus:outline-none focus:ring-1 focus:ring-accent transition-colors disabled:opacity-40 disabled:cursor-not-allowed',
            swimlaneEnabled && swimlaneProjects.length > 0 && grouping === 'status'
              ? 'border-accent bg-accent/10 text-accent'
              : 'border-border bg-muted text-muted-foreground'
          )}
        >
          <Rows3 className="w-3 h-3" />
          레인
          {swimlaneEnabled && swimlaneProjects.length > 0 && (
            <span className="ml-0.5 font-semibold">{swimlaneProjects.length}</span>
          )}
        </button>

        {swimlaneOpen && (
          <div className="absolute top-full left-0 mt-1 z-50 w-72 max-h-[70vh] overflow-y-auto rounded-md border border-border bg-popover shadow-[rgba(0,0,0,0.5)_0px_8px_24px] p-3 flex flex-col gap-3">
            <label className="flex items-center gap-2 text-xs text-foreground cursor-pointer">
              <input
                type="checkbox"
                checked={swimlaneEnabled}
                onChange={(e) => setSwimlaneEnabled(e.target.checked)}
              />
              스윔레인 사용
            </label>

            <div>
              <p className="text-xs font-bold text-muted-foreground uppercase tracking-widest mb-1.5">
                레인 프로젝트
              </p>
              {laneProjectOptions.length === 0 ? (
                <p className="text-xs text-muted-foreground">프로젝트 없음</p>
              ) : (
                <div className="flex flex-wrap gap-1">
                  {laneProjectOptions.map((project) => (
                    <button
                      key={project}
                      onClick={() => toggleSwimlaneProject(project)}
                      className={cn(
                        chipBase,
                        swimlaneProjects.includes(project) ? chipActive : chipInactive
                      )}
                    >
                      {project}
                    </button>
                  ))}
                </div>
              )}
              {swimlaneEnabled && swimlaneProjects.length === 0 && (
                <p className="text-xs text-muted-foreground mt-1.5">
                  레인으로 볼 프로젝트를 선택하세요
                </p>
              )}
            </div>

            <label className="flex items-center gap-2 text-xs text-foreground cursor-pointer">
              <input
                type="checkbox"
                checked={showEtcLane}
                onChange={(e) => setShowEtcLane(e.target.checked)}
              />
              기타 레인 표시
            </label>
          </div>
        )}
      </div>

      <input
        type="text"
        placeholder="키워드 검색…"
        value={filters.keyword}
        onChange={(e) => setFilters({ keyword: e.target.value })}
        className={cn(selectClass, 'w-40 placeholder:text-muted-foreground/50')}
      />

      {filters.keyword && (
        <button
          onClick={() => setFilters({ keyword: '' })}
          className="text-muted-foreground hover:text-foreground transition-colors"
          aria-label="키워드 지우기"
        >
          <X className="w-3 h-3" />
        </button>
      )}

      <button
        onClick={() => {
          if (vaultPath) {
            loadVault(vaultPath, settings?.excludedFolders)
          }
        }}
        disabled={loading || !vaultPath}
        className="ml-auto flex items-center gap-1 text-xs px-2 py-1 rounded-md border border-border bg-muted text-muted-foreground hover:text-foreground hover:border-muted-foreground transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
        aria-label="볼트 새로고침"
        title="볼트 새로고침 (전체 재스캔)"
      >
        <RefreshCw className={cn('w-3 h-3', loading && 'animate-spin')} />
        새로고침
      </button>

      {filterOpen && <div className="fixed inset-0 z-40" onClick={() => setFilterOpen(false)} />}
      {swimlaneOpen && (
        <div className="fixed inset-0 z-40" onClick={() => setSwimlaneOpen(false)} />
      )}
    </div>
  )
}
