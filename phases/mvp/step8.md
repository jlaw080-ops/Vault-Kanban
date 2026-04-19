# Phase 8: 설정 화면 완성 + 빌드/배포

## 필수 읽기

1. `CLAUDE.md`
2. `docs/PRD.md` § "성공 기준"
3. `docs/ARCHITECTURE.md` § 7 (빌드 파이프라인)
4. `docs/ADR.md` ADR-012 (코드 서명 생략)

---

## 범위

설정 화면의 나머지 섹션을 마무리하고, **`electron-builder` 패키징 + GitHub Actions 자동 빌드**를 구성한다. macOS `.dmg` / Windows `.exe` 자동 빌드 + GitHub Releases 업로드.

---

## 구현 작업 (순서대로)

### 1. 설정 화면 나머지 섹션

`SettingsPanel.tsx` 완성. 섹션 순서:

- **Vault**: 경로 변경, vault 이름, 제외 폴더 (chips)
- **상태 필드**: 필드명, 컬럼 설정 (이름/WIP/정책. 추가/삭제/순서 변경 가능)
- **체류시간 경고**: yellow/red 일수
- **기본 뷰**: 기본 그룹핑, 기본 정렬
- **에디터**: 자동저장 on/off + idle 초
- **AI (Anthropic)**: (Phase 6에서 만든 거 통합) + 월별 사용량 표시 (가능한 경우)
- **정보**: 앱 버전, GitHub 링크, 라이선스

설정 변경은 즉시 반영 + electron-store에 자동 저장. 값 검증(숫자/범위) 포함.

### 2. electron-builder 설정

**`electron-builder.yml`**:
```yaml
appId: com.user.vaultkanban
productName: Vault Kanban
directories:
  buildResources: build
  output: release/${version}
files:
  - '!**/.vscode/*'
  - '!src/*'
  - '!electron.vite.config.{js,ts,mjs,cjs}'
  - '!{.eslintrc,.prettierrc,tsconfig.json,tsconfig.node.json}'
  - '!tests/**'
  - '!**/*.test.ts'
asarUnpack:
  - resources/**
mac:
  target: dmg
  category: public.app-category.productivity
  icon: build/icon.icns
  identity: null        # ADR-012: 코드 서명 생략
win:
  target: nsis
  icon: build/icon.ico
nsis:
  oneClick: false
  allowToChangeInstallationDirectory: true
```

**`package.json` 스크립트 추가**:
```json
{
  "scripts": {
    "dist": "electron-builder",
    "dist:mac": "electron-builder --mac",
    "dist:win": "electron-builder --win"
  }
}
```

### 3. 앱 아이콘

`build/icon.png` (1024x1024 PNG), `build/icon.ico`, `build/icon.icns` 배치. 임시 아이콘은 shadcn 스타일의 단순 도형으로 제작 가능 (v0.2에서 교체).

### 4. GitHub Actions

**`.github/workflows/build-release.yml`**:

```yaml
name: Build & Release

on:
  push:
    tags:
      - 'v*'
  workflow_dispatch:

jobs:
  build:
    strategy:
      fail-fast: false
      matrix:
        os: [macos-latest, windows-latest]
    runs-on: ${{ matrix.os }}
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: '20'
          cache: 'npm'
      - run: npm ci
      - run: npm run lint
      - run: npm run test -- --run
      - run: npm run build
      - run: npx electron-builder --publish always
        env:
          GH_TOKEN: ${{ secrets.GITHUB_TOKEN }}
```

### 5. README.md 작성

다음 구조:
- 프로젝트 소개 (1문단)
- 주요 기능 (불릿 5~7개)
- 스크린샷 (칸반/에디터/대시보드 3장)
- 설치 방법 (macOS/Windows별)
  - 첫 실행 경고 뚫는 방법 (ADR-012)
- 사용법 요약 (Obsidian vault 연결 → 칸반 이동 → AI 분류)
- AI 사용 비용 안내 (Anthropic 계정 필요 + 크레딧 충전)
- 빌드 방법 (개발자용)
- 라이선스

### 6. 배포 워크플로우 문서화

