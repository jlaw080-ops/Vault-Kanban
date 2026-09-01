# To Do 관리 화면 + 프로젝트 이동 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** `06_To Do` 폴더의 할일을 전용 화면에서 관리하고, 티켓을 `01_Projects` 하위 폴더로 파일 이동 + frontmatter 동기화까지 한 번에 처리한다.

**Architecture:** 새 스토어를 만들지 않고 기존 `vaultStore.notes`에서 To Do 폴더 노트를 걸러 쓴다. 순수 함수는 `todoModel.ts`에 모으고, 파일을 실제로 옮기는 연산만 main 프로세스 IPC로 내린다. 이동은 "새 경로에 먼저 쓰고 원본을 지우는" 순서라 중간 실패 시 원본이 남는다.

**Tech Stack:** Electron 33 · TypeScript 5.5 strict · React 18 · zustand 5 (persist) · gray-matter · Tailwind + shadcn/ui(Radix Dialog) · lucide-react · Vitest + @testing-library/react

**Spec:** `docs/superpowers/specs/2026-09-01-todo-management-design.md`

## Global Constraints

- **TDD 필수.** 모든 태스크는 실패하는 테스트를 먼저 쓴다. 테스트 없는 구현은 Hook이 차단한다.
- **frontmatter는 `gray-matter`만 사용.** 정규식으로 직접 파싱·수정 금지.
- **렌더러에서 `fs`·Anthropic SDK·`safeStorage` 직접 사용 금지.** 반드시 `window.api.*` 경유.
- **`fs.writeFile`/`fs.unlink` 직전에 `recentlyWrittenByApp`에 경로 추가.** 자기 쓰기 재감지 루프 방지.
- **zustand 스토어는 세 개(`vaultStore`·`viewStore`·`settingsStore`)만.** 새 스토어 금지.
- **타입은 `src/renderer/src/types/index.ts`에만 정의.**
- **UI**: `bg-gradient-*`·`backdrop-blur-*`·`rounded-2xl` 이상 큰 모서리·보라/인디고 브랜드 색 금지. 모든 색상 클래스에 `dark:` 변형 병기. 아이콘은 `lucide-react`. UI 텍스트에 이모지 금지.
- **커밋 메시지**: Conventional Commits (`feat(todo): ...`, `fix(note): ...`, `test: ...`).
- **테스트 실행**: `npm run test`. 단일 파일은 `npx vitest run <경로>`.
- **zustand persist 스토어를 import하는 테스트 파일**은 파일 상단에 인메모리 스토리지 교체 블록이 필요하다(Node 22 실험적 webstorage가 `setItem` 없는 `localStorage`를 제공). 아래 블록을 그대로 복사한다.

```ts
import { createJSONStorage } from 'zustand/middleware'
import { useViewStore } from '<상대경로>/stores/viewStore'

const memoryStore = new Map<string, string>()
useViewStore.persist.setOptions({
  storage: createJSONStorage(() => ({
    getItem: (k: string) => memoryStore.get(k) ?? null,
    setItem: (k: string, v: string) => void memoryStore.set(k, v),
    removeItem: (k: string) => void memoryStore.delete(k)
  }))
})
```

---

## File Structure

| 파일 | 책임 | 태스크 |
|---|---|---|
| `src/renderer/src/types/index.ts` | `Note.extraFrontmatter`, `Settings.todoFolder`·`projectsFolder`, `TodoSortKey` 재노출 없음(타입 정본) | 1, 4 |
| `src/renderer/src/lib/noteParser.ts` | 미지 frontmatter 키 보존, `title` 조건부 기록 | 1 |
| `src/main/utils/metadataMenu.ts` | MM preset에서 `sub_project` 추가 수집 | 2 |
| `src/renderer/src/lib/todoModel.ts` (신규) | To Do 선별·정렬·검색, 폴더→frontmatter 파생, 파일 경로·본문 생성 | 3 |
| `src/main/ipc/settings.ts` | `todoFolder`·`projectsFolder` 기본값 | 4 |
| `src/renderer/src/stores/viewStore.ts` | `'todo'` 라우트, `todoSort`·`todoKeyword`, persist v5, Toast 액션 버튼 | 4 |
| `src/renderer/src/components/layout/AppShell.tsx` | 사이드바 항목, To Do 라우트 렌더, Toast 액션 버튼 렌더 | 4, 6 |
| `src/renderer/src/components/settings/SettingsPanel.tsx` | 폴더 경로 입력 두 개 | 4 |
| `src/main/ipc/vault.ts` | `moveNoteToProject`·`createNote` 구현 + 핸들러 등록 | 5 |
| `src/preload/index.ts`, `index.d.ts` | 두 IPC 노출 | 5 |
| `src/renderer/src/components/todo/TodoView.tsx` (신규) | 툴바 + 테이블. 라우트 진입점 | 6 |
| `src/renderer/src/components/todo/TodoRow.tsx` (신규) | 한 행. 인라인 편집 셀 | 6 |
| `src/renderer/src/components/todo/MoveToProjectDialog.tsx` (신규) | 폴더 선택 + frontmatter 미리보기 | 7 |
| `src/renderer/src/components/todo/NewTodoDialog.tsx` (신규) | 새 할일 입력 | 8 |

---

### Task 1: frontmatter 미지 키 보존

지금 앱에서 To Do 노트를 저장하면 `sub_project`·`category`·`works`·`updated`가 사라지고 없던 `title`이 주입된다. 이 기능의 전제조건이자 단독으로 검증 가능한 버그 수정이다.

**Files:**
- Modify: `src/renderer/src/types/index.ts` (Note 인터페이스)
- Modify: `src/renderer/src/lib/noteParser.ts`
- Test: `src/renderer/src/lib/noteParser.test.ts` (기존 파일에 describe 블록 추가)

**Interfaces:**
- Consumes: 없음
- Produces:
  - `Note.extraFrontmatter?: Record<string, unknown>`
  - `parseNote(filePath, raw, mtime, statusFieldName?)` — 반환 Note에 `extraFrontmatter` 포함
  - `serializeNote(note, statusFieldName?)` — `extraFrontmatter`를 원래 키 순서 자리에 복원

- [ ] **Step 1: 실패하는 테스트를 작성한다**

`src/renderer/src/lib/noteParser.test.ts` 맨 끝에 아래를 추가한다. 파일 상단 import에 `matter`가 없으면 `import matter from 'gray-matter'`를 추가한다.

```ts
describe('미지 frontmatter 키 보존', () => {
  const TODO_RAW = [
    '---',
    'project: 에너빌드',
    'sub_project: 에너지분석(에너빌드)',
    'priority: high',
    'category: action',
    'status: planned',
    'works: pending',
    'tags: []',
    'created: 2026-08-31',
    'updated:',
    'completed:',
    '---',
    '',
    '## 업무 개요',
    '- 확인'
  ].join('\n')

  it('parseNote는 KNOWN_KEYS 밖의 키를 extraFrontmatter에 담는다', () => {
    const note = parseNote('C:/v/06_To Do/a.md', TODO_RAW, 1)
    expect(note.extraFrontmatter).toEqual({
      sub_project: '에너지분석(에너빌드)',
      category: 'action',
      works: 'pending',
      updated: null
    })
  })

  it('serializeNote는 미지 키를 그대로 되쓴다', () => {
    const note = parseNote('C:/v/06_To Do/a.md', TODO_RAW, 1)
    const out = serializeNote(note)
    expect(out).toContain('sub_project: 에너지분석(에너빌드)')
    expect(out).toContain('category: action')
    expect(out).toContain('works: pending')
    expect(out).toContain('updated: null')
  })

  it('원본 키 순서를 유지한다', () => {
    const note = parseNote('C:/v/06_To Do/a.md', TODO_RAW, 1)
    const reparsed = matter(serializeNote(note))
    expect(Object.keys(reparsed.data)).toEqual([
      'project',
      'sub_project',
      'priority',
      'category',
      'status',
      'works',
      'tags',
      'created',
      'updated',
      'completed'
    ])
  })

  it('원본에 없던 title 을 주입하지 않는다', () => {
    const note = parseNote('C:/v/06_To Do/a.md', TODO_RAW, 1)
    expect(serializeNote(note)).not.toContain('title:')
  })

  it('frontmatter 가 없는 노트는 기존대로 title 을 기록한다', () => {
    const note = parseNote('C:/v/06_To Do/무제.md', '본문만 있는 노트', 1)
    expect(serializeNote(note)).toContain('title: 무제')
  })

  it('상태 필드가 한국어 키일 때 extraFrontmatter 에 중복되지 않는다', () => {
    const raw = ['---', '상태: 진행중', 'category: note', '---', '본문'].join('\n')
    const note = parseNote('C:/v/a.md', raw, 1, '상태')
    expect(note.extraFrontmatter).toEqual({ category: 'note' })
    const out = serializeNote(note, '상태')
    expect(out).toContain('상태: in-progress')
    expect(out.match(/상태:/g)).toHaveLength(1)
  })

  it('extraFrontmatter 가 알려진 키를 덮어쓰지 않는다', () => {
    const note = parseNote('C:/v/a.md', '---\nstatus: planned\n---\n본문', 1)
    const tampered = { ...note, extraFrontmatter: { status: '오염' } }
    expect(serializeNote(tampered)).toContain('status: planned')
  })
})
```

- [ ] **Step 2: 테스트가 실패하는지 확인한다**

Run: `npx vitest run src/renderer/src/lib/noteParser.test.ts`
Expected: FAIL — `extraFrontmatter` 가 `undefined`, `title: a` 가 출력에 포함됨

- [ ] **Step 3: `Note` 타입에 필드를 추가한다**

`src/renderer/src/types/index.ts`의 `Note` 인터페이스에서 `statusFieldKey?: string` 바로 아래에 추가한다.

```ts
  /** KNOWN_KEYS 및 상태 필드 밖의 frontmatter 키 원본값. 저장 시 그대로 복원한다. */
  extraFrontmatter?: Record<string, unknown>
```

- [ ] **Step 4: `parseNote`가 미지 키를 수집하게 한다**

`src/renderer/src/lib/noteParser.ts`에서 `if (originalKeyOrder.length > 0) note.originalKeyOrder = originalKeyOrder` **바로 위**에 아래를 삽입한다.

```ts
  const extra: Record<string, unknown> = {}
  for (const [key, value] of Object.entries(frontmatter)) {
    if ((KNOWN_KEYS as readonly string[]).includes(key)) continue
    if (key === effectiveStatusKey) continue
    if ((ALIAS_KEYS as readonly string[]).includes(key)) continue
    extra[key] = value
  }
  if (Object.keys(extra).length > 0) note.extraFrontmatter = extra
```

그리고 같은 파일에서 `const KNOWN_KEYS = [...] as const` 선언 **바로 아래**에 추가한다. (`KNOWN_KEYS`는 `parseNote`보다 아래에 선언돼 있지만, 함수 본문은 모듈 초기화 이후에 실행되므로 참조에 문제가 없다.)

```ts
/** 알려진 키의 한국어 별칭 — 값이 이미 KNOWN_KEYS 쪽으로 기록되므로 extra 로 중복 보관하지 않는다. */
const ALIAS_KEYS = ['우선순위', '상태'] as const
```

- [ ] **Step 5: `serializeNote`가 미지 키를 복원하고 title을 조건부로 쓰게 한다**

`src/renderer/src/lib/noteParser.ts`의 `buildFrontmatterMap` 을 아래로 교체한다.

```ts
/** 원본 frontmatter 에 title 이 있었을 때만 다시 쓴다. frontmatter 자체가 없던 노트는 기존 동작 유지. */
function shouldWriteTitle(note: Note): boolean {
  if (!note.originalKeyOrder || note.originalKeyOrder.length === 0) return true
  return note.originalKeyOrder.includes('title')
}

function buildFrontmatterMap(note: Note, statusFieldName: string): Record<string, unknown> {
  const effectiveKey = note.statusFieldKey ?? statusFieldName
  const data: Record<string, unknown> = {}
  if (shouldWriteTitle(note)) data.title = note.title
  data[effectiveKey] = note.status
  if (note.priority !== undefined) data.priority = note.priority
  if (note.due !== undefined) data.due = note.due
  data.tags = note.tags
  if (note.project !== undefined) data.project = note.project
  data.created = note.created
  if (note.started !== undefined) data.started = note.started
  if (note.completed !== undefined) data.completed = note.completed

  // 미지 키 복원 — 알려진 키를 덮지 않는다.
  for (const [key, value] of Object.entries(note.extraFrontmatter ?? {})) {
    if (key in data) continue
    data[key] = value
  }

  return data
}
```

- [ ] **Step 6: 테스트가 통과하는지 확인한다**

Run: `npx vitest run src/renderer/src/lib/noteParser.test.ts`
Expected: PASS

- [ ] **Step 7: 전체 테스트로 회귀를 확인한다**

Run: `npm run test`
Expected: 전부 PASS. 실패가 있으면 그 테스트가 `title` 자동 주입에 의존하던 것인지 확인하고, 의존하고 있으면 그 테스트의 기대값을 실제 원본 frontmatter 기준으로 고친다.

- [ ] **Step 8: 커밋한다**

```bash
git add src/renderer/src/types/index.ts src/renderer/src/lib/noteParser.ts src/renderer/src/lib/noteParser.test.ts
git commit -m "fix(note): frontmatter 미지 키 보존 + title 미주입"
```

---

### Task 2: MM preset에서 `sub_project` 읽기

**Files:**
- Modify: `src/main/utils/metadataMenu.ts`
- Modify: `src/renderer/src/lib/viewModel.ts:191-` (`presetMismatchMessage` 파라미터 타입 — 아래 Step 5 참조)
- Test: `src/main/utils/metadataMenu.test.ts` (기존 파일에 추가)

**Interfaces:**
- Consumes: 없음
- Produces: `PresetFieldValues { projects: string[]; subProjects: string[]; statuses: string[]; priorities: string[] }`

