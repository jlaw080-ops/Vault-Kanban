# 스윔레인(Swimlane) 설계 — 뷰 레벨 프로젝트 가로 밴드

- 날짜: 2026-08-06
- 상태: 사용자 승인된 접근(A안) 기반 설계
- 관련: PRD "MVP 제외: 스윔레인(가로 분할) — v0.2 이후로 미룸" 항목의 착수

## 1. 목표

status 그룹핑 칸반에서, 사용자가 선택한 프로젝트별로 보드를 가로 밴드(레인)로 분할한다.
상태 컬럼 5종(backlog/planned/in-progress/review/done)은 유지되고, 각 레인 안에서 반복된다.
데이터 스키마 변경 없음 — 기존 frontmatter `project` 필드를 그대로 사용한다.

## 2. 확정 요구사항

1. **뷰 레벨 스윔레인** — 데이터가 아니라 표시 방식. 스키마 변경 없음.
2. **선택식 레인** — 레인으로 볼 프로젝트를 사용자가 선택. 미선택 프로젝트 + 프로젝트 없는
   노트는 맨 아래 "(기타)" 레인 하나로 합쳐진다.
3. **레인 간 드래그 = frontmatter `project` 변경** — 상태 변경과 같은 gray-matter 저장 경로
   (`window.api.vault.writeNote`). 대각선 드롭은 상태+project 동시 변경.

## 3. 범위

- 스윔레인은 **status 그룹핑에서만** 활성. tag/folder/project 그룹핑에서는 토글 비활성(disabled).
- ControlBar에 토글 버튼 + 프로젝트 선택 팝오버(기존 필터 팝오버 패턴) + "기타 레인 표시" 체크.
- 선택·활성 상태는 viewStore persist (버전 3 마이그레이션 + 회귀 테스트).
- WIP 리밋 확인/표시는 스윔레인 뷰에서 **v1 생략** (레인 분할 시 컬럼별 한도 의미가 모호).
- PRD·CLAUDE.md의 "MVP 제외: 스윔레인" 항목을 v0.2 범위로 갱신.

### 범위 제외 (이번 작업에서 하지 않음)

- 레인별 접기/펼치기, 레인 순서 드래그 변경, 레인별 WIP 한도
- status 외 그룹핑에서의 스윔레인
- 레인 내 카드 수 페이지네이션 동작 변경 (KanbanColumn의 기존 pageSize 로직 그대로)

## 4. 아키텍처 (A안: KanbanBoard 확장)

### 4.1 순수 함수 — `src/renderer/src/lib/viewModel.ts`

```ts
export const ETC_LANE = '(기타)'

export interface SwimlaneGroup {
  lane: string            // 프로젝트명 또는 ETC_LANE
  notes: Note[]           // 이 레인에 속한 노트 (status 분배는 기존 groupNotes 재사용)
}

export function groupNotesBySwimlane(notes: Note[], selectedProjects: string[]): SwimlaneGroup[]
```

규칙:

- 레인 순서 = `selectedProjects` 배열 순서. 마지막에 `ETC_LANE`을 **항상** 추가한다
  (표시 여부는 렌더 계층이 `showEtcLane`으로 결정).
- `note.project`가 `selectedProjects`에 있으면 해당 레인, 아니면(미선택 프로젝트·project 없음)
  `ETC_LANE`.
- 선택된 프로젝트에 노트가 0개여도 레인은 반환한다 (빈 레인 = 드롭 타깃으로 필요).
- 입력을 변형하지 않는다 (불변).

레인 내부의 상태 컬럼 분배는 기존 `groupNotes(laneNotes, 'status')`를 레인별로 재호출한다.
정렬·필터는 기존 파이프라인(`filterNotes` → `sortNotes`)을 스윔레인 분배 **이전에** 적용하므로
변경 없음.

### 4.2 droppable id 복합키

