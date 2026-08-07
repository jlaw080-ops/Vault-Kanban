# Metadata Menu preset fields 연동 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Obsidian Metadata Menu 플러그인의 `data.json` preset fields를 읽어 project 선택지 3곳(스윔레인 레인·필터 칩·NoteEditor datalist)의 단일 소스로 쓰고, status/priority는 앱 하드코딩과 일치 검증만 한다.

**Architecture:** 메인 프로세스에 순수 파서 + 파일 리더(`src/main/utils/metadataMenu.ts`)를 두고 IPC `vault:getPresetFields`로 노출. 렌더러 `vaultStore.loadVault`가 볼트 로드 시 1회 호출해 `presetProjects`에 보관(비영속), 불일치 시 toast. 합집합 정렬은 `viewModel.ts`의 순수 함수 `mergeProjectOptions`가 담당.

**Tech Stack:** Electron IPC (ipcMain.handle / preload contextBridge), zustand, Vitest.

**Spec:** `docs/superpowers/specs/2026-08-06-metadata-menu-presets-design.md`

## Global Constraints

- TypeScript strict mode. 렌더러에서 `fs` 직접 사용 금지 — 반드시 `window.api.*` 경유 (CLAUDE.md CRITICAL).
- 순수 함수는 100% 테스트 (같은 폴더 `*.test.ts`), 통합 테스트는 `tests/integration/`.
- MM `data.json`은 **읽기 전용**. 쓰기 금지.
- preset 읽기 실패는 볼트 로드를 절대 막지 않는다 — `null` 폴백 + `console.warn` 사유 로그.
- 커밋: Conventional Commits, 스코프 `metadata-menu` (예: `feat(metadata-menu): ...`).
- 작업 브랜치: `feat/metadata-menu-presets` (Task 1 Step 0에서 생성, main에서 분기).
- 새 라이브러리 추가 없음 (ADR 기록 불필요).

---

### Task 1: 순수 파서 `parseMetadataMenuPresets`

**Files:**
- Create: `src/main/utils/metadataMenu.ts`
- Test: `src/main/utils/metadataMenu.test.ts`

**Interfaces:**
- Consumes: 없음 (순수 함수, fs/electron 의존 없음)
- Produces: `interface PresetFieldValues { projects: string[]; statuses: string[]; priorities: string[] }`, `function parseMetadataMenuPresets(jsonText: string): PresetFieldValues | null` — Task 2·4가 사용.

- [ ] **Step 0: 브랜치 생성**

```bash
git checkout main && git checkout -b feat/metadata-menu-presets
```

- [ ] **Step 1: 실패하는 테스트 작성**

`src/main/utils/metadataMenu.test.ts`:

