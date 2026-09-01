import { describe, it, expect } from 'vitest'
import { createJSONStorage } from 'zustand/middleware'
import { useViewStore } from './viewStore'
import { SWIMLANE_MIN_HEIGHT, SWIMLANE_MAX_HEIGHT } from '../lib/viewModel'

// Node 22+ 실험적 webstorage가 setItem 없는 localStorage 전역을 제공해
// persist 쓰기가 깨지므로, 테스트에서는 인메모리 스토리지로 교체한다.
// (partialize/migrate/version 검증은 setOptions와 무관하게 원본 정의를 본다)
const memoryStore = new Map<string, string>()
useViewStore.persist.setOptions({
  storage: createJSONStorage(() => ({
    getItem: (k: string) => memoryStore.get(k) ?? null,
    setItem: (k: string, v: string) => void memoryStore.set(k, v),
    removeItem: (k: string) => void memoryStore.delete(k)
  }))
})

describe('viewStore 스윔레인 상태', () => {
  it('기본값: 비활성, 선택 없음, 기타 레인 표시', () => {
    const s = useViewStore.getState()
    expect(s.swimlaneEnabled).toBe(false)
    expect(s.swimlaneProjects).toEqual([])
    expect(s.showEtcLane).toBe(true)
  })

  it('toggleSwimlaneProject: 추가는 뒤에, 재호출 시 제거 (불변)', () => {
    const { toggleSwimlaneProject } = useViewStore.getState()
    toggleSwimlaneProject('proj-A')
    toggleSwimlaneProject('proj-B')
    expect(useViewStore.getState().swimlaneProjects).toEqual(['proj-A', 'proj-B'])
    toggleSwimlaneProject('proj-A')
    expect(useViewStore.getState().swimlaneProjects).toEqual(['proj-B'])
    toggleSwimlaneProject('proj-B') // 원상 복구
  })
})

describe('viewStore persist 회귀 방지 (2026-05-04 grouping 버그 교훈)', () => {
  it('partialize에 스윔레인 3필드가 포함된다', () => {
    const options = useViewStore.persist.getOptions()
    const partial = options.partialize!(useViewStore.getState()) as Record<string, unknown>
    expect(partial).toHaveProperty('swimlaneEnabled')
    expect(partial).toHaveProperty('swimlaneProjects')
    expect(partial).toHaveProperty('showEtcLane')
    expect(partial).toHaveProperty('swimlaneHeights')
    // 기존 필드 유지
    expect(partial).toHaveProperty('grouping')
    expect(partial).toHaveProperty('sort')
    expect(partial).toHaveProperty('filters')
  })

  it('migrate v2→v3: 스윔레인 기본값 주입', () => {
    const options = useViewStore.persist.getOptions()
    const migrated = options.migrate!(
      {
        grouping: 'status',
        sort: 'modifiedDesc',
        filters: { tags: [], folders: [], projects: [], priority: 'all', keyword: '' }
      },
      2
    ) as Record<string, unknown>
    expect(migrated.swimlaneEnabled).toBe(false)
    expect(migrated.swimlaneProjects).toEqual([])
    expect(migrated.showEtcLane).toBe(true)
  })

  it('persist version은 5이다', () => {
    expect(useViewStore.persist.getOptions().version).toBe(5)
  })
})

describe('viewStore 스윔레인 레인 높이', () => {
  it('기본값: 빈 객체', () => {
    expect(useViewStore.getState().swimlaneHeights).toEqual({})
  })

  it('setSwimlaneHeight: 범위 내 값 저장, 불변 갱신', () => {
    const before = useViewStore.getState().swimlaneHeights
    useViewStore.getState().setSwimlaneHeight('proj-A', 400)
    const after = useViewStore.getState().swimlaneHeights
    expect(after['proj-A']).toBe(400)
    expect(after).not.toBe(before)
    expect(before).toEqual({}) // 원본 미변경
    useViewStore.getState().resetSwimlaneHeight('proj-A') // 정리
  })

  it('setSwimlaneHeight: 범위 밖 값은 클램프해 저장한다', () => {
    useViewStore.getState().setSwimlaneHeight('proj-A', 2000)
    expect(useViewStore.getState().swimlaneHeights['proj-A']).toBe(SWIMLANE_MAX_HEIGHT)
    useViewStore.getState().setSwimlaneHeight('proj-A', 10)
    expect(useViewStore.getState().swimlaneHeights['proj-A']).toBe(SWIMLANE_MIN_HEIGHT)
    useViewStore.getState().resetSwimlaneHeight('proj-A')
  })

  it('resetSwimlaneHeight: 해당 키만 삭제하고 다른 레인은 유지한다', () => {
    useViewStore.getState().setSwimlaneHeight('proj-A', 400)
    useViewStore.getState().setSwimlaneHeight('(기타)', 500)
    useViewStore.getState().resetSwimlaneHeight('proj-A')
    const heights = useViewStore.getState().swimlaneHeights
    expect(heights).not.toHaveProperty('proj-A')
    expect(heights['(기타)']).toBe(500)
    useViewStore.getState().resetSwimlaneHeight('(기타)')
  })

  it('resetSwimlaneHeight: 없는 키에 호출해도 안전하다', () => {
    useViewStore.getState().resetSwimlaneHeight('없는-레인')
    expect(useViewStore.getState().swimlaneHeights).toEqual({})
  })
})