- 컬럼 droppable id: `` `${laneIndex}::${status}` `` (예: `0::in-progress`, `2::done`).
  laneIndex는 `groupNotesBySwimlane` 결과 배열의 인덱스 — 프로젝트명에 `::`가 포함되어도
  안전하도록 **이름 대신 인덱스**를 쓴다.
- 파싱은 순수 헬퍼로 분리해 테스트한다:

```ts
// src/renderer/src/lib/viewModel.ts
export function parseSwimlaneDroppableId(id: string): { laneIndex: number; status: string } | null
```

- 스윔레인 비활성 시 droppable id는 기존 그대로(`status` 단일키) — 기존 동작 무변경.

### 4.3 컴포넌트 — `src/renderer/src/components/kanban/`

- **`SwimlaneRow.tsx` (신규)** — 레인 1개 렌더. 레인 라벨 헤더 + `KanbanColumn` 5개
  (columnId = 복합키). `KanbanColumn`/`KanbanCard`는 수정 없이 재사용 —
  `KanbanColumn`은 이미 `columnId`를 prop으로 받으므로 복합키를 그대로 넘기면 된다.
  WIP 생략을 위해 `column`(ColumnConfig)은 `undefined`로 전달 (기존 코드가 undefined 시
  WIP 표시를 건너뜀).
- **`KanbanBoard.tsx` (수정)** — 렌더 분기 추가:
  - `grouping === 'status' && swimlaneEnabled && swimlaneProjects.length > 0`이면 스윔레인 렌더
    (세로 스택된 `SwimlaneRow`들, 하나의 `DndContext` 공유).
  - 그 외에는 기존 렌더 경로 그대로.
  - `handleDragEnd`: over id가 복합키로 파싱되면 스윔레인 드롭 처리, 아니면 기존 로직.

### 4.4 드롭 처리 (스윔레인 모드)

`handleSwimlaneDrop(draggedNote, laneIndex, targetStatus)`:

1. 타깃 레인 결정: `lanes[laneIndex].lane`.
2. **project 변경 판정**:
   - 타깃이 프로젝트 레인이고 `draggedNote.project !== 타깃 프로젝트` → project 변경.
   - 타깃이 `ETC_LANE` → **project는 변경하지 않는다** (기타 레인은 "미선택 묶음"이라
     특정 project 값으로 환원 불가. 상태만 변경).
3. **status 변경 판정**: `targetStatus !== draggedNote.status` → `apply()`(statusTransition)로
   상태 전이 (done 타임스탬프 등 기존 규칙 재사용).
4. 둘 다 변경이면 하나의 updated Note로 합쳐 **writeNote 1회** 호출.
5. 변경 없으면 no-op. 실패 시 기존 패턴대로 toast + 롤백(`onNoteUpdate(draggedNote)`).
6. WIP 확인은 하지 않는다 (범위 4).

카드 위에 드롭한 경우(over id가 노트 filePath): 해당 카드가 속한 레인·컬럼으로 해석
(기존 `resolveTargetColumn` 패턴을 스윔레인용으로 확장).

### 4.5 상태 관리 — `src/renderer/src/stores/viewStore.ts`

추가 상태 (모두 persist 대상):

```ts
swimlaneEnabled: boolean      // 기본 false
swimlaneProjects: string[]    // 기본 [] — 레인 순서 = 배열 순서
showEtcLane: boolean          // 기본 true
setSwimlaneEnabled(v): void
toggleSwimlaneProject(p): void
setShowEtcLane(v): void
```

- persist `version: 2 → 3`. migrate에서 구버전에 세 필드 기본값 주입.
- `partialize`에 세 필드 추가. **과거 grouping 퍼시스트 버그(2026-05-04) 재발 방지**:
  partialize에 필드 누락 시 저장 안 되는 회귀를 테스트로 고정한다.
- 스윔레인 활성 중 grouping을 status 외로 바꾸면: `swimlaneEnabled`는 유지하되 렌더 분기에서
  자동으로 일반 보드로 폴백 (grouping을 status로 되돌리면 스윔레인 복귀). 토글 UI는 disabled.