```ts
import { describe, it, expect } from 'vitest'
import { parseMetadataMenuPresets } from './metadataMenu'

// 사용자 볼트 실측 구조 (2026-08-06) 축약판
const REAL_SHAPE = JSON.stringify({
  presetFields: [
    {
      name: 'status',
      type: 'Select',
      options: {
        sourceType: 'ValuesList',
        valuesList: { '1': 'backlog', '2': 'planned', '3': 'in-progress', '4': 'review', '5': 'done' }
      }
    },
    {
      name: 'priority',
      type: 'Select',
      options: {
        sourceType: 'ValuesList',
        valuesList: { 낮음: 'low', 중간: 'mid', 높음: 'high' }
      }
    },
    {
      name: 'project',
      type: 'Select',
      options: {
        sourceType: 'ValuesList',
        valuesList: { '1': '신재생에너지제안(EPC)', '2': '에너빌드', '3': 'Private' }
      }
    }
  ]
})

describe('parseMetadataMenuPresets', () => {
  it('실측 구조에서 세 필드를 추출한다', () => {
    const result = parseMetadataMenuPresets(REAL_SHAPE)
    expect(result).toEqual({
      statuses: ['backlog', 'planned', 'in-progress', 'review', 'done'],
      priorities: ['low', 'mid', 'high'],
      projects: ['신재생에너지제안(EPC)', '에너빌드', 'Private']
    })
  })

  it('깨진 JSON → null', () => {
    expect(parseMetadataMenuPresets('{not json')).toBeNull()
  })

  it('presetFields 없음 → null', () => {
    expect(parseMetadataMenuPresets('{"version": "1.0"}')).toBeNull()
    expect(parseMetadataMenuPresets('"just a string"')).toBeNull()
  })

  it('project 필드 없음 → projects는 빈 배열', () => {
    const json = JSON.stringify({
      presetFields: [
        {
          name: 'status',
          type: 'Select',
          options: { sourceType: 'ValuesList', valuesList: { '1': 'backlog' } }
        }
      ]
    })
    expect(parseMetadataMenuPresets(json)).toEqual({
      statuses: ['backlog'],
      priorities: [],
      projects: []
    })
  })

  it('순번 키 순서 보존 — 키 정의 순서가 아니라 숫자 오름차순', () => {
    const json = JSON.stringify({
      presetFields: [
        {
          name: 'project',
          type: 'Select',
          options: { sourceType: 'ValuesList', valuesList: { '10': 'J번째', '2': 'B번째', '1': 'A번째' } }
        }
      ]
    })
    expect(parseMetadataMenuPresets(json)?.projects).toEqual(['A번째', 'B번째', 'J번째'])
  })

  it('숫자·비숫자 키 혼재 시 숫자 키 먼저, 비숫자 키는 뒤에', () => {
    const json = JSON.stringify({
      presetFields: [
        {
          name: 'project',
          type: 'Select',
          options: { sourceType: 'ValuesList', valuesList: { 별칭: 'Z값', '2': 'B값', '1': 'A값' } }
        }
      ]
    })
    expect(parseMetadataMenuPresets(json)?.projects).toEqual(['A값', 'B값', 'Z값'])
  })

  it('sourceType이 ValuesList가 아니면 무시', () => {
    const json = JSON.stringify({
      presetFields: [
        {
          name: 'project',
          type: 'Select',
          options: { sourceType: 'ValuesListNotePath', valuesList: { '1': '무시할값' } }
        }
      ]
    })
    expect(parseMetadataMenuPresets(json)?.projects).toEqual([])
  })

  it('type이 Select가 아니면 무시', () => {
    const json = JSON.stringify({
      presetFields: [
        {
          name: 'project',
          type: 'Input',
          options: { sourceType: 'ValuesList', valuesList: { '1': '무시할값' } }
        }
      ]
    })
    expect(parseMetadataMenuPresets(json)?.projects).toEqual([])
  })

  it('공백 값 제외·trim·중복 제거', () => {
    const json = JSON.stringify({
      presetFields: [
        {
          name: 'project',
          type: 'Select',
          options: {
            sourceType: 'ValuesList',
            valuesList: { '1': '  에너빌드  ', '2': '', '3': '   ', '4': '에너빌드', '5': 'Private' }
          }
        }
      ]
    })
    expect(parseMetadataMenuPresets(json)?.projects).toEqual(['에너빌드', 'Private'])
  })

  it('문자열이 아닌 값은 건너뛴다', () => {
    const json = JSON.stringify({
      presetFields: [
        {
          name: 'project',
          type: 'Select',
          options: { sourceType: 'ValuesList', valuesList: { '1': 42, '2': null, '3': '정상값' } }
        }
      ]
    })
    expect(parseMetadataMenuPresets(json)?.projects).toEqual(['정상값'])
  })

  it('앱이 안 쓰는 preset 필드(sub_project 등)는 결과에 없다', () => {
    const json = JSON.stringify({
      presetFields: [
        {
          name: 'sub_project',
          type: 'Select',
          options: { sourceType: 'ValuesList', valuesList: { '1': '값' } }
        }
      ]
    })
    expect(parseMetadataMenuPresets(json)).toEqual({ statuses: [], priorities: [], projects: [] })
  })
})
```

- [ ] **Step 2: 테스트 실패 확인**

Run: `npx vitest run src/main/utils/metadataMenu.test.ts`
Expected: FAIL — `Cannot find module './metadataMenu'` (또는 export 없음)

- [ ] **Step 3: 최소 구현**

`src/main/utils/metadataMenu.ts`:

