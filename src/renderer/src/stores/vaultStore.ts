import { create } from 'zustand'
import type { Note } from '@renderer/types'
import { useViewStore } from './viewStore'
import { presetMismatchMessage } from '../lib/viewModel'

interface VaultState {
  vaultPath: string
  notes: Note[]
  loading: boolean
  loadProgress: { current: number; total: number } | null
  error: string | null
  selectedNote: Note | null
  presetProjects: string[]
  setVaultPath: (path: string) => void
  setNotes: (notes: Note[]) => void
  updateNote: (updated: Note) => void
  removeNote: (filePath: string) => void
  setLoading: (loading: boolean) => void
  setLoadProgress: (progress: { current: number; total: number } | null) => void
  setError: (error: string | null) => void
  selectVault: () => Promise<string | null>
  loadVault: (path: string, excludedFolders?: string[]) => Promise<void>
  openNote: (note: Note) => void
  closeNote: () => void
}

export const useVaultStore = create<VaultState>((set) => ({
  vaultPath: '',
  notes: [],
  loading: false,
  loadProgress: null,
  error: null,
  selectedNote: null,
  presetProjects: [],

  setVaultPath: (path) => set({ vaultPath: path }),
  setNotes: (notes) => set({ notes }),
  updateNote: (updated) =>
    set((state) => ({
      notes: state.notes.map((n) => (n.filePath === updated.filePath ? updated : n)),
      selectedNote: state.selectedNote?.filePath === updated.filePath ? updated : state.selectedNote
    })),
  removeNote: (filePath) =>
    set((state) => ({
      notes: state.notes.filter((n) => n.filePath !== filePath),
      selectedNote: state.selectedNote?.filePath === filePath ? null : state.selectedNote
    })),
  setLoading: (loading) => set({ loading }),
  setLoadProgress: (loadProgress) => set({ loadProgress }),
  setError: (error) => set({ error }),
  openNote: (note) => set({ selectedNote: note }),
  closeNote: () => set({ selectedNote: null }),

  selectVault: async () => {
    const path = await window.api.vault.select()
    if (path) {
      set({ vaultPath: path, error: null })
      await window.api.settings.set('vaultPath', path)
    }
    return path
  },

  loadVault: async (path, excludedFolders) => {
    set({ loading: true, error: null, loadProgress: null })
    try {
      const notes = await window.api.vault.scan(path, excludedFolders)

      let presetProjects: string[] = []
      try {
        const preset = await window.api.vault.getPresetFields(path)
        if (preset) {
          presetProjects = preset.projects
          const mismatch = presetMismatchMessage(preset)
          if (mismatch) {
            useViewStore.getState().pushToast(mismatch, 'info', 6000)
          }
        }
      } catch {
        // preset 읽기 실패는 볼트 로드를 막지 않는다 — 노트 유도 값 폴백
      }

      set({ notes, presetProjects, loading: false, loadProgress: null })
      await window.api.watcher.start(path, excludedFolders ?? ['.obsidian', '.trash', '.git'])
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Vault 로드 실패'
      set({ loading: false, error: message, loadProgress: null })
    }
  }
}))
