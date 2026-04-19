# Architecture: Vault Kanban

> **이 앱이 어떻게 구성되는지** 정의한다. 디렉토리 구조, 데이터 흐름, 프로세스 분리 원칙을 담는다.
> 코드 작성 전, AI는 반드시 이 문서를 읽어야 한다.

---

## 0. 전체 구도

Electron 앱의 세 프로세스를 엄격히 분리한다.

```
┌────────────────────────────────────────────────────────────────┐
│  Main Process (Node.js 권한, OS API 접근)                       │
│   - 파일 읽기/쓰기 (fs)                                         │
│   - chokidar 파일 감시                                          │
│   - Anthropic SDK 호출                                          │
│   - safeStorage로 API 키 관리                                   │
└────────────────────────────────────────────────────────────────┘
                  ▲
                  │ IPC (ipcMain.handle / ipcRenderer.invoke)
                  │ 모든 통신은 preload를 통해서만
                  ▼
┌────────────────────────────────────────────────────────────────┐
│  Preload (contextBridge로 안전한 API만 렌더러에 노출)           │
│   - window.api.vault.*                                          │
│   - window.api.settings.*                                       │
│   - window.api.ai.*                                             │
└────────────────────────────────────────────────────────────────┘
                  ▲
                  │
                  ▼
┌────────────────────────────────────────────────────────────────┐
│  Renderer Process (브라우저, React 앱)                          │
│   - 파일 시스템 직접 접근 금지                                  │
│   - Anthropic SDK 직접 호출 금지                                │
│   - 오직 window.api를 통해서만 OS 자원 사용                     │
└────────────────────────────────────────────────────────────────┘
```

**CRITICAL 원칙**:
- 렌더러에 `nodeIntegration: true`를 쓰지 않는다. `contextIsolation: true` + preload로만.
- API 키는 메인 프로세스에서만 복호화하여 사용한다. 렌더러에 절대 보내지 않는다.
- 파일 쓰기는 전부 메인 프로세스에서. 렌더러는 내용만 IPC로 전달.

---

## 1. 디렉토리 구조

```
vault-kanban/
├── .github/workflows/
│   └── build-release.yml            # 빌드 자동화
├── build/                           # 빌드 리소스 (아이콘)
│   ├── icon.png
│   ├── icon.ico
│   └── icon.icns
├── electron-builder.yml             # 패키징 설정
├── electron.vite.config.ts          # Vite 설정
├── src/
│   ├── main/                        # === Electron 메인 프로세스 ===
│   │   ├── index.ts                 # 진입점, BrowserWindow 생성
│   │   ├── ipc/
│   │   │   ├── vault.ts             # vault 파일 읽기/쓰기 핸들러
│   │   │   ├── watcher.ts           # chokidar 파일 감시
│   │   │   ├── settings.ts          # electron-store 래퍼
│   │   │   ├── api-key.ts           # safeStorage로 API 키 관리
│   │   │   └── ai.ts                # Anthropic SDK 호출
│   │   └── utils/
│   │       ├── markdown.ts          # gray-matter 래퍼
│   │       └── backup.ts            # 백업 생성 로직
│   ├── preload/                     # === Preload ===
│   │   └── index.ts                 # contextBridge로 window.api 노출
│   └── renderer/                    # === React 앱 (렌더러) ===
│       ├── src/
│       │   ├── components/
│       │   │   ├── kanban/
│       │   │   │   ├── KanbanBoard.tsx
│       │   │   │   ├── KanbanColumn.tsx
│       │   │   │   ├── KanbanCard.tsx
│       │   │   │   └── WipLimitIndicator.tsx
│       │   │   ├── editor/
│       │   │   │   ├── NoteEditor.tsx
│       │   │   │   └── EditorToolbar.tsx
│       │   │   ├── dashboard/
│       │   │   │   ├── Dashboard.tsx
│       │   │   │   ├── LeadTimeChart.tsx
│       │   │   │   ├── CycleTimeChart.tsx
│       │   │   │   ├── ThroughputChart.tsx
│       │   │   │   └── CfdChart.tsx
│       │   │   ├── migration/
│       │   │   │   └── StatusMigrationWizard.tsx
│       │   │   ├── ai/
│       │   │   │   ├── AiGroupingDialog.tsx
│       │   │   │   └── RelatedNotesPanel.tsx
│       │   │   ├── settings/
│       │   │   │   └── SettingsPanel.tsx
│       │   │   ├── layout/
│       │   │   │   ├── AppShell.tsx
│       │   │   │   ├── Sidebar.tsx
│       │   │   │   └── TopBar.tsx
│       │   │   └── ui/              # shadcn/ui 컴포넌트
│       │   ├── hooks/
│       │   │   ├── useVault.ts
│       │   │   ├── useFileWatcher.ts
│       │   │   └── useNotes.ts
│       │   ├── stores/              # zustand
│       │   │   ├── vaultStore.ts    # vault 경로, 노트 목록
│       │   │   ├── viewStore.ts     # 그룹핑/정렬/필터
│       │   │   └── settingsStore.ts # 설정
│       │   ├── lib/
│       │   │   ├── noteParser.ts    # 노트 파싱
│       │   │   ├── aiClient.ts      # window.api.ai 래퍼
│       │   │   ├── metrics.ts       # 리드/사이클타임 계산
│       │   │   └── obsidianUri.ts   # obsidian:// URI 생성
│       │   ├── types/
│       │   │   └── index.ts         # Note, Settings, ColumnPolicy 타입
│       │   ├── App.tsx
│       │   └── main.tsx
│       └── index.html
├── tests/                           # Vitest 테스트
│   ├── unit/
│   │   ├── metrics.test.ts
│   │   └── noteParser.test.ts
│   └── integration/
│       └── vault.test.ts
├── package.json
├── tsconfig.json
├── tailwind.config.js
├── postcss.config.js
└── README.md
```