```ts
export interface PresetFieldValues {
  projects: string[]
  statuses: string[]
  priorities: string[]
}

const FIELD_TO_KEY: Record<string, keyof PresetFieldValues> = {
  project: 'projects',
  status: 'statuses',
  priority: 'priorities'
}

const NUMERIC_KEY = /^\d+$/

function extractValues(valuesList: Record<string, unknown>): string[] {
  const keys = Object.keys(valuesList)
  const numericKeys = keys
    .filter((k) => NUMERIC_KEY.test(k))
    .sort((a, b) => Number(a) - Number(b))
  const otherKeys = keys.filter((k) => !NUMERIC_KEY.test(k))

  const out: string[] = []
  for (const key of [...numericKeys, ...otherKeys]) {
    const raw = valuesList[key]
    if (typeof raw !== 'string') continue
    const value = raw.trim()
    if (value.length === 0 || out.includes(value)) continue
    out.push(value)
  }
  return out
}

export function parseMetadataMenuPresets(jsonText: string): PresetFieldValues | null {
  let data: unknown
  try {
    data = JSON.parse(jsonText)
  } catch {
    return null
  }
  if (typeof data !== 'object' || data === null) return null

  const presetFields = (data as { presetFields?: unknown }).presetFields
  if (!Array.isArray(presetFields)) return null

  const result: PresetFieldValues = { projects: [], statuses: [], priorities: [] }

  for (const field of presetFields) {
    if (typeof field !== 'object' || field === null) continue
    const f = field as {
      name?: unknown
      type?: unknown
      options?: { sourceType?: unknown; valuesList?: unknown }
    }
    const key = typeof f.name === 'string' ? FIELD_TO_KEY[f.name] : undefined
    if (!key) continue
    if (f.type !== 'Select') continue
    const options = f.options
    if (typeof options !== 'object' || options === null) continue
    if (options.sourceType !== 'ValuesList') continue
    const valuesList = options.valuesList
    if (typeof valuesList !== 'object' || valuesList === null) continue
    result[key] = extractValues(valuesList as Record<string, unknown>)
  }

  return result
}
```

- [ ] **Step 4: 테스트 통과 확인**

Run: `npx vitest run src/main/utils/metadataMenu.test.ts`
Expected: PASS (11 tests)

- [ ] **Step 5: 커밋**

```bash
git add src/main/utils/metadataMenu.ts src/main/utils/metadataMenu.test.ts
git commit -m "feat(metadata-menu): MM data.json preset fields 순수 파서"
```

---

### Task 2: 파일 리더 + IPC `vault:getPresetFields` + preload 노출

**Files:**
- Modify: `src/main/utils/metadataMenu.ts` (readPresetFields 추가)
- Modify: `src/main/ipc/vault.ts` (핸들러 등록, `registerVaultHandlers` 내부)
- Modify: `src/preload/index.ts` (vault 객체에 메서드 추가)
- Modify: `src/preload/index.d.ts` (`VaultApi`에 타입 추가)
- Test: `tests/integration/preset-fields.test.ts`

**Interfaces:**
- Consumes: Task 1의 `parseMetadataMenuPresets`, `PresetFieldValues`
- Produces: `readPresetFields(vaultPath: string): Promise<PresetFieldValues | null>` (main), `window.api.vault.getPresetFields(vaultPath: string): Promise<PresetFieldValues | null>` (렌더러) — Task 4가 사용.

- [ ] **Step 1: 실패하는 통합 테스트 작성**

`tests/integration/preset-fields.test.ts` (fs만 사용, electron 의존 없음 — `metadataMenu.ts`에서 직접 import):

```ts
import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { promises as fs } from 'fs'
import { join } from 'path'
import { tmpdir } from 'os'
import { readPresetFields } from '../../src/main/utils/metadataMenu'

describe('readPresetFields — MM data.json 읽기', () => {
  let tmpDir: string

  beforeEach(async () => {
    tmpDir = await fs.mkdtemp(join(tmpdir(), 'mm-preset-'))
  })

  afterEach(async () => {
    await fs.rm(tmpDir, { recursive: true, force: true })
  })

  async function writeDataJson(content: string): Promise<void> {
    const pluginDir = join(tmpDir, '.obsidian', 'plugins', 'metadata-menu')
    await fs.mkdir(pluginDir, { recursive: true })
    await fs.writeFile(join(pluginDir, 'data.json'), content, 'utf-8')
  }

  it('정상 data.json에서 preset을 읽는다', async () => {
    await writeDataJson(
      JSON.stringify({
        presetFields: [
          {
            name: 'project',
            type: 'Select',
            options: { sourceType: 'ValuesList', valuesList: { '1': '에너빌드', '2': 'Private' } }
          }
        ]
      })
    )
    const result = await readPresetFields(tmpDir)
    expect(result?.projects).toEqual(['에너빌드', 'Private'])
  })

  it('data.json 파일 없음 → null (MM 미설치 볼트)', async () => {
    const result = await readPresetFields(tmpDir)
    expect(result).toBeNull()
  })

  it('data.json 깨짐 → null', async () => {
    await writeDataJson('{broken json')
    const result = await readPresetFields(tmpDir)
    expect(result).toBeNull()
  })
})
```

