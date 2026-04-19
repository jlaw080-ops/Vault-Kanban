# Phase 1: 프로젝트 뼈대 + Vault 로드

## 필수 읽기 (이 순서로)

1. `CLAUDE.md` — 전체 규칙
2. `docs/PRD.md` § "핵심 기능 1. Vault 연결 및 실시간 동기화"
3. `docs/ARCHITECTURE.md` § 0, 1, 5 (프로세스 분리, 디렉토리, 보안 경계)
4. `docs/ADR.md` ADR-001, ADR-002, ADR-006, ADR-007

---

## 범위

electron-vite 기반 프로젝트 뼈대를 세우고, vault 폴더 선택 → `.md` 재귀 스캔 → frontmatter 파싱 → zustand 저장까지 구현한다. **UI는 단순 테이블**로 표시. 칸반은 Phase 2에서.

---

## 구현 작업 (순서대로)

### 1. 프로젝트 생성

```bash
npm create @quick-start/electron@latest vault-kanban -- --template react-ts
cd vault-kanban
npm install
```

### 2. 필수 의존성 설치

```bash
# 런타임
npm install gray-matter chokidar zustand lucide-react date-fns electron-store

# 개발
npm install -D tailwindcss postcss autoprefixer vitest @testing-library/react @testing-library/jest-dom jsdom
```

### 3. Tailwind CSS 설정

```bash
npx tailwindcss init -p
```

- `tailwind.config.js` content에 `./src/renderer/**/*.{html,tsx}` 추가
- `src/renderer/src/assets/main.css`에 `@tailwind base/components/utilities` 세 줄 추가

### 4. shadcn/ui 초기화

```bash
npx shadcn@latest init
# 이번 Phase에서는 button, card만 추가
npx shadcn@latest add button card
```

### 5. 디렉토리 구조 생성

`docs/ARCHITECTURE.md` § 1 에 정의된 구조대로. 비어있는 폴더라도 `.gitkeep` 포함.

### 6. 타입 정의

`src/renderer/src/types/index.ts`에 `Note`, `Settings`, `ColumnConfig`, `Status`, `Priority` 모두 정의. (ARCHITECTURE.md § 4 그대로)

### 7. 순수 함수 구현 (TDD — 테스트 먼저!)

**`src/renderer/src/lib/noteParser.test.ts` 먼저 작성**:
- frontmatter 있는 노트 파싱 테스트 (모든 필드 포함)
- frontmatter 없는 노트 → `status: "백로그"`, 파일명이 title
- frontmatter 파싱 실패 → `parseError` 필드 세팅
- `title` 없으면 파일명(확장자 제외) 사용

그 다음 `src/renderer/src/lib/noteParser.ts` 구현.

### 8. 메인 프로세스 IPC 핸들러

`src/main/ipc/vault.ts`:
- `vault:select` — dialog.showOpenDialog로 폴더 선택
- `vault:scan` — vaultPath 이하 `.md` 재귀 탐색 + gray-matter 파싱, `excludedFolders` 스킵
- `vault:readNote` — 단일 노트 재파싱
- `vault:writeNote` — 이번 Phase에서는 **빈 스텁만**. Phase 2에서 실제 구현.

`src/main/ipc/settings.ts`:
- electron-store 인스턴스 생성
- `settings:get`, `settings:set` 핸들러

`src/main/index.ts`에서 BrowserWindow 생성 시:
- **CRITICAL**: `contextIsolation: true`, `nodeIntegration: false`
- `preload: join(__dirname, '../preload/index.js')`
- IPC 핸들러 등록 호출

### 9. Preload

`src/preload/index.ts`에서 `contextBridge.exposeInMainWorld('api', { vault: {...}, settings: {...} })` 타입 안전하게 노출.

### 10. zustand 스토어

- `vaultStore.ts` — notes, vaultPath, loading state
- `settingsStore.ts` — IPC로 메인의 electron-store와 동기화

### 11. 임시 UI

- 앱 실행 → vault 없으면 "Vault 폴더 선택" 버튼
- 선택 후 노트 목록을 **단순 테이블**(제목, status, 수정일)로 표시
- 100개 이상이면 "로드 중 (N/M)" 프로그레스 표시

---

## 인터페이스 시그니처

```typescript
// src/renderer/src/types/index.ts
export type Status = "백로그" | "예정" | "진행중" | "검토" | "완료";
export type Priority = "high" | "mid" | "low";
export interface Note { /* ARCHITECTURE.md § 4 참조 */ }

// src/renderer/src/lib/noteParser.ts
export function parseNote(filePath: string, raw: string, mtime: number): Note;
export function serializeNote(note: Note): string;  // Phase 2에서 사용

// window.api (preload)
window.api.vault.select(): Promise<string | null>;
window.api.vault.scan(vaultPath: string): Promise<Note[]>;
window.api.vault.readNote(filePath: string): Promise<Note>;
window.api.settings.get<K extends keyof Settings>(key: K): Promise<Settings[K]>;
window.api.settings.set<K extends keyof Settings>(key: K, value: Settings[K]): Promise<void>;
```

---

## 수락 기준 (모두 통과해야 함)

- [ ] `npm run dev` 실행 → 앱 창이 뜬다
- [ ] `npm run build` 통과 (TypeScript strict 에러 0)
- [ ] `npm run lint` 통과
- [ ] `npm run test` 통과 — 최소 `noteParser.test.ts` 전체 그린
- [ ] vault 폴더 선택 → 노트 목록이 테이블로 표시됨
- [ ] 앱 재시작 → 저장된 vault가 자동 로드
- [ ] frontmatter 없는 노트도 에러 없이 표시 (백로그로 간주)
- [ ] 노트 100개 vault에서 최초 로드 1초 이내

---

## 금지 사항 (이 Phase에서 하지 말 것)

- **칸반 UI, 드래그앤드롭, 에디터, AI, 차트 건드리지 말 것.** 전부 이후 Phase.
- `vault:writeNote` 실제 구현 금지 (Phase 2).
- 파일 감시(chokidar) 금지 (Phase 4).
- `gray-matter` 대신 정규식으로 frontmatter 파싱 금지. ADR-006 위반.
- 렌더러에서 `import fs from 'fs'` 금지. CRITICAL.
- `nodeIntegration: true` 설정 금지. CRITICAL.
- shadcn/ui 외의 컴포넌트 라이브러리 설치 금지.
- 본문(body) 내용 조작 금지. 읽어와 저장만.

---

## 완료 후 커밋 메시지 예시

```
feat(phase-1): 프로젝트 뼈대 + vault 로드 구현

- electron-vite 기반 초기 세팅
- gray-matter로 frontmatter 파싱 (noteParser.ts + 테스트)
- vault 폴더 선택 및 재귀 스캔 IPC 구현
- zustand vaultStore / settingsStore 추가
- 단순 테이블 UI로 노트 목록 표시
```
