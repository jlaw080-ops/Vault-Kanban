# To Do 관리 화면 + 프로젝트 이동 설계

- 날짜: 2026-09-01
- 상태: 사용자 승인된 요구사항 기반 설계
- 배경: 볼트의 `06_To Do` 폴더에 월별로 할일 노트가 쌓이는데, 앱에서는 칸반 보드의
  폴더 필터로만 볼 수 있다. 할일을 한눈에 훑고, 끝난 할일을 해당 프로젝트 폴더로
  보내는 흐름을 앱 안에서 처리한다.

## 1. 확정 요구사항

사용자와의 브레인스토밍에서 확정한 항목이다.

1. **이동의 의미**: 파일을 `01_Projects/<프로젝트>/<세부폴더>/`로 실제 이동하고,
   동시에 frontmatter의 `project`·`sub_project` 값도 그 폴더에 맞게 갱신한다.
2. **화면**: 사이드바에 `To Do` 전용 라우트를 신설한다. 칸반이 아니라 리스트/테이블로
   보여준다.
3. **목적지 결정**: 폴더 트리에서 사용자가 직접 고른다. 현재 `project` 값과 이름이
   비슷한 폴더를 추천으로 위에 올리되, 최종 선택은 항상 사용자가 한다.
4. **frontmatter 값**: 폴더명의 숫자 접두를 떼어 기본값을 만들고, Metadata Menu
   preset에 대응 표기가 있으면 그쪽을 채택한다. 보정에 실패하면 경고를 띄우고
   사용자가 preset 목록에서 고른다. 대화상자에서 언제든 수정할 수 있다.
5. **안전장치**: 이동 전 확인 대화상자, 이동 후 "되돌리기" 버튼이 달린 토스트.
6. **화면에서 할 수 있는 일**: 상태 변경, 노트 열기, 우선순위·마감 인라인 편집,
   새 할일 노트 생성.

## 2. 전제조건 — frontmatter 미지 키 유실 수정

`serializeNote`는 `KNOWN_KEYS` 9개(`title`·`status`·`priority`·`due`·`tags`·
`project`·`created`·`started`·`completed`)만 다시 쓰고 나머지 키는 버린다.
`originalKeyOrder`는 순서만 기억할 뿐 값을 보존하지 않는다.

2026-09-01 실측 — 실제 To Do 노트를 `parseNote` → `serializeNote` 왕복시킨 결과:

```
저장 전                          저장 후
project: 에너빌드                project: 에너빌드
sub_project: 에너지분석(에너빌드)   priority: high
priority: high                   status: planned
category: action                 tags: []
status: planned                  created: '2026-08-31'
works:                           completed: null
tags: []                         title: a          ← 원본에 없던 키
created: 2026-08-31
updated:
completed:
```

`sub_project`·`category`·`works`·`updated` 4개 키가 사라진다. `sub_project`를
동기화하려면 이 문제를 먼저 고쳐야 하므로, 이 브랜치의 첫 커밋으로 분리해 처리한다.

### 2.1 Note 타입 확장

```ts
export interface Note {
  // ...기존 필드
  /** KNOWN_KEYS 및 statusFieldKey 밖의 frontmatter 키 원본값. 저장 시 그대로 복원한다. */
  extraFrontmatter?: Record<string, unknown>
}
```

- `parseNote`: frontmatter 전체를 순회해 `KNOWN_KEYS`에도 `statusFieldKey`에도
  없는 키를 `extraFrontmatter`에 원본값 그대로 담는다. 비어 있으면 필드를 넣지 않는다.
- `serializeNote`: `buildFrontmatterMap` 결과에 `extraFrontmatter`를 병합한다.
  키 순서는 기존 `originalKeyOrder` 로직이 그대로 처리한다.
- `title` 주입 중단: 원본에 `title` 키가 있었을 때(`originalKeyOrder`에 포함)만 쓴다.
  `originalKeyOrder` 자체가 없는 노트(= frontmatter 없는 노트)는 기존 동작인
  `DEFAULT_KEY_ORDER` 경로를 그대로 유지한다.

### 2.2 허용하는 표기 변경