- [ ] **Step 2: 테스트 실패 확인**

Run: `npx vitest run tests/integration/preset-fields.test.ts`
Expected: FAIL — `readPresetFields` export 없음

- [ ] **Step 3: readPresetFields 구현**

`src/main/utils/metadataMenu.ts` 상단에 import 추가, 파일 끝에 함수 추가:

```ts
// 파일 상단에 추가
import { promises as fs } from 'fs'
import { join } from 'path'
```

```ts
// 파일 끝에 추가
export async function readPresetFields(vaultPath: string): Promise<PresetFieldValues | null> {
  const dataPath = join(vaultPath, '.obsidian', 'plugins', 'metadata-menu', 'data.json')
  let jsonText: string
  try {
    jsonText = await fs.readFile(dataPath, 'utf-8')
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : String(error)
    console.warn(`[metadata-menu] data.json 읽기 실패 — 노트 유도 값으로 폴백: ${message}`)
    return null
  }
  const parsed = parseMetadataMenuPresets(jsonText)
  if (parsed === null) {
    console.warn('[metadata-menu] data.json 파싱 실패 — 노트 유도 값으로 폴백')
  }
  return parsed
}
```

- [ ] **Step 4: 테스트 통과 확인**

Run: `npx vitest run tests/integration/preset-fields.test.ts`
Expected: PASS (3 tests)

- [ ] **Step 5: IPC 핸들러 등록**

`src/main/ipc/vault.ts` — import에 추가:

```ts
import { readPresetFields } from '../utils/metadataMenu'
```

`registerVaultHandlers()` 함수 안, `vault:listFolders` 핸들러 뒤에 추가:

```ts
  ipcMain.handle('vault:getPresetFields', async (_event, vaultPath: string) => {
    return readPresetFields(vaultPath)
  })
```

- [ ] **Step 6: preload 노출**

`src/preload/index.ts` — import에 타입 추가:

```ts
import type { PresetFieldValues } from '../main/utils/metadataMenu'
```

`vault` 객체의 `listFolders` 뒤에 추가:

```ts
  getPresetFields: (vaultPath: string): Promise<PresetFieldValues | null> =>
    ipcRenderer.invoke('vault:getPresetFields', vaultPath)
```

`src/preload/index.d.ts` — import에 타입 추가:

```ts
import type { PresetFieldValues } from '../main/utils/metadataMenu'
```

`VaultApi` 인터페이스의 `listFolders` 뒤에 추가:

```ts
  getPresetFields: (vaultPath: string) => Promise<PresetFieldValues | null>
```

- [ ] **Step 7: 타입 체크 + 전체 테스트**

Run: `npm run build` (타입 체크 포함) 후 `npm run test`
Expected: 빌드 성공, 전체 테스트 PASS

- [ ] **Step 8: 커밋**

```bash
git add src/main/utils/metadataMenu.ts src/main/ipc/vault.ts src/preload/index.ts src/preload/index.d.ts tests/integration/preset-fields.test.ts
git commit -m "feat(metadata-menu): vault:getPresetFields IPC + preload 노출"
```

---

### Task 3: `mergeProjectOptions` + `presetMismatchMessage` 순수 함수

**Files:**
- Modify: `src/renderer/src/lib/viewModel.ts` (파일 끝에 두 함수 추가)
- Test: `src/renderer/src/lib/viewModel.test.ts` (기존 파일에 describe 블록 추가)

**Interfaces:**
- Consumes: 기존 `STATUS_COLUMNS` (같은 파일에 이미 정의됨: `['backlog','planned','in-progress','review','done']`)
- Produces: `mergeProjectOptions(preset: string[], derived: string[]): string[]` — Task 5가 사용. `presetMismatchMessage(preset: { statuses: string[]; priorities: string[] }): string | null` — Task 4가 사용.

