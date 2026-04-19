# Phase 3: 칸반 정석 기능 (WIP/정책/체류시간) + 그룹핑/정렬/필터

## 필수 읽기

1. `CLAUDE.md`
2. `docs/PRD.md` § "핵심 기능 2 (정석 기능)"
3. `docs/UI_GUIDE.md` § "색상 (체류시간)", "컴포넌트 스타일 (카드)"
4. `docs/ADR.md` ADR-004 (zustand), ADR-011 (상태 5단계)

---

## 범위

Phase 2의 기본 칸반에 **WIP Limit, 컬럼 정책(Definition of Done) 팝오버, 체류시간 색상 경고**를 얹는다. 그리고 **그룹핑 모드 4종(status / 태그 / 폴더 / AI 프로젝트) + 정렬 6종 + 필터(태그/폴더/우선순위/키워드)**를 추가한다.

AI 프로젝트 그룹핑은 필드만 읽는다 (`project` 필드 기준 그룹). 실제 AI 분류 실행은 Phase 6.

---

## 구현 작업 (순서대로)

### 1. 순수 함수 테스트 먼저

**`src/renderer/src/lib/metrics.test.ts`** — 체류시간 계산 검증:
- [진행중] 컬럼: `started`가 있으면 (now - started), 없으면 mtime 기준
- [백로그/예정]: created 기준
- [검토/완료]: 마지막 상태 변경 시각 기준 (근사치: mtime)
- 경계 케이스: created가 미래, mtime이 created보다 이전

**`src/renderer/src/lib/viewModel.test.ts`** — 그룹핑/정렬/필터 조합:
- status 그룹 + 수정일↓ 정렬
- 태그 그룹 (쉼표 없는 tag 이름만)
- 폴더 그룹 (vaultPath 기준 상대)
- project 그룹 (`project`가 없는 노트는 "미분류"로)
- 태그 AND 필터, 폴더 OR 필터, 우선순위 필터, 키워드(제목+본문) 필터 조합

구현은 테스트 통과한 뒤.

### 2. `viewStore` 확장

```typescript
interface ViewState {
  grouping: "status" | "tag" | "folder" | "project";
  sort: SortKey;
  filters: {
    tags: string[];        // AND
    folders: string[];     // OR
    priority: Priority | "none" | "all";
    keyword: string;
  };
}
```

localStorage 영속성 유지.

### 3. 컨트롤 바 UI

`TopBar` 아래 `ControlBar.tsx`:
- 그룹핑 Select
- 정렬 Select
- 필터 팝오버 (Command + MultiSelect 조합)
- 키워드 Input

### 4. WIP Limit 표시

- 컬럼 헤더: `진행중 (2/3)` 형식
- 초과 시 헤더 배경 `bg-red-50 dark:bg-red-950` + `AlertTriangle` 아이콘
- 드래그 중 초과 컬럼에 진입하면 테두리 빨간색
- 드롭 시 확인 Dialog: "WIP 제한(3개)을 초과합니다. 그래도 이동하시겠습니까?"
- **강제 차단 아님** — 사용자 결정 존중 (칸반 정석은 초과 허용 + 가시화)

### 5. 컬럼 정책 팝오버

- 컬럼 헤더에 `Info` lucide 아이콘
- 클릭 시 shadcn `Popover`로 해당 컬럼의 `policy` 마크다운 렌더
- 정책이 비어있으면 "정책이 아직 설정되지 않았습니다" + "설정에서 추가" 링크

### 6. 체류시간 색상

`KanbanCard`의 테두리를 `metrics.getStayDays(note, column)` 결과로 결정:
- `< yellow`: 기본 테두리
- `>= yellow && < red`: `border-amber-400`
- `>= red`: `border-red-500`

임계값은 `settingsStore.stayTimeWarnings`에서 읽기.

### 7. 폴더 모드 드래그 시 실제 파일 이동

- 그룹핑이 `folder`일 때 드래그앤드롭 → `fs.rename`
- **반드시 확인 Dialog**: "파일을 `/A/foo.md`에서 `/B/foo.md`로 이동합니다. 계속하시겠습니까?"
- 같은 폴더 내 파일명 충돌 시 에러 + 롤백
- 이동 후 vaultStore의 `filePath`/`relativePath` 갱신
- 추가 IPC: `vault:moveNote(oldPath, newPath)`

### 8. 태그 모드 드래그 시 태그 교체

- `tags` 배열에서 기존 그룹 태그 제거, 새 그룹 태그 추가
- 노트에 여러 태그가 있으면 다중 그룹에 **중복 표시** (참조 동일, 편집 시 주의)

### 9. AI 프로젝트 모드 드래그

- 프론트매터 `project` 필드만 교체. Phase 6과 동일 로직.
- 이번 Phase에서 "미분류" 그룹 처리만 제대로.

---

## 인터페이스 시그니처

```typescript
// src/renderer/src/lib/metrics.ts
export function getStayDays(note: Note, column: ColumnConfig, now: Date): number;
export function getStayColor(days: number, warn: { yellow: number; red: number }): "default" | "yellow" | "red";

// src/renderer/src/lib/viewModel.ts
export function groupNotes(notes: Note[], grouping: ViewState["grouping"]): Map<string, Note[]>;
export function sortNotes(notes: Note[], sort: SortKey): Note[];
export function filterNotes(notes: Note[], filters: ViewState["filters"]): Note[];

// vault IPC 확장
window.api.vault.moveNote(oldPath: string, newPath: string):
  Promise<{ ok: true } | { ok: false; error: string }>;
```

---

## 수락 기준

- [ ] lint/build/test 전부 통과
- [ ] `metrics.test.ts`, `viewModel.test.ts` 그린
- [ ] 4가지 그룹핑 모드 모두 동작, localStorage 유지
- [ ] WIP 초과 컬럼 시각화 + 드롭 시 확인 Dialog 표시
- [ ] 컬럼 헤더 Info 클릭 → 정책 팝오버 표시
- [ ] 3일/7일 경계에서 카드 테두리 색 전환 확인 (테스트로 자동화 + 수동 확인)
- [ ] 폴더 모드 드래그 → `fs.rename` 실제 실행 + 충돌 시 에러 처리
- [ ] 태그/폴더/우선순위/키워드 필터 모두 조합 가능
- [ ] 다크 모드에서 모든 경고 색 가독성 확인

---

## 금지 사항

- 그룹핑 모드를 zustand 스토어 '동작' 쪽에 넣지 말고 **파생 상태**로 계산 (메모이제이션)
- AI를 이 Phase에서 호출 금지 (Phase 6). `project` 필드 **읽기**만.
- 체류시간 색상을 카드 **배경**으로 적용 금지 (가독성 저하). 반드시 테두리.
- 폴더 이동 시 확인 Dialog 없이 바로 `fs.rename` 호출 금지. CRITICAL (데이터 손실 위험).
- WIP 초과를 **강제 차단**하지 말 것. 사용자 선택지 제공만.
- 필터 구현에 `useEffect` 안에서 zustand 읽기 + 다시 쓰기 루프 만들지 말 것. 순수 파생으로.

---

## 커밋 메시지 예시

```
feat(phase-3): WIP/정책/체류시간 + 그룹핑/정렬/필터

- metrics.ts (체류시간 계산) + 테스트
- viewModel.ts (그룹/정렬/필터 파생) + 테스트
- ControlBar 컴포넌트
- WipLimitIndicator + 컬럼 정책 Popover
- 폴더 모드 파일 이동 (vault:moveNote 신규 IPC)
```