- [ ] **Step 1: 실패하는 테스트를 작성한다**

`src/main/utils/metadataMenu.test.ts` 맨 끝에 추가한다.

```ts
describe('sub_project preset', () => {
  it('sub_project Select 필드를 subProjects 로 읽는다', () => {
    const json = JSON.stringify({
      presetFields: [
        {
          name: 'sub_project',
          type: 'Select',
          options: {
            sourceType: 'ValuesList',
            valuesList: { '1': '디벨로퍼(에너빌드)', '2': ' 리포트(에너빌드)' }
          }
        }
      ]
    })
    const result = parseMetadataMenuPresets(json)
    expect(result?.subProjects).toEqual(['디벨로퍼(에너빌드)', '리포트(에너빌드)'])
  })

  it('sub_project 필드가 없으면 빈 배열이다', () => {
    const json = JSON.stringify({
      presetFields: [
        {
          name: 'project',
          type: 'Select',
          options: { sourceType: 'ValuesList', valuesList: { '1': '에너빌드' } }
        }
      ]
    })
    const result = parseMetadataMenuPresets(json)
    expect(result?.subProjects).toEqual([])
  })
})
```

- [ ] **Step 2: 테스트가 실패하는지 확인한다**

Run: `npx vitest run src/main/utils/metadataMenu.test.ts`
Expected: FAIL — `result.subProjects` 가 `undefined`

- [ ] **Step 3: 타입과 매핑을 넓힌다**

`src/main/utils/metadataMenu.ts` 상단 두 곳을 고친다.

```ts
export interface PresetFieldValues {
  projects: string[]
  subProjects: string[]
  statuses: string[]
  priorities: string[]
}

const FIELD_TO_KEY: Record<string, keyof PresetFieldValues> = {
  project: 'projects',
  sub_project: 'subProjects',
  status: 'statuses',
  priority: 'priorities'
}
```

- [ ] **Step 4: 초기값에 `subProjects`를 넣는다**

같은 파일 `parseMetadataMenuPresets` 안의 결과 초기화를 고친다.

```ts
  const result: PresetFieldValues = { projects: [], subProjects: [], statuses: [], priorities: [] }
```

- [ ] **Step 5: 타입 체크를 돌려 소비처 영향을 확인한다**

Run: `npx tsc --noEmit -p tsconfig.node.json && npx tsc --noEmit -p tsconfig.web.json`
Expected: PASS. `presetMismatchMessage(preset: { statuses; priorities })` 는 구조적 부분 타입이라 필드가 늘어도 그대로 통과한다. 오류가 나면 그 호출부의 인자 타입만 넓히고 로직은 건드리지 않는다.

- [ ] **Step 6: 테스트가 통과하는지 확인한다**

Run: `npm run test`
Expected: PASS

- [ ] **Step 7: 커밋한다**

```bash
git add src/main/utils/metadataMenu.ts src/main/utils/metadataMenu.test.ts
git commit -m "feat(metadata-menu): sub_project preset 읽기"
```

---

### Task 3: `todoModel.ts` 순수 함수

**Files:**
- Create: `src/renderer/src/lib/todoModel.ts`
- Test: `src/renderer/src/lib/todoModel.test.ts`

**Interfaces:**
- Consumes: Task 1의 `Note.extraFrontmatter`
- Produces:
  - `type TodoSortKey = 'createdDesc' | 'dueAsc' | 'priorityDesc' | 'status'`
  - `interface ProjectMeta { project: string; subProject: string | null; offPreset: { project: boolean; subProject: boolean } }`
  - `selectTodoNotes(notes, todoFolder): Note[]`
  - `deriveProjectMeta(destRelPath, projectsFolder, preset): ProjectMeta`
  - `suggestProjectFolders(folderPaths, currentProject): string[]`
  - `sortTodos(notes, key, statusOrder): Note[]`
  - `filterTodosByKeyword(notes, keyword): Note[]`
  - `sanitizeTodoTitle(title): string`
  - `buildTodoFilePath(vaultPath, todoFolder, title, now): string`
  - `buildTodoNoteContent(input): string`
  - `getSubProject(note): string | null`

- [ ] **Step 1: 실패하는 테스트를 작성한다**

`src/renderer/src/lib/todoModel.test.ts` 를 새로 만든다.

```ts
import { describe, it, expect } from 'vitest'
import matter from 'gray-matter'
import {
  selectTodoNotes,
  deriveProjectMeta,
  suggestProjectFolders,
  sortTodos,
  filterTodosByKeyword,
  sanitizeTodoTitle,
  buildTodoFilePath,
  buildTodoNoteContent,
  getSubProject
} from './todoModel'
import type { Note } from '@renderer/types'

function makeNote(overrides: Partial<Note> = {}): Note {
  return {
    filePath: 'C:/v/06_To Do/2026-08/a.md',
    relativePath: '06_To Do/2026-08/a.md',
    title: 'a',
    status: 'planned',
    tags: [],
    created: '2026-08-31',
    body: '',
    mtime: 1,
    ...overrides
  }
}

const PRESET = {
  projects: ['신재생에너지제안(EPC)', '에너빌드', 'BIPV특허기획'],
  subProjects: ['디벨로퍼(에너빌드)', '에너지분석(에너빌드)', 'RTU개발및시제품제작']
}

describe('selectTodoNotes', () => {
  it('todoFolder 아래 노트만 고른다', () => {
    const notes = [
      makeNote({ relativePath: '06_To Do/2026-08/a.md' }),
      makeNote({ relativePath: '06_To Do/무제.md' }),
      makeNote({ relativePath: '01_Projects/02_에너빌드/b.md' })
    ]
    expect(selectTodoNotes(notes, '06_To Do').map((n) => n.relativePath)).toEqual([
      '06_To Do/2026-08/a.md',
      '06_To Do/무제.md'
    ])
  })

  it('역슬래시 경로도 처리한다', () => {
    const notes = [makeNote({ relativePath: '06_To Do\\2026-08\\a.md' })]
    expect(selectTodoNotes(notes, '06_To Do')).toHaveLength(1)
  })

  it('이름이 접두사로 겹치는 다른 폴더는 제외한다', () => {
    const notes = [makeNote({ relativePath: '06_To Done/a.md' })]
    expect(selectTodoNotes(notes, '06_To Do')).toHaveLength(0)
  })

  it('todoFolder 가 비면 빈 배열이다', () => {
    expect(selectTodoNotes([makeNote()], '')).toEqual([])
  })
})

describe('deriveProjectMeta', () => {
  it('숫자 접두를 떼고 preset 표기로 보정한다', () => {
    const r = deriveProjectMeta('01_Projects/02_에너빌드/03_에너지분석', '01_Projects', PRESET)
    expect(r.project).toBe('에너빌드')
    expect(r.subProject).toBe('에너지분석(에너빌드)')
    expect(r.offPreset).toEqual({ project: false, subProject: false })
  })

  it('1단 폴더면 subProject 는 null 이다', () => {
    const r = deriveProjectMeta('01_Projects/BIPV특허기획', '01_Projects', PRESET)
    expect(r.project).toBe('BIPV특허기획')
    expect(r.subProject).toBeNull()
    expect(r.offPreset.project).toBe(false)
  })

  it('project 보정 실패 시 파생값을 쓰고 offPreset 을 세운다', () => {
    const r = deriveProjectMeta('01_Projects/01_신재생에너지검토제안(EPC)', '01_Projects', PRESET)
    expect(r.project).toBe('신재생에너지검토제안(EPC)')
    expect(r.offPreset.project).toBe(true)
  })

  it('subProject 보정 실패 시 값을 지어내지 않고 null 을 준다', () => {
    const r = deriveProjectMeta(
      '01_Projects/01_신재생에너지검토제안(EPC)/0813_데이터센터사업',
      '01_Projects',
      PRESET
    )
    expect(r.subProject).toBeNull()
    expect(r.offPreset.subProject).toBe(true)
  })

  it('부분 일치 후보가 둘 이상이면 보정하지 않는다', () => {
    const preset = { projects: [], subProjects: ['분석(A)', '분석(B)'] }
    const r = deriveProjectMeta('01_Projects/X/분석', '01_Projects', preset)
    expect(r.subProject).toBeNull()
  })

  it('projectsFolder 자체를 고르면 project 가 비고 offPreset 이 선다', () => {
    const r = deriveProjectMeta('01_Projects', '01_Projects', PRESET)
    expect(r.project).toBe('')
    expect(r.offPreset.project).toBe(true)
  })
})

describe('suggestProjectFolders', () => {
  it('현재 project 와 겹치는 폴더만 돌려준다', () => {
    const folders = [
      '01_Projects/02_에너빌드',
      '01_Projects/02_에너빌드/03_에너지분석',
      '01_Projects/11_BIPV화재진단기술'
    ]
    expect(suggestProjectFolders(folders, '에너빌드')).toEqual([
      '01_Projects/02_에너빌드',
      '01_Projects/02_에너빌드/03_에너지분석'
    ])
  })

  it('currentProject 가 없으면 빈 배열이다', () => {
    expect(suggestProjectFolders(['01_Projects/02_에너빌드'], undefined)).toEqual([])
  })
})

describe('sortTodos', () => {
  const STATUS_ORDER = ['backlog', 'planned', 'in-progress', 'review', 'done']

  it('createdDesc: 최신 우선, 값 없는 노트는 뒤로', () => {
    const notes = [
      makeNote({ title: 'old', created: '2026-01-01' }),
      makeNote({ title: 'none', created: '' }),
      makeNote({ title: 'new', created: '2026-08-31' })
    ]
    expect(sortTodos(notes, 'createdDesc', STATUS_ORDER).map((n) => n.title)).toEqual([
      'new',
      'old',
      'none'
    ])
  })

  it('dueAsc: 임박 우선, 마감 없는 노트는 뒤로', () => {
    const notes = [
      makeNote({ title: 'none' }),
      makeNote({ title: 'late', due: '2026-12-31' }),
      makeNote({ title: 'soon', due: '2026-09-02' })
    ]
    expect(sortTodos(notes, 'dueAsc', STATUS_ORDER).map((n) => n.title)).toEqual([
      'soon',
      'late',
      'none'
    ])
  })

  it('priorityDesc: high → mid → low → 없음', () => {
    const notes = [
      makeNote({ title: 'none' }),
      makeNote({ title: 'low', priority: 'low' }),
      makeNote({ title: 'high', priority: 'high' }),
      makeNote({ title: 'mid', priority: 'mid' })
    ]
    expect(sortTodos(notes, 'priorityDesc', STATUS_ORDER).map((n) => n.title)).toEqual([
      'high',
      'mid',
      'low',
      'none'
    ])
  })

  it('status: statusOrder 순서, 목록 밖 상태는 뒤로', () => {
    const notes = [
      makeNote({ title: 'weird', status: '알수없음' as Note['status'] }),
      makeNote({ title: 'done', status: 'done' }),
      makeNote({ title: 'backlog', status: 'backlog' })
    ]
    expect(sortTodos(notes, 'status', STATUS_ORDER).map((n) => n.title)).toEqual([
      'backlog',
      'done',
      'weird'
    ])
  })

  it('원본 배열을 바꾸지 않는다', () => {
    const notes = [makeNote({ title: 'b' }), makeNote({ title: 'a' })]
    const before = notes.map((n) => n.title)
    sortTodos(notes, 'priorityDesc', STATUS_ORDER)
    expect(notes.map((n) => n.title)).toEqual(before)
  })
})

describe('filterTodosByKeyword', () => {
  it('제목·project·sub_project 를 대소문자 무시로 찾는다', () => {
    const notes = [
      makeNote({ title: 'BIPV 조달 확인' }),
      makeNote({ title: '다른 건', project: '에너빌드' }),
      makeNote({ title: '또 다른 건', extraFrontmatter: { sub_project: '에너지분석(에너빌드)' } }),
      makeNote({ title: '무관' })
    ]
    expect(filterTodosByKeyword(notes, '에너빌드')).toHaveLength(2)
    expect(filterTodosByKeyword(notes, 'bipv')).toHaveLength(1)
  })

  it('키워드가 비면 전부 돌려준다', () => {
    const notes = [makeNote(), makeNote()]
    expect(filterTodosByKeyword(notes, '   ')).toHaveLength(2)
  })
})

describe('getSubProject', () => {
  it('문자열 sub_project 만 돌려준다', () => {
    expect(getSubProject(makeNote({ extraFrontmatter: { sub_project: 'X' } }))).toBe('X')
    expect(getSubProject(makeNote({ extraFrontmatter: { sub_project: null } }))).toBeNull()
    expect(getSubProject(makeNote())).toBeNull()
  })
})

describe('sanitizeTodoTitle', () => {
  it('파일명 금지 문자를 지운다', () => {
    expect(sanitizeTodoTitle('a/b:c*d?e"f<g>h|i')).toBe('abcdefghi')
  })

  it('빈 제목은 무제로 바꾼다', () => {
    expect(sanitizeTodoTitle('   ')).toBe('무제')
  })

  it('120자로 자른다', () => {
    expect(sanitizeTodoTitle('가'.repeat(200))).toHaveLength(120)
  })
})

describe('buildTodoFilePath', () => {
  it('월 폴더와 MMDD 접두를 붙인다', () => {
    const path = buildTodoFilePath('C:/v', '06_To Do', 'BIPV 확인', new Date(2026, 8, 1))
    expect(path).toBe('C:/v/06_To Do/2026-09/0901_BIPV 확인.md')
  })

  it('역슬래시 볼트 경로를 정규화한다', () => {
    const path = buildTodoFilePath('C:\\v\\', '06_To Do', 'x', new Date(2026, 11, 25))
    expect(path).toBe('C:/v/06_To Do/2026-12/1225_x.md')
  })
})

describe('buildTodoNoteContent', () => {
  it('볼트 관례와 같은 키 순서로 frontmatter 를 만든다', () => {
    const content = buildTodoNoteContent({
      title: 'x',
      project: '에너빌드',
      subProject: '에너지분석(에너빌드)',
      priority: 'high',
      now: new Date(2026, 8, 1)
    })
    const parsed = matter(content)
    expect(Object.keys(parsed.data)).toEqual([
      'project',
      'sub_project',
      'priority',
      'category',
      'status',
      'works',
      'tags',
      'created',
      'updated',
      'completed'
    ])
    expect(parsed.data.category).toBe('action')
    expect(parsed.data.status).toBe('planned')
    expect(parsed.data.created).toBe('2026-09-01')
    expect(parsed.content).toContain('## 업무 개요')
  })

  it('project 를 안 주면 빈 값으로 둔다', () => {
    const parsed = matter(
      buildTodoNoteContent({ title: 'x', priority: 'mid', now: new Date(2026, 8, 1) })
    )
    expect(parsed.data.project).toBeNull()
    expect(parsed.data.sub_project).toBeNull()
  })
})
```

