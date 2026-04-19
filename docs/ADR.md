# Architecture Decision Records: Vault Kanban

> **이 문서의 목적**: "뭘 선택했고, 왜 선택했고, 뭘 포기했는지"를 기록한다.
> AI가 "더 좋은 대안이 있는데요?" 제안을 해오지 않게 하는 근거가 된다.
> 결정을 뒤집을 때는 새 ADR을 추가(Supersedes)하고 기존은 남겨둔다.

---

## 프로젝트 철학

1. **개인용 속도 최우선** — 완벽함보다 "1주일 내 내가 써보기"가 훨씬 중요하다.
2. **외부 의존성 최소화** — 데이터는 사용자 컴퓨터에만. 클라우드 DB, 계정 시스템 없음.
3. **Obsidian 데이터 포맷이 곧 저장소** — 별도 DB 없이 `.md` 파일이 Single Source of Truth.
4. **AI는 보조, 사람이 결정** — AI 그룹핑은 제안만. 사용자가 검토 후 적용.
5. **파괴적 작업 전에는 반드시 백업** — 마이그레이션, 폴더 이동 등.

---

## ADR-001: 데스크톱 프레임워크로 Electron 선택

- **결정**: Electron을 쓴다.
- **이유**:
  - 로컬 파일 시스템 접근이 가장 자유롭다 (Obsidian과 같은 방식).
  - chokidar로 실시간 파일 감시가 쉽다.
  - React + TypeScript 생태계 그대로 사용 가능.
  - 참고 자료와 레퍼런스가 압도적으로 많아 비개발자가 AI 도움으로 문제 해결하기 유리.
- **트레이드오프**:
  - 번들 크기 150MB+ (Tauri 대비 10배 이상).
  - 메모리 사용량 많음.
  - **→ 개인용 데스크톱 앱이므로 수용.**
- **검토했으나 포기한 대안**: Tauri (Rust 러닝커브), PWA (파일 감시 제한), Web Electron (불필요).

---

## ADR-002: 빌드 도구로 electron-vite 선택

- **결정**: electron-vite + Vite 기반.
- **이유**: 개발 중 HMR(Hot Module Reload)이 빠르다. Claude Code가 코드를 고칠 때마다 즉시 확인 가능.
- **트레이드오프**: webpack 기반 보일러플레이트 대비 생태계는 작지만, 현재 기능에 충분하다.

---

## ADR-003: UI 컴포넌트로 shadcn/ui 선택

- **결정**: shadcn/ui + Tailwind CSS.
- **이유**:
  - 컴포넌트를 복사해 오는 방식이라 **의존성이 안 생긴다**. 커스터마이징 자유도 최고.
  - Radix UI 기반으로 접근성이 이미 처리됨.
  - 디자인 토큰이 CSS 변수로 분리돼서 다크/라이트 모드 전환이 쉬움.
- **트레이드오프**:
  - MUI/Ant Design 같은 "통짜 디자인 시스템"보다 초기 세팅이 번거롭다.
  - 컴포넌트마다 직접 `add` 해야 한다.
- **검토했으나 포기한 대안**: MUI (디자인 고정적), Chakra (Tailwind와 중복), Ant Design (동양풍 스타일).

---

## ADR-004: 상태 관리로 zustand 선택

- **결정**: zustand (Redux/MobX 대신).
- **이유**:
  - 보일러플레이트가 없다 (action/reducer 안 씀).
  - 이 규모(1인용 앱, 스토어 3개)에서는 Redux는 과잉.
  - devtools 연동 잘 됨.
- **트레이드오프**: 엔터프라이즈급 시스템에서는 Redux가 낫지만, **이 프로젝트에는 zustand가 적합**.

---

## ADR-005: 드래그앤드롭으로 @dnd-kit 선택

- **결정**: @dnd-kit/core + @dnd-kit/sortable.
- **이유**:
  - `react-beautiful-dnd`는 2022년부터 사실상 deprecated.
  - @dnd-kit은 현재 React 생태계에서 가장 활발히 유지보수됨.
  - 키보드 접근성 지원 (aria 대응이 기본).
- **트레이드오프**: API가 react-dnd보다 살짝 복잡하지만 문서가 잘 돼 있음.

---

## ADR-006: 마크다운 파싱은 gray-matter

- **결정**: `gray-matter`로 frontmatter 파싱.
- **이유**:
  - Obsidian 생태계 표준 (Obsidian 자체도 같은 파서 계열 사용).
  - **YAML 키 순서와 들여쓰기를 보존**한다. 이게 핵심.
- **CRITICAL**: frontmatter를 직접 정규식으로 파싱하지 않는다. 원본 파일의 주석, 공백, 키 순서를 깨뜨릴 수 있다.