원본의 빈 값(`works:`)은 gray-matter가 `null`로 읽고 `works: null`로 다시 쓴다.
YAML상 동치이므로 허용한다. 정규식 후처리로 되돌리지 않는다(CLAUDE.md CRITICAL —
frontmatter는 gray-matter만 사용).

## 3. 아키텍처

### 3.1 데이터 경로 — 기존 vaultStore 재사용

새 스토어를 만들지 않는다(CLAUDE.md — 스토어는 세 개만). 볼트 전체 스캔 결과에서
To Do 폴더 아래 노트만 골라 쓴다. 대상 파일이 57개 수준이라 성능 문제가 없고,
파일 워처·외부 변경 동기화가 이미 동작한다.

**판정은 폴더 기준으로만 한다.** `category: action`이 아닌 노트도 To Do 폴더에
있으면 목록에 나온다.

### 3.2 설정 확장 — `Settings`

```ts
todoFolder: string      // 기본 '06_To Do'
projectsFolder: string  // 기본 '01_Projects'
```

`settings.ts`의 `DEFAULT_SETTINGS`에 추가한다. electron-store는 누락 키에 기본값을
돌려주므로 기존 사용자에게도 자동 적용된다. `SettingsPanel`에 텍스트 입력 두 개를
추가한다(볼트 루트 기준 상대 경로).

### 3.3 preset 파서 확장 — `src/main/utils/metadataMenu.ts`

현재 파서는 `FIELD_TO_KEY`에 `project`·`status`·`priority`만 있어 `sub_project`를
읽지 못한다. 2026-09-01 실측 기준 볼트의 preset은 다음과 같다.

| 필드 | 값 |
|---|---|
| `project` | 신재생에너지제안(EPC) / 에너빌드 / 분산자원통합운영플랫폼 / 연료전지급탕패키지 / BIPV특허기획 / 인력양성사업 / 에너지노관리 / Private |
| `sub_project` | 디벨로퍼(에너빌드) / 에너지절약계획서(에너빌드) / 에너지분석(에너빌드) / ` 리포트(에너빌드)` / RTU개발및시제품제작 / 분산자원플랫폼(SW)개발 |

`FIELD_TO_KEY`에 `sub_project: 'subProjects'`를 추가하고 `PresetFieldValues`를 넓힌다.

```ts
export interface PresetFieldValues {
  projects: string[]
  subProjects: string[]   // 신규
  statuses: string[]
  priorities: string[]
}
```

기존 소비처 세 곳(ControlBar 레인 팝오버·필터 칩·NoteEditor datalist)은 `projects`만
쓰므로 영향이 없다. 값 추출 로직(`extractValues`)은 그대로 재사용한다 —
` 리포트(에너빌드)`처럼 앞에 공백이 있는 값은 이미 `trim()`으로 정리된다.

### 3.4 순수 함수 — `src/renderer/src/lib/todoModel.ts` (신규)

`viewModel.ts`가 이미 크므로 별도 파일로 둔다.

```ts
export type TodoSortKey = 'createdDesc' | 'dueAsc' | 'priorityDesc' | 'status'

/** relativePath 가 todoFolder 아래인 노트만 반환. 경로 구분자는 '/'로 정규화 후 비교. */
export function selectTodoNotes(notes: readonly Note[], todoFolder: string): Note[]

/** 목적지 폴더 상대경로 → frontmatter 값. 숫자 접두 제거 후 preset 표기로 보정. */
export function deriveProjectMeta(
  destRelPath: string,          // '01_Projects/02_에너빌드/03_에너지분석'
  projectsFolder: string,       // '01_Projects'
  preset: { projects: readonly string[]; subProjects: readonly string[] }
): {
  project: string
  subProject: string | null
  /** preset 목록에 없는 값. 대화상자에서 경고를 띄울 대상 */
  offPreset: { project: boolean; subProject: boolean }
}

/** currentProject 와 이름이 겹치는 폴더를 앞으로 정렬. 없으면 빈 배열. */
export function suggestProjectFolders(
  folderPaths: readonly string[],
  currentProject: string | undefined
): string[]

/** 정렬 키에 따라 복사본을 정렬해 반환(원본 불변). statusOrder 는 Settings.statusColumns 이름 순서. */
export function sortTodos(
  notes: readonly Note[], key: TodoSortKey, statusOrder: readonly string[]
): Note[]

/** 제목·project·sub_project 부분 일치(대소문자 무시)로 거른다. keyword 가 비면 원본 그대로. */
export function filterTodosByKeyword(notes: readonly Note[], keyword: string): Note[]

/** <vault>/06_To Do/2026-09/0901_제목.md */
export function buildTodoFilePath(
  vaultPath: string, todoFolder: string, title: string, now: Date
): string

/** 새 할일 노트의 전체 마크다운(frontmatter 포함). gray-matter로 생성. */
export function buildTodoNoteContent(input: {
  title: string
  project?: string
  subProject?: string
  priority: Priority
  now: Date
}): string
```

