import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import type { Settings, Priority } from '@renderer/types'
import { clampSwimlaneHeight } from '../lib/viewModel'

type Grouping = Settings['defaultGrouping']
type SortKey = Settings['defaultSort']

export type ToastVariant = 'success' | 'error' | 'info'

export interface Toast {
  id: string
  message: string
  variant: ToastVariant
}

export interface ViewFilters {
  tags: string[]
  folders: string[]
  projects: string[]
  priority: Priority | 'none' | 'all'
  keyword: string
}

export type AppRoute = 'kanban' | 'dashboard' | 'migration' | 'settings' | 'daily'

interface ViewState {
  grouping: Grouping
  sort: SortKey
  filters: ViewFilters
  toasts: Toast[]
  route: AppRoute
  swimlaneEnabled: boolean
  swimlaneProjects: string[]
  showEtcLane: boolean
  swimlaneHeights: Record<string, number>
  setGrouping: (grouping: Grouping) => void
  setSort: (sort: SortKey) => void
  setFilters: (filters: Partial<ViewFilters>) => void
  resetFilters: () => void
  pushToast: (message: string, variant?: ToastVariant, durationMs?: number) => void
  dismissToast: (id: string) => void
  setRoute: (route: AppRoute) => void
  setSwimlaneEnabled: (v: boolean) => void
  toggleSwimlaneProject: (project: string) => void
  setShowEtcLane: (v: boolean) => void
  setSwimlaneHeight: (lane: string, px: number) => void
  resetSwimlaneHeight: (lane: string) => void
}

const DEFAULT_FILTERS: ViewFilters = {
  tags: [],
  folders: [],
  projects: [],
  priority: 'all',
  keyword: ''
}

export const useViewStore = create<ViewState>()(
  persist(
    (set, get) => ({
      grouping: 'status',
      sort: 'modifiedDesc',
      filters: DEFAULT_FILTERS,
      toasts: [],
      route: 'kanban' as AppRoute,

      swimlaneEnabled: false,
      swimlaneProjects: [],
      showEtcLane: true,
      swimlaneHeights: {},

      setGrouping: (grouping) => set({ grouping }),
      setSort: (sort) => set({ sort }),
      setFilters: (partial) => set((state) => ({ filters: { ...state.filters, ...partial } })),
      resetFilters: () => set({ filters: DEFAULT_FILTERS }),
      setRoute: (route) => set({ route }),
      setSwimlaneEnabled: (v) => set({ swimlaneEnabled: v }),
      toggleSwimlaneProject: (project) =>
        set((state) => ({
          swimlaneProjects: state.swimlaneProjects.includes(project)
            ? state.swimlaneProjects.filter((p) => p !== project)
            : [...state.swimlaneProjects, project]
        })),
      setShowEtcLane: (v) => set({ showEtcLane: v }),
      setSwimlaneHeight: (lane, px) =>
        set((state) => ({
          swimlaneHeights: { ...state.swimlaneHeights, [lane]: clampSwimlaneHeight(px) }
        })),
      resetSwimlaneHeight: (lane) =>
        set((state) => {
          const next = { ...state.swimlaneHeights }
          delete next[lane] // 복사본에 대한 delete — 원본 불변
          return { swimlaneHeights: next }
        }),

      pushToast: (message, variant = 'info', durationMs = 4000) => {
        const id = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
        set((state) => ({ toasts: [...state.toasts, { id, message, variant }] }))
        if (durationMs > 0) {
          setTimeout(() => get().dismissToast(id), durationMs)
        }
      },
      dismissToast: (id) => set((state) => ({ toasts: state.toasts.filter((t) => t.id !== id) }))
    }),
    {
      name: 'vault-kanban-view',
      version: 4,
      migrate: (persisted: unknown, version: number) => {
        const s = persisted as { filters?: Partial<ViewFilters>; grouping?: string }
        if (version < 1 && s?.filters && !s.filters.projects) {
          s.filters.projects = []
        }
        if (version < 2 && s?.grouping) {
          const map: Record<string, string> = { '상태': 'status', '태그': 'tag', '폴더': 'folder', '프로젝트': 'project' }
          if (map[s.grouping]) s.grouping = map[s.grouping]
        }
        if (version < 3) {
          const s3 = s as Record<string, unknown>
          s3.swimlaneEnabled = false
          s3.swimlaneProjects = []
          s3.showEtcLane = true
        }
        if (version < 4) {
          const s4 = s as Record<string, unknown>
          s4.swimlaneHeights = {}
        }
        return s as ViewState
      },
      partialize: (state) => ({
        grouping: state.grouping,
        sort: state.sort,
        filters: state.filters,
        swimlaneEnabled: state.swimlaneEnabled,
        swimlaneProjects: state.swimlaneProjects,
        showEtcLane: state.showEtcLane,
        swimlaneHeights: state.swimlaneHeights
      })
    }
  )
)