- [ ] **Step 2: 테스트가 실패하는지 확인한다**

Run: `npx vitest run src/renderer/src/lib/todoModel.test.ts`
Expected: FAIL — `Failed to resolve import "./todoModel"`

- [ ] **Step 3: 구현한다**

`src/renderer/src/lib/todoModel.ts` 를 새로 만든다.

```ts
import matter from 'gray-matter'
import type { Note, Priority } from '@renderer/types'

export type TodoSortKey = 'createdDesc' | 'dueAsc' | 'priorityDesc' | 'status'

export interface ProjectMeta {
  project: string
  subProject: string | null
  /** preset 목록으로 보정하지 못한 값. 대화상자에서 경고를 띄운다. */
  offPreset: { project: boolean; subProject: boolean }
}

const NUMERIC_PREFIX = /^\d+[_-]\s*/
const FORBIDDEN_FILENAME_CHARS = /[\\/:*?"<>|]/g
const MAX_TITLE_LENGTH = 120
const MIN_SUGGEST_SEGMENT = 2

const PRIORITY_RANK: Record<Priority, number> = { high: 0, mid: 1, low: 2 }
const NO_PRIORITY_RANK = 99

function normalizePath(p: string): string {
  return p.replace(/\\/g, '/')
}

function trimSlashes(p: string): string {
  return p.replace(/^\/+|\/+$/g, '')
}

function pad2(n: number): string {
  return String(n).padStart(2, '0')
}

function stripNumericPrefix(segment: string): string {
  return segment.replace(NUMERIC_PREFIX, '').trim()
}

/** note.extraFrontmatter.sub_project 를 문자열일 때만 돌려준다. */
export function getSubProject(note: Note): string | null {
  const raw = note.extraFrontmatter?.sub_project
  return typeof raw === 'string' && raw.length > 0 ? raw : null
}

export function selectTodoNotes(notes: readonly Note[], todoFolder: string): Note[] {
  const folder = trimSlashes(normalizePath(todoFolder))
  if (folder.length === 0) return []
  const prefix = `${folder}/`
  return notes.filter((n) => normalizePath(n.relativePath).startsWith(prefix))
}

/** preset 목록에서 후보와 같거나 후보를 포함하는 항목이 정확히 하나면 그 표기를 돌려준다. */
function correctWithPreset(candidate: string, preset: readonly string[]): string | null {
  if (candidate.length === 0) return null
  if (preset.includes(candidate)) return candidate
  const contains = preset.filter((p) => p.includes(candidate))
  return contains.length === 1 ? contains[0] : null
}

export function deriveProjectMeta(
  destRelPath: string,
  projectsFolder: string,
  preset: { projects: readonly string[]; subProjects: readonly string[] }
): ProjectMeta {
  const dest = trimSlashes(normalizePath(destRelPath))
  const root = trimSlashes(normalizePath(projectsFolder))

  let rest = dest
  if (root.length > 0) {
    if (dest === root) rest = ''
    else if (dest.startsWith(`${root}/`)) rest = dest.slice(root.length + 1)
  }

  const segments = rest
    .split('/')
    .filter((s) => s.length > 0)
    .map(stripNumericPrefix)

  if (segments.length === 0) {
    return { project: '', subProject: null, offPreset: { project: true, subProject: false } }
  }

  const projectCandidate = segments[0]
  const projectCorrected = correctWithPreset(projectCandidate, preset.projects)

  let subProject: string | null = null
  let subOffPreset = false
  if (segments.length >= 2) {
    const subCandidate = segments[segments.length - 1]
    // 보정에 실패하면 값을 지어내지 않는다. 폴더 2단계가 항상 sub_project 개념은 아니다.
    subProject = correctWithPreset(subCandidate, preset.subProjects)
    subOffPreset = subProject === null
  }

  return {
    project: projectCorrected ?? projectCandidate,
    subProject,
    offPreset: { project: projectCorrected === null, subProject: subOffPreset }
  }
}

export function suggestProjectFolders(
  folderPaths: readonly string[],
  currentProject: string | undefined
): string[] {
  const key = (currentProject ?? '').trim()
  if (key.length === 0) return []
  return folderPaths.filter((path) =>
    normalizePath(path)
      .split('/')
      .filter((s) => s.length > 0)
      .map(stripNumericPrefix)
      .some(
        (seg) =>
          seg.length >= MIN_SUGGEST_SEGMENT && (seg.includes(key) || key.includes(seg))
      )
  )
}

function byTitle(a: Note, b: Note): number {
  return a.title.localeCompare(b.title, 'ko')
}

/** 빈 값을 항상 뒤로 보내는 문자열 비교. dir 이 -1 이면 내림차순. */
function compareOptionalText(a: string, b: string, dir: 1 | -1): number | null {
  if (a === b) return null
  if (a.length === 0) return 1
  if (b.length === 0) return -1
  return a.localeCompare(b) * dir
}

export function sortTodos(
  notes: readonly Note[],
  key: TodoSortKey,
  statusOrder: readonly string[]
): Note[] {
  const copy = [...notes]
  copy.sort((a, b) => {
    if (key === 'createdDesc') {
      return compareOptionalText(a.created ?? '', b.created ?? '', -1) ?? byTitle(a, b)
    }
    if (key === 'dueAsc') {
      return compareOptionalText(a.due ?? '', b.due ?? '', 1) ?? byTitle(a, b)
    }
    if (key === 'priorityDesc') {
      const ar = a.priority ? PRIORITY_RANK[a.priority] : NO_PRIORITY_RANK
      const br = b.priority ? PRIORITY_RANK[b.priority] : NO_PRIORITY_RANK
      return ar === br ? byTitle(a, b) : ar - br
    }
    const ai = statusOrder.indexOf(a.status)
    const bi = statusOrder.indexOf(b.status)
    const an = ai === -1 ? NO_PRIORITY_RANK : ai
    const bn = bi === -1 ? NO_PRIORITY_RANK : bi
    return an === bn ? byTitle(a, b) : an - bn
  })
  return copy
}

export function filterTodosByKeyword(notes: readonly Note[], keyword: string): Note[] {
  const k = keyword.trim().toLowerCase()
  if (k.length === 0) return [...notes]
  return notes.filter((n) => {
    const haystack = [n.title, n.project ?? '', getSubProject(n) ?? ''].join('\n').toLowerCase()
    return haystack.includes(k)
  })
}

export function sanitizeTodoTitle(title: string): string {
  const cleaned = title.replace(FORBIDDEN_FILENAME_CHARS, '').trim()
  if (cleaned.length === 0) return '무제'
  return cleaned.slice(0, MAX_TITLE_LENGTH)
}

export function buildTodoFilePath(
  vaultPath: string,
  todoFolder: string,
  title: string,
  now: Date
): string {
  const root = normalizePath(vaultPath).replace(/\/+$/, '')
  const folder = trimSlashes(normalizePath(todoFolder))
  const month = `${now.getFullYear()}-${pad2(now.getMonth() + 1)}`
  const day = `${pad2(now.getMonth() + 1)}${pad2(now.getDate())}`
  return `${root}/${folder}/${month}/${day}_${sanitizeTodoTitle(title)}.md`
}

const TODO_BODY = ['## 업무 개요', '- ', '', '## 출처', '- ', '', '## 배경', '- '].join('\n')

export function buildTodoNoteContent(input: {
  title: string
  project?: string
  subProject?: string
  priority: Priority
  now: Date
}): string {
  const { now } = input
  const created = `${now.getFullYear()}-${pad2(now.getMonth() + 1)}-${pad2(now.getDate())}`
  const data: Record<string, unknown> = {
    project: input.project ?? null,
    sub_project: input.subProject ?? null,
    priority: input.priority,
    category: 'action',
    status: 'planned',
    works: null,
    tags: [],
    created,
    updated: null,
    completed: null
  }
  // 파일 오브젝트를 넘겨 gray-matter 가 본문을 다시 파싱하지 않게 한다 (noteParser.ts 와 같은 이유).
  return matter.stringify(
    { content: TODO_BODY, data: {} } as unknown as matter.GrayMatterFile<string>,
    data
  )
}
```

- [ ] **Step 4: 테스트가 통과하는지 확인한다**

Run: `npx vitest run src/renderer/src/lib/todoModel.test.ts`
Expected: PASS (전체 케이스)

- [ ] **Step 5: lint 와 타입 체크를 돌린다**

Run: `npm run lint`
Expected: 새 파일에서 오류 없음. `.claude/skills/run-visual-check/driver.mjs:125` 의 기존 오류 1건은 이 브랜치와 무관하니 고치지 않는다.

- [ ] **Step 6: 커밋한다**

```bash
git add src/renderer/src/lib/todoModel.ts src/renderer/src/lib/todoModel.test.ts
git commit -m "feat(todo): todoModel 순수 함수"
```

---

### Task 4: Settings 두 키 + viewStore persist v5 + Toast 액션

**Files:**
- Modify: `src/renderer/src/types/index.ts` (`Settings`)
- Modify: `src/main/ipc/settings.ts` (`DEFAULT_SETTINGS`)
- Modify: `src/renderer/src/stores/viewStore.ts`
- Modify: `src/renderer/src/components/layout/AppShell.tsx` (Toast 액션 버튼 렌더)
- Modify: `src/renderer/src/components/settings/SettingsPanel.tsx`
- Test: `src/renderer/src/stores/viewStore.test.ts` (기존 파일에 추가)

**Interfaces:**
- Consumes: Task 3의 `TodoSortKey`
- Produces:
  - `Settings.todoFolder: string`, `Settings.projectsFolder: string`
  - `AppRoute` 에 `'todo'` 추가
  - `viewStore.todoSort: TodoSortKey`, `viewStore.todoKeyword: string`
  - `setTodoSort(key)`, `setTodoKeyword(keyword)`
  - `Toast.action?: { label: string; onClick: () => void }`
  - `pushToast(message, variant?, durationMs?, action?)`

- [ ] **Step 1: 실패하는 테스트를 작성한다**

`src/renderer/src/stores/viewStore.test.ts` 맨 끝에 추가한다.

```ts
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
```

- [ ] **Step 2: 테스트가 실패하는지 확인한다**

Run: `npx vitest run src/renderer/src/stores/viewStore.test.ts`
Expected: FAIL — `todoSort` 가 `undefined`, `version` 이 4

- [ ] **Step 3: `Settings` 타입에 두 키를 추가한다**

`src/renderer/src/types/index.ts` 의 `Settings` 인터페이스에서 `cardFields: CardField[]` 바로 위에 추가한다.

```ts
  /** 볼트 루트 기준 상대 경로. To Do 화면이 읽는 폴더 */
  todoFolder: string
  /** 볼트 루트 기준 상대 경로. 티켓을 옮길 프로젝트 루트 */
  projectsFolder: string
```

- [ ] **Step 4: 기본값을 넣는다**

`src/main/ipc/settings.ts` 의 `DEFAULT_SETTINGS` 에서 `cardFields:` 줄 위에 추가한다.

```ts
  todoFolder: '06_To Do',
  projectsFolder: '01_Projects',
```

- [ ] **Step 5: viewStore 를 확장한다**

`src/renderer/src/stores/viewStore.ts` 를 아래 다섯 곳 고친다.

(1) import 와 Toast 타입:

```ts
import type { TodoSortKey } from '../lib/todoModel'

export interface ToastAction {
  label: string
  onClick: () => void
}

export interface Toast {
  id: string
  message: string
  variant: ToastVariant
  action?: ToastAction
}
```

(2) `AppRoute`:

```ts
export type AppRoute = 'kanban' | 'dashboard' | 'migration' | 'settings' | 'daily' | 'todo'
```

(3) `ViewState` 인터페이스에 추가 (`swimlaneHeights` 아래, `setGrouping` 위):

```ts
  todoSort: TodoSortKey
  todoKeyword: string
```

그리고 액션 선언부(`resetSwimlaneHeight` 아래)에 추가:

```ts
  setTodoSort: (key: TodoSortKey) => void
  setTodoKeyword: (keyword: string) => void
```

`pushToast` 선언을 교체:

```ts
  pushToast: (
    message: string,
    variant?: ToastVariant,
    durationMs?: number,
    action?: ToastAction
  ) => void
```

(4) 스토어 본문 — 초기값(`swimlaneHeights: {},` 아래)과 액션:

```ts
      todoSort: 'createdDesc' as TodoSortKey,
      todoKeyword: '',
```

```ts
      setTodoSort: (key) => set({ todoSort: key }),
      setTodoKeyword: (keyword) => set({ todoKeyword: keyword }),
```

`pushToast` 구현 교체:

```ts
      pushToast: (message, variant = 'info', durationMs = 4000, action) => {
        const id = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
        set((state) => ({ toasts: [...state.toasts, { id, message, variant, action }] }))
        if (durationMs > 0) {
          setTimeout(() => get().dismissToast(id), durationMs)
        }
      },
```

