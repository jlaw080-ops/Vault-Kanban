# 스윔레인 레인 높이 드래그 조절 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 스윔레인 각 레인의 하단 경계를 마우스 드래그로 조절하고, 조절값을 persist하며, 핸들 더블클릭 시 기본 높이(288px)로 리셋한다.

**Architecture:** 순수 함수 `clampSwimlaneHeight`(viewModel.ts) → viewStore persist 상태 `swimlaneHeights`(v3→v4 마이그레이션) → SwimlaneRow에 커스텀 6px 리사이즈 핸들(pointer capture). 라이브러리 추가 없음(ADR 불필요).

**Tech Stack:** React 18 + zustand persist + Tailwind. 테스트는 Vitest(co-located `*.test.ts`), 드래그 상호작용은 run-visual-check 육안 확인.

**Spec:** `docs/superpowers/specs/2026-08-07-swimlane-resize-design.md`

## Global Constraints

- 실행 시작 시 새 브랜치 생성 (superpowers:using-git-worktrees): 예 `feature/swimlane-resize`
- TypeScript strict, `any` 금지. 내보내는 함수는 명시적 파라미터/반환 타입.
- TDD 필수: 순수 함수·스토어는 테스트 먼저(RED) → 구현(GREEN). 테스트 없는 구현은 Hook이 차단.
- 불변 갱신만 사용 (기존 객체 mutate 금지 — 복사본에 대한 `delete`는 허용).
- UI 규칙: `bg-gradient-*`·`backdrop-blur-*`·`rounded-2xl` 이상 금지, 애니메이션 금지(DnD·모달·스피너 외). 핸들 hover 색은 `bg-accent/40` — accent 토큰은 양 테마 공통이라 `dark:` 병기 불필요 (스펙 5장에서 확정).
- 새 의존성 추가 금지.
- zustand 스토어는 기존 3개만 — viewStore를 수정하고 새 스토어를 만들지 않는다.
- 커밋: Conventional Commits — `test: ...`, `feat(swimlane): ...`.
- 알려진 기존 lint 오류 1건: `.claude/skills/run-visual-check/driver.mjs:125` 반환 타입 누락 — 이 작업과 무관, **수정하지 말 것**.
- 셸: Windows. 명령은 프로젝트 루트 `C:\Users\jlaw8\dev\Vault Kanban`에서 실행.

---

### Task 1: 순수 함수 `clampSwimlaneHeight` + 상수 (viewModel.ts)

**Files:**
- Modify: `src/renderer/src/lib/viewModel.ts` (파일 끝에 추가)
- Test: `src/renderer/src/lib/viewModel.test.ts` (기존 파일에 describe 블록 추가)

**Interfaces:**
- Consumes: 없음 (독립 순수 함수)
- Produces (Task 2·3이 import):
  - `export const SWIMLANE_DEFAULT_HEIGHT = 288`
  - `export const SWIMLANE_MIN_HEIGHT = 160`
  - `export const SWIMLANE_MAX_HEIGHT = 800`
  - `export function clampSwimlaneHeight(px: number): number` — `[MIN, MAX]` 클램프, NaN/±Infinity → DEFAULT

- [ ] **Step 1: 실패하는 테스트 작성**

`src/renderer/src/lib/viewModel.test.ts` — 상단 import 목록(현재 `presetMismatchMessage`까지 있는 블록)에 다음 4개를 추가:

```ts
  clampSwimlaneHeight,
  SWIMLANE_DEFAULT_HEIGHT,
  SWIMLANE_MIN_HEIGHT,
  SWIMLANE_MAX_HEIGHT
```

파일 끝에 describe 블록 추가:

```ts
describe('clampSwimlaneHeight', () => {
  it('상수 값: DEFAULT 288 (기존 h-72), MIN 160, MAX 800', () => {
    expect(SWIMLANE_DEFAULT_HEIGHT).toBe(288)
    expect(SWIMLANE_MIN_HEIGHT).toBe(160)
    expect(SWIMLANE_MAX_HEIGHT).toBe(800)
  })

  it('범위 내 값은 그대로 반환한다 (경계 포함)', () => {
    expect(clampSwimlaneHeight(300)).toBe(300)
    expect(clampSwimlaneHeight(SWIMLANE_MIN_HEIGHT)).toBe(SWIMLANE_MIN_HEIGHT)
    expect(clampSwimlaneHeight(SWIMLANE_MAX_HEIGHT)).toBe(SWIMLANE_MAX_HEIGHT)
  })

  it('MIN 미만은 MIN으로 클램프한다', () => {
    expect(clampSwimlaneHeight(159)).toBe(SWIMLANE_MIN_HEIGHT)
    expect(clampSwimlaneHeight(0)).toBe(SWIMLANE_MIN_HEIGHT)
    expect(clampSwimlaneHeight(-50)).toBe(SWIMLANE_MIN_HEIGHT)
  })

  it('MAX 초과는 MAX로 클램프한다', () => {
    expect(clampSwimlaneHeight(801)).toBe(SWIMLANE_MAX_HEIGHT)
    expect(clampSwimlaneHeight(99999)).toBe(SWIMLANE_MAX_HEIGHT)
  })

  it('NaN·비유한값은 DEFAULT를 반환한다', () => {
    expect(clampSwimlaneHeight(NaN)).toBe(SWIMLANE_DEFAULT_HEIGHT)
    expect(clampSwimlaneHeight(Infinity)).toBe(SWIMLANE_DEFAULT_HEIGHT)
    expect(clampSwimlaneHeight(-Infinity)).toBe(SWIMLANE_DEFAULT_HEIGHT)
  })
})
```

- [ ] **Step 2: 테스트 실패 확인**

Run: `npx vitest run src/renderer/src/lib/viewModel.test.ts`
Expected: FAIL — `clampSwimlaneHeight` 등 export가 없다는 오류

- [ ] **Step 3: 최소 구현**

`src/renderer/src/lib/viewModel.ts` 파일 끝에 추가:

```ts
export const SWIMLANE_DEFAULT_HEIGHT = 288 // 기존 h-72와 동일
export const SWIMLANE_MIN_HEIGHT = 160
export const SWIMLANE_MAX_HEIGHT = 800

export function clampSwimlaneHeight(px: number): number {
  if (!Number.isFinite(px)) return SWIMLANE_DEFAULT_HEIGHT
  return Math.min(SWIMLANE_MAX_HEIGHT, Math.max(SWIMLANE_MIN_HEIGHT, px))
}
```

- [ ] **Step 4: 테스트 통과 확인**

Run: `npx vitest run src/renderer/src/lib/viewModel.test.ts`
Expected: PASS (기존 테스트 포함 전부)

- [ ] **Step 5: 커밋**

```bash
git add src/renderer/src/lib/viewModel.ts src/renderer/src/lib/viewModel.test.ts
git commit -m "feat(swimlane): clampSwimlaneHeight 순수 함수 + 높이 상수"
```

---

### Task 2: viewStore — `swimlaneHeights` 상태 + persist v4

**Files:**
- Modify: `src/renderer/src/stores/viewStore.ts`
- Test: `src/renderer/src/stores/viewStore.test.ts` (기존 파일에 추가·수정)

**Interfaces:**
- Consumes: Task 1의 `clampSwimlaneHeight` (`../lib/viewModel`)
- Produces (Task 3이 사용):
  - `swimlaneHeights: Record<string, number>` — 키: 레인 이름(프로젝트명 또는 `(기타)`), 값: px. 기본 `{}`
  - `setSwimlaneHeight: (lane: string, px: number) => void` — 클램프 적용 후 불변 갱신
  - `resetSwimlaneHeight: (lane: string) => void` — 키 삭제 → 기본 높이 복귀
  - persist version 4, `partialize`에 `swimlaneHeights` 포함

- [ ] **Step 1: 실패하는 테스트 작성**

`src/renderer/src/stores/viewStore.test.ts` 수정. 주의: 이 파일 상단의 **인메모리 스토리지 교체 블록(Node 22 localStorage 함정 대응)은 그대로 둔다.**

(a) import 추가:

```ts
import { SWIMLANE_MIN_HEIGHT, SWIMLANE_MAX_HEIGHT } from '../lib/viewModel'
```

(b) 기존 테스트 `'persist version은 3이다'`를 다음으로 **교체**:

```ts
  it('persist version은 4이다', () => {
    expect(useViewStore.persist.getOptions().version).toBe(4)
  })
```

(c) 기존 테스트 `'partialize에 스윔레인 3필드가 포함된다'` 안에 어서션 1줄 추가:

```ts
    expect(partial).toHaveProperty('swimlaneHeights')
```

(d) 파일 끝에 describe 블록 2개 추가:

```ts
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
```

- [ ] **Step 2: 테스트 실패 확인**

Run: `npx vitest run src/renderer/src/stores/viewStore.test.ts`
Expected: FAIL — `setSwimlaneHeight` 미정의, version 3≠4, partialize에 `swimlaneHeights` 없음

- [ ] **Step 3: 구현**

`src/renderer/src/stores/viewStore.ts` 수정 5곳:

(a) import 추가 (파일 상단):

```ts
import { clampSwimlaneHeight } from '../lib/viewModel'
```

(b) `interface ViewState`에 필드·액션 추가 (`showEtcLane: boolean` 아래에 필드, `setShowEtcLane` 아래에 액션):

```ts
  swimlaneHeights: Record<string, number>
```

```ts
  setSwimlaneHeight: (lane: string, px: number) => void
  resetSwimlaneHeight: (lane: string) => void
```

(c) 스토어 본문 — `showEtcLane: true,` 아래에 초기값, `setShowEtcLane: ...` 아래에 액션 구현:

```ts
      swimlaneHeights: {},
```

```ts
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
```

(d) persist 옵션 — `version: 3` → `version: 4`, migrate에 v4 단계 추가 (`if (version < 3)` 블록 아래):

```ts
        if (version < 4) {
          const s4 = s as Record<string, unknown>
          s4.swimlaneHeights = {}
        }
```

(e) `partialize` 반환 객체에 추가:

```ts
        swimlaneHeights: state.swimlaneHeights
```

- [ ] **Step 4: 테스트 통과 확인**

Run: `npx vitest run src/renderer/src/stores/viewStore.test.ts`
Expected: PASS (기존 테스트 포함 전부)

- [ ] **Step 5: 전체 테스트 회귀 확인**

Run: `npm run test`
Expected: 전부 PASS

- [ ] **Step 6: 커밋**

```bash
git add src/renderer/src/stores/viewStore.ts src/renderer/src/stores/viewStore.test.ts
git commit -m "feat(swimlane): viewStore swimlaneHeights 상태 + persist v4 마이그레이션"
```

---

### Task 3: SwimlaneRow 리사이즈 핸들 UI + 육안 확인

**Files:**
- Modify: `src/renderer/src/components/kanban/SwimlaneRow.tsx` (전체 교체 수준)

**Interfaces:**
- Consumes:
  - Task 1: `clampSwimlaneHeight(px: number): number`, `SWIMLANE_DEFAULT_HEIGHT` (`../../lib/viewModel`)
  - Task 2: `useViewStore` 셀렉터로 `swimlaneHeights` / `setSwimlaneHeight` / `resetSwimlaneHeight` (`../../stores/viewStore`)
- Produces: 없음 (말단 UI). Props 인터페이스(`SwimlaneRowProps`)는 변경하지 않는다 — KanbanBoard.tsx 수정 없음.

참고: 이 컴포넌트는 순수 함수가 아니므로 단위 테스트 대상이 아니다(로직은 Task 1·2에서 전부 테스트됨). 검증은 아래 육안 확인 단계로 한다.

- [ ] **Step 1: SwimlaneRow.tsx 구현**

파일 전체를 다음으로 교체:

```tsx
import { useMemo, useRef, useState, type PointerEvent as ReactPointerEvent } from 'react'
import {
  clampSwimlaneHeight,
  groupNotes,
  makeSwimlaneDroppableId,
  STATUS_COLUMNS,
  SWIMLANE_DEFAULT_HEIGHT
} from '../../lib/viewModel'
import { useViewStore } from '../../stores/viewStore'
import { KanbanColumn } from './KanbanColumn'
import type { Note } from '@renderer/types'

interface SwimlaneRowProps {
  laneIndex: number
  lane: string
  notes: Note[]
  pageSize: number
}

export function SwimlaneRow({ laneIndex, lane, notes, pageSize }: SwimlaneRowProps): JSX.Element {
  const grouped = useMemo(() => groupNotes(notes, 'status'), [notes])
  const storedHeight = useViewStore((s) => s.swimlaneHeights[lane])
  const setSwimlaneHeight = useViewStore((s) => s.setSwimlaneHeight)
  const resetSwimlaneHeight = useViewStore((s) => s.resetSwimlaneHeight)
  // 저장값이 범위 밖이어도 렌더 시 클램프 (스펙 6장 엣지 케이스)
  const height = clampSwimlaneHeight(storedHeight ?? SWIMLANE_DEFAULT_HEIGHT)

  const [isDragging, setIsDragging] = useState(false)
  const dragStart = useRef<{ y: number; height: number } | null>(null)

  const handlePointerDown = (e: ReactPointerEvent<HTMLDivElement>): void => {
    e.currentTarget.setPointerCapture(e.pointerId)
    dragStart.current = { y: e.clientY, height }
    setIsDragging(true)
  }

  const handlePointerMove = (e: ReactPointerEvent<HTMLDivElement>): void => {
    if (!dragStart.current) return
    setSwimlaneHeight(lane, dragStart.current.height + (e.clientY - dragStart.current.y))
  }

  const endDrag = (e: ReactPointerEvent<HTMLDivElement>): void => {
    if (!dragStart.current) return
    dragStart.current = null
    setIsDragging(false)
    if (e.currentTarget.hasPointerCapture(e.pointerId)) {
      e.currentTarget.releasePointerCapture(e.pointerId)
    }
  }

  return (
    <div className={`flex flex-col flex-shrink-0${isDragging ? ' select-none' : ''}`}>
      <div className="flex items-center gap-2 mb-1">
        <span className="text-xs font-bold text-foreground uppercase tracking-widest">
          {lane}
        </span>
        <span className="text-xs text-muted-foreground">{notes.length}</span>
      </div>
      <div className="flex gap-3 overflow-x-auto pb-2" style={{ height }}>
        {STATUS_COLUMNS.map((status) => (
          <KanbanColumn
            key={status}
            columnId={makeSwimlaneDroppableId(laneIndex, status)}
            label={status}
            notes={grouped.get(status) ?? []}
            column={undefined}
            pageSize={pageSize}
          />
        ))}
      </div>
      <div
        role="separator"
        aria-orientation="horizontal"
        aria-label={`${lane} 레인 높이 조절`}
        className="h-1.5 cursor-row-resize rounded-sm hover:bg-accent/40"
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={endDrag}
        onPointerCancel={endDrag}
        onDoubleClick={() => resetSwimlaneHeight(lane)}
      />
    </div>
  )
}
```