### 4.6 UI — `src/renderer/src/components/layout/ControlBar.tsx`

- 필터 버튼 옆에 스윔레인 버튼 (lucide `Rows3` 아이콘 + "레인" 라벨).
  - `grouping !== 'status'`이면 `disabled` + title="상태 그룹핑에서만 사용 가능".
  - 클릭 시 팝오버 (기존 필터 팝오버와 동일한 구조: absolute + z-50 + 바깥 클릭 닫기).
- 팝오버 내용:
  - "스윔레인 사용" 체크 (swimlaneEnabled).
  - 프로젝트 칩 목록 (기존 필터 팝오버의 chip 패턴 재사용). 목록 = `allProjects` ∪
    `swimlaneProjects` — **노트에서 사라진 프로젝트도 선택 해제할 수 있도록** 선택된 항목은
    항상 표시.
  - "기타 레인 표시" 체크 (showEtcLane).
  - 활성인데 선택 0개면 안내 문구 "레인으로 볼 프로젝트를 선택하세요".
- 다크 모드: 기존 팝오버·칩 클래스 재사용이므로 추가 작업 없음. 이모지 금지·lucide 고정 준수.

## 5. 문서 갱신

- `docs/PRD.md`: "MVP 제외 사항"의 스윔레인 항목 → v0.2 범위로 이동, 본 설계 요약 반영.
- `CLAUDE.md`: "금지 사항"의 스윔레인 제거(또는 v0.2 진행 중으로 주석), PRD 참조 갱신.

## 6. 테스트 계획 (TDD — 구현 전 작성)

| 대상 | 파일 | 케이스 |
|------|------|--------|
| `groupNotesBySwimlane` | `viewModel.test.ts` | 레인 순서 = 선택 순서 / 미선택·무프로젝트 → 기타 / 빈 레인 유지 / 기타 항상 마지막 / 입력 불변 |
| `parseSwimlaneDroppableId` | `viewModel.test.ts` | 정상 파싱 / 단일키(기존 status id) → null / 잘못된 형식 → null |
| viewStore persist | `stores/viewStore.test.ts` (신규 또는 기존) | partialize에 swimlane 3필드 포함 / migrate v2→v3 기본값 주입 |
| 드롭 판정 | `KanbanBoard` 통합 테스트 (`tests/integration/` 기존 패턴) | 레인 간 이동 = project 변경 / 대각선 = status+project 동시 / 기타 레인 드롭 = status만 / 동일 위치 = no-op |

- 순수 함수는 100% 커버리지 (CLAUDE.md 규칙).
- 육안 확인: 구현 후 `run-visual-check` 스킬로 스윔레인 렌더 스크린샷 검증.

## 7. 엣지 케이스 정리

| 상황 | 동작 |
|------|------|
| 선택 프로젝트에 노트 0개 | 빈 레인 표시 (드롭 타깃 유지) |
| 노트에서 사라진 프로젝트가 선택에 남음 | 빈 레인 표시, 팝오버에서 해제 가능 |
| 기타 레인에 드롭 | status만 변경, project 보존 |
| swimlaneEnabled=true + 선택 0개 | 일반 보드 렌더 + 팝오버에 안내 문구 |
| status 외 그룹핑으로 전환 | 일반 보드로 자동 폴백, 설정은 보존 |
| 필터로 레인 내 노트 전부 제외 | 빈 레인 표시 (필터는 스윔레인 이전 단계) |

## 8. 구현 순서 (개요 — 상세는 implementation plan에서)

1. viewModel 순수 함수 + 테스트 (RED→GREEN)
2. viewStore 확장 + persist 회귀 테스트
3. SwimlaneRow + KanbanBoard 렌더 분기
4. 드롭 처리 + 통합 테스트
5. ControlBar UI
6. PRD·CLAUDE.md 갱신, 육안 확인, 커밋