(5) persist 설정 — `version` 을 `5` 로 바꾸고, `migrate` 의 v4 블록 아래에 추가한 뒤, `partialize` 에 두 키를 넣는다.

```ts
        if (version < 5) {
          const s5 = s as Record<string, unknown>
          s5.todoSort = 'createdDesc'
          s5.todoKeyword = ''
        }
```

```ts
      partialize: (state) => ({
        grouping: state.grouping,
        sort: state.sort,
        filters: state.filters,
        swimlaneEnabled: state.swimlaneEnabled,
        swimlaneProjects: state.swimlaneProjects,
        showEtcLane: state.showEtcLane,
        swimlaneHeights: state.swimlaneHeights,
        todoSort: state.todoSort,
        todoKeyword: state.todoKeyword
      })
```

- [ ] **Step 6: 테스트가 통과하는지 확인한다**

Run: `npx vitest run src/renderer/src/stores/viewStore.test.ts`
Expected: PASS

- [ ] **Step 7: AppShell 토스트에 액션 버튼을 렌더한다**

`src/renderer/src/components/layout/AppShell.tsx` 의 토스트 렌더에서 `<span className="flex-1">{toast.message}</span>` 바로 아래에 삽입한다.

```tsx
            {toast.action && (
              <button
                onClick={() => {
                  toast.action?.onClick()
                  dismissToast(toast.id)
                }}
                className="text-xs font-bold px-2 py-0.5 rounded-md border border-border text-foreground hover:bg-muted dark:hover:bg-muted"
              >
                {toast.action.label}
              </button>
            )}
```

- [ ] **Step 8: 설정 화면에 입력 두 개를 추가한다**

`src/renderer/src/components/settings/SettingsPanel.tsx` 에서:

로컬 상태를 `const [excludedInput, setExcludedInput] = useState('')` 아래에 추가한다.

```tsx
  const [todoFolder, setTodoFolder] = useState('06_To Do')
  const [projectsFolder, setProjectsFolder] = useState('01_Projects')
```

`useEffect` 의 `load().then((s) => { ... })` 안에 추가한다.

```tsx
      setTodoFolder(s.todoFolder ?? '06_To Do')
      setProjectsFolder(s.projectsFolder ?? '01_Projects')
```

`handleVaultNameBlur` 아래에 핸들러를 추가한다.

```tsx
  async function handleTodoFolderBlur(): Promise<void> {
    await update('todoFolder', todoFolder.trim())
  }

  async function handleProjectsFolderBlur(): Promise<void> {
    await update('projectsFolder', projectsFolder.trim())
  }
```

Vault 섹션의 `<Field label="제외 폴더">` **바로 위**에 두 필드를 추가한다.

```tsx
            <Field label="To Do 폴더 (볼트 루트 기준 상대 경로)">
              <input
                value={todoFolder}
                onChange={(e) => setTodoFolder(e.target.value)}
                onBlur={handleTodoFolderBlur}
                className={inputCls}
                placeholder="06_To Do"
              />
            </Field>

            <Field label="프로젝트 폴더 (티켓 이동 대상 루트)">
              <input
                value={projectsFolder}
                onChange={(e) => setProjectsFolder(e.target.value)}
                onBlur={handleProjectsFolderBlur}
                className={inputCls}
                placeholder="01_Projects"
              />
            </Field>
```

- [ ] **Step 9: 전체 테스트와 빌드를 확인한다**

Run: `npm run test && npm run build`
Expected: 테스트 전부 PASS, 빌드 성공

- [ ] **Step 10: 커밋한다**

```bash
git add src/renderer/src/types/index.ts src/main/ipc/settings.ts src/renderer/src/stores/viewStore.ts src/renderer/src/stores/viewStore.test.ts src/renderer/src/components/layout/AppShell.tsx src/renderer/src/components/settings/SettingsPanel.tsx
git commit -m "feat(todo): Settings todoFolder·projectsFolder + viewStore persist v5"
```

---

### Task 5: 이동·생성 IPC

**Files:**
- Modify: `src/main/ipc/vault.ts`
- Modify: `src/preload/index.ts`
- Modify: `src/preload/index.d.ts`
- Test: `tests/integration/todo-move.test.ts` (신규)

**Interfaces:**
- Consumes: Task 1의 `Note.extraFrontmatter`
- Produces:
  - `type FileOpResult = { ok: true } | { ok: false; code: 'exists' | 'io'; error: string }`
  - `interface ProjectPatch { project: string; subProject: string | null }`
  - `moveNoteToProject(oldPath, newPath, patch): Promise<FileOpResult>`
  - `createNote(filePath, content): Promise<FileOpResult>`
  - `window.api.vault.moveNoteToProject(oldPath, newPath, patch)`
  - `window.api.vault.createNote(filePath, content)`

- [ ] **Step 1: 실패하는 테스트를 작성한다**

`tests/integration/todo-move.test.ts` 를 새로 만든다.

```ts
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { promises as fs } from 'fs'
import { join } from 'path'
import { tmpdir } from 'os'

vi.mock('../../src/main/ipc/settings', () => ({
  getSettingValue: (key: string) => (key === 'statusFieldName' ? 'status' : undefined)
}))

import { moveNoteToProject, createNote, recentlyWrittenByApp } from '../../src/main/ipc/vault'

const TODO_RAW = [
  '---',
  'project: 이전프로젝트',
  'sub_project: 이전세부',
  'priority: high',
  'category: action',
  'status: planned',
  'works: pending',
  'tags: []',
  'created: 2026-08-31',
  'completed:',
  '---',
  '',
  '## 업무 개요',
  '- 확인'
].join('\n')

describe('moveNoteToProject / createNote', () => {
  let tmpDir: string
  let oldPath: string
  let newPath: string

  beforeEach(async () => {
    tmpDir = await fs.mkdtemp(join(tmpdir(), 'todo-move-'))
    oldPath = join(tmpDir, '06_To Do', '2026-08', 'a.md')
    newPath = join(tmpDir, '01_Projects', '02_에너빌드', '03_에너지분석', 'a.md')
    await fs.mkdir(join(tmpDir, '06_To Do', '2026-08'), { recursive: true })
    await fs.writeFile(oldPath, TODO_RAW, 'utf-8')
    recentlyWrittenByApp.clear()
  })

  afterEach(async () => {
    await fs.rm(tmpDir, { recursive: true, force: true })
  })

  it('파일을 옮기고 project·sub_project 를 갱신한다', async () => {
    const result = await moveNoteToProject(oldPath, newPath, {
      project: '에너빌드',
      subProject: '에너지분석(에너빌드)'
    })
    expect(result).toEqual({ ok: true })

    const moved = await fs.readFile(newPath, 'utf-8')
    expect(moved).toContain('project: 에너빌드')
    expect(moved).toContain('sub_project: 에너지분석(에너빌드)')
    await expect(fs.access(oldPath)).rejects.toThrow()
  })

  it('미지 frontmatter 키를 보존한다', async () => {
    await moveNoteToProject(oldPath, newPath, { project: '에너빌드', subProject: null })
    const moved = await fs.readFile(newPath, 'utf-8')
    expect(moved).toContain('category: action')
    expect(moved).toContain('works: pending')
  })

  it('subProject 가 null 이면 기존 sub_project 를 유지한다', async () => {
    await moveNoteToProject(oldPath, newPath, { project: '에너빌드', subProject: null })
    const moved = await fs.readFile(newPath, 'utf-8')
    expect(moved).toContain('sub_project: 이전세부')
  })

  it('양쪽 경로를 recentlyWrittenByApp 에 등록한다', async () => {
    await moveNoteToProject(oldPath, newPath, { project: '에너빌드', subProject: null })
    expect(recentlyWrittenByApp.has(newPath)).toBe(true)
    expect(recentlyWrittenByApp.has(oldPath)).toBe(true)
  })

  it('목적지에 같은 이름이 있으면 exists 로 실패하고 원본을 남긴다', async () => {
    await fs.mkdir(join(tmpDir, '01_Projects', '02_에너빌드', '03_에너지분석'), {
      recursive: true
    })
    await fs.writeFile(newPath, '기존 파일', 'utf-8')

    const result = await moveNoteToProject(oldPath, newPath, {
      project: '에너빌드',
      subProject: null
    })
    expect(result).toMatchObject({ ok: false, code: 'exists' })
    expect(await fs.readFile(newPath, 'utf-8')).toBe('기존 파일')
    expect(await fs.readFile(oldPath, 'utf-8')).toBe(TODO_RAW)
  })

  it('원본 삭제에 실패하면 새 파일을 지워 롤백한다', async () => {
    const unlinkSpy = vi.spyOn(fs, 'unlink').mockRejectedValueOnce(new Error('EBUSY'))

    const result = await moveNoteToProject(oldPath, newPath, {
      project: '에너빌드',
      subProject: null
    })
    expect(result).toMatchObject({ ok: false, code: 'io' })
    await expect(fs.access(newPath)).rejects.toThrow()
    expect(await fs.readFile(oldPath, 'utf-8')).toBe(TODO_RAW)

    unlinkSpy.mockRestore()
  })

  it('읽을 수 없는 원본이면 io 로 실패한다', async () => {
    const result = await moveNoteToProject(join(tmpDir, '없는파일.md'), newPath, {
      project: '에너빌드',
      subProject: null
    })
    expect(result).toMatchObject({ ok: false, code: 'io' })
  })

  it('createNote 는 폴더를 만들며 파일을 쓴다', async () => {
    const target = join(tmpDir, '06_To Do', '2026-09', '0901_새 할일.md')
    const result = await createNote(target, '---\nstatus: planned\n---\n본문')
    expect(result).toEqual({ ok: true })
    expect(await fs.readFile(target, 'utf-8')).toContain('본문')
    expect(recentlyWrittenByApp.has(target)).toBe(true)
  })

  it('createNote 는 이미 있는 파일을 덮지 않는다', async () => {
    const result = await createNote(oldPath, '새 내용')
    expect(result).toMatchObject({ ok: false, code: 'exists' })
    expect(await fs.readFile(oldPath, 'utf-8')).toBe(TODO_RAW)
  })
})
```

- [ ] **Step 2: 테스트가 실패하는지 확인한다**

Run: `npx vitest run tests/integration/todo-move.test.ts`
Expected: FAIL — `moveNoteToProject` 가 export 되지 않음

- [ ] **Step 3: main 프로세스에 두 연산을 구현한다**

`src/main/ipc/vault.ts` 의 import 를 고친다.

```ts
import { join, dirname } from 'path'
```

`writeNoteToDisk` 함수 **아래**에 추가한다.

```ts
export type FileOpResult =
  | { ok: true }
  | { ok: false; code: 'exists' | 'io'; error: string }

export interface ProjectPatch {
  project: string
  /** null 이면 sub_project 를 건드리지 않는다 (기존 값 유지, 없으면 만들지 않음). */
  subProject: string | null
}

async function pathExists(target: string): Promise<boolean> {
  try {
    await fs.access(target)
    return true
  } catch {
    return false
  }
}

function toMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}

/**
 * 새 경로에 먼저 쓰고 원본을 지운다. 중간에 실패해도 원본이 남는다.
 * 덮어쓰기는 하지 않는다.
 */
export async function moveNoteToProject(
  oldPath: string,
  newPath: string,
  patch: ProjectPatch
): Promise<FileOpResult> {
  try {
    if (await pathExists(newPath)) {
      return { ok: false, code: 'exists', error: `이미 같은 이름의 파일이 있습니다: ${newPath}` }
    }

    const note = await readSingleNote(oldPath)
    const extra = { ...(note.extraFrontmatter ?? {}) }
    if (patch.subProject !== null) {
      extra.sub_project = patch.subProject
    }
    const updated: Note = { ...note, project: patch.project, extraFrontmatter: extra }
    const markdown = serializeNote(updated, getSettingValue('statusFieldName'))

    await fs.mkdir(dirname(newPath), { recursive: true })
    recentlyWrittenByApp.add(newPath)
    scheduleEviction(newPath)
    await fs.writeFile(newPath, markdown, 'utf-8')

    try {
      recentlyWrittenByApp.add(oldPath)
      scheduleEviction(oldPath)
      await fs.unlink(oldPath)
    } catch (error: unknown) {
      await fs.rm(newPath, { force: true })
      return { ok: false, code: 'io', error: toMessage(error) }
    }

    return { ok: true }
  } catch (error: unknown) {
    return { ok: false, code: 'io', error: toMessage(error) }
  }
}

/** 배타적 생성(wx). 이미 있으면 덮지 않고 exists 를 돌려준다. */
export async function createNote(filePath: string, content: string): Promise<FileOpResult> {
  try {
    await fs.mkdir(dirname(filePath), { recursive: true })
    recentlyWrittenByApp.add(filePath)
    scheduleEviction(filePath)
    await fs.writeFile(filePath, content, { encoding: 'utf-8', flag: 'wx' })
    return { ok: true }
  } catch (error: unknown) {
    const code = (error as NodeJS.ErrnoException).code
    if (code === 'EEXIST') {
      return { ok: false, code: 'exists', error: `이미 존재합니다: ${filePath}` }
    }
    return { ok: false, code: 'io', error: toMessage(error) }
  }
}
```

- [ ] **Step 4: 테스트가 통과하는지 확인한다**

Run: `npx vitest run tests/integration/todo-move.test.ts`
Expected: PASS

- [ ] **Step 5: IPC 핸들러를 등록한다**

`src/main/ipc/vault.ts` 의 `registerVaultHandlers()` 안, `vault:moveNote` 핸들러 아래에 추가한다.