- [ ] **Step 1: 실패하는 테스트 작성**

`src/renderer/src/lib/viewModel.test.ts` 파일 끝에 추가 (import 문에 `mergeProjectOptions, presetMismatchMessage` 추가):

```ts
describe('mergeProjectOptions — MM preset ∪ 노트 유도 값', () => {
  it('preset 순서를 그대로 유지한다 (정렬하지 않음)', () => {
    expect(mergeProjectOptions(['다', '가', '나'], [])).toEqual(['다', '가', '나'])
  })

  it('derived에만 있는 값은 뒤에 ko 가나다순으로 붙인다', () => {
    expect(mergeProjectOptions(['에너빌드'], ['하나', '가나', '에너빌드'])).toEqual([
      '에너빌드',
      '가나',
      '하나'
    ])
  })

  it('중복 제거 — preset과 derived 양쪽 중복 모두', () => {
    expect(mergeProjectOptions(['A', 'A', 'B'], ['B', 'C', 'C'])).toEqual(['A', 'B', 'C'])
  })

  it('preset 빈 배열이면 derived만 ko 정렬로 반환 (현재 동작과 동일)', () => {
    expect(mergeProjectOptions([], ['나', '가'])).toEqual(['가', '나'])
  })

  it('양쪽 빈 배열 → 빈 배열', () => {
    expect(mergeProjectOptions([], [])).toEqual([])
  })
})

describe('presetMismatchMessage — status/priority 일치 검증', () => {
  const APP_STATUSES = ['backlog', 'planned', 'in-progress', 'review', 'done']

  it('둘 다 일치하면 null', () => {
    expect(
      presetMismatchMessage({ statuses: APP_STATUSES, priorities: ['low', 'mid', 'high'] })
    ).toBeNull()
  })

  it('순서가 달라도 집합이 같으면 null', () => {
    expect(
      presetMismatchMessage({
        statuses: ['done', 'backlog', 'planned', 'review', 'in-progress'],
        priorities: ['high', 'low', 'mid']
      })
    ).toBeNull()
  })

  it('빈 배열은 검증 대상이 아니다 (MM에 해당 필드가 없는 경우) → null', () => {
    expect(presetMismatchMessage({ statuses: [], priorities: [] })).toBeNull()
  })

  it('statuses 불일치 → 경고 메시지에 status 차이 포함', () => {
    const msg = presetMismatchMessage({
      statuses: ['todo', 'doing', 'done'],
      priorities: ['low', 'mid', 'high']
    })
    expect(msg).toContain('status')
    expect(msg).toContain('todo')
    expect(msg).not.toContain('priority:')
  })

  it('priorities 불일치 → 경고 메시지에 priority 차이 포함', () => {
    const msg = presetMismatchMessage({
      statuses: [],
      priorities: ['낮음', '중간', '높음']
    })
    expect(msg).toContain('priority')
    expect(msg).toContain('낮음')
  })
})
```

- [ ] **Step 2: 테스트 실패 확인**

Run: `npx vitest run src/renderer/src/lib/viewModel.test.ts`
Expected: FAIL — `mergeProjectOptions` export 없음

- [ ] **Step 3: 구현**

`src/renderer/src/lib/viewModel.ts` 파일 끝에 추가:

```ts
export function mergeProjectOptions(preset: string[], derived: string[]): string[] {
  const merged = [...new Set(preset)]
  const seen = new Set(merged)
  const extras = [...new Set(derived)].filter((d) => !seen.has(d))
  extras.sort((a, b) => a.localeCompare(b, 'ko'))
  return [...merged, ...extras]
}

const APP_PRIORITIES: readonly string[] = ['low', 'mid', 'high']

function sameSet(a: readonly string[], b: readonly string[]): boolean {
  const as = new Set(a)
  const bs = new Set(b)
  return as.size === bs.size && [...as].every((x) => bs.has(x))
}

export function presetMismatchMessage(preset: {
  statuses: string[]
  priorities: string[]
}): string | null {
  const diffs: string[] = []
  if (preset.statuses.length > 0 && !sameSet(preset.statuses, STATUS_COLUMNS)) {
    diffs.push(`status: [${preset.statuses.join(', ')}]`)
  }
  if (preset.priorities.length > 0 && !sameSet(preset.priorities, APP_PRIORITIES)) {
    diffs.push(`priority: [${preset.priorities.join(', ')}]`)
  }
  if (diffs.length === 0) return null
  return `Metadata Menu의 status/priority 정의가 앱과 다릅니다 — ${diffs.join(' / ')}`
}
```

