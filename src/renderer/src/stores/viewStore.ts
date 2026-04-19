import { create } from 'zustand'
import type { Settings } from '@renderer/types'

type Grouping = Settings['defaultGrouping']
type Sort = Settings['defaultSort']

interface ViewState {
  grouping: Grouping
  sort: Sort
  search: string
  selectedTags: string[]
  selectedProject: string | null
  setGrouping: (grouping: Grouping) => void
  setSort: (sort: Sort) => void
  setSearch: (search: string) => void
  setSelectedTags: (tags: string[]) => void
  setSelectedProject: (project: string | null) => void
  resetFilters: () => void
}

export const useViewStore = create<ViewState>((set) => ({
  grouping: 'status',
  sort: 'modifiedDesc',
  search: '',
  selectedTags: [],
  selectedProject: null,

  setGrouping: (grouping) => set({ grouping }),
  setSort: (sort) => set({ sort }),
  setSearch: (search) => set({ search }),
  setSelectedTags: (selectedTags) => set({ selectedTags }),
  setSelectedProject: (selectedProject) => set({ selectedProject }),
  resetFilters: () => set({ search: '', selectedTags: [], selectedProject: null })
}))
