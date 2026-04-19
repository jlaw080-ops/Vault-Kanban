import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import type { Settings, Priority } from '@renderer/types'

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
  priority: Priority | 'none' | 'all'
  keyword: string
}

interface ViewState {
  grouping: Grouping
  sort: SortKey
  filters: ViewFilters
  toasts: Toast[]
  setGrouping: (grouping: Grouping) => void
  setSort: (sort: SortKey) => void
  setFilters: (filters: Partial<ViewFilters>) => void
  resetFilters: () => void
  pushToast: (message: string, variant?: ToastVariant, durationMs?: number) => void
  dismissToast: (id: string) => void
}

const DEFAULT_FILTERS: ViewFilters = {
  tags: [],
  folders: [],
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

      setGrouping: (grouping) => set({ grouping }),
      setSort: (sort) => set({ sort }),
      setFilters: (partial) => set((state) => ({ filters: { ...state.filters, ...partial } })),
      resetFilters: () => set({ filters: DEFAULT_FILTERS }),

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
      partialize: (state) => ({
        grouping: state.grouping,
        sort: state.sort,
        filters: state.filters
      })
    }
  )
)
