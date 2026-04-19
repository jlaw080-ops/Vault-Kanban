import { create } from 'zustand'
import type { Note } from '@renderer/types'

interface VaultState {
  vaultPath: string
  notes: Note[]
  loading: boolean
  loadProgress: { current: number; total: number } | null
  error: string | null
  setVaultPath: (path: string) => void
  setNotes: (notes: Note[]) => void
  setLoading: (loading: boolean) => void
  setLoadProgress: (progress: { current: number; total: number } | null) => void
  setError: (error: string | null) => void
  selectVault: () => Promise<string | null>
  loadVault: (path: string, excludedFolders?: string[]) => Promise<void>
}

export const useVaultStore = create<VaultState>((set) => ({
  vaultPath: '',
  notes: [],
  loading: false,
  loadProgress: null,
  error: null,

  setVaultPath: (path) => set({ vaultPath: path }),
  setNotes: (notes) => set({ notes }),
  setLoading: (loading) => set({ loading }),
  setLoadProgress: (loadProgress) => set({ loadProgress }),
  setError: (error) => set({ error }),

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
      set({ notes, loading: false, loadProgress: null })
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Vault 로드 실패'
      set({ loading: false, error: message, loadProgress: null })
    }
  }
}))