구현 노트:
- 기존 `h-72` 클래스를 제거하고 인라인 `style={{ height }}`로 대체 (스펙 5장).
- 핸들 `h-1.5` = 6px. `hover:bg-accent/40`은 accent 토큰이라 `dark:` 병기 불필요 (Global Constraints 참조).
- 핸들은 dnd-kit droppable/draggable 외부 요소 — 카드 드래그와 간섭 없음.
- 드래그 중 `select-none`은 행 컨테이너에만 적용 (스펙 5장: 드래그 중 텍스트 선택 방지).
- 트랜지션/애니메이션 클래스 금지.

- [ ] **Step 2: 타입 체크 + lint + 전체 테스트**

Run: `npm run build`
Expected: 성공 (타입 오류 없음)

Run: `npm run lint`
Expected: 신규 오류 없음 (기존 driver.mjs:125 오류 1건만 잔존 — 건드리지 말 것)

Run: `npm run test`
Expected: 전부 PASS

- [ ] **Step 3: run-visual-check 육안 확인**

`run-visual-check` 프로젝트 스킬을 호출해 앱을 구동하고 다음 시나리오를 확인한다 (스윔레인 활성 + 프로젝트 레인 1개 이상인 설정은 스킬의 driver.mjs 설정 스왑 패턴 사용):

1. 스윔레인 화면 초기 스크린샷 — 각 레인 카드 영역 높이 288px, 레인 아래 6px 핸들 존재
2. 첫 레인 핸들에 pointer down → clientY +150px 이동 → up (드래그 시뮬레이션) → 스크린샷: 첫 레인만 높이 증가, 다른 레인 불변
3. 앱 재시작 → 스크린샷: 조절한 높이 유지 (persist 확인)
4. 핸들 더블클릭 → 스크린샷: 기본 높이(288px) 복귀
5. (선택) 핸들을 화면 밖까지 아래로 드래그 → 높이가 800px에서 멈춤 (클램프)

Expected: 5개 시나리오 모두 스크린샷으로 확인. 실패 시 수정 후 재확인.

- [ ] **Step 4: 커밋**

```bash
git add src/renderer/src/components/kanban/SwimlaneRow.tsx
git commit -m "feat(swimlane): 레인 하단 리사이즈 핸들 — 드래그 높이 조절·더블클릭 리셋"
```

---

## 완료 기준 (스펙 대비 체크)

- [ ] 레인별 개별 높이 드래그 조절 (요구 1) — Task 3
- [ ] persist로 재시작 후 유지, v3→v4 마이그레이션 (요구 2) — Task 2 + 육안 3
- [ ] 더블클릭 리셋 288px (요구 3) — Task 2·3 + 육안 4
- [ ] 저장 키 = 레인 이름, `(기타)` 포함 (요구 4) — Task 2 테스트
- [ ] 클램프 160~800, NaN→DEFAULT, 범위 밖 저장값 렌더 시 클램프 — Task 1·3
- [ ] 범위 제외 항목(공통 높이 모드, 레인 접기, 이름 변경 시 이전, 일반 칸반 컬럼) 미구현 확인
