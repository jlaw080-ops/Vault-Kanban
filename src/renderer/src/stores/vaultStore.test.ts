import { describe, it, expect, beforeEach, vi } from 'vitest'
import { createJSONStorage } from 'zustand/middleware'
import { useVaultStore } from './vaultStore'
import { useViewStore } from './viewStore'

// viewStore.test.ts와 동일한 함정 대응: Node 22+ 실험적 webstorage가 setItem 없는
// localStorage 전역을 제공해 persist 쓰기가 깨지므로 인메모리 스토리지로 교체.
const memoryStore = new Map<string, string>()
useViewStore.persist.setOptions({
  storage: createJSONStorage(() => ({
    getItem: (k: string) => memoryStore.get(k) ?? null,
    setItem: (k: string, v: string) => void memoryStore.set(k, v),
    removeItem: (k: string) => void memoryStore.delete(k)
  }))
})

const APP_STATUSES = ['backlog', 'planned', 'in-progress', 'review', 'done']

function stubApi(overrides: { getPresetFields?: () => Promise<unknown> }): void {
  vi.stubGlobal('window', {
    api: {
      vault: {
        scan: vi.fn().mockResolvedValue([]),
        getPresetFields: overrides.getPresetFields ?? vi.fn().mockResolvedValue(null)
      },
      watcher: {
        start: vi.fn().mockResolvedValue(undefined)
      }
    }
  })
}

describe('vaultStore — MM preset 연동', () => {
  beforeEach(() => {
    vi.unstubAllGlobals()
    useVaultStore.setState({ notes: [], presetProjects: [], loading: false, error: null })
    useViewStore.setState({ toasts: [] })
  })

  it('기본값: presetProjects는 빈 배열', () => {
    expect(useVaultStore.getState().presetProjects).toEqual([])
  })

  it('loadVault 성공 시 preset projects를 저장한다', async () => {
    stubApi({
      getPresetFields: vi.fn().mockResolvedValue({
        projects: ['에너빌드', 'Private'],
        statuses: APP_STATUSES,
        priorities: ['low', 'mid', 'high']
      })
    })
    await useVaultStore.getState().loadVault('/vault')
    expect(useVaultStore.getState().presetProjects).toEqual(['에너빌드', 'Private'])
    expect(useViewStore.getState().toasts).toEqual([])
  })

  it('preset이 null이면 presetProjects는 빈 배열 (노트 유도 폴백)', async () => {
    stubApi({ getPresetFields: vi.fn().mockResolvedValue(null) })
    await useVaultStore.getState().loadVault('/vault')
    expect(useVaultStore.getState().presetProjects).toEqual([])
  })

  it('statuses 불일치 시 경고 toast를 1회 띄운다', async () => {
    stubApi({
      getPresetFields: vi.fn().mockResolvedValue({
        projects: [],
        statuses: ['todo', 'doing'],
        priorities: ['low', 'mid', 'high']
      })
    })
    await useVaultStore.getState().loadVault('/vault')
    const toasts = useViewStore.getState().toasts
    expect(toasts).toHaveLength(1)
    expect(toasts[0].message).toContain('status')
    expect(toasts[0].message).toContain('todo')
  })

  it('getPresetFields가 reject해도 볼트 로드는 성공한다', async () => {
    stubApi({ getPresetFields: vi.fn().mockRejectedValue(new Error('IPC 실패')) })
    await useVaultStore.getState().loadVault('/vault')
    const s = useVaultStore.getState()
    expect(s.error).toBeNull()
    expect(s.loading).toBe(false)
    expect(s.presetProjects).toEqual([])
  })

  it('로드마다 preset을 갱신한다 (이전 값 잔존 금지)', async () => {
    useVaultStore.setState({ presetProjects: ['옛값'] })
    stubApi({ getPresetFields: vi.fn().mockResolvedValue(null) })
    await useVaultStore.getState().loadVault('/vault')
    expect(useVaultStore.getState().presetProjects).toEqual([])
  })
})