```ts
  ipcMain.handle(
    'vault:moveNoteToProject',
    async (
      _event,
      oldPath: string,
      newPath: string,
      patch: ProjectPatch
    ): Promise<FileOpResult> => {
      return moveNoteToProject(oldPath, newPath, patch)
    }
  )

  ipcMain.handle(
    'vault:createNote',
    async (_event, filePath: string, content: string): Promise<FileOpResult> => {
      return createNote(filePath, content)
    }
  )
```

- [ ] **Step 6: preload 에 노출한다**

`src/preload/index.ts` 의 import 에 타입을 추가한다.

```ts
import type { FolderNode, FileOpResult, ProjectPatch } from '../main/ipc/vault'
```

`const vault = { ... }` 안, `getPresetFields` 아래에 추가한다.

```ts
  moveNoteToProject: (
    oldPath: string,
    newPath: string,
    patch: ProjectPatch
  ): Promise<FileOpResult> =>
    ipcRenderer.invoke('vault:moveNoteToProject', oldPath, newPath, patch),
  createNote: (filePath: string, content: string): Promise<FileOpResult> =>
    ipcRenderer.invoke('vault:createNote', filePath, content)
```

- [ ] **Step 7: preload 타입 선언을 맞춘다**

`src/preload/index.d.ts` 의 import 를 고친다.

```ts
import type { FolderNode, FileOpResult, ProjectPatch } from '../main/ipc/vault'
```

`VaultApi` 인터페이스의 `getPresetFields` 아래에 추가한다.

```ts
  moveNoteToProject: (
    oldPath: string,
    newPath: string,
    patch: ProjectPatch
  ) => Promise<FileOpResult>
  createNote: (filePath: string, content: string) => Promise<FileOpResult>
```

- [ ] **Step 8: 전체 테스트와 빌드를 확인한다**

Run: `npm run test && npm run build`
Expected: 테스트 전부 PASS, 빌드 성공

- [ ] **Step 9: 커밋한다**

```bash
git add src/main/ipc/vault.ts src/preload/index.ts src/preload/index.d.ts tests/integration/todo-move.test.ts
git commit -m "feat(todo): 프로젝트 이동·노트 생성 IPC + preload 노출"
```

---

### Task 6: To Do 화면 (목록·정렬·검색·인라인 편집)

이동/생성 대화상자는 Task 7·8에서 붙인다. 이 태스크는 목록이 뜨고 인라인 편집이 저장되는 데까지다.

**Files:**
- Create: `src/renderer/src/components/todo/TodoRow.tsx`
- Create: `src/renderer/src/components/todo/TodoView.tsx`
- Modify: `src/renderer/src/components/layout/AppShell.tsx`
- Test: `tests/integration/todo-view.test.tsx` (신규)

**Interfaces:**
- Consumes: Task 3의 `selectTodoNotes`·`sortTodos`·`filterTodosByKeyword`·`getSubProject`·`TodoSortKey`, Task 4의 `viewStore.todoSort`·`todoKeyword`
- Produces:
  - `TodoView(props: { notes: Note[]; todoFolder: string; statusOrder: string[]; onNoteUpdate: (note: Note) => void; onOpenNote: (note: Note) => void })`
  - `TodoRow(props: { note: Note; onChange: (note: Note) => void; onOpen: () => void; onMove: () => void; statusOrder: string[] })`

- [ ] **Step 1: 실패하는 테스트를 작성한다**

`tests/integration/todo-view.test.tsx` 를 새로 만든다.

```tsx
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, cleanup, fireEvent, waitFor } from '@testing-library/react'
import { createJSONStorage } from 'zustand/middleware'
import { useViewStore } from '../../src/renderer/src/stores/viewStore'
import { TodoView } from '../../src/renderer/src/components/todo/TodoView'
import type { Note } from '../../src/renderer/src/types'

// Node 22+ 실험적 webstorage 대응 (viewStore.test.ts 와 같은 패턴)
const memoryStore = new Map<string, string>()
useViewStore.persist.setOptions({
  storage: createJSONStorage(() => ({
    getItem: (k: string) => memoryStore.get(k) ?? null,
    setItem: (k: string, v: string) => void memoryStore.set(k, v),
    removeItem: (k: string) => void memoryStore.delete(k)
  }))
})

const STATUS_ORDER = ['backlog', 'planned', 'in-progress', 'review', 'done']

function makeNote(overrides: Partial<Note> = {}): Note {
  return {
    filePath: 'C:/v/06_To Do/2026-08/a.md',
    relativePath: '06_To Do/2026-08/a.md',
    title: 'BIPV 조달 확인',
    status: 'planned',
    priority: 'high',
    tags: [],
    created: '2026-08-31',
    body: '',
    mtime: 1,
    project: 'BIPV특허기획',
    ...overrides
  }
}

beforeEach(() => {
  useViewStore.getState().setTodoSort('createdDesc')
  useViewStore.getState().setTodoKeyword('')
})

afterEach(() => {
  cleanup()
  vi.restoreAllMocks()
})

describe('TodoView', () => {
  it('To Do 폴더 노트만 행으로 그린다', () => {
    const notes = [
      makeNote(),
      makeNote({
        filePath: 'C:/v/01_Projects/b.md',
        relativePath: '01_Projects/b.md',
        title: '프로젝트 노트'
      })
    ]
    render(
      <TodoView
        notes={notes}
        todoFolder="06_To Do"
        statusOrder={STATUS_ORDER}
        onNoteUpdate={() => {}}
        onOpenNote={() => {}}
      />
    )
    expect(screen.getByText('BIPV 조달 확인')).toBeInTheDocument()
    expect(screen.queryByText('프로젝트 노트')).not.toBeInTheDocument()
  })

  it('검색어로 행을 거른다', () => {
    const notes = [
      makeNote({ title: 'BIPV 조달 확인' }),
      makeNote({
        filePath: 'C:/v/06_To Do/2026-08/b.md',
        relativePath: '06_To Do/2026-08/b.md',
        title: '데이터센터 대안'
      })
    ]
    render(
      <TodoView
        notes={notes}
        todoFolder="06_To Do"
        statusOrder={STATUS_ORDER}
        onNoteUpdate={() => {}}
        onOpenNote={() => {}}
      />
    )
    fireEvent.change(screen.getByPlaceholderText('검색'), { target: { value: 'BIPV' } })
    expect(screen.getByText('BIPV 조달 확인')).toBeInTheDocument()
    expect(screen.queryByText('데이터센터 대안')).not.toBeInTheDocument()
  })

  it('할일이 없으면 안내를 보여준다', () => {
    render(
      <TodoView
        notes={[]}
        todoFolder="06_To Do"
        statusOrder={STATUS_ORDER}
        onNoteUpdate={() => {}}
        onOpenNote={() => {}}
      />
    )
    expect(screen.getByText(/할일이 없습니다/)).toBeInTheDocument()
  })

  it('제목을 누르면 onOpenNote 를 부른다', () => {
    const onOpenNote = vi.fn()
    render(
      <TodoView
        notes={[makeNote()]}
        todoFolder="06_To Do"
        statusOrder={STATUS_ORDER}
        onNoteUpdate={() => {}}
        onOpenNote={onOpenNote}
      />
    )
    fireEvent.click(screen.getByText('BIPV 조달 확인'))
    expect(onOpenNote).toHaveBeenCalledTimes(1)
  })

  it('상태를 바꾸면 statusTransition 을 거쳐 저장한다', async () => {
    const writeNote = vi.fn().mockResolvedValue(undefined)
    // @ts-expect-error 테스트용 부분 구현
    window.api = { vault: { writeNote } }
    const onNoteUpdate = vi.fn()

    render(
      <TodoView
        notes={[makeNote()]}
        todoFolder="06_To Do"
        statusOrder={STATUS_ORDER}
        onNoteUpdate={onNoteUpdate}
        onOpenNote={() => {}}
      />
    )

    fireEvent.change(screen.getByLabelText('상태'), { target: { value: 'in-progress' } })

    await waitFor(() => expect(writeNote).toHaveBeenCalledTimes(1))
    const saved = writeNote.mock.calls[0][0] as Note
    expect(saved.status).toBe('in-progress')
    expect(saved.started).toBeTruthy()
    expect(onNoteUpdate).toHaveBeenCalled()
  })

  it('파싱 오류 노트는 편집 컨트롤을 비활성화한다', () => {
    render(
      <TodoView
        notes={[makeNote({ parseError: 'YAML 오류' })]}
        todoFolder="06_To Do"
        statusOrder={STATUS_ORDER}
        onNoteUpdate={() => {}}
        onOpenNote={() => {}}
      />
    )
    expect(screen.getByLabelText('상태')).toBeDisabled()
    expect(screen.getByRole('button', { name: '프로젝트로 이동' })).toBeDisabled()
  })
})
```

- [ ] **Step 2: 테스트가 실패하는지 확인한다**

Run: `npx vitest run tests/integration/todo-view.test.tsx`
Expected: FAIL — `TodoView` 모듈을 찾을 수 없음

- [ ] **Step 3: `TodoRow` 를 만든다**

`src/renderer/src/components/todo/TodoRow.tsx`:

```tsx
import { AlertTriangle, FolderInput } from 'lucide-react'
import type { Note, Priority, Status } from '@renderer/types'
import { getSubProject } from '../../lib/todoModel'

const PRIORITY_LABEL: Record<Priority, string> = { high: '높음', mid: '보통', low: '낮음' }

const cellCls = 'px-2 py-1.5 align-middle'
const selectCls =
  'w-full text-xs bg-background text-foreground border border-border rounded-md px-1.5 py-1 disabled:opacity-40 disabled:cursor-not-allowed dark:bg-background dark:text-foreground'

interface Props {
  note: Note
  statusOrder: readonly string[]
  onChange: (next: Note) => void
  onStatusChange: (next: Status) => void
  onOpen: () => void
  onMove: () => void
}

export function TodoRow({
  note,
  statusOrder,
  onChange,
  onStatusChange,
  onOpen,
  onMove
}: Props): JSX.Element {
  const disabled = Boolean(note.parseError)
  const subProject = getSubProject(note)

  return (
    <tr className="border-b border-border hover:bg-muted/40 dark:hover:bg-muted/40">
      <td className={cellCls}>
        <div className="flex items-center gap-1.5">
          {disabled && (
            <AlertTriangle
              size={12}
              className="text-destructive dark:text-destructive shrink-0"
              aria-label="파싱 오류"
            />
          )}
          <button
            onClick={onOpen}
            className="text-xs text-left text-foreground dark:text-foreground hover:underline truncate"
          >
            {note.title}
          </button>
        </div>
      </td>

      <td className={`${cellCls} text-xs text-muted-foreground dark:text-muted-foreground`}>
        <span className="truncate block">
          {note.project ?? '—'}
          {subProject ? ` · ${subProject}` : ''}
        </span>
      </td>

      <td className={cellCls}>
        <select
          aria-label="우선순위"
          disabled={disabled}
          value={note.priority ?? ''}
          onChange={(e) =>
            onChange({
              ...note,
              priority: e.target.value === '' ? undefined : (e.target.value as Priority)
            })
          }
          className={selectCls}
        >
          <option value="">없음</option>
          {(Object.keys(PRIORITY_LABEL) as Priority[]).map((p) => (
            <option key={p} value={p}>
              {PRIORITY_LABEL[p]}
            </option>
          ))}
        </select>
      </td>

      <td className={cellCls}>
        <select
          aria-label="상태"
          disabled={disabled}
          value={note.status}
          onChange={(e) => onStatusChange(e.target.value as Status)}
          className={selectCls}
        >
          {statusOrder.map((s) => (
            <option key={s} value={s}>
              {s}
            </option>
          ))}
          {!statusOrder.includes(note.status) && (
            <option value={note.status}>{note.status}</option>
          )}
        </select>
      </td>

      <td className={`${cellCls} text-xs text-muted-foreground dark:text-muted-foreground`}>
        {note.created || '—'}
      </td>

      <td className={cellCls}>
        <input
          type="date"
          aria-label="마감"
          disabled={disabled}
          value={note.due ?? ''}
          onChange={(e) =>
            onChange({ ...note, due: e.target.value === '' ? undefined : e.target.value })
          }
          className={selectCls}
        />
      </td>

      <td className={cellCls}>
        <button
          onClick={onMove}
          disabled={disabled}
          aria-label="프로젝트로 이동"
          title="프로젝트로 이동"
          className="p-1 rounded-md text-muted-foreground hover:bg-muted hover:text-foreground disabled:opacity-30 disabled:cursor-not-allowed dark:text-muted-foreground dark:hover:bg-muted dark:hover:text-foreground"
        >
          <FolderInput size={14} />
        </button>
      </td>
    </tr>
  )
}
```

- [ ] **Step 4: `TodoView` 를 만든다**

`src/renderer/src/components/todo/TodoView.tsx`:

```tsx
import { useMemo } from 'react'
import type { Note, Status } from '@renderer/types'
import { useViewStore } from '../../stores/viewStore'
import {
  filterTodosByKeyword,
  selectTodoNotes,
  sortTodos,
  type TodoSortKey
} from '../../lib/todoModel'
import { apply } from '../../lib/statusTransition'
import { TodoRow } from './TodoRow'

const SORT_LABEL: Record<TodoSortKey, string> = {
  createdDesc: '생성일 최신',
  dueAsc: '마감 임박',
  priorityDesc: '우선순위',
  status: '상태'
}

const headCls =
  'px-2 py-1.5 text-left text-[11px] font-bold uppercase tracking-widest text-muted-foreground dark:text-muted-foreground'

interface Props {
  notes: Note[]
  todoFolder: string
  statusOrder: string[]
  onNoteUpdate: (note: Note) => void
  onOpenNote: (note: Note) => void
  onMoveNote?: (note: Note) => void
  onCreateTodo?: () => void
}

export function TodoView({
  notes,
  todoFolder,
  statusOrder,
  onNoteUpdate,
  onOpenNote,
  onMoveNote,
  onCreateTodo
}: Props): JSX.Element {
  const { todoSort, todoKeyword, setTodoSort, setTodoKeyword, pushToast } = useViewStore()

  const rows = useMemo(() => {
    const scoped = selectTodoNotes(notes, todoFolder)
    return sortTodos(filterTodosByKeyword(scoped, todoKeyword), todoSort, statusOrder)
  }, [notes, todoFolder, todoKeyword, todoSort, statusOrder])

  async function save(next: Note, previous: Note): Promise<void> {
    onNoteUpdate(next)
    try {
      await window.api.vault.writeNote(next)
    } catch (error) {
      pushToast(
        `파일 저장 실패: ${error instanceof Error ? error.message : '알 수 없는 오류'}`,
        'error'
      )
      onNoteUpdate(previous)
    }
  }

  return (
    <div className="flex flex-col h-full min-h-0">
      <div className="flex items-center gap-2 mb-3 flex-shrink-0">
        <input
          value={todoKeyword}
          onChange={(e) => setTodoKeyword(e.target.value)}
          placeholder="검색"
          className="text-xs bg-background text-foreground border border-border rounded-md px-2 py-1.5 w-56 dark:bg-background dark:text-foreground"
        />
        <select
          aria-label="정렬"
          value={todoSort}
          onChange={(e) => setTodoSort(e.target.value as TodoSortKey)}
          className="text-xs bg-background text-foreground border border-border rounded-md px-2 py-1.5 dark:bg-background dark:text-foreground"
        >
          {(Object.keys(SORT_LABEL) as TodoSortKey[]).map((k) => (
            <option key={k} value={k}>
              {SORT_LABEL[k]}
            </option>
          ))}
        </select>
        <div className="flex-1" />
        <span className="text-xs text-muted-foreground dark:text-muted-foreground">
          {rows.length}건
        </span>
        {onCreateTodo && (
          <button
            onClick={onCreateTodo}
            className="text-xs px-3 py-1.5 rounded-md border border-border text-foreground hover:bg-muted dark:text-foreground dark:hover:bg-muted"
          >
            새 할일
          </button>
        )}
      </div>

      {rows.length === 0 ? (
        <div className="flex-1 flex items-center justify-center">
          <p className="text-sm text-muted-foreground dark:text-muted-foreground">
            할일이 없습니다. `{todoFolder}` 폴더를 확인하세요.
          </p>
        </div>
      ) : (
        <div className="flex-1 overflow-auto border border-border rounded-md">
          <table className="w-full border-collapse">
            <thead className="sticky top-0 bg-card dark:bg-card">
              <tr className="border-b border-border">
                <th className={`${headCls} w-[34%]`}>제목</th>
                <th className={`${headCls} w-[22%]`}>프로젝트</th>
                <th className={`${headCls} w-[10%]`}>우선순위</th>
                <th className={`${headCls} w-[14%]`}>상태</th>
                <th className={`${headCls} w-[10%]`}>생성일</th>
                <th className={`${headCls} w-[10%]`}>마감</th>
                <th className={headCls} />
              </tr>
            </thead>
            <tbody>
              {rows.map((note) => (
                <TodoRow
                  key={note.filePath}
                  note={note}
                  statusOrder={statusOrder}
                  onChange={(next) => void save(next, note)}
                  onStatusChange={(status: Status) =>
                    void save(apply(note, status, new Date()), note)
                  }
                  onOpen={() => onOpenNote(note)}
                  onMove={() => onMoveNote?.(note)}
                />
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
```

- [ ] **Step 5: 테스트가 통과하는지 확인한다**

Run: `npx vitest run tests/integration/todo-view.test.tsx`
Expected: PASS

- [ ] **Step 6: AppShell 에 라우트를 연결한다**

`src/renderer/src/components/layout/AppShell.tsx` 를 네 곳 고친다.

(1) import — lucide 아이콘과 컴포넌트:

```tsx
import { ListTodo } from 'lucide-react'
import { TodoView } from '../todo/TodoView'
```

(`ListTodo` 는 기존 lucide-react import 목록에 추가한다.)

(2) 설정 값을 읽는 상태를 컴포넌트 본문 상단(`const [showAiDialog, ...]` 근처)에 추가한다.

```tsx
  const [todoFolder, setTodoFolder] = useState('06_To Do')
  const [projectsFolder, setProjectsFolder] = useState('01_Projects')

  useEffect(() => {
    window.api.settings
      .getAll()
      .then((s) => {
        setTodoFolder(s.todoFolder ?? '06_To Do')
        setProjectsFolder(s.projectsFolder ?? '01_Projects')
      })
      .catch(() => {})
  }, [route])
```

(3) `navItems` 에 항목을 추가한다 (칸반 다음).

```tsx
    { key: 'todo', label: 'To Do', icon: ListTodo },
```

(4) 메인 영역 렌더에서 `{!loading && route === 'dashboard' && <Dashboard notes={notes} />}` 위에 추가한다.

```tsx
              {!loading && route === 'todo' && (
                <TodoView
                  notes={notes}
                  todoFolder={todoFolder}
                  statusOrder={DEFAULT_COLUMNS.map((c) => String(c.name))}
                  onNoteUpdate={updateNote}
                  onOpenNote={openNote}
                />
              )}
```

`projectsFolder` 는 Task 7에서 쓴다. 이 태스크에서는 선언만 해두고 `void projectsFolder` 같은 회피 코드를 쓰지 않는다 — Task 7에서 바로 소비하므로 lint 의 미사용 경고가 뜨면 (2)의 `projectsFolder` 상태 추가를 Task 7로 미룬다.

- [ ] **Step 7: 전체 테스트·lint·빌드를 확인한다**

Run: `npm run test && npm run lint && npm run build`
Expected: 테스트 PASS, lint 는 기존 `driver.mjs:125` 외 신규 오류 없음, 빌드 성공

- [ ] **Step 8: 커밋한다**

```bash
git add src/renderer/src/components/todo/ src/renderer/src/components/layout/AppShell.tsx tests/integration/todo-view.test.tsx
git commit -m "feat(todo): To Do 목록 화면 + 인라인 상태·우선순위·마감 편집"
```

---

### Task 7: 프로젝트 이동 대화상자

**Files:**
- Create: `src/renderer/src/components/todo/MoveToProjectDialog.tsx`
- Modify: `src/renderer/src/components/todo/TodoView.tsx`
- Modify: `src/renderer/src/components/layout/AppShell.tsx`
- Test: `tests/integration/todo-move-dialog.test.tsx` (신규)

**Interfaces:**
- Consumes: Task 3의 `deriveProjectMeta`·`suggestProjectFolders`·`getSubProject`, Task 5의 `window.api.vault.moveNoteToProject`, Task 4의 `pushToast` 액션
- Produces: `MoveToProjectDialog(props: { note: Note; vaultPath: string; projectsFolder: string; preset: { projects: string[]; subProjects: string[] }; open: boolean; onOpenChange: (open: boolean) => void; onMoved: (oldPath: string) => void })`

- [ ] **Step 1: 실패하는 테스트를 작성한다**

`tests/integration/todo-move-dialog.test.tsx`:

```tsx
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, cleanup, fireEvent, waitFor } from '@testing-library/react'
import { createJSONStorage } from 'zustand/middleware'
import { useViewStore } from '../../src/renderer/src/stores/viewStore'
import { MoveToProjectDialog } from '../../src/renderer/src/components/todo/MoveToProjectDialog'
import type { Note } from '../../src/renderer/src/types'

const memoryStore = new Map<string, string>()
useViewStore.persist.setOptions({
  storage: createJSONStorage(() => ({
    getItem: (k: string) => memoryStore.get(k) ?? null,
    setItem: (k: string, v: string) => void memoryStore.set(k, v),
    removeItem: (k: string) => void memoryStore.delete(k)
  }))
})

const PRESET = {
  projects: ['에너빌드', 'BIPV특허기획'],
  subProjects: ['에너지분석(에너빌드)']
}

const FOLDER_TREE = [
  {
    name: '01_Projects',
    path: '01_Projects',
    children: [
      {
        name: '02_에너빌드',
        path: '01_Projects/02_에너빌드',
        children: [
          { name: '03_에너지분석', path: '01_Projects/02_에너빌드/03_에너지분석', children: [] }
        ]
      }
    ]
  }
]

function makeNote(overrides: Partial<Note> = {}): Note {
  return {
    filePath: 'C:/v/06_To Do/2026-08/a.md',
    relativePath: '06_To Do/2026-08/a.md',
    title: 'a',
    status: 'planned',
    tags: [],
    created: '2026-08-31',
    body: '',
    mtime: 1,
    project: '에너빌드',
    extraFrontmatter: { sub_project: '이전세부' },
    ...overrides
  }
}

let moveNoteToProject: ReturnType<typeof vi.fn>

beforeEach(() => {
  moveNoteToProject = vi.fn().mockResolvedValue({ ok: true })
  // @ts-expect-error 테스트용 부분 구현
  window.api = {
    vault: {
      listFolders: vi.fn().mockResolvedValue(FOLDER_TREE),
      moveNoteToProject
    }
  }
})

afterEach(() => {
  cleanup()
  vi.restoreAllMocks()
})

async function openDialogAndPickFolder(): Promise<void> {
  render(
    <MoveToProjectDialog
      note={makeNote()}
      vaultPath="C:/v"
      projectsFolder="01_Projects"
      preset={PRESET}
      open
      onOpenChange={() => {}}
      onMoved={() => {}}
    />
  )
  await waitFor(() => expect(screen.getByText('03_에너지분석')).toBeInTheDocument())
  fireEvent.click(screen.getByText('03_에너지분석'))
}

describe('MoveToProjectDialog', () => {
  it('폴더를 고르면 preset 으로 보정한 값을 미리보기에 채운다', async () => {
    await openDialogAndPickFolder()
    await waitFor(() =>
      expect(screen.getByLabelText('project')).toHaveValue('에너빌드')
    )
    expect(screen.getByLabelText('sub_project')).toHaveValue('에너지분석(에너빌드)')
  })

  it('확인을 누르면 목적지 경로와 patch 로 IPC 를 부른다', async () => {
    await openDialogAndPickFolder()
    fireEvent.click(screen.getByRole('button', { name: '이동' }))

    await waitFor(() => expect(moveNoteToProject).toHaveBeenCalledTimes(1))
    expect(moveNoteToProject).toHaveBeenCalledWith(
      'C:/v/06_To Do/2026-08/a.md',
      'C:/v/01_Projects/02_에너빌드/03_에너지분석/a.md',
      { project: '에너빌드', subProject: '에너지분석(에너빌드)' }
    )
  })

  it('preset 에 없는 값이면 경고를 보여준다', async () => {
    render(
      <MoveToProjectDialog
        note={makeNote()}
        vaultPath="C:/v"
        projectsFolder="01_Projects"
        preset={{ projects: [], subProjects: [] }}
        open
        onOpenChange={() => {}}
        onMoved={() => {}}
      />
    )
    await waitFor(() => expect(screen.getByText('02_에너빌드')).toBeInTheDocument())
    fireEvent.click(screen.getByText('02_에너빌드'))
    await waitFor(() =>
      expect(screen.getByText(/preset에 없는 값/)).toBeInTheDocument()
    )
  })

  it('폴더를 고르기 전에는 이동 버튼이 비활성이다', async () => {
    render(
      <MoveToProjectDialog
        note={makeNote()}
        vaultPath="C:/v"
        projectsFolder="01_Projects"
        preset={PRESET}
        open
        onOpenChange={() => {}}
        onMoved={() => {}}
      />
    )
    expect(screen.getByRole('button', { name: '이동' })).toBeDisabled()
  })

  it('이동 실패 시 오류 토스트를 띄우고 onMoved 를 부르지 않는다', async () => {
    moveNoteToProject.mockResolvedValue({
      ok: false,
      code: 'exists',
      error: '이미 같은 이름의 파일이 있습니다'
    })
    const onMoved = vi.fn()
    render(
      <MoveToProjectDialog
        note={makeNote()}
        vaultPath="C:/v"
        projectsFolder="01_Projects"
        preset={PRESET}
        open
        onOpenChange={() => {}}
        onMoved={onMoved}
      />
    )
    await waitFor(() => expect(screen.getByText('03_에너지분석')).toBeInTheDocument())
    fireEvent.click(screen.getByText('03_에너지분석'))
    fireEvent.click(screen.getByRole('button', { name: '이동' }))

    await waitFor(() =>
      expect(useViewStore.getState().toasts.at(-1)?.variant).toBe('error')
    )
    expect(onMoved).not.toHaveBeenCalled()
  })

  it('이동 성공 시 되돌리기 버튼이 달린 토스트를 띄운다', async () => {
    await openDialogAndPickFolder()
    fireEvent.click(screen.getByRole('button', { name: '이동' }))

    await waitFor(() =>
      expect(useViewStore.getState().toasts.at(-1)?.action?.label).toBe('되돌리기')
    )

    const undo = useViewStore.getState().toasts.at(-1)!.action!
    undo.onClick()
    await waitFor(() => expect(moveNoteToProject).toHaveBeenCalledTimes(2))
    expect(moveNoteToProject).toHaveBeenLastCalledWith(
      'C:/v/01_Projects/02_에너빌드/03_에너지분석/a.md',
      'C:/v/06_To Do/2026-08/a.md',
      { project: '에너빌드', subProject: '이전세부' }
    )
  })
})
```

- [ ] **Step 2: 테스트가 실패하는지 확인한다**

Run: `npx vitest run tests/integration/todo-move-dialog.test.tsx`
Expected: FAIL — `MoveToProjectDialog` 모듈을 찾을 수 없음

- [ ] **Step 3: 대화상자를 만든다**

`src/renderer/src/components/todo/MoveToProjectDialog.tsx`:

