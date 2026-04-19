import { create } from 'zustand'
import type { Settings } from '@renderer/types'

interface SettingsState {
  settings: Settings | null
  loading: boolean
  load: () => Promise<Settings>
  update: <K extends keyof Settings>(key: K, value: Settings[K]) => Promise<void>
}

export const useSettingsStore = create<SettingsState>((set, get) => ({
  settings: null,
  loading: false,

  load: async () => {
    set({ loading: true })
    const settings = await window.api.settings.getAll()
    set({ settings, loading: false })
    return settings
  },

  update: async (key, value) => {
    await window.api.settings.set(key, value)
    const current = get().settings
    if (current) {
      set({ settings: { ...current, [key]: value } })
    }
  }
}))