**`deriveProjectMeta` 규칙**

1. `projectsFolder` 접두를 떼고 세그먼트로 나눈다 → `['02_에너빌드', '03_에너지분석']`
2. 각 세그먼트에서 `/^\d+[_-]\s*/` 를 제거 → `['에너빌드', '에너지분석']`
3. `project` = 첫 세그먼트, `subProject` 후보 = 마지막 세그먼트(세그먼트가 2개 이상일 때).
4. preset 보정: 해당 preset 목록 중 후보와 완전히 같거나, 후보를 부분 문자열로
   포함하는 항목이 **정확히 하나**면 그 표기를 채택한다
   (`에너지분석` → `에너지분석(에너빌드)`).
5. 보정에 실패했을 때:
   - `project`: 파생값을 그대로 제안하고 `offPreset.project = true`로 표시한다.
   - `subProject`: **`null`을 반환한다.** 폴더 2단계가 언제나 sub_project 개념인 것은
     아니다(`01_신재생에너지검토제안(EPC)/0813_데이터센터사업`처럼 개별 건 폴더일 수
     있다). preset에 없는 값을 임의로 만들어 넣지 않고, 노트의 기존 값을 유지한다.

**보정이 실패하는 실제 사례** — 폴더 `01_신재생에너지검토제안(EPC)`는 접두를 떼면
`신재생에너지검토제안(EPC)`인데 preset 값은 `신재생에너지제안(EPC)`이다. 어느 쪽도
서로를 포함하지 않아 4단계가 실패한다. 자동 유사도 매칭은 결과를 예측하기 어려우므로
쓰지 않고, 대화상자에서 사용자가 preset 목록에서 고르게 한다(3.7 참조).

**`buildTodoFilePath` 규칙**

- 월 폴더는 `YYYY-MM`(현재 볼트의 최신 관례인 `2026-08` 형식).
- 파일명은 `MMDD_<제목>.md`.
- 제목에서 `\ / : * ? " < > |` 를 제거하고 앞뒤 공백을 다듬는다. 120자로 자른다.
- 제목이 비면 `무제`.

### 3.5 viewStore — 라우트와 정렬 상태

```ts
export type AppRoute = 'kanban' | 'dashboard' | 'migration' | 'settings' | 'daily' | 'todo'

todoSort: TodoSortKey      // 기본 'createdDesc'
todoKeyword: string        // 기본 ''
setTodoSort: (key: TodoSortKey) => void
setTodoKeyword: (keyword: string) => void
```

- `partialize`에 `todoSort`·`todoKeyword` 포함.
- persist 버전 v4→**v5**. migrate에서 `todoSort: 'createdDesc'`, `todoKeyword: ''` 주입.
- `todoKeyword`는 제목·`project`·`sub_project` 세 값에 대해 대소문자 무시 부분 일치로
  거른다. 칸반의 `filters`와는 별개 상태다.

`sortTodos` 정렬 규칙:

| 키 | 순서 | 값이 없는 노트 |
|---|---|---|
| `createdDesc` | `created` 내림차순 | 맨 뒤 |
| `dueAsc` | `due` 오름차순 | 맨 뒤 |
| `priorityDesc` | high → mid → low | 맨 뒤 |
| `status` | `Settings.statusColumns` 순서 | 목록에 없는 상태는 맨 뒤 |

같은 값이면 `title` 오름차순(`localeCompare`, 로케일 `ko`)으로 안정화한다.

### 3.6 화면 — `src/renderer/src/components/todo/`

