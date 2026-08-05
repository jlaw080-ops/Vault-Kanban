import { describe, it, expect } from 'vitest'
import { useViewStore } from './viewStore'

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

  it('persist version은 3이다', () => {
    expect(useViewStore.persist.getOptions().version).toBe(3)
  })
})