- [ ] **Step 4: 테스트 통과 확인**

Run: `npx vitest run src/renderer/src/lib/viewModel.test.ts`
Expected: PASS (기존 테스트 + 신규 10개 모두)

- [ ] **Step 5: 커밋**

```bash
git add src/renderer/src/lib/viewModel.ts src/renderer/src/lib/viewModel.test.ts
git commit -m "feat(metadata-menu): mergeProjectOptions·presetMismatchMessage 순수 함수"
```

---

### Task 4: vaultStore — `presetProjects` 보관 + 검증 toast

**Files:**
- Modify: `src/renderer/src/stores/vaultStore.ts`
- Test: `src/renderer/src/stores/vaultStore.test.ts` (신규)

**Interfaces:**
- Consumes: Task 2의 `window.api.vault.getPresetFields`, Task 3의 `presetMismatchMessage`, 기존 `useViewStore.getState().pushToast(message, variant?, durationMs?)`
- Produces: `vaultStore.presetProjects: string[]` (기본 `[]`, persist 아님) — Task 5가 사용.

- [ ] **Step 1: 실패하는 테스트 작성**

`src/renderer/src/stores/vaultStore.test.ts` (vaultStore는 persist 미사용이므로 스토리지 교체 불필요. `window`가 없는 node 환경이므로 `vi.stubGlobal`로 `window.api` 주입):

```ts
import { describe, it, expect, beforeEach, vi } from 'vitest'
import { createJSONStorage } from 'zustand/middleware'
import { useVaultStore } from './vaultStore'
import { useViewStore } from './viewStore'

// viewStore.test.ts와 동일한 함정 대응: Node 22+ 실험적 webstorage가 setItem 없는
// localStorage 전역을 제공해 persist 쓰기가 깨지므로 인메모리 스토리지로 교체.
const memoryStore = new Map<string, string>()
useViewStore.persist.setOptions({
  storage: createJSONStorage(() => ({
    getItem: (k: string) => memoryStore.get(k) ?? null,
    setItem: (k: string, v: string) => void memoryStore.set(k, v),
    removeItem: (k: string) => void memoryStore.delete(k)
  }))
})

const APP_STATUSES = ['backlog', 'planned', 'in-progress', 'review', 'done']

function stubApi(overrides: {
  getPresetFields?: () => Promise<unknown>
}): void {
  vi.stubGlobal('window', {
    api: {
      vault: {
        scan: vi.fn().mockResolvedValue([]),
        getPresetFields:
          overrides.getPresetFields ?? vi.fn().mockResolvedValue(null)
      },
      watcher: {
        start: vi.fn().mockResolvedValue(undefined)
      }
    }
  })
}

describe('vaultStore — MM preset 연동', () => {
  beforeEach(() => {
    vi.unstubAllGlobals()
    useVaultStore.setState({ notes: [], presetProjects: [], loading: false, error: null })
    useViewStore.setState({ toasts: [] })
  })

  it('기본값: presetProjects는 빈 배열', () => {
    expect(useVaultStore.getState().presetProjects).toEqual([])
  })

  it('loadVault 성공 시 preset projects를 저장한다', async () => {
    stubApi({
      getPresetFields: vi.fn().mockResolvedValue({
        projects: ['에너빌드', 'Private'],
        statuses: APP_STATUSES,
        priorities: ['low', 'mid', 'high']
      })
    })
    await useVaultStore.getState().loadVault('/vault')
    expect(useVaultStore.getState().presetProjects).toEqual(['에너빌드', 'Private'])
    expect(useViewStore.getState().toasts).toEqual([])
  })

  it('preset이 null이면 presetProjects는 빈 배열 (노트 유도 폴백)', async () => {
    stubApi({ getPresetFields: vi.fn().mockResolvedValue(null) })
    await useVaultStore.getState().loadVault('/vault')
    expect(useVaultStore.getState().presetProjects).toEqual([])
  })

  it('statuses 불일치 시 경고 toast를 1회 띄운다', async () => {
    stubApi({
      getPresetFields: vi.fn().mockResolvedValue({
        projects: [],
        statuses: ['todo', 'doing'],
        priorities: ['low', 'mid', 'high']
      })
    })
    await useVaultStore.getState().loadVault('/vault')
    const toasts = useViewStore.getState().toasts
    expect(toasts).toHaveLength(1)
    expect(toasts[0].message).toContain('status')
    expect(toasts[0].message).toContain('todo')
  })

  it('getPresetFields가 reject해도 볼트 로드는 성공한다', async () => {
    stubApi({ getPresetFields: vi.fn().mockRejectedValue(new Error('IPC 실패')) })
    await useVaultStore.getState().loadVault('/vault')
    const s = useVaultStore.getState()
    expect(s.error).toBeNull()
    expect(s.loading).toBe(false)
    expect(s.presetProjects).toEqual([])
  })

  it('로드마다 preset을 갱신한다 (이전 값 잔존 금지)', async () => {
    useVaultStore.setState({ presetProjects: ['옛값'] })
    stubApi({ getPresetFields: vi.fn().mockResolvedValue(null) })
    await useVaultStore.getState().loadVault('/vault')
    expect(useVaultStore.getState().presetProjects).toEqual([])
  })
})
```