---

## 2. 데이터 흐름

### 2-1. 노트 로드 (앱 시작)

```
settingsStore(localStorage) → vaultPath 조회
  → IPC: vault:scan(vaultPath)
  → Main: fs.readdir 재귀 + gray-matter 파싱
  → 결과 배열 반환
  → vaultStore.setNotes(notes)
  → React 리렌더
```

### 2-2. 카드 드래그 → 파일 저장

```
사용자가 카드를 [진행중] 컬럼으로 드롭
  → viewStore의 현재 그룹핑 모드 확인 (예: "status")
  → 변경 사항 계산 (frontmatter.status = "진행중")
  → started/completed 자동 기록 규칙 적용
  → IPC: vault:writeNote(filePath, newContent)
  → Main: fs.writeFile + recentlyWrittenByApp Set에 추가 (TTL 1초)
  → chokidar가 change 이벤트 발생시키지만 Set에 있으므로 무시
  → vaultStore.updateNote() → React 리렌더
```

### 2-3. 외부 변경 감지 (Obsidian에서 수정)

```
chokidar가 change 이벤트 감지
  → recentlyWrittenByApp Set 확인 → 없음 → 외부 변경으로 판단
  → 디바운스 (500ms)
  → Main: 해당 파일 재파싱
  → IPC: window.api.onNoteChanged(note) 이벤트 발송
  → vaultStore.updateNote()
  → 에디터에 열려있는 노트면 충돌 처리 로직 실행
```

### 2-4. AI 그룹핑 호출

```
렌더러: window.api.ai.groupNotes(notes)
  → IPC: ai:groupNotes
  → Main: safeStorage로 API 키 복호화
  → Main: Anthropic SDK 호출 (Haiku 모델)
  → 결과 JSON 파싱
  → 렌더러에 반환 (API 키는 절대 안 나감)
  → 미리보기 UI 표시 → 사용자가 "적용" 선택
  → 각 노트별로 vault:writeNote 호출해 project 필드 저장
```

---

## 3. 상태 관리 전략

### zustand 스토어 3개 분리

| 스토어 | 저장 내용 | 영속성 |
|--------|-----------|--------|
| `vaultStore` | vault 경로, 노트 목록 (Note[]) | 메모리만 (새로고침 시 재스캔) |
| `viewStore` | 현재 그룹핑/정렬/필터 상태 | localStorage (사용자 UX) |
| `settingsStore` | 설정값 (컬럼, WIP, 체류시간 임계 등) | 메인의 electron-store (IPC로 동기화) |