| 파일 | 역할 |
|---|---|
| `TodoView.tsx` | 라우트 진입점. 툴바(정렬·검색·새 할일) + 테이블 |
| `TodoRow.tsx` | 한 행. 인라인 편집 셀 |
| `MoveToProjectDialog.tsx` | 폴더 선택 + frontmatter 미리보기 + 확인 |
| `NewTodoDialog.tsx` | 새 할일 입력 |

**테이블 열**: 제목 / 프로젝트·세부 / 우선순위 / 상태 / 생성일 / 마감 / 동작

- 상태 셀: 드롭다운. 변경 시 기존 `statusTransition.apply`를 거쳐 `started`·
  `completed`가 자동 기록된 뒤 `vault:writeNote`.
- 우선순위 셀: 드롭다운(high/mid/low/없음).
- 마감 셀: `<input type="date">`.
- 제목 클릭: 기존 `NoteEditor` 패널을 연다(칸반과 같은 방식).
- 동작 열: "프로젝트로 이동" 버튼.
- `parseError`가 있는 노트는 행에 경고 표시를 하고 편집·이동 컨트롤을 비활성화한다.
  본문이 온전히 파싱되지 않은 상태로 저장하면 내용이 손상될 수 있다.
- 모든 색상 클래스에 `dark:` 변형을 병기한다. 아이콘은 `lucide-react`.

`AppShell` 사이드바에 `To Do` 항목을 추가한다.

### 3.7 프로젝트로 이동

**대화상자 흐름**

1. `vault:listFolders`로 받은 트리에서 `projectsFolder` 하위만 보여준다
   (기존 `FolderTreePicker` 재사용).
2. `suggestProjectFolders`로 뽑은 추천 폴더를 트리 위에 별도 줄로 표시한다.
3. 폴더를 고르면 `deriveProjectMeta` 결과를 미리보기로 보여준다. `project`·
   `sub_project` 둘 다 preset 값 목록을 단 `<select>` + 직접 입력으로 그 자리에서
   고칠 수 있다.
4. `offPreset`이 `true`인 값에는 "preset에 없는 값" 경고를 붙인다. 진행은 막지
   않는다 — 폴더가 preset보다 먼저 생기는 경우가 있다.
5. 확인 버튼을 누르면 이동한다.

**IPC — `vault:moveNoteToProject`**

```ts
(oldPath: string, newPath: string, patch: { project: string; subProject: string | null })
  => { ok: true } | { ok: false; code: 'exists' | 'io'; error: string }
```

새 경로에 먼저 쓰고 원본을 지우는 순서로 간다. 중간에 실패해도 원본이 남는다.

1. `newPath`가 이미 있으면 `code: 'exists'`로 즉시 실패한다. **덮어쓰지 않는다.**
2. `readSingleNote(oldPath)` → `project`와 `extraFrontmatter.sub_project`를 patch
   값으로 갱신 → `serializeNote`.
   - `subProject`가 `null`이면 **`sub_project` 키를 건드리지 않는다.** 원래 값이
     있으면 그대로 두고, 없으면 새로 만들지 않는다.
   - `updated`·`category`·`works`는 v1에서 갱신하지 않는다. `extraFrontmatter`로
     보존만 한다.
3. `mkdir -p dirname(newPath)` 후, `recentlyWrittenByApp`에 `newPath`를 넣고 쓴다.
4. `recentlyWrittenByApp`에 `oldPath`를 넣고 `unlink(oldPath)`.
   실패하면 방금 쓴 `newPath`를 지워 롤백하고 `code: 'io'`로 반환한다.

**되돌리기**

렌더러가 이동 직전에 `{ oldPath, project, subProject }` 스냅샷을 들고 있다가,
토스트의 "되돌리기"를 누르면 같은 IPC를 역방향으로 호출한다. 원래 경로에 그 사이
다른 파일이 생겼으면 `exists`로 실패하고 그 사실을 토스트로 알린다.

### 3.8 새 할일 노트

**IPC — `vault:createNote`**

```ts
(filePath: string, content: string)
  => { ok: true } | { ok: false; code: 'exists' | 'io'; error: string }
```

`mkdir -p` 후 `wx` 플래그로 배타적 생성한다(경쟁 없이 중복을 막는다).
`recentlyWrittenByApp`에 등록한다.

**생성 내용** — 현재 볼트 To Do 노트와 같은 키 순서를 유지한다.