---

## ADR-007: 데이터 저장소는 오직 `.md` 파일

- **결정**: SQLite/IndexedDB 등 별도 DB를 두지 않는다.
- **이유**:
  - Single Source of Truth가 `.md` 파일이어야 Obsidian과 충돌이 없다.
  - 마이그레이션, 동기화, 이식성이 모두 해결됨.
  - 파일 = 데이터이므로 백업/복원이 그냥 폴더 복사.
- **트레이드오프**:
  - 노트 수가 수천 개를 넘어가면 스캔이 느려진다.
  - 검색 인덱싱을 메모리에서만 한다 (재시작마다 재계산).
  - **→ 현재 타겟(개인 vault, 수백~천 노트) 범위에서는 문제 없음.**

---

## ADR-008: AI 제공자는 Anthropic Claude 고정

- **결정**: Anthropic SDK만 사용. OpenAI/Gemini 지원 안 함.
- **이유**:
  - 기본 모델은 Haiku(저렴 + 빠름). Sonnet은 옵션.
  - 다중 공급자를 지원하면 UI와 에러 처리가 복잡해진다.
  - 사용자 도메인(건축설비, 한국어 많음)에 Claude 성능이 좋음.
- **트레이드오프**: API 다운 시 대체 수단 없음. **→ AI는 부가 기능이므로 수용.**

---

## ADR-009: API 키 저장은 safeStorage

- **결정**: Electron의 `safeStorage` API로 OS 키체인(macOS Keychain) / 자격증명관리자(Windows Credential Manager)에 암호화 저장.
- **이유**:
  - `settings.json`에 평문 저장은 보안상 받아들일 수 없음.
  - `safeStorage`는 앱별 격리되고 OS가 관리.
- **트레이드오프**:
  - OS 키체인 접근 실패 시(리눅스 특정 환경 등) 대체 동작 필요.
  - **→ macOS/Windows 타겟이므로 수용.**

---

## ADR-010: 차트는 recharts

- **결정**: `recharts`로 대시보드 차트 구현.
- **이유**:
  - React 친화적 선언형 API.
  - 리드/사이클타임 히스토그램, 누적 영역 차트(CFD) 모두 기본 지원.
- **트레이드오프**: D3.js 대비 커스터마이징 자유도가 낮지만, **대시보드 수준에서는 충분**.
- **검토했으나 포기**: D3.js (러닝커브), Chart.js (React 통합 번거로움), Visx (과잉).

---

## ADR-011: 상태 5단계 고정 (확장 가능)

- **결정**: 기본 칸반 컬럼은 `백로그 / 예정 / 진행중 / 검토 / 완료` 5개로 고정. 설정에서 추가/삭제/이름 변경 가능.
- **이유**:
  - 칸반 정석(David Anderson 칸반 방법)이 보통 4~5 단계.
  - 이미 Obsidian 쓰던 사람들의 자유형 값은 마이그레이션 도구로 흡수.
- **트레이드오프**: 일부 사용자는 더 많은 단계를 원할 수 있음 → 설정에서 확장 허용.

---

## ADR-012: 코드 서명 생략 (개인용 범위)

- **결정**: macOS/Windows 코드 서명 없이 배포.
- **이유**:
  - Apple Developer $99/year + notarization이 개인 토이 프로젝트에 과함.
  - 첫 실행 시 OS 경고만 뚫으면 이후 문제 없음.
- **트레이드오프**: 다른 사람에게 배포 시 "개발자 미확인" 경고 → README에 우회 방법 명시.
- **미래 전환 조건**: 배포 대상이 개인을 넘어서면 ADR-012를 대체하는 새 ADR 추가.

---

## ADR-013: TDD 강제

- **결정**: 새 기능은 **반드시 테스트를 먼저 작성**. 테스트 없는 구현은 Hook으로 차단.
- **이유**:
  - 비개발자 + AI 자동 구현 환경에서는 "눈으로 훑어서 검증"이 불가능.
  - 회귀 방지 + 리팩토링 안전망 필수.
  - 특히 `metrics.ts`(리드타임 계산) 같은 순수 함수는 테스트가 설계 스펙 역할.
- **트레이드오프**: 초반 속도가 10~20% 느림. **→ 중장기 속도로 보상됨.**

---

## ADR-014: 커밋 메시지는 Conventional Commits

- **결정**: `feat: / fix: / docs: / refactor: / test: / chore:` 접두어 사용.
- **이유**:
  - AI Generator Agent가 Phase 단위로 커밋할 때 메시지를 일관되게 생성 가능.
  - 추후 CHANGELOG 자동 생성에도 유리.