```tsx
import { useEffect, useMemo, useState } from 'react'
import { ChevronDown, ChevronRight, Folder } from 'lucide-react'
import type { Note } from '@renderer/types'
import type { FolderNode } from '../../../../main/ipc/vault'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle
} from '../ui/dialog'
import { useViewStore } from '../../stores/viewStore'
import { deriveProjectMeta, getSubProject, suggestProjectFolders } from '../../lib/todoModel'

interface Props {
  note: Note
  vaultPath: string
  projectsFolder: string
  preset: { projects: string[]; subProjects: string[] }
  open: boolean
  onOpenChange: (open: boolean) => void
  /** 이동이 끝난 뒤 원래 경로를 알려준다. 목록에서 노트를 지우는 데 쓴다. */
  onMoved: (oldPath: string) => void
}

const inputCls =
  'w-full text-xs bg-background text-foreground border border-border rounded-md px-2 py-1.5 dark:bg-background dark:text-foreground'

function flattenPaths(nodes: readonly FolderNode[], out: string[] = []): string[] {
  for (const node of nodes) {
    out.push(node.path)
    flattenPaths(node.children, out)
  }
  return out
}

/** projectsFolder 하위 서브트리만 남긴다. 못 찾으면 원본을 그대로 쓴다. */
function scopeToProjects(nodes: readonly FolderNode[], projectsFolder: string): FolderNode[] {
  const target = projectsFolder.replace(/\\/g, '/').replace(/^\/+|\/+$/g, '')
  const stack: FolderNode[] = [...nodes]
  while (stack.length > 0) {
    const node = stack.shift()!
    if (node.path === target) return node.children
    stack.push(...node.children)
  }
  return [...nodes]
}

function FolderRow({
  node,
  selected,
  onSelect,
  depth
}: {
  node: FolderNode
  selected: string
  onSelect: (path: string) => void
  depth: number
}): JSX.Element {
  const [open, setOpen] = useState(depth === 0)
  const isSelected = selected === node.path

  return (
    <div>
      <div
        className={`flex items-center gap-0.5 py-0.5 rounded px-1 ${
          isSelected
            ? 'bg-muted text-foreground dark:bg-muted dark:text-foreground'
            : 'hover:bg-muted/60 dark:hover:bg-muted/60'
        }`}
        style={{ paddingLeft: `${depth * 14 + 4}px` }}
      >
        {node.children.length > 0 ? (
          <button
            onClick={() => setOpen((o) => !o)}
            aria-label={open ? '접기' : '펼치기'}
            className="text-muted-foreground w-5 h-5 flex items-center justify-center shrink-0"
          >
            {open ? <ChevronDown size={12} /> : <ChevronRight size={12} />}
          </button>
        ) : (
          <span className="w-5 h-5 shrink-0" />
        )}
        <Folder size={12} className="text-muted-foreground mr-1 shrink-0" />
        <button
          onClick={() => onSelect(node.path)}
          className="text-xs text-foreground dark:text-foreground truncate text-left flex-1"
        >
          {node.name}
        </button>
      </div>
      {open &&
        node.children.map((child) => (
          <FolderRow
            key={child.path}
            node={child}
            selected={selected}
            onSelect={onSelect}
            depth={depth + 1}
          />
        ))}
    </div>
  )
}

export function MoveToProjectDialog({
  note,
  vaultPath,
  projectsFolder,
  preset,
  open,
  onOpenChange,
  onMoved
}: Props): JSX.Element {
  const pushToast = useViewStore((s) => s.pushToast)
  const [tree, setTree] = useState<FolderNode[]>([])
  const [selected, setSelected] = useState('')
  const [project, setProject] = useState('')
  const [subProject, setSubProject] = useState('')
  const [offPreset, setOffPreset] = useState({ project: false, subProject: false })
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    if (!open || !vaultPath) return
    window.api.vault
      .listFolders(vaultPath)
      .then((nodes) => setTree(scopeToProjects(nodes, projectsFolder)))
      .catch(() => setTree([]))
  }, [open, vaultPath, projectsFolder])

  const suggestions = useMemo(
    () => suggestProjectFolders(flattenPaths(tree), note.project),
    [tree, note.project]
  )

  function handleSelect(path: string): void {
    setSelected(path)
    const meta = deriveProjectMeta(path, projectsFolder, preset)
    setProject(meta.project)
    setSubProject(meta.subProject ?? getSubProject(note) ?? '')
    setOffPreset(meta.offPreset)
  }

  async function handleMove(): Promise<void> {
    const fileName = note.filePath.replace(/\\/g, '/').split('/').pop()!
    const root = vaultPath.replace(/\\/g, '/').replace(/\/+$/, '')
    const oldPath = note.filePath.replace(/\\/g, '/')
    const newPath = `${root}/${selected}/${fileName}`
    const before = { project: note.project ?? '', subProject: getSubProject(note) }

    setBusy(true)
    const result = await window.api.vault.moveNoteToProject(oldPath, newPath, {
      project,
      subProject: subProject.length > 0 ? subProject : null
    })
    setBusy(false)

    if (!result.ok) {
      pushToast(`이동 실패: ${result.error}`, 'error', 6000)
      return
    }

    onMoved(oldPath)
    onOpenChange(false)
    pushToast(`"${note.title}"을(를) ${selected}(으)로 옮겼습니다.`, 'success', 10000, {
      label: '되돌리기',
      onClick: () => {
        void window.api.vault
          .moveNoteToProject(newPath, oldPath, before)
          .then((undone) => {
            if (!undone.ok) {
              pushToast(`되돌리기 실패: ${undone.error}`, 'error', 6000)
            }
          })
      }
    })
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-xl">
        <DialogHeader>
          <DialogTitle>프로젝트로 이동</DialogTitle>
          <DialogDescription>
            파일을 옮기고 frontmatter 의 project · sub_project 를 함께 바꿉니다.
          </DialogDescription>
        </DialogHeader>

        {suggestions.length > 0 && (
          <div className="flex flex-wrap gap-1.5">
            <span className="text-xs text-muted-foreground dark:text-muted-foreground self-center">
              추천
            </span>
            {suggestions.map((path) => (
              <button
                key={path}
                onClick={() => handleSelect(path)}
                className="text-xs px-2 py-0.5 rounded-full border border-border text-foreground hover:bg-muted dark:text-foreground dark:hover:bg-muted"
              >
                {path}
              </button>
            ))}
          </div>
        )}

        <div className="border border-border rounded-md max-h-52 overflow-y-auto bg-muted/20 dark:bg-muted/20 py-1">
          {tree.length === 0 ? (
            <p className="text-xs text-muted-foreground dark:text-muted-foreground px-2 py-1">
              폴더를 불러오는 중입니다.
            </p>
          ) : (
            tree.map((node) => (
              <FolderRow
                key={node.path}
                node={node}
                selected={selected}
                onSelect={handleSelect}
                depth={0}
              />
            ))
          )}
        </div>

        <div className="grid grid-cols-2 gap-3">
          <label className="space-y-1.5">
            <span className="block text-xs font-medium text-muted-foreground dark:text-muted-foreground">
              project
            </span>
            <input
              aria-label="project"
              list="move-project-options"
              value={project}
              onChange={(e) => setProject(e.target.value)}
              className={inputCls}
            />
            <datalist id="move-project-options">
              {preset.projects.map((p) => (
                <option key={p} value={p} />
              ))}
            </datalist>
          </label>

          <label className="space-y-1.5">
            <span className="block text-xs font-medium text-muted-foreground dark:text-muted-foreground">
              sub_project
            </span>
            <input
              aria-label="sub_project"
              list="move-subproject-options"
              value={subProject}
              onChange={(e) => setSubProject(e.target.value)}
              className={inputCls}
            />
            <datalist id="move-subproject-options">
              {preset.subProjects.map((p) => (
                <option key={p} value={p} />
              ))}
            </datalist>
          </label>
        </div>

        {(offPreset.project || offPreset.subProject) && (
          <p className="text-xs text-destructive dark:text-destructive">
            preset에 없는 값입니다. 목록에서 고르거나 그대로 진행할 수 있습니다.
          </p>
        )}

        <DialogFooter>
          <button
            onClick={() => onOpenChange(false)}
            className="text-xs px-3 py-2 rounded-md border border-border text-muted-foreground hover:bg-muted dark:hover:bg-muted"
          >
            취소
          </button>
          <button
            onClick={() => void handleMove()}
            disabled={selected.length === 0 || project.length === 0 || busy}
            className="text-xs px-3 py-2 rounded-md bg-accent text-accent-foreground font-bold disabled:opacity-30 disabled:cursor-not-allowed hover:brightness-110"
          >
            이동
          </button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
```

- [ ] **Step 4: 테스트가 통과하는지 확인한다**

Run: `npx vitest run tests/integration/todo-move-dialog.test.tsx`
Expected: PASS

- [ ] **Step 5: AppShell 에서 대화상자를 연결한다**

`src/renderer/src/components/layout/AppShell.tsx`:

import 를 추가한다.

```tsx
import { MoveToProjectDialog } from '../todo/MoveToProjectDialog'
```

`presetProjects` 대신 preset 전체가 필요하므로 `vaultStore` 에서 꺼낸 값 옆에 지역 상태를 둔다. 컴포넌트 본문 상단에 추가한다.

```tsx
  const [moveTarget, setMoveTarget] = useState<Note | null>(null)
  const [preset, setPreset] = useState<{ projects: string[]; subProjects: string[] }>({
    projects: [],
    subProjects: []
  })

  useEffect(() => {
    if (!vaultPath) return
    window.api.vault
      .getPresetFields(vaultPath)
      .then((p) => {
        if (p) setPreset({ projects: p.projects, subProjects: p.subProjects })
      })
      .catch(() => {})
  }, [vaultPath])
```

`Note` 타입 import 를 기존 타입 import 줄에 추가한다.

```tsx
import type { ColumnConfig, Note, Status } from '@renderer/types'
```

`TodoView` 렌더에 `onMoveNote` 를 넘긴다.

```tsx
                  onMoveNote={(note) => setMoveTarget(note)}
```

`AiGroupingDialog` 렌더 아래에 대화상자를 추가한다.

```tsx
      {moveTarget && (
        <MoveToProjectDialog
          note={moveTarget}
          vaultPath={vaultPath}
          projectsFolder={projectsFolder}
          preset={preset}
          open
          onOpenChange={(next) => {
            if (!next) setMoveTarget(null)
          }}
          onMoved={(oldPath) => removeNote(oldPath)}
        />
      )}
```

- [ ] **Step 6: 전체 테스트·lint·빌드를 확인한다**

Run: `npm run test && npm run lint && npm run build`
Expected: 테스트 PASS, 신규 lint 오류 없음, 빌드 성공

- [ ] **Step 7: 커밋한다**

```bash
git add src/renderer/src/components/todo/MoveToProjectDialog.tsx src/renderer/src/components/layout/AppShell.tsx tests/integration/todo-move-dialog.test.tsx
git commit -m "feat(todo): 프로젝트 이동 대화상자 + 되돌리기 토스트"
```

---

### Task 8: 새 할일 노트 대화상자

**Files:**
- Create: `src/renderer/src/components/todo/NewTodoDialog.tsx`
- Modify: `src/renderer/src/components/layout/AppShell.tsx`
- Test: `tests/integration/todo-new-dialog.test.tsx` (신규)

**Interfaces:**
- Consumes: Task 3의 `buildTodoFilePath`·`buildTodoNoteContent`, Task 5의 `window.api.vault.createNote`·`window.api.vault.readNote`
- Produces: `NewTodoDialog(props: { vaultPath: string; todoFolder: string; preset: { projects: string[]; subProjects: string[] }; open: boolean; onOpenChange: (open: boolean) => void; onCreated: (note: Note) => void })`

- [ ] **Step 1: 실패하는 테스트를 작성한다**

`tests/integration/todo-new-dialog.test.tsx`:

```tsx
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, cleanup, fireEvent, waitFor } from '@testing-library/react'
import { createJSONStorage } from 'zustand/middleware'
import { useViewStore } from '../../src/renderer/src/stores/viewStore'
import { NewTodoDialog } from '../../src/renderer/src/components/todo/NewTodoDialog'
import type { Note } from '../../src/renderer/src/types'

const memoryStore = new Map<string, string>()
useViewStore.persist.setOptions({
  storage: createJSONStorage(() => ({
    getItem: (k: string) => memoryStore.get(k) ?? null,
    setItem: (k: string, v: string) => void memoryStore.set(k, v),
    removeItem: (k: string) => void memoryStore.delete(k)
  }))
})

const PRESET = { projects: ['에너빌드'], subProjects: ['에너지분석(에너빌드)'] }

let createNote: ReturnType<typeof vi.fn>
let readNote: ReturnType<typeof vi.fn>

function makeCreatedNote(): Note {
  return {
    filePath: 'C:/v/06_To Do/2026-09/0901_새 할일.md',
    relativePath: '06_To Do/2026-09/0901_새 할일.md',
    title: '0901_새 할일',
    status: 'planned',
    tags: [],
    created: '2026-09-01',
    body: '',
    mtime: 1
  }
}

beforeEach(() => {
  vi.useFakeTimers()
  vi.setSystemTime(new Date(2026, 8, 1))
  createNote = vi.fn().mockResolvedValue({ ok: true })
  readNote = vi.fn().mockResolvedValue(makeCreatedNote())
  // @ts-expect-error 테스트용 부분 구현
  window.api = { vault: { createNote, readNote } }
})

afterEach(() => {
  vi.useRealTimers()
  cleanup()
  vi.restoreAllMocks()
})

function renderDialog(onCreated = vi.fn()): ReturnType<typeof vi.fn> {
  render(
    <NewTodoDialog
      vaultPath="C:/v"
      todoFolder="06_To Do"
      preset={PRESET}
      open
      onOpenChange={() => {}}
      onCreated={onCreated}
    />
  )
  return onCreated
}

describe('NewTodoDialog', () => {
  it('제목이 비면 만들기 버튼이 비활성이다', () => {
    renderDialog()
    expect(screen.getByRole('button', { name: '만들기' })).toBeDisabled()
  })

  it('경로와 내용으로 createNote 를 부른다', async () => {
    renderDialog()
    fireEvent.change(screen.getByLabelText('제목'), { target: { value: '새 할일' } })
    fireEvent.change(screen.getByLabelText('project'), { target: { value: '에너빌드' } })
    fireEvent.click(screen.getByRole('button', { name: '만들기' }))

    await vi.waitFor(() => expect(createNote).toHaveBeenCalledTimes(1))
    const [path, content] = createNote.mock.calls[0]
    expect(path).toBe('C:/v/06_To Do/2026-09/0901_새 할일.md')
    expect(content).toContain('project: 에너빌드')
    expect(content).toContain('category: action')
  })

  it('생성 후 읽어온 노트를 onCreated 로 넘긴다', async () => {
    const onCreated = renderDialog()
    fireEvent.change(screen.getByLabelText('제목'), { target: { value: '새 할일' } })
    fireEvent.click(screen.getByRole('button', { name: '만들기' }))

    await vi.waitFor(() => expect(onCreated).toHaveBeenCalledTimes(1))
    expect(onCreated.mock.calls[0][0].filePath).toBe('C:/v/06_To Do/2026-09/0901_새 할일.md')
  })

  it('이미 있는 파일이면 오류 토스트를 띄운다', async () => {
    createNote.mockResolvedValue({ ok: false, code: 'exists', error: '이미 존재합니다' })
    const onCreated = renderDialog()
    fireEvent.change(screen.getByLabelText('제목'), { target: { value: '새 할일' } })
    fireEvent.click(screen.getByRole('button', { name: '만들기' }))

    await vi.waitFor(() =>
      expect(useViewStore.getState().toasts.at(-1)?.variant).toBe('error')
    )
    expect(onCreated).not.toHaveBeenCalled()
  })
})
```

