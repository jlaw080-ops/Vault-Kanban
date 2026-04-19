# 프로젝트: Vault Kanban

> **이 파일은 Claude Code가 작업 시작 전에 반드시 읽는 파일이다.**
> 100줄 이내의 목차/헌법 역할. 세부 규칙은 `docs/` 하위 파일 참조.

---

## 프로젝트 개요

- **이름**: Vault Kanban
- **유형**: Electron 데스크톱 앱 (macOS + Windows)
- **목적**: 로컬 Obsidian vault의 `.md` 노트를 칸반으로 시각화·편집·AI 분석
- **사용자**: 1인 (건축설비/ZEB/Passive House 도메인)
- **상세**: `docs/PRD.md`

---

## 기술 스택

- **프레임워크**: Electron `^33` + electron-vite `^2.3`
- **언어**: TypeScript `^5.5` (strict mode 필수)
- **UI**: React `^18.3` + Tailwind CSS `^3.4` + shadcn/ui
- **드래그앤드롭**: @dnd-kit/core + @dnd-kit/sortable
- **상태관리**: zustand `^5`
- **마크다운**: gray-matter (파싱) + @uiw/react-md-editor (편집)
- **파일 감시**: chokidar `^4`
- **AI**: @anthropic-ai/sdk (메인 프로세스 전용)
- **차트**: recharts
- **빌드/배포**: electron-builder + GitHub Actions
- **테스트**: Vitest + @testing-library/react

---

## 아키텍처 규칙

- **CRITICAL**: 렌더러 프로세스에서 `fs`, `Anthropic SDK`, `safeStorage`를 직접 사용하지 않는다. 반드시 `window.api.*` (preload IPC) 경유.
- **CRITICAL**: Anthropic API 키는 `safeStorage`로 암호화 저장만 한다. `settings.json` 평문 저장 금지. 렌더러에 절대 전달 금지.
- **CRITICAL**: frontmatter 수정 시 `gray-matter`만 사용한다. 정규식으로 직접 파싱/수정 금지 (YAML 키 순서·들여쓰기 손상됨).
- **CRITICAL**: `fs.writeFile` 직전에 `recentlyWrittenByApp` Set에 경로 추가. 자기 쓰기-재감지 무한 루프 방지.
- **CRITICAL**: 파괴적 작업(마이그레이션, 폴더 이동) 전에는 반드시 자동 백업 선행.
- 파일 구조는 `docs/ARCHITECTURE.md` 1장을 따른다. 임의로 폴더를 추가하거나 위치를 옮기지 않는다.
- zustand 스토어는 세 개(`vaultStore`, `viewStore`, `settingsStore`)만. 합치거나 쪼개지 않는다.
- 타입은 `src/renderer/src/types/index.ts`에만 정의. 여기저기 흩뜨리지 않는다.

---

## UI 규칙 (상세는 `docs/UI_GUIDE.md`)

- **CRITICAL**: `bg-gradient-*`, `backdrop-blur-*`, `rounded-2xl` 이상의 큰 둥근 모서리, 보라/인디고 브랜드 색 금지 ("AI 슬롭" 방지).
- 애니메이션은 드래그앤드롭, 모달, 로딩 스피너에만 허용.
- 모든 색상 클래스에 `dark:` 변형 병기. 다크 모드 누락 금지.
- 아이콘은 `lucide-react` 고정. UI 텍스트에 이모지 금지.

---

## 개발 프로세스

- **CRITICAL (TDD)**: 새 기능 구현 시 **반드시 테스트를 먼저 작성**한다. 테스트 없는 구현은 Hook이 차단한다.
  - 순수 함수(`metrics.ts`, `noteParser.ts`, `obsidianUri.ts`)는 100% 테스트 작성.
  - 테스트 파일 위치: 순수 함수는 같은 폴더 `*.test.ts`, 통합 테스트는 `tests/integration/`.
- **CRITICAL**: 새 라이브러리 추가 시 `docs/ADR.md`에 의사결정 기록 추가. 기록 없이 의존성 추가 금지.
- **CRITICAL**: Phase 단위로만 작업한다. 한 Phase 완료 후 사용자 확인 전까지 다음 Phase로 넘어가지 않는다.
- 커밋 메시지는 Conventional Commits: `feat(phase-N): ...`, `fix: ...`, `test: ...`, `docs: ...`, `refactor: ...`, `chore: ...`.
- 같은 오류가 2회 이상 발생하면 이 파일의 CRITICAL에 "하지 말 것"을 추가 + 재발 방지 테스트 작성.

---

## 금지 사항 (하지 말 것)

- SQLite, IndexedDB 등 별도 DB 도입 (ADR-007 참조. `.md` 파일이 Single Source of Truth).
- OpenAI/Gemini 등 다른 AI 공급자 지원 (ADR-008).
- Tauri/Neutralino 등 프레임워크 변경 제안 (ADR-001).
- 스윔레인, 모바일 뷰, 팀 공유, 회고 자동화 기능 구현 (PRD "MVP 제외 사항").
- 본문(마크다운 body)을 앱이 임의 수정. 본문은 **보존만** 한다.
- `contextIsolation: false` 또는 `nodeIntegration: true` 설정.
- `git push --force`, `git reset --hard`, `rm -rf` 사용 (Hook이 자동 차단).

---

## 명령어

```bash
npm run dev        # 개발 서버 (electron-vite, HMR)
npm run build      # 프로덕션 빌드 (타입 체크 포함)
npm run lint       # ESLint
npm run test       # Vitest 실행
npm run test:watch # Vitest watch 모드
npm run dist       # electron-builder 패키징
```

---

## 문서 참조 지도

- **무엇을 만드는가** → `docs/PRD.md`
- **어떻게 만드는가 (폴더/프로세스/데이터 흐름)** → `docs/ARCHITECTURE.md`
- **왜 이렇게 선택했는가 (대안 거절 근거)** → `docs/ADR.md`
- **어떻게 보여야 하는가 (디자인/안티패턴)** → `docs/UI_GUIDE.md`
- **현재 Phase 작업 지시** → `phases/{task-name}/step{N}.md`

---

## 자동 업데이트 규칙

1. 작업 중 실패/회귀가 발생하면 원인을 분석하여 CRITICAL에 "하지 말 것"으로 기록한다.
2. 같은 유형의 실패가 2회 이상 반복되면 테스트를 추가해 회귀 방지 장치를 만든다.
3. 이 파일이 실제 코드와 일치하는지 `/review` 명령으로 주기 점검한다.
