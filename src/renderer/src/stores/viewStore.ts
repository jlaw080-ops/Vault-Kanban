import { create } from 'zustand'
import type { Settings } from '@renderer/types'

type Grouping = Settings['defaultGrouping']
type Sort = Settings['defaultSort']

export type ToastVariant = 'success' | 'error' | 'info'

export interface Toast {
  id: string
  message: string
  variant: ToastVariant
}

interface ViewState {
  grouping: Grouping
  sort: Sort
  search: string
  selectedTags: string[]
  selectedProject: string | null
  toasts: Toast[]
  setGrouping: (grouping: Grouping) => void
  setSort: (sort: Sort) => void
  setSearch: (search: string) => void
  setSelectedTags: (tags: string[]) => void
  setSelectedProject: (project: string | null) => void
  resetFilters: () => void
  pushToast: (message: string, variant?: ToastVariant, durationMs?: number) => void
  dismissToast: (id: string) => void
}

export const useViewStore = create<ViewState>((set, get) => ({
  grouping: 'status',
  sort: 'modifiedDesc',
  search: '',
  selectedTags: [],
  selectedProject: null,
  toasts: [],

  setGrouping: (grouping) => set({ grouping }),
  setSort: (sort) => set({ sort }),
  setSearch: (search) => set({ search }),
  setSelectedTags: (selectedTags) => set({ selectedTags }),
  setSelectedProject: (selectedProject) => set({ selectedProject }),
  resetFilters: () => set({ search: '', selectedTags: [], selectedProject: null }),
  pushToast: (message, variant = 'info', durationMs = 4000) => {
    const id = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
    set((state) => ({ toasts: [...state.toasts, { id, message, variant }] }))
    if (durationMs > 0) {
      setTimeout(() => get().dismissToast(id), durationMs)
    }
  },
  dismissToast: (id) => set((state) => ({ toasts: state.toasts.filter((t) => t.id !== id) }))
}))