**원칙**:
- 한 스토어는 한 관심사만. 서로 가져다 쓰기만 하고 합치지 않는다.
- 스토어 안에 API 호출 로직을 넣지 않는다. `lib/` 또는 `hooks/`에 둔다.
- React 컴포넌트는 스토어를 직접 구독하고, `props drilling`을 피한다.

---

## 4. 타입 정의 (`src/renderer/src/types/index.ts`)

```typescript
export type Status = "백로그" | "예정" | "진행중" | "검토" | "완료";
export type Priority = "high" | "mid" | "low";

export interface Note {
  filePath: string;         // vaultPath 기준 절대 경로
  relativePath: string;     // vaultPath 기준 상대 경로
  title: string;
  status: Status;
  priority?: Priority;
  due?: string;             // YYYY-MM-DD
  tags: string[];
  project?: string;
  created: string;          // ISO 8601
  started?: string | null;
  completed?: string | null;
  body: string;             // frontmatter 제외 본문
  mtime: number;            // 파일 수정 시각 (Unix ms)
  parseError?: string;      // frontmatter 파싱 실패 시 메시지
}

export interface ColumnConfig {
  name: Status | string;
  wipLimit: number | null;
  policy: string;
}

export interface Settings {
  vaultPath: string;
  vaultName: string;
  excludedFolders: string[];
  defaultGrouping: "status" | "tag" | "folder" | "project";
  defaultSort: "modifiedDesc" | "modifiedAsc" | "createdDesc" | "createdAsc" | "titleAsc" | "dueAsc";
  statusColumns: ColumnConfig[];
  stayTimeWarnings: { yellow: number; red: number };
  anthropicModel: string;
  statusFieldName: string;  // 기본 "status", 사용자가 "상태"로 바꿀 수 있음
}
```

---

## 5. 보안/권한 경계

| 자원 | 메인 | 프리로드 | 렌더러 |
|------|------|----------|--------|
| 파일 읽기/쓰기 (fs) | ✅ | ❌ | ❌ (`window.api.vault.*` 경유) |
| Anthropic SDK | ✅ | ❌ | ❌ (`window.api.ai.*` 경유) |
| safeStorage API 키 | ✅ | ❌ | ❌ (절대 노출 금지) |
| dialog.showOpenDialog | ✅ | ❌ | ❌ |
| electron-store | ✅ | ❌ | ❌ |
| chokidar 감시 | ✅ | ❌ | ❌ |
| DOM 조작 | ❌ | ❌ | ✅ |
| zustand 스토어 | ❌ | ❌ | ✅ |

---

## 6. 테스트 전략 (TDD)

**이 프로젝트는 TDD를 강제한다** (CLAUDE.md CRITICAL 참조).

### 테스트 프레임워크
- **Vitest**: 메인/렌더러 모두. Jest 호환이면서 Vite와 궁합 좋음.
- **@testing-library/react**: 렌더러 컴포넌트 테스트.

### 테스트 우선순위 (모든 Phase에서 이 순서로 작성)

1. **순수 함수 유닛 테스트 (최우선)**
   - `metrics.ts` (리드/사이클타임 계산)
   - `noteParser.ts` (frontmatter 파싱)
   - `obsidianUri.ts` (URI 생성)
   - → 이런 함수는 **외부 의존성 없음** → 100% 테스트 작성
2. **IPC 핸들러 통합 테스트**
   - 실제 임시 vault 폴더를 만들어서 테스트
3. **React 컴포넌트 스냅샷/상호작용 테스트**
   - 카드 드래그, WIP 경고 표시 등

### 테스트 파일 위치

- 순수 함수: 같은 폴더에 `*.test.ts` (예: `metrics.ts` 옆에 `metrics.test.ts`)
- 통합 테스트: `tests/integration/`

---

## 7. 빌드 파이프라인

```
개발: npm run dev
  → electron-vite dev (HMR)
  → 메인/프리로드/렌더러 동시 빌드 + watch

프로덕션 빌드: npm run build
  → TypeScript 타입 체크
  → electron-vite build
  → dist/ 산출물 생성

패키징: npm run dist
  → electron-builder
  → release/{version}/ 에 .dmg / .exe 생성

CI/CD: git push tag v*
  → GitHub Actions (macos-latest + windows-latest 매트릭스)
  → npm ci → npm run build → electron-builder --publish always
  → GitHub Releases에 자동 업로드
```