- **예시**: `feat(phase-2): 칸반 드래그앤드롭 구현`, `test(metrics): 사이클타임 경계 케이스 추가`.

---

## ADR-015: dev 스크립트는 `node scripts/dev.mjs` 런처 경유

- **결정**: `npm run dev`는 `electron-vite dev`를 직접 실행하지 않고, `scripts/dev.mjs` Node ESM 런처를 거쳐 실행한다. 이 런처는 자식 프로세스의 환경 변수에서 `ELECTRON_RUN_AS_NODE`를 **삭제**한 뒤 `electron-vite dev`를 spawn한다.
- **포맷 결정**: `.mjs` (ESM) 사용. 초기에는 `.cjs`로 작성했으나 ESLint `@typescript-eslint/no-require-imports` 규칙과 충돌. 규칙을 약화하는 대신 ESM `import`로 전환 (`import { spawn } from 'node:child_process'`). 런처는 자체 의존성 없는 단일 파일이므로 ESM 전환 비용 0.
- **배경**:
  - VSCode의 호스트 Electron이 spawned 터미널에 `ELECTRON_RUN_AS_NODE=1`을 export한다 (VSCode 내장 동작).
  - Electron 바이너리는 이 변수가 비어있지 않은 어떤 값(`""` 포함)이라도 설정돼 있으면 plain Node 모드로 부팅한다.
  - 이 경우 `require('electron')`이 API 객체 대신 **경로 문자열**을 반환 → `out/main/index.js`의 `electron.app.isPackaged` 접근에서 `TypeError: Cannot read properties of undefined (reading 'isPackaged')` 발생.
- **검토했으나 포기한 대안**:
  - `cross-env ELECTRON_RUN_AS_NODE= electron-vite dev` — cross-env는 변수 SET만 가능하고 UNSET이 불가능. 빈 값 `""`도 Electron이 "Node 모드 ON"으로 해석하므로 효과 없음.
  - 사용자에게 VSCode 외부 터미널에서만 실행하라고 강제 — 비개발자 사용자에게 비현실적.
  - 셸 프로파일에서 `unset ELECTRON_RUN_AS_NODE` — 매 세션 진입마다 부담, 프로파일 종속.
- **트레이드오프**:
  - dev 진입에 `node` 한 단계가 더 추가됨 (수십 ms 오버헤드).
  - 윈도우에서 Bash/PowerShell/CMD 어디서 실행해도 동일하게 동작 → **수용**.
- **검증**: `npm run dev` 실행 → main/preload 빌드 성공, 렌더러 dev 서버 `http://localhost:5173/` 기동, electron.exe 4개 정상 spawn, `isPackaged` 에러 미발생.

---

## ADR-016: chokidar `^5` 채택 (스펙 명시 `^4` 와 차이)

- **결정**: PRD/스펙 명시 버전인 `chokidar ^4` 대신 `^5.0.0`을 채택한다.
- **이유**:
  - `^5`는 ESM-first 출시본이며 Node 20+ 환경에서 더 가벼운 의존성 트리(파싱·정규식 처리 단순화)를 제공.
  - 스펙 작성 시점(`^4`) 이후 안정 메이저가 출시되었고, 본 프로젝트가 사용하는 watch API 표면(`add`/`change`/`unlink`)은 메이저 간 호환.
  - Electron 33 + Node 20 런타임에서 `^4`의 fsevents 폴백 경로가 일부 윈도우 케이스에서 deprecation 경고를 띄우는 것을 회피.
- **트레이드오프**: 스펙 문서와 실제 의존성이 어긋나는 단점 → 본 ADR로 명시적 대체.
- **회귀 방지**: vault 로드 통합 테스트에서 `add`/`change`/`unlink` 이벤트 트리거 케이스 유지.

---

## ADR-017: Electron `^33.2.1` 잔여 CVE 수용 (개인용 범위)

