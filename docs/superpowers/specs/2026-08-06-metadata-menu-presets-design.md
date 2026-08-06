# Metadata Menu preset fields 연동 설계

- 날짜: 2026-08-06
- 상태: 사용자 승인된 접근(A안) 기반 설계
- 배경: 스윔레인 도입으로 프로젝트 선택 UI가 3곳으로 늘었는데, 선택지가 "노트에 이미 존재하는
  값"에서만 유도됨. 사용자의 Obsidian 볼트는 커뮤니티 플러그인 **Metadata Menu**의
  preset fields settings로 frontmatter 값 체계를 관리하므로, 그 값을 앱의 단일 소스로 쓴다.

## 1. 목표

앱이 사용하는 frontmatter 메타데이터 선택지를 볼트의
`.obsidian/plugins/metadata-menu/data.json` → `presetFields`에서 읽어 사용한다.

## 2. 확정 요구사항

1. **적용 범위 = 앱이 이미 쓰는 필드만.**
   - `project`: 선택지 3곳(스윔레인 레인 후보, 필터 칩, NoteEditor datalist)에 MM preset 사용.
   - `status`·`priority`: 앱 하드코딩 구조 유지(컬럼·전이 로직 불변). MM 값을 읽어
     **일치 검증만** 하고, 불일치 시 경고 toast로 표면화.
   - `sub_project`/`category`/`works` 등 앱이 안 쓰는 preset 필드: 이번 범위 아님.
2. **합집합.** 선택지 = MM preset 목록 ∪ 노트에서 유도한 값. 순서는 **MM preset 정의 순서
   우선**, 노트에만 있는 값은 뒤에 가나다순. (preset에 없는 값을 가진 노트도 필터·레인에서
   숨겨지지 않는다)
3. **볼트 로드 시 1회 읽기.** 앱 시작·새로고침 버튼에서 읽는다. 파일 없음/파싱 실패/플러그인
   미설치 → `null` 반환 → 현재처럼 노트 유도만 사용 (조용한 폴백, 단 콘솔에 사유 로그).

## 3. 참조: 현재 볼트의 preset (2026-08-06 실측)

```
status   : backlog / planned / in-progress / review / done   ← 앱 STATUS_COLUMNS와 일치
priority : 낮음→low / 중간→mid / 높음→high                   ← 앱 Priority와 일치
project  : 신재생에너지제안(EPC), 에너빌드, 분산자원통합운영플랫폼, 연료전지급탕패키지,
           BIPV특허기획, 인력양성사업, 에너지노관리, Private (8개, 순서 있음)
```

data.json 구조 (Select 필드):

```json
{ "name": "project", "type": "Select",
  "options": { "sourceType": "ValuesList",
               "valuesList": { "1": "값A", "2": "값B" } } }
```

- `valuesList`는 순번 문자열 키의 객체 — 키의 숫자 순서가 사용자가 정한 표시 순서.
- `priority`처럼 키가 순번이 아닌 경우(`"낮음": "low"`)도 있음 — **값(value)만 취한다**
  (키는 표시명일 수 있으나 앱은 frontmatter에 저장되는 값 기준).
- `sourceType`이 `ValuesList`가 아닌 필드(DVQuery 등)는 무시.

## 4. 아키텍처 (A안)

### 4.1 순수 파서 — `src/main/utils/metadataMenu.ts` (신규)

```ts
export interface PresetFieldValues {
  projects: string[]
  statuses: string[]
  priorities: string[]
}

// jsonText 파싱 실패, presetFields 없음 → null. 개별 필드 없음 → 빈 배열.
export function parseMetadataMenuPresets(jsonText: string): PresetFieldValues | null
```

규칙:
- `presetFields`에서 `name`이 `project`/`status`/`priority`이고 `type === 'Select'`,
  `options.sourceType === 'ValuesList'`인 항목만 취급.
- `valuesList`의 값들을 **키의 숫자 오름차순**으로 정렬해 배열로. 숫자가 아닌 키가 섞이면
  숫자 키 먼저(오름차순), 비숫자 키는 뒤에 삽입 순서대로.
- 빈 문자열·공백만인 값 제외, 값 trim, 중복 제거.
- TDD 100% (같은 폴더 `metadataMenu.test.ts`).

### 4.2 IPC — `vault:getPresetFields`

