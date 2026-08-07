# 스윔레인 레인 높이 드래그 조절 설계

- 날짜: 2026-08-07
- 상태: 사용자 승인된 접근(A안: 커스텀 리사이즈 핸들) 기반 설계
- 배경: 스윔레인 각 레인의 카드 영역 높이가 `h-72`(288px)로 고정되어 있어, 카드가 많은
  레인은 내부 스크롤로만 봐야 한다. 레인 하단 경계를 마우스로 끌어 높이를 조절할 수
  있게 한다.

## 1. 확정 요구사항

1. **레인별 개별 높이.** 각 레인의 하단 경계를 드래그해 그 레인만 높이가 바뀐다.
2. **영속화.** 조정한 높이는 앱 재시작 후에도 유지 (viewStore persist, 기존 스윔레인
   설정과 동일한 방식).
3. **더블클릭 리셋.** 핸들 더블클릭 시 해당 레인이 기본 높이(288px)로 돌아간다.
4. 저장 키는 레인 이름(프로젝트명 또는 `(기타)`) — 프로젝트를 레인에서 뺐다 다시
   넣어도 높이가 유지된다.

## 2. 거절한 대안

- **CSS `resize: vertical`**: 핸들이 우하단 구석에만 생기고 스타일 제어 불가,
  persist하려면 ResizeObserver가 필요해 커스텀 핸들 대비 이점 없음.
- **라이브러리(re-resizable 등)**: 한 축 리사이즈 하나에 의존성 추가는 과함 (ADR
  기록 의무 발생).

## 3. 상태 — viewStore

```ts
swimlaneHeights: Record<string, number>   // 키: 레인 이름, 값: px. 기본 {}
setSwimlaneHeight: (lane: string, px: number) => void   // 클램프 적용 후 불변 갱신
resetSwimlaneHeight: (lane: string) => void             // 키 삭제 → 기본 높이 복귀
```

- persist `partialize`에 `swimlaneHeights` 포함.
- persist 버전 v3→v4. migrate에서 `swimlaneHeights: {}` 주입.

## 4. 순수 함수 — viewModel.ts

```ts
export const SWIMLANE_DEFAULT_HEIGHT = 288  // 기존 h-72와 동일
export const SWIMLANE_MIN_HEIGHT = 160
export const SWIMLANE_MAX_HEIGHT = 800

// px를 [MIN, MAX]로 클램프. NaN/비유한값 → DEFAULT.
export function clampSwimlaneHeight(px: number): number
```

TDD 100% (viewModel.test.ts).

## 5. UI — SwimlaneRow

- 카드 영역의 `h-72` 고정 클래스 제거 → 인라인 `style={{ height }}`.
  `height = clampSwimlaneHeight(swimlaneHeights[lane] ?? SWIMLANE_DEFAULT_HEIGHT)`
  (저장값이 범위 밖이어도 렌더 시 클램프).
- 카드 영역 바로 아래 리사이즈 핸들 div:
  - 높이 6px, `cursor-row-resize`, hover 시 `bg-accent/40` (다크 모드 병기 —
    accent 토큰이라 양 테마 공통).
  - `onPointerDown`: `setPointerCapture`, 시작 clientY·시작 높이 기록.
  - `onPointerMove` (캡처 중): `시작높이 + (clientY − 시작Y)` → `setSwimlaneHeight`.
  - `onPointerUp` / `onPointerCancel`: 캡처 해제.
  - `onDoubleClick`: `resetSwimlaneHeight`.
- 드래그 중에만 `user-select: none` 적용 (텍스트 선택 방지).
- 애니메이션 없음 (UI 규칙: 애니메이션은 DnD·모달·스피너에만).

## 6. 엣지 케이스

| 상황 | 동작 |
|------|------|
| 저장된 높이가 클램프 범위 밖 | 렌더 시 클램프 적용 |
| 레인에서 프로젝트 제거 후 재추가 | 높이 유지 (키 잔존, 정리 로직 없음 — YAGNI) |
| 프로젝트 이름 변경 | 새 이름은 기본 높이 (의도된 동작) |
| dnd-kit 카드 드래그와 간섭 | 핸들은 droppable/draggable 외부 요소 — 간섭 없음 |
| 기타 레인 | `(기타)` 키로 동일하게 동작 |

## 7. 테스트 계획 (TDD)

| 대상 | 케이스 |
|------|--------|
| `clampSwimlaneHeight` | MIN 미만→MIN / MAX 초과→MAX / 범위 내 그대로 / NaN·Infinity→DEFAULT |
| viewStore | setSwimlaneHeight 클램프·불변 갱신 / resetSwimlaneHeight 키 삭제 / partialize에 swimlaneHeights 포함 / migrate v3→v4 기본값 주입 |
| 드래그 상호작용 | run-visual-check 패턴 육안 확인 (드래그 전후 스크린샷, 더블클릭 리셋) |

## 8. 범위 제외

- 전체 공통 높이 모드, 레인 접기/펼치기
- 프로젝트 이름 변경 시 높이 이전
- 일반 칸반(스윔레인 미사용) 컬럼 높이 조절