- **결정**: Electron `^33.2.1`을 사용하며, 이 시점 이후 공개된 잔여 CVE 패치를 위한 즉시 메이저 업그레이드는 하지 않는다.
- **이유**:
  - 본 앱은 **로컬 vault 파일만** 다루며 외부 신뢰되지 않은 콘텐츠(원격 URL, 외부 iframe, 외부 JS)를 로드하지 않음.
  - `contextIsolation: true`, `nodeIntegration: false`, `sandbox: false`(파일 시스템 접근 필요로 sandbox만 해제) 설정으로 렌더러 공격면 축소.
  - 메이저 업그레이드는 electron-vite, electron-builder, @electron-toolkit/* 동반 검증이 필요해 Phase 진행을 지연시킴.
- **트레이드오프**: 외부 배포로 범위가 확장되거나, 렌더러가 원격 콘텐츠를 직접 로드하게 되면 본 ADR을 대체하는 새 ADR 필요.
- **재평가 트리거**: (1) Electron LTS 변경, (2) 외부 사용자 배포 결정, (3) 렌더러에 외부 컨텐츠 로딩 기능 추가.

---

## ADR-018: shadcn/ui는 수동 스캐폴드 (CLI 미사용)

- **결정**: `shadcn add` CLI를 돌리지 않고, 필요한 컴포넌트(`button.tsx` 등)와 토큰(`globals.css`의 HSL CSS 변수), `lib/utils.ts`(`cn` 헬퍼), `components.json`에 해당하는 설정을 수동으로 작성·복사한다.
- **이유**:
  - electron-vite + 다중 tsconfig(`tsconfig.web.json` / `tsconfig.node.json`) 환경에서 shadcn CLI의 경로 자동 추론이 자주 깨짐.
  - 컴포넌트 한두 개부터 시작하므로 CLI를 도입할 만큼의 자동화 이득이 없음.
  - 우리 코드 컨벤션(`react-refresh/only-export-components` 강제 → `button-variants.ts` 분리 등)을 CLI 출력보다 우선 적용해야 함.
- **트레이드오프**: 컴포넌트 추가 시마다 shadcn 공식 소스에서 직접 복사 + 본 프로젝트 컨벤션 적용. 추후 컴포넌트가 10개를 넘기면 CLI 재도입 검토.

---

## ADR-019: 메인 ↔ 렌더러 타입 공유는 `src/renderer/src/types/index.ts` 단일 출처

- **결정**: 도메인 타입(`Note`, `KanbanStatus`, `VaultMeta` 등)은 `src/renderer/src/types/index.ts`에 정의하고, 메인/프리로드는 **상대 경로 import**로 동일 정의를 공유한다. `shared/`나 별도 패키지를 만들지 않는다.
- **이유**:
  - 1인 프로젝트 규모에서 monorepo/`packages/shared`는 과잉.
  - 타입은 빌드 산출물이 없으므로 메인/프리로드/렌더러 각자의 tsconfig에서 동일 파일을 import해도 문제없음.
  - "타입은 한 곳에만" 규칙을 CLAUDE.md 헌법에 명시 (검색·수정 비용 최소화).
- **트레이드오프**: 메인 코드가 렌더러 디렉토리를 import하는 모양새가 어색해 보일 수 있음 → 주석으로 의도 명시.
- **검토했으나 포기**: `src/shared/types.ts` 신설 (디렉토리만 늘고 가치 미미), 패키지 분리 (over-engineering).

---

## ADR-020: zustand 스토어는 `vaultStore` / `viewStore` / `settingsStore` 3개로 고정

- **결정**: 스토어를 정확히 3개만 둔다. 합치지 않고 더 쪼개지 않는다.
  - `vaultStore`: 노트 목록·로딩 상태·파일 시스템 이벤트 반영
  - `viewStore`: 칸반 컬럼 필터·정렬·UI 표시 상태
  - `settingsStore`: vault 경로·테마·AI 설정 등 사용자 설정
- **이유**:
  - 책임 경계가 (데이터) / (뷰 상태) / (설정)으로 자연스럽게 갈림.
  - 스토어가 5개를 넘으면 의존성 사이클·구독 비효율이 생기기 시작.
  - 하나로 합치면 불필요한 리렌더가 폭증.
- **트레이드오프**: 일부 도메인 액션이 두 스토어를 동시에 호출하는 경우가 생김 → 액션 호출자(컴포넌트)에서 명시적으로 처리.
- **회귀 방지**: 새 스토어 추가 PR은 본 ADR 대체 ADR이 함께 작성돼야 머지.

---

## ADR-021: `button-variants.ts`는 `button.tsx`에서 분리

- **결정**: shadcn `button` 컴포넌트의 CVA `buttonVariants`를 `button.tsx`에서 떼어 `button-variants.ts`로 분리한다.
- **이유**:
  - ESLint `react-refresh/only-export-components` 규칙: 컴포넌트 파일에서 컴포넌트 외 값(`buttonVariants`)을 export하면 HMR 갱신이 깨짐.
  - 이 규칙은 dev 경험(즉시 반영) 보호용이라 비활성화하지 않음.
- **트레이드오프**: shadcn 공식 예시와 파일 구조가 달라짐 → 다른 shadcn 컴포넌트 추가 시에도 동일 패턴 적용.
- **적용 범위**: `variants` 객체를 export하는 모든 shadcn 컴포넌트(badge, alert 등)에 동일 규칙 적용.