주의: `useViewStore.setState({ toasts: [] })` 초기화는 pushToast의 `setTimeout` 자동 dismiss와 무관하게 동작 확인만 한다. toast가 4초 뒤 사라지는 것은 이 테스트 범위 아님.

- [ ] **Step 2: 테스트 실패 확인**

Run: `npx vitest run src/renderer/src/stores/vaultStore.test.ts`
Expected: FAIL — `presetProjects` 속성 없음 (TS 오류 또는 undefined)

- [ ] **Step 3: vaultStore 구현**

`src/renderer/src/stores/vaultStore.ts`:

import 추가:

```ts
import { useViewStore } from './viewStore'
import { presetMismatchMessage } from '../lib/viewModel'
```

`VaultState` 인터페이스에 필드 추가 (`selectedNote: Note | null` 뒤):

```ts
  presetProjects: string[]
```

스토어 초기값 추가 (`selectedNote: null,` 뒤):

```ts
  presetProjects: [],
```

`loadVault`를 다음으로 교체:

```ts
  loadVault: async (path, excludedFolders) => {
    set({ loading: true, error: null, loadProgress: null })
    try {
      const notes = await window.api.vault.scan(path, excludedFolders)

      let presetProjects: string[] = []
      try {
        const preset = await window.api.vault.getPresetFields(path)
        if (preset) {
          presetProjects = preset.projects
          const mismatch = presetMismatchMessage(preset)
          if (mismatch) {
            useViewStore.getState().pushToast(mismatch, 'info', 6000)
          }
        }
      } catch {
        // preset 읽기 실패는 볼트 로드를 막지 않는다 — 노트 유도 값 폴백
      }

      set({ notes, presetProjects, loading: false, loadProgress: null })
      await window.api.watcher.start(path, excludedFolders ?? ['.obsidian', '.trash', '.git'])
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Vault 로드 실패'
      set({ loading: false, error: message, loadProgress: null })
    }
  }
```

- [ ] **Step 4: 테스트 통과 확인**

Run: `npx vitest run src/renderer/src/stores/vaultStore.test.ts`
Expected: PASS (6 tests)

- [ ] **Step 5: 전체 테스트 회귀 확인**

Run: `npm run test`
Expected: 전체 PASS (기존 loadVault를 쓰는 다른 테스트 회귀 없음)

- [ ] **Step 6: 커밋**

```bash
git add src/renderer/src/stores/vaultStore.ts src/renderer/src/stores/vaultStore.test.ts
git commit -m "feat(metadata-menu): vaultStore presetProjects + status/priority 검증 toast"
```

---

### Task 5: 소비처 3곳 교체 (ControlBar 레인·필터 칩, NoteEditor datalist)

**Files:**
- Modify: `src/renderer/src/components/layout/ControlBar.tsx`
- Modify: `src/renderer/src/components/editor/NoteEditor.tsx`