README.md 하단 또는 별도 `DEPLOY.md`:

```
# 새 버전 배포

1. 변경사항 커밋 + 푸시
2. 버전 올리기: npm version patch  # 또는 minor/major
3. 태그 푸시: git push && git push --tags
4. GitHub Actions 자동 빌드 대기 (약 10분)
5. Releases 탭에서 .dmg / .exe 다운로드
```

### 7. 최종 점검 체크리스트

- [ ] `npm run lint` `npm run build` `npm run test` 전부 통과
- [ ] `npm run dist` 로컬에서 성공 (Mac 또는 Windows 둘 중 하나)
- [ ] 빌드된 앱 실행 → vault 연결 → 칸반/에디터/대시보드 동작
- [ ] `/review` 실행 결과 CRITICAL 위반 0건
- [ ] 문서 일치성: PRD 기능 목록 ↔ 실제 구현 100% 매치

---

## 인터페이스 시그니처

```typescript
// 설정 스키마 (settings.json 전체)
export interface Settings {
  vaultPath: string;
  vaultName: string;
  excludedFolders: string[];
  defaultGrouping: ViewState["grouping"];
  defaultSort: SortKey;
  statusColumns: ColumnConfig[];
  stayTimeWarnings: { yellow: number; red: number };
  anthropicModel: string;
  statusFieldName: string;        // "status" | "상태"
  editorAutoSave: { enabled: boolean; idleSeconds: number };
  theme: "system" | "light" | "dark";
}
```

---

## 수락 기준

- [ ] 로컬에서 `npm run dist` 성공 → `release/*/` 에 `.dmg` 또는 `.exe` 생성
- [ ] GitHub에 `v0.1.0` 태그 푸시 → Actions가 Mac+Windows 빌드 성공 → Releases에 자동 업로드
- [ ] 빌드된 앱 설치 → 새 컴퓨터에서 실행 → vault 연결 후 정상 동작
- [ ] Mac: 첫 실행 경고 우회 방법(우클릭 → 열기)이 README에 명시됨
- [ ] Windows: SmartScreen 경고 우회 방법("추가 정보" → "실행")이 README에 명시됨
- [ ] README에 스크린샷 3장 이상 + 기능 설명
- [ ] 실제 사용자 vault로 **1주일 이상 사용 후 치명적 버그 0**  (사용자 주관 검증 항목)

---

## 금지 사항

- Apple Developer 계정, 코드 서명 인증서 요구 금지 (ADR-012).
- electron-builder 대신 electron-packager/다른 도구로 전환 금지.
- GitHub Actions에서 `secrets.ANTHROPIC_API_KEY` 같은 값을 빌드에 포함 금지 (API 키는 사용자 본인이 설정). CRITICAL.
- `npm version` 명령 대신 태그 수동 작성 금지 (git 태그와 package.json 버전 불일치 위험).
- 자동 업데이트 기능(electron-updater) 도입 금지. 이번 범위 밖. 향후 ADR 추가 후 검토.
- README에 "배포 자동화 성공!" 같은 자찬 문구 금지. 간결한 설치/사용법에 집중.

---

## 커밋 메시지 예시

```
feat(phase-8): 설정 화면 완성 + electron-builder 패키징

- SettingsPanel 전체 섹션 완성 (Vault/상태/체류/기본뷰/에디터/AI/정보)
- electron-builder.yml (mac dmg, win nsis, 코드 서명 생략)
- GitHub Actions 워크플로우 (macos+windows 매트릭스, tag 기반)
- README.md 작성 (설치/사용법/빌드)
- build/icon.* 임시 아이콘 배치
```

---

## MVP 완성 후 할 일

1. 실제 본인 vault로 **1주일 이상 사용**
2. 발견된 이슈를 `issues/` 또는 GitHub Issues에 기록
3. 자주 반복되는 실패 패턴 → `CLAUDE.md` CRITICAL에 추가
4. v0.2 계획 수립 — PRD "MVP 제외 사항" 중 무엇을 먼저?
   - 스윔레인?
   - ZEB 인증 체크리스트 도메인 템플릿?
   - 회고 노트 자동 생성?