```yaml
project:
sub_project:
priority: mid
category: action
status: planned
works:
tags: []
created: 2026-09-01
updated:
completed:
```

본문은 `## 업무 개요` / `## 출처` / `## 배경` 뼈대만 넣는다.
생성 후 그 노트를 `NoteEditor`로 연다.

## 4. 범위 제외

v1에서 다루지 않는다.

- 여러 건 선택 후 일괄 이동
- 프로젝트 → To Do 역이동
- 반복 할일, 마감 알림
- 볼트 전역 동명 파일 검사 (이동 시 목적지 폴더만 검사한다. 6장 참조)
- To Do 폴더 자체를 앱에서 만들거나 옮기는 기능

## 5. 테스트 계획 (TDD)

**순수 함수 — 100% 작성**

| 파일 | 케이스 |
|---|---|
| `noteParser.test.ts` | 실제 To Do frontmatter 10키 왕복 보존 / 원본에 없던 `title` 미주입 / `statusFieldKey`가 `상태`일 때 `extraFrontmatter`에 중복 안 들어감 / frontmatter 없는 노트는 기존 동작 유지 / 키 순서 보존 |
| `metadataMenu.test.ts` | `sub_project` preset을 `subProjects`로 읽는다 / 앞 공백 값 trim / `sub_project` 필드가 없는 data.json에서 빈 배열 |
| `todoModel.test.ts` | `selectTodoNotes` 경로 구분자·하위 폴더·경계값 / `deriveProjectMeta` 접두 제거·preset 단일 매치·다중 매치·매치 실패 시 `offPreset`·`subProject` null·1단 폴더 / `suggestProjectFolders` / `sortTodos` 4개 키 + 값 없는 노트 후순위 + 원본 불변 / `filterTodosByKeyword` / `buildTodoFilePath` 금지문자·빈 제목·길이 / `buildTodoNoteContent` 키 순서 |

**통합 테스트 — `tests/integration/todo-move.test.ts`**

- 이동 성공 → 새 경로에 파일 존재, 원본 없음, frontmatter 갱신됨, 미지 키 보존됨
- 목적지에 동명 파일 → `exists` 반환, 원본 그대로
- unlink 실패 → 롤백되어 새 경로 파일이 지워지고 원본 유지
- `createNote` 성공 / 중복 시 `exists`

**육안 확인**

`run-visual-check`로 To Do 화면 렌더, 이동 대화상자, 이동 후 토스트를 확인한다.
지난 세션 교훈대로 드라이버는 주입 전 `vault-kanban-view` localStorage 원본을
파일로 백업하고 `finally`에서 원복한다.

## 6. 엣지 케이스

| 상황 | 처리 |
|---|---|
| 목적지에 동명 파일 | 이동 거부, 토스트 안내. 덮어쓰지 않음 |
| 이동 중 파일 워처 이벤트 | 두 경로 모두 `recentlyWrittenByApp` 등록 |
| 위키링크 | Obsidian 위키링크는 이름 기반이라 이동해도 유지된다. 볼트 전역 동명 충돌은 검사하지 않음(범위 제외) |
| `todoFolder`가 없거나 비어 있음 | 빈 상태 화면 + 설정으로 가는 안내 |
| frontmatter 없는 노트(`무제.md`) | 목록에 표시(status `backlog`). 이동 시 frontmatter를 새로 만든다 |
| `parseError` 노트 | 목록에는 표시하되 편집·이동 비활성화 |
| preset을 못 읽는 볼트 | `deriveProjectMeta`는 보정 없이 파생값을 그대로 쓴다 |
| 월 폴더가 없음 | `mkdir -p`로 만든다 |

## 7. 커밋 순서

1. `fix(note): frontmatter 미지 키 보존 + title 미주입` — 2장. 단독으로 검증 가능
2. `feat(metadata-menu): sub_project preset 읽기` — 3.3
3. `feat(todo): todoModel 순수 함수` — 3.4
4. `feat(todo): Settings todoFolder·projectsFolder + viewStore persist v5` — 3.2, 3.5
5. `feat(todo): 이동·생성 IPC + preload 노출` — 3.7, 3.8
6. `feat(todo): To Do 화면 + 이동/생성 대화상자` — 3.6