- `src/main/ipc/vault.ts`: `ipcMain.handle('vault:getPresetFields', (_e, vaultPath) => ...)`
  — `path.join(vaultPath, '.obsidian', 'plugins', 'metadata-menu', 'data.json')`을 읽어
  파서에 넘긴다. 파일 없음/읽기 실패 → `null` (콘솔 로그).
- `src/preload/index.ts`: `vault.getPresetFields(vaultPath): Promise<PresetFieldValues | null>`
  노출. 기존 채널 명명(`vault:*`) 관례 준수.

### 4.3 vaultStore — preset 보관 + 검증

- `presetProjects: string[]` 필드 추가 (기본 `[]`). persist 아님 (볼트 로드마다 갱신).
- `loadVault` 성공 흐름에서 `getPresetFields` 호출:
  - `result?.projects` → `presetProjects` 저장. null이면 `[]`.
  - **검증**: `result.statuses`가 비어있지 않고 앱 `STATUS_COLUMNS`와 집합이 다르면,
    또는 `result.priorities`가 비어있지 않고 `['low','mid','high']`와 집합이 다르면
    경고 toast 1회: "Metadata Menu의 status/priority 정의가 앱과 다릅니다: <차이>".
    렌더 동작에는 영향 없음 (규칙 12: 불일치를 숨기지 않는다).

### 4.4 합집합 헬퍼 — `viewModel.ts`

```ts
// preset 순서 우선, derived에만 있는 값은 뒤에 localeCompare('ko') 정렬로 덧붙임. 중복 제거.
export function mergeProjectOptions(preset: string[], derived: string[]): string[]
```

TDD. 소비처 3곳 교체:

| 위치 | 현재 | 변경 |
|------|------|------|
| ControlBar `laneProjectOptions` | `union(allProjects, swimlaneProjects).sort()` | `mergeProjectOptions(presetProjects, union(allProjects, swimlaneProjects))` |
| ControlBar 필터 칩 `allProjects` | 노트 유도 `.sort()` | `mergeProjectOptions(presetProjects, allProjects)` |
| NoteEditor datalist `allProjects` | 노트 유도 `.sort()` | `mergeProjectOptions(presetProjects, 노트 유도)` |

(파생 값 수집 로직 자체는 유지 — preset이 비면 현재 동작과 동일해진다)

## 5. 범위 제외

- MM `data.json` 실시간 감시 (chokidar) — 볼트 로드 시 1회로 충분
- `fileClass` / `fileClassQueries` / DVQuery 기반 옵션 해석
- 앱이 안 쓰는 preset 필드(sub_project·category·works)의 UI 추가
- MM 설정 파일 쓰기 (읽기 전용)

## 6. 테스트 계획 (TDD)

| 대상 | 케이스 |
|------|--------|
| `parseMetadataMenuPresets` | 정상(실측 구조) / presetFields 없음→null / 깨진 JSON→null / project 필드 없음→projects [] / 순번 키 순서 보존 / priority형(비순번 키) 값 추출 / DVQuery sourceType 무시 / 공백·중복 정리 |
| `mergeProjectOptions` | preset 순서 유지 / derived 추가분 뒤에 ko 정렬 / 중복 제거 / preset 빈 배열 = derived만 / 양쪽 빈 배열 |
| IPC 핸들러 | `tests/integration/` — 임시 폴더에 data.json 만들어 읽기 / 파일 없음 → null |
| 검증 toast | vaultStore 단위: statuses 불일치 시 pushToast 호출 (기존 스토어 테스트 패턴) |

구현 후 `run-visual-check` 패턴으로 실제 볼트 preset 8개가 레인 팝오버·필터에 노출되는지 육안 확인.

## 7. 엣지 케이스

| 상황 | 동작 |
|------|------|
| MM 플러그인 미설치 볼트 | null → 노트 유도만 (현재와 동일) |
| data.json 깨짐 | null + 콘솔 로그 → 노트 유도만 |
| preset에만 있고 노트에 없는 프로젝트 | 선택지에 표시 (빈 레인·빈 필터 가능 — 스윔레인의 빈 레인 동작과 일관) |
| 노트에만 있는 프로젝트 | preset 뒤에 가나다순으로 표시 |
| MM status/priority가 앱과 불일치 | 경고 toast, 동작은 앱 하드코딩 기준 유지 |
| 새로고침 버튼 | loadVault 경유이므로 preset도 재읽기 |