**Interfaces:**
- Consumes: Task 3의 `mergeProjectOptions`, Task 4의 `useVaultStore().presetProjects`
- Produces: UI 동작 변경만. 신규 export 없음.

- [ ] **Step 1: ControlBar 수정**

`src/renderer/src/components/layout/ControlBar.tsx`:

import 추가:

```ts
import { mergeProjectOptions } from '../../lib/viewModel'
```

vaultStore 구조분해에 `presetProjects` 추가 (49행):

```ts
  const { notes, vaultPath, loading, loadVault, presetProjects } = useVaultStore()
```

`laneProjectOptions` useMemo(73–76행)를 다음으로 교체:

```ts
  const laneProjectOptions = useMemo(
    () =>
      mergeProjectOptions(presetProjects, [...new Set([...allProjects, ...swimlaneProjects])]),
    [presetProjects, allProjects, swimlaneProjects]
  )
```

그 아래에 필터 칩용 useMemo 추가:

```ts
  const projectFilterOptions = useMemo(
    () => mergeProjectOptions(presetProjects, allProjects),
    [presetProjects, allProjects]
  )
```

필터 팝오버의 프로젝트 섹션(166·170행)에서 `allProjects` → `projectFilterOptions`로 교체:

```tsx
              {projectFilterOptions.length === 0 ? (
                <p className="text-xs text-muted-foreground">프로젝트 없음</p>
              ) : (
                <div className="flex flex-wrap gap-1">
                  {projectFilterOptions.map((project) => (
```

(레인 팝오버는 이미 `laneProjectOptions`를 쓰므로 렌더 부분 변경 없음. `allTags`·`allFolders` 수집 useMemo는 그대로 둔다.)

- [ ] **Step 2: NoteEditor 수정**

`src/renderer/src/components/editor/NoteEditor.tsx`:

import 추가 (기존 lib import가 있으면 병합):

```ts
import { mergeProjectOptions } from '../../lib/viewModel'
```

vaultStore 구조분해에 `presetProjects` 추가 (71행):

```ts
  const { selectedNote, closeNote, updateNote, notes, presetProjects } = useVaultStore()
```

`allProjects` useMemo(75–81행)를 다음으로 교체:

```ts
  const allProjects = useMemo(() => {
    const s = new Set<string>()
    for (const n of notes) {
      if (n.project) s.add(n.project)
    }
    return mergeProjectOptions(presetProjects, [...s])
  }, [notes, presetProjects])
```

- [ ] **Step 3: 빌드 + 전체 테스트**

Run: `npm run build` 후 `npm run test`
Expected: 타입 체크 통과, 전체 테스트 PASS

- [ ] **Step 4: 커밋**

```bash
git add src/renderer/src/components/layout/ControlBar.tsx src/renderer/src/components/editor/NoteEditor.tsx
git commit -m "feat(metadata-menu): project 선택지 3곳에 MM preset 합집합 적용"
```

---

### Task 6: 육안 확인 + 마무리

**Files:**
- 없음 (검증만)

**Interfaces:**
- Consumes: Task 1~5 전체
- Produces: main 머지 가능한 검증된 브랜치

- [ ] **Step 1: lint**

Run: `npm run lint`
Expected: 오류 없음

- [ ] **Step 2: 육안 확인 (run-visual-check 프로젝트 스킬)**

`run-visual-check` 스킬로 앱을 구동해 다음을 확인:
1. 레인 팝오버(ControlBar '레인' 버튼)에 실제 볼트 preset 프로젝트 8개가 **MM 정의 순서**(신재생에너지제안(EPC) → 에너빌드 → 분산자원통합운영플랫폼 → 연료전지급탕패키지 → BIPV특허기획 → 인력양성사업 → 에너지노관리 → Private)로 노출되는지
2. 필터 팝오버 프로젝트 칩에도 동일 노출 + 노트에만 있는 프로젝트가 뒤에 가나다순으로 붙는지
3. NoteEditor project 입력 datalist에 preset 값이 뜨는지
4. status/priority가 일치하므로 경고 toast가 **뜨지 않는지**

- [ ] **Step 3: 스크린샷 확인 후 문제 없으면 main 머지 준비**

superpowers:finishing-a-development-branch 스킬 사용 (머지·push는 사용자 확인 후).