> `waitFor` 는 가짜 타이머와 함께 쓰면 멈추므로 이 파일에서는 `vi.waitFor` 를 쓴다. `@testing-library/react` 의 `waitFor` import 는 남겨두지 말고 지운다.

- [ ] **Step 2: 테스트가 실패하는지 확인한다**

Run: `npx vitest run tests/integration/todo-new-dialog.test.tsx`
Expected: FAIL — `NewTodoDialog` 모듈을 찾을 수 없음

- [ ] **Step 3: 대화상자를 만든다**

`src/renderer/src/components/todo/NewTodoDialog.tsx`:

```tsx
import { useState } from 'react'
import type { Note, Priority } from '@renderer/types'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle
} from '../ui/dialog'
import { useViewStore } from '../../stores/viewStore'
import { buildTodoFilePath, buildTodoNoteContent } from '../../lib/todoModel'

interface Props {
  vaultPath: string
  todoFolder: string
  preset: { projects: string[]; subProjects: string[] }
  open: boolean
  onOpenChange: (open: boolean) => void
  onCreated: (note: Note) => void
}

const inputCls =
  'w-full text-xs bg-background text-foreground border border-border rounded-md px-2 py-1.5 dark:bg-background dark:text-foreground'

const labelCls = 'block text-xs font-medium text-muted-foreground dark:text-muted-foreground'

export function NewTodoDialog({
  vaultPath,
  todoFolder,
  preset,
  open,
  onOpenChange,
  onCreated
}: Props): JSX.Element {
  const pushToast = useViewStore((s) => s.pushToast)
  const [title, setTitle] = useState('')
  const [project, setProject] = useState('')
  const [subProject, setSubProject] = useState('')
  const [priority, setPriority] = useState<Priority>('mid')
  const [busy, setBusy] = useState(false)

  async function handleCreate(): Promise<void> {
    const now = new Date()
    const filePath = buildTodoFilePath(vaultPath, todoFolder, title, now)
    const content = buildTodoNoteContent({
      title,
      project: project.length > 0 ? project : undefined,
      subProject: subProject.length > 0 ? subProject : undefined,
      priority,
      now
    })

    setBusy(true)
    const result = await window.api.vault.createNote(filePath, content)
    setBusy(false)

    if (!result.ok) {
      pushToast(`할일 생성 실패: ${result.error}`, 'error', 6000)
      return
    }

    try {
      const created = await window.api.vault.readNote(filePath)
      onCreated(created)
    } catch (error) {
      pushToast(
        `생성은 됐지만 읽지 못했습니다: ${error instanceof Error ? error.message : '알 수 없는 오류'}`,
        'error',
        6000
      )
    }
    onOpenChange(false)
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>새 할일</DialogTitle>
          <DialogDescription>
            `{todoFolder}` 아래 이번 달 폴더에 노트를 만듭니다.
          </DialogDescription>
        </DialogHeader>

        <label className="space-y-1.5 block">
          <span className={labelCls}>제목</span>
          <input
            aria-label="제목"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            className={inputCls}
            placeholder="무엇을 해야 하는지"
          />
        </label>

        <div className="grid grid-cols-2 gap-3">
          <label className="space-y-1.5 block">
            <span className={labelCls}>project</span>
            <input
              aria-label="project"
              list="new-todo-project-options"
              value={project}
              onChange={(e) => setProject(e.target.value)}
              className={inputCls}
            />
            <datalist id="new-todo-project-options">
              {preset.projects.map((p) => (
                <option key={p} value={p} />
              ))}
            </datalist>
          </label>

          <label className="space-y-1.5 block">
            <span className={labelCls}>sub_project</span>
            <input
              aria-label="sub_project"
              list="new-todo-subproject-options"
              value={subProject}
              onChange={(e) => setSubProject(e.target.value)}
              className={inputCls}
            />
            <datalist id="new-todo-subproject-options">
              {preset.subProjects.map((p) => (
                <option key={p} value={p} />
              ))}
            </datalist>
          </label>
        </div>

        <label className="space-y-1.5 block">
          <span className={labelCls}>우선순위</span>
          <select
            aria-label="우선순위"
            value={priority}
            onChange={(e) => setPriority(e.target.value as Priority)}
            className={inputCls}
          >
            <option value="high">높음</option>
            <option value="mid">보통</option>
            <option value="low">낮음</option>
          </select>
        </label>

        <DialogFooter>
          <button
            onClick={() => onOpenChange(false)}
            className="text-xs px-3 py-2 rounded-md border border-border text-muted-foreground hover:bg-muted dark:hover:bg-muted"
          >
            취소
          </button>
          <button
            onClick={() => void handleCreate()}
            disabled={title.trim().length === 0 || busy}
            className="text-xs px-3 py-2 rounded-md bg-accent text-accent-foreground font-bold disabled:opacity-30 disabled:cursor-not-allowed hover:brightness-110"
          >
            만들기
          </button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
```

- [ ] **Step 4: 테스트가 통과하는지 확인한다**

Run: `npx vitest run tests/integration/todo-new-dialog.test.tsx`
Expected: PASS

- [ ] **Step 5: AppShell 에서 연결한다**

`src/renderer/src/components/layout/AppShell.tsx`:

import 를 추가한다.

```tsx
import { NewTodoDialog } from '../todo/NewTodoDialog'
```

지역 상태를 추가한다.

```tsx
  const [showNewTodo, setShowNewTodo] = useState(false)
```

`vaultStore` 구조 분해에 `setNotes` 를 추가한다(생성된 노트를 목록에 넣기 위해).

```tsx
    removeNote,
    setNotes
```

`TodoView` 렌더에 `onCreateTodo` 를 넘긴다.

```tsx
                  onCreateTodo={() => setShowNewTodo(true)}
```

`MoveToProjectDialog` 렌더 아래에 추가한다.

```tsx
      {showNewTodo && (
        <NewTodoDialog
          vaultPath={vaultPath}
          todoFolder={todoFolder}
          preset={preset}
          open
          onOpenChange={setShowNewTodo}
          onCreated={(created) => {
            setNotes([...notes, created])
            openNote(created)
          }}
        />
      )}
```

- [ ] **Step 6: 전체 테스트·lint·빌드를 확인한다**

Run: `npm run test && npm run lint && npm run build`
Expected: 테스트 PASS, 신규 lint 오류 없음, 빌드 성공

- [ ] **Step 7: 커밋한다**

```bash
git add src/renderer/src/components/todo/NewTodoDialog.tsx src/renderer/src/components/layout/AppShell.tsx tests/integration/todo-new-dialog.test.tsx
git commit -m "feat(todo): 새 할일 노트 생성 대화상자"
```

---

### Task 9: 육안 확인

자동 테스트가 통과해도 실제 앱에서 렌더가 깨질 수 있다. 실행해서 눈으로 본다.

**Files:**
- 없음 (검증만. 문제가 나오면 해당 태스크로 돌아가 고친다)

**Interfaces:**
- Consumes: Task 6·7·8의 화면 전부
- Produces: 스크린샷 4장

- [ ] **Step 1: 드라이버가 사용자 설정을 지우지 않게 준비한다**

`run-visual-check` 스킬의 드라이버를 스크래치패드로 복사해 쓰되, **localStorage 주입 전에 원본을 백업하고 `finally` 에서 되돌리는 코드**를 반드시 넣는다. 2026-08-07 세션에서 이 백업이 없어 사용자의 스윔레인·필터 설정이 초기화된 적이 있다.

```js
// 주입 전
const original = await page.evaluate(() => localStorage.getItem('vault-kanban-view'))
await fs.writeFile(backupPath, original ?? '', 'utf-8')
try {
  // ... 주입하고 검증
} finally {
  await page.evaluate((v) => {
    if (v === '') localStorage.removeItem('vault-kanban-view')
    else localStorage.setItem('vault-kanban-view', v)
  }, original ?? '')
}
```

- [ ] **Step 2: 앱을 띄워 To Do 화면을 확인한다**

`run-visual-check` 스킬을 실행한다. 확인 항목:

1. 사이드바에 `To Do` 항목이 보이고, 눌렀을 때 표가 뜬다
2. 정렬 드롭다운을 `마감 임박` 으로 바꾸면 행 순서가 바뀐다
3. 검색창에 `BIPV` 를 넣으면 행이 줄어든다
4. 다크 모드에서 표 머리·행·드롭다운 색이 모두 읽힌다

- [ ] **Step 3: 이동 대화상자를 확인한다**

`프로젝트로 이동` 버튼을 눌러 확인한다.

1. `01_Projects` 하위 트리만 보인다 (볼트 최상위 폴더가 아니라)
2. 폴더를 고르면 project · sub_project 미리보기가 채워진다
3. `01_신재생에너지검토제안(EPC)` 을 고르면 preset 경고 문구가 뜬다
4. 취소로 닫아 실제 파일은 옮기지 않는다

- [ ] **Step 4: 새 할일 대화상자를 확인한다**

`새 할일` 버튼을 눌러 대화상자가 뜨는지 보고, **만들지 않고 취소**한다. 실제 볼트에 테스트 노트를 남기지 않는다.

- [ ] **Step 5: 스크린샷 4장을 남기고 결과를 보고한다**

목록 화면(라이트·다크), 이동 대화상자, 새 할일 대화상자. 깨진 항목이 있으면 해당 태스크로 돌아가 고치고 이 태스크를 다시 실행한다.

- [ ] **Step 6: 백업 원복을 확인한다**

앱을 다시 띄워 칸반의 스윔레인·필터 설정이 검증 전과 같은지 확인한다. 달라졌으면 사용자에게 알린다.

---

## Self-Review

**Spec coverage**

| 스펙 항목 | 태스크 |
|---|---|
| 2장 frontmatter 미지 키 보존 · title 미주입 · null 표기 허용 | Task 1 |
| 3.1 기존 vaultStore 재사용, 폴더 기준 판정 | Task 6 (`selectTodoNotes`) |
| 3.2 `todoFolder` · `projectsFolder` 설정 | Task 4 |
| 3.3 MM preset `sub_project` | Task 2 |
| 3.4 순수 함수 9개 + 정렬·검색 규칙 | Task 3 |
| 3.5 `'todo'` 라우트, `todoSort`·`todoKeyword`, persist v5 | Task 4 |
| 3.6 표 6열 + 인라인 편집 + parseError 비활성 + 사이드바 | Task 6 |
| 3.7 이동 대화상자·추천·offPreset 경고·IPC 4단계·되돌리기 | Task 5 (IPC), Task 7 (UI) |
| 3.8 새 할일 노트 `wx` 생성·키 순서·본문 뼈대 | Task 5 (IPC), Task 8 (UI) |
| 5장 테스트 계획 | Task 1·2·3·5·6·7·8의 Step 1, Task 9 육안 |
| 6장 엣지 케이스 | exists/롤백 = Task 5 테스트, parseError = Task 6 테스트, 빈 폴더 안내 = Task 6 테스트, preset 없음 = Task 3 테스트 |

**Placeholder scan**: 없음. 모든 코드 단계에 실제 코드 블록이 들어 있다.

**Type consistency**: `FileOpResult`·`ProjectPatch`(Task 5)는 preload(Task 5 Step 6·7)와 대화상자(Task 7·8)에서 같은 이름으로 쓴다. `TodoSortKey`는 Task 3에서 정의해 Task 4 viewStore와 Task 6 TodoView가 `../lib/todoModel`에서 가져온다. `getSubProject`는 Task 3에서 정의해 Task 6·7이 쓴다. `preset` 프로퍼티는 세 곳 모두 `{ projects: string[]; subProjects: string[] }` 형태다.

**남은 위험 하나**: Task 6 Step 6의 `projectsFolder` 상태는 Task 7에서야 소비된다. 두 태스크를 따로 실행하면 Task 6에서 `no-unused-vars` lint 오류가 날 수 있다. 그 경우 Task 6에서는 `todoFolder` 만 두고 `projectsFolder` 추가를 Task 7 Step 5로 미룬다(Step 6 본문에 명시해 둠).
