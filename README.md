# Vault Kanban

로컬 Obsidian vault의 마크다운 노트를 칸반 보드로 시각화하고 편집하는 Electron 데스크톱 앱입니다.

---

## 주요 기능

- **칸반 보드**: frontmatter `status` 필드 기반 컬럼 자동 분류 + 드래그앤드롭 이동
- **인라인 에디터**: 노트 클릭 시 마크다운 에디터 즉시 오픈, 자동 저장
- **다중 뷰**: 상태 / 태그 / 폴더 / 프로젝트별 그룹핑 전환
- **대시보드**: WIP 현황, 체류시간 경고, 완료율 차트
- **AI 분류**: Anthropic Claude API로 노트 status 자동 추천
- **실시간 파일 감시**: vault 외부 편집 즉시 반영 (chokidar)
- **설정 패널**: 컬럼 구성, 체류시간 경고, 테마, 자동저장 등 전체 설정

---

## 스크린샷

> 스크린샷은 v0.2에서 추가 예정입니다.

---

## 설치 방법

### macOS

1. [Releases](https://github.com/jlaw080-ops/Vault-Kanban/releases) 페이지에서 `Vault.Kanban-x.x.x.dmg` 다운로드
2. `.dmg` 열고 Applications 폴더로 드래그
3. 첫 실행 시 보안 경고가 뜨면:
   - Finder에서 앱 아이콘을 **우클릭 → 열기** 선택
   - 팝업에서 "열기" 버튼 클릭

### Windows

1. [Releases](https://github.com/jlaw080-ops/Vault-Kanban/releases) 페이지에서 `Vault.Kanban-x.x.x-setup.exe` 다운로드
2. 설치 파일 실행
3. SmartScreen 경고가 뜨면:
   - "추가 정보" 링크 클릭
   - "실행" 버튼 클릭

> 코드 서명이 없어 발생하는 경고입니다. 앱 자체는 안전합니다.

---

## 사용법

1. **Vault 연결**: 앱 첫 실행 시 Obsidian vault 폴더 선택
2. **칸반 이동**: 노트 카드를 드래그하여 다른 컬럼으로 이동 → frontmatter 자동 저장
3. **노트 편집**: 카드 클릭 → 마크다운 에디터에서 편집 → 자동 저장
4. **AI 분류**: 설정에서 Anthropic API 키 입력 후 카드 우클릭 → "AI 추천"

---

## AI 사용 비용 안내

AI 분류 기능은 [Anthropic Console](https://console.anthropic.com)에서 발급한 API 키가 필요합니다.

- 신규 계정에 무료 크레딧 제공 ($5 상당, 기간 제한 있음)
- 이후 사용량에 따라 과금 (claude-sonnet-4-6 기준 약 $0.003/1K 토큰)
- 1회 분류 요청 ≈ 500토큰 ≈ $0.0015 미만
- API 키는 앱 로컬에 암호화 저장되며 서버로 전송되지 않습니다

---

## 빌드 (개발자용)

```bash
# 의존성 설치
npm install

# 개발 서버 (HMR)
npm run dev

# 타입 체크 + 빌드
npm run build

# 테스트
npm run test

# 패키징 (현재 플랫폼)
npm run dist

# 패키징 (플랫폼 지정)
npm run dist:mac
npm run dist:win
```

### 새 버전 배포

```
1. 변경사항 커밋 + 푸시
2. npm version patch    # 또는 minor / major
3. git push && git push --tags
4. GitHub Actions 자동 빌드 대기 (약 10분)
5. Releases 탭에서 .dmg / .exe 다운로드
```

---

## 기술 스택

- Electron 33 + electron-vite
- React 18 + TypeScript 5 (strict)
- Tailwind CSS + shadcn/ui
- @dnd-kit (드래그앤드롭)
- zustand (상태 관리)
- gray-matter (frontmatter 파싱)
- chokidar (파일 감시)
- Anthropic SDK (AI)

---

## 라이선스

MIT
