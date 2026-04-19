# Phase 5: 지표 대시보드

## 필수 읽기

1. `CLAUDE.md`
2. `docs/PRD.md` § "핵심 기능 5"
3. `docs/ADR.md` ADR-010 (recharts 선택)
4. `docs/UI_GUIDE.md` § "색상", "여백 규칙"

---

## 범위

사이드바에 **대시보드** 메뉴를 추가한다. `recharts`로 4개 차트를 만든다:
1. 리드타임 히스토그램
2. 사이클타임 히스토그램
3. 처리량(Throughput) 바 차트
4. 누적 흐름도(CFD) 영역 차트

기간 필터(7/30/90일/전체). 데이터 부족 시 안내 표시. **CFD는 근사치임을 명시**한다 (created/started/completed 3시점 기반).

---

## 구현 작업 (순서대로)

### 1. 의존성 설치

```bash
npm install recharts
```

### 2. 순수 함수 테스트 먼저

**`src/renderer/src/lib/metrics.test.ts`에 추가**:
- `computeLeadTime(note)`: `completed - created` in days. completed 없으면 undefined.
- `computeCycleTime(note)`: `completed - started` in days. 둘 중 하나라도 없으면 undefined.
- `computeThroughput(notes, range, bucket)`: 주/일 단위로 `completed` 카운트.
- `buildCfd(notes, range, bucket)`: 날짜별 status별 노트 수. 중간 상태 역산 로직:
  - 노트의 시점 t에서:
    - t < created → 존재하지 않음
    - created ≤ t < started → "백로그"(근사)
    - started ≤ t < completed → "진행중"(근사)
    - t ≥ completed → "완료"
- 경계 케이스: 같은 날 created+started+completed, started 없이 completed만 있는 경우, 미래 날짜.

### 3. 차트 컴포넌트

**`Dashboard.tsx`** — 2x2 그리드. 상단 기간 선택 `Tabs` (7/30/90/전체).

**`LeadTimeChart.tsx`** / **`CycleTimeChart.tsx`** — `BarChart`로 히스토그램 + 평균선/중앙값선 (`ReferenceLine`).

**`ThroughputChart.tsx`** — `BarChart` + 7일 이동평균 `Line`.

**`CfdChart.tsx`** — `AreaChart` (stacked). 하단에 주석: "⚠️ 근사치: created/started/completed 3시점 기반. 중간 상태 이력은 반영되지 않습니다."

### 4. 데이터 부족 처리

각 차트별 최소 기준:
- 리드/사이클타임: completed 노트 3개 이상
- 처리량: 선택 기간 내 completed 1개 이상
- CFD: 전체 노트 5개 이상

미달 시: `<EmptyState>` — "완료 데이터가 아직 부족합니다. 최소 3개의 완료 노트가 필요합니다."

### 5. 사이드바 네비게이션

`Sidebar.tsx`에 대시보드 링크 추가 (`BarChart3` lucide 아이콘). 라우팅은 심플하게 `viewStore.route = 'kanban' | 'dashboard' | 'migration' | 'settings'`로 분기. (SPA 라우터 도입 금지 — ADR에 없음)

### 6. 색상 매핑

UI_GUIDE.md의 status 색 바 색을 차트 시리즈 색으로 재사용:
- 백로그 `slate-400` / 예정 `blue-500` / 진행중 `amber-500` / 검토 `violet-500` / 완료 `emerald-500`

CSS 변수로 추출해 다크/라이트 모드 모두 대응.

### 7. 성능

- 기간/데이터 변경 시 재계산은 `useMemo`. notes 배열 참조가 바뀔 때만.
- 노트 1000개 기준 CFD 생성이 150ms 이하로.

---

## 인터페이스 시그니처

```typescript
// metrics.ts 확장
export function computeLeadTime(note: Note): number | undefined;
export function computeCycleTime(note: Note): number | undefined;
export function computeThroughput(notes: Note[], range: DateRange, bucket: "day" | "week"): Array<{ date: string; count: number }>;
export function buildCfd(notes: Note[], range: DateRange, bucket: "day" | "week"): Array<{ date: string; 백로그: number; 예정: number; 진행중: number; 검토: number; 완료: number }>;

export type DateRange = { from: Date; to: Date };
```

---

## 수락 기준

- [ ] lint/build/test 전부 통과
- [ ] metrics 테스트 (lead/cycle/throughput/cfd 각각 최소 4케이스) 그린
- [ ] 실제 vault로 대시보드 진입 → 4개 차트 모두 표시 (또는 EmptyState)
- [ ] 기간 탭 전환 시 데이터 재계산 (최소 50노트 기준 200ms 이내)
- [ ] CFD 하단 근사치 경고 표시 확인
- [ ] 다크/라이트 모드 색상 가독성
- [ ] 노트 1000개 기준 대시보드 렌더 3초 이내

---

## 금지 사항

- D3.js, Chart.js 등 대체 차트 라이브러리 설치 금지 (ADR-010 위반).
- 차트에 3D, 그림자, 네온 효과 금지 (UI_GUIDE.md 애니메이션 규칙).
- CFD 중간 상태를 **추정하여 frontmatter에 쓰는 행위 금지**. 차트에서만 시각화 근사.
- `SPA 라우터`(react-router 등) 도입 금지. ADR에 없음. zustand `route` 필드만.
- 기간 필터를 localStorage 말고 settingsStore에 저장하지 말 것. UX 상태와 설정은 구분.

---

## 커밋 메시지 예시

```
feat(phase-5): 지표 대시보드 (리드/사이클/처리량/CFD)

- metrics: computeLeadTime/CycleTime/Throughput/buildCfd + 테스트
- recharts 기반 4개 차트 컴포넌트
- 기간 필터 (7/30/90/전체)
- 데이터 부족 EmptyState
- 사이드바 라우팅 (zustand route)
```