describe('viewStore persist v4 마이그레이션', () => {
  it('migrate v3→v4: swimlaneHeights 기본값 주입', () => {
    const options = useViewStore.persist.getOptions()
    const migrated = options.migrate!(
      {
        grouping: 'status',
        sort: 'modifiedDesc',
        filters: { tags: [], folders: [], projects: [], priority: 'all', keyword: '' },
        swimlaneEnabled: true,
        swimlaneProjects: ['proj-A'],
        showEtcLane: true
      },
      3
    ) as Record<string, unknown>
    expect(migrated.swimlaneHeights).toEqual({})
    // 기존 필드는 보존
    expect(migrated.swimlaneProjects).toEqual(['proj-A'])
  })

  it('migrate v2→v4: 스윔레인 기본값과 swimlaneHeights 모두 주입', () => {
    const options = useViewStore.persist.getOptions()
    const migrated = options.migrate!(
      {
        grouping: 'status',
        sort: 'modifiedDesc',
        filters: { tags: [], folders: [], projects: [], priority: 'all', keyword: '' }
      },
      2
    ) as Record<string, unknown>
    expect(migrated.swimlaneEnabled).toBe(false)
    expect(migrated.swimlaneHeights).toEqual({})
  })
})

describe('viewStore To Do 상태', () => {
  it('기본값: createdDesc, 빈 키워드', () => {
    const s = useViewStore.getState()
    expect(s.todoSort).toBe('createdDesc')
    expect(s.todoKeyword).toBe('')
  })

  it('setTodoSort / setTodoKeyword 가 값을 바꾼다', () => {
    useViewStore.getState().setTodoSort('dueAsc')
    useViewStore.getState().setTodoKeyword('BIPV')
    expect(useViewStore.getState().todoSort).toBe('dueAsc')
    expect(useViewStore.getState().todoKeyword).toBe('BIPV')
    useViewStore.getState().setTodoSort('createdDesc')
    useViewStore.getState().setTodoKeyword('')
  })

  it('partialize 에 todoSort·todoKeyword 가 포함된다', () => {
    const options = useViewStore.persist.getOptions()
    const partial = options.partialize!(useViewStore.getState()) as Record<string, unknown>
    expect(partial).toHaveProperty('todoSort')
    expect(partial).toHaveProperty('todoKeyword')
  })

  it('persist 버전은 5이고 v4 저장본을 마이그레이션한다', () => {
    const options = useViewStore.persist.getOptions()
    expect(options.version).toBe(5)
    const migrated = options.migrate!({ grouping: 'status' }, 4) as Record<string, unknown>
    expect(migrated.todoSort).toBe('createdDesc')
    expect(migrated.todoKeyword).toBe('')
  })

  it('todo 라우트를 설정할 수 있다', () => {
    useViewStore.getState().setRoute('todo')
    expect(useViewStore.getState().route).toBe('todo')
    useViewStore.getState().setRoute('kanban')
  })
})

describe('viewStore Toast 액션', () => {
  it('pushToast 에 넘긴 action 이 토스트에 실린다', () => {
    const onClick = (): void => {}
    useViewStore.getState().pushToast('이동했습니다', 'success', 0, {
      label: '되돌리기',
      onClick
    })
    const toast = useViewStore.getState().toasts.at(-1)
    expect(toast?.action?.label).toBe('되돌리기')
    expect(toast?.action?.onClick).toBe(onClick)
    useViewStore.getState().dismissToast(toast!.id)
  })
})
