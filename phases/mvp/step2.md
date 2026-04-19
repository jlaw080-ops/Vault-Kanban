# Phase 2: 칸반 보드 + 드래그앤드롭

## 필수 읽기

1. `CLAUDE.md`
2. `docs/PRD.md` § "핵심 기능 2, 3"
3. `docs/ARCHITECTURE.md` § 2-2 (카드 드래그 → 파일 저장 흐름)
4. `docs/UI_GUIDE.md` (전체)
5. `docs/ADR.md` ADR-003, ADR-005, ADR-006, ADR-011

---

## 범위

Phase 1의 단순 테이블을 **5컬럼 칸반 보드**로 교체한다. `@dnd-kit`으로 드래그앤드롭을 구현하고, 카드 이동 시 실제 `.md` 파일의 frontmatter `status`를 수정한다. `started`/`completed` 자동 기록 로직 포함. **이번 Phase에서 그룹핑 모드는 `status` 하나만**.

---

## 구현 작업 (순서대로)

### 1. 의존성 설치

```bash
npm install @dnd-kit/core @dnd-kit/sortable @dnd-kit/utilities
npx shadcn@latest add dialog toast badge
```

### 2. 순수 함수 테스트 먼저 (TDD)

`src/renderer/src/lib/statusTransition.test.ts` 작성 — `started`/`completed` 자동 기록 규칙 검증:
- [진행중]으로 이동 시 `started == null`이면 현재시각 기록, 이미 있으면 보존
- [완료]로 이동 시 `completed` 항상 현재시각
- [완료]에서 다른 컬럼으로 이동 시 `completed = null`
- 그 외 컬럼 간 이동은 `started`/`completed` 변경 없음

그 다음 `src/renderer/src/lib/statusTransition.ts` 구현.

### 3. `vault:writeNote` 실제 구현

`src/main/ipc/vault.ts`에서:
- `fs.writeFile` 직전에 경로를 `recentlyWrittenByApp` Set에 추가 (TTL 1000ms)
- gray-matter의 `stringify`로 frontmatter + body 직렬화 (**키 순서 보존 필수**)
- 쓰기 실패 시 에러 객체 반환 (throw 말고 `{ok: false, error}`)

### 4. `noteParser.ts`에 `serializeNote` 추가

- gray-matter `stringify(note.body, frontmatterObj)` 사용
- 원본 파일의 YAML 키 순서를 유지하기 위해 파싱 시 원본 키 순서를 보존해두고 serialize 시 참조

### 5. 칸반 컴포넌트

**`KanbanBoard.tsx`** — 5개 컬럼을 가로로 배치. `DndContext` + `SortableContext` 래핑. `onDragEnd` 핸들러에서:
1. 이동 대상 컬럼 판단
2. `statusTransition.apply()`로 프론트매터 변경
3. `window.api.vault.writeNote()` 호출
4. `vaultStore.updateNote()`

**`KanbanColumn.tsx`** — `useDroppable`. 컬럼명 + 카드 수 표시. 상단 3px 색 바 (UI_GUIDE.md 시맨틱 색상).

**`KanbanCard.tsx`** — `useSortable`. 표시 요소: 제목(1줄 생략), 태그(최대 3개 + "+N"), 우선순위 점, 마감일 상대 표시, 폴더 경로.

### 6. 레이아웃 셸

`AppShell.tsx`(좌측 Sidebar + 중앙 KanbanBoard). `TopBar.tsx`는 현재 앱명만. 나머지는 이후 Phase.

### 7. 에러 처리

- 쓰기 실패 시 toast 표시
- 실패한 카드는 원래 컬럼으로 롤백
- frontmatter 파싱 실패 노트는 카드에 ⚠️ lucide 아이콘 (`AlertTriangle`) 표시

---

## 인터페이스 시그니처

```typescript
// src/renderer/src/lib/statusTransition.ts
export function apply(note: Note, newStatus: Status, now: Date): Note;

// vault IPC 확장
window.api.vault.writeNote(filePath: string, newContent: string):
  Promise<{ ok: true } | { ok: false; error: string }>;

// 컴포넌트 props
interface KanbanBoardProps {
  notes: Note[];
  columns: ColumnConfig[];
  onNoteUpdate: (updated: Note) => void;
}
```

---

## 수락 기준

- [ ] `npm run lint` / `npm run build` / `npm run test` 전부 통과
- [ ] `statusTransition.test.ts`의 모든 케이스 그린
- [ ] 카드를 다른 컬럼에 드래그 → 실제 `.md` 파일의 `status` 값이 변경됨 (Obsidian으로 열어 확인 가능)
- [ ] [진행중]으로 처음 이동 시 `started` 필드에 ISO 8601 타임스탬프 기록
- [ ] [완료]로 이동 시 `completed` 기록, 다시 다른 컬럼으로 이동 시 `completed = null`
- [ ] 드래그 중 카드 visual: `scale-105 shadow-lg` (UI_GUIDE.md 애니메이션 규칙)
- [ ] 쓰기 실패 시 토스트 + UI 롤백
- [ ] 다크 모드 전환 시 컬럼 색 바와 카드 모두 정상

---

## 금지 사항

- WIP Limit, 체류시간, 컬럼 정책 팝오버 **구현 금지** (Phase 3).
- 그룹핑 드롭다운 **구현 금지**. 이번엔 status 고정 (Phase 3에서 확장).
- 에디터 패널 **금지** (Phase 4).
- 드래그 중 카드에 `animate-pulse`, `animate-bounce` 금지. UI 가이드 위반.
- `rounded-xl` 이상의 카드 모서리 금지. `rounded-md`까지만.
- 렌더러에서 frontmatter를 정규식으로 재조립 금지. 반드시 메인 프로세스 IPC로 `serializeNote` 호출.

---

## 커밋 메시지 예시

```
feat(phase-2): 5컬럼 칸반 보드 + 드래그앤드롭

- @dnd-kit 기반 KanbanBoard/Column/Card 구현
- statusTransition 순수 함수 + 테스트
- vault:writeNote IPC 실제 구현 (gray-matter stringify)
- started/completed 자동 기록 규칙 적용
- 자기 쓰기 방지 Set (recentlyWrittenByApp)
```
