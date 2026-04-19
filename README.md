# Vault Kanban — Harness Engineering 작업지시서 세트

> **이 폴더는 "개발 결과물"이 아니라 "개발을 지시하는 설계서 묶음"입니다.**
> Claude Code가 이 문서들을 읽고 실제 Vault Kanban 앱을 만듭니다.

---

## 🎯 이 설계서가 하는 일

기존 단일 작업지시서(`작업지시서.md`)를 **Harness Engineering 4개 레이어**로 해체한 결과물입니다.
이렇게 해체해야 Claude Code가 Phase 단위로 **안전하게, 자기 완결적으로, 검증 가능하게** 개발할 수 있습니다.

| 레이어 | 위치 | 역할 | 비유 |
|---|---|---|---|
| **Layer 1: 프로젝트의 뇌** | `docs/` | 뭘/어떻게/왜/어떻게 보여야 하는지 기록 | 설계도 + 시방서 |
| **Layer 2: 프로젝트 헌법** | `CLAUDE.md` | AI가 제일 먼저 읽는 목차·규칙 | 계약서 제1조 |
| **Layer 3: 실행 엔진** | `.claude/commands/`, `scripts/execute.py`, `phases/` | Phase 쪼개고 순차 자동 실행 | 공정표 + 감리자 |
| **Layer 4: 자동 검증** | `.claude/settings.json`, `scripts/hooks/` | lint/test/위험명령 자동 체크 | 센서 + 알람 |

---

## 📁 폴더 구조 (한눈에)

```
vault-kanban-harness/
│
├── README.md                        ← 지금 이 파일 (사용 가이드)
│
├── CLAUDE.md                        ← Layer 2: 프로젝트 헌법 (AI가 매번 먼저 읽음)
│
├── docs/                            ← Layer 1: 프로젝트의 뇌
│   ├── PRD.md                       ·  뭘 만드는지 + MVP 제외 목록
│   ├── ARCHITECTURE.md              ·  폴더 구조, 데이터 흐름, 보안 경계
│   ├── ADR.md                       ·  왜 이 기술을 골랐는지 (14개 결정)
│   └── UI_GUIDE.md                  ·  AI 슬롭 방지 + 색/타이포/컴포넌트
│
├── .claude/                         ← Layer 3+4: 실행 + 검증
│   ├── commands/
│   │   ├── harness.md               ·  /harness — 원스톱 실행
│   │   └── review.md                ·  /review — 규칙 기반 자동 리뷰
│   └── settings.json                ·  Hooks 설정
│
├── scripts/
│   ├── execute.py                   ·  Phase 순차 실행기 (재시도 + 자동 커밋)
│   └── hooks/
│       ├── dangerous-cmd-guard.sh   ·  rm -rf / force push 차단
│       ├── tdd-guard.sh             ·  테스트 없으면 경고
│       ├── circuit-breaker.sh       ·  반복 에러 감지
│       └── stop-check.sh            ·  응답 끝날 때마다 lint+test
│
└── phases/mvp/                      ← Phase 작업지시서 (8개)
    ├── index.json                   ·  전체 Phase 목록 + 상태
    ├── step1.md                     ·  프로젝트 뼈대 + Vault 로드
    ├── step2.md                     ·  칸반 보드 + 드래그앤드롭
    ├── step3.md                     ·  WIP/정책/체류시간 + 그룹핑
    ├── step4.md                     ·  노트 에디터 + 파일 감시
    ├── step5.md                     ·  지표 대시보드
    ├── step6.md                     ·  AI 그룹핑 (Anthropic)
    ├── step7.md                     ·  status 마이그레이션
    └── step8.md                     ·  설정 화면 + 빌드/배포
```

---

## 🚀 사용 순서 (6단계)

### 1. 새 Git 리포지토리에 이 폴더 내용 복사

```bash
mkdir vault-kanban && cd vault-kanban
git init
# 이 ZIP의 모든 내용을 이 폴더에 복사
```

### 2. docs/ 검토 & 내 상황 맞게 수정

PRD/ARCHITECTURE/ADR/UI_GUIDE를 **한 번 읽으면서** 내 상황과 안 맞는 부분이 있으면 고치세요.
특히:
- `docs/PRD.md` § "MVP 제외 사항" — 진짜 안 만들 것만 남기기
- `docs/ADR.md` — 기술 선택에 이견이 있으면 **지금** 바꾸기 (나중에 갈아엎으면 비용 큼)

### 3. GitHub에 Push

```bash
git add .
git commit -m "chore: Harness 프레임워크 초기 세팅"
git remote add origin git@github.com:YOUR_USER/vault-kanban.git
git push -u origin main
```

### 4. VS Code + Claude Code 실행

VS Code에서 이 폴더 열기 → Claude Code 패널에서:

```
/harness mvp
```

Claude가 아래 순서로 작동:
1. `CLAUDE.md` + `docs/*` 전부 읽음
2. 이해한 내용 3~5줄 요약 → 사용자 확인
3. Phase 1 지시서(`phases/mvp/step1.md`)를 읽고 구현 시작

### 5. Phase 단위로 확인 + 다음 진행

한 Phase가 끝나면:
- Claude Code가 자동 커밋 (conventional commits)
- 사용자는 `npm run dev`로 직접 동작 확인
- 괜찮으면 다음 Phase로 `/harness resume mvp`

문제가 있으면:
- `/review` 로 규칙 준수 여부 자동 체크
- 이슈 원인이 지시서 모호함 때문이면 **`docs/` 또는 해당 `stepN.md` 수정**
- 같은 문제가 2회 반복되면 `CLAUDE.md` CRITICAL에 "하지 말 것" 추가

### 6. MVP 완성 후

- GitHub에 `v0.1.0` 태그 푸시 → Actions가 자동 빌드 → Releases에 `.dmg`/`.exe` 업로드
- 1주일 실사용 후 v0.2 계획 수립 (PRD "MVP 제외 사항" 중 택 1)

---

## 🧭 대화 원칙 (Claude에게 주문할 때)

- **한 번에 한 Phase만 시켜라.** "다 만들어줘"는 금지. 1주일치 콘텐트를 한 번에 맡기면 깊이가 얕아집니다.
- **"작업지시서.md의 N.N절 참고"** 대신 **"`phases/mvp/stepN.md` 지시서대로"**로 말하세요.
- 에러가 났을 때 에러 메시지 전체를 복사해서 주세요. "안 돼요"만으로는 해결 못 합니다.
- Claude가 스코프를 늘리려 하면 `docs/PRD.md § MVP 제외 사항` 또는 `docs/ADR.md § ADR-XXX`를 근거로 거절하세요.

---

## 🛡️ 이 프레임워크가 보호하는 것

| 위험 | 보호 장치 |
|---|---|
| AI가 의존성 막 추가 | ADR-## 에 근거 없으면 `/review`가 경고 |
| 렌더러에서 API 키 노출 | CLAUDE.md CRITICAL + 코드 grep 자동 체크 |
| 테스트 없는 구현 | `tdd-guard.sh` Hook이 경고 |
| rm -rf 같은 사고 | `dangerous-cmd-guard.sh` Hook이 차단 |
| 같은 실수 반복 | `circuit-breaker.sh` 가 60초 내 5회 반복 감지 |
| AI 슬롭 디자인 | `docs/UI_GUIDE.md` 안티패턴 + `/review` 체크 |
| 마이그레이션 데이터 손실 | Phase 7 CRITICAL: 백업 없이 실행 금지 |
| Scope 크리프 | `docs/PRD.md § MVP 제외 사항` |

---

## 📊 이렇게 해체한 이유 (비개발자 설명)

**원본 작업지시서의 문제**:
- 기능 설명, 디렉토리 구조, Phase 순서, 디자인, 의사결정이 **한 문서에 뒤섞임**
- AI가 긴 문서를 매번 처음부터 읽다가 앞부분을 잊어버림
- "왜 이 라이브러리를 골랐는지"가 없어서 AI가 수시로 "더 좋은 게 있어요" 제안
- 테스트/검증이 말로만 있고 **자동 실행되는 장치가 없음**

**해체 후**:
- AI는 현재 Phase에 필요한 문서만 읽음 (토큰 절약 + 집중력)
- ADR이 "기술 논쟁 종결권"을 가짐 (AI가 대안 제시하면 ADR로 거절)
- UI 가이드가 AI 디폴트 디자인(보라/그라데이션)을 차단
- Hook이 응답 끝날 때마다 자동으로 lint/test 실행 → 문제가 사용자에게 도달하기 전에 잡힘

---

## 🔧 문제 해결 (FAQ)

**Q. `/harness` 명령이 안 먹혀요**
A. VS Code에서 Claude Code 확장이 최신 버전인지 확인. `.claude/commands/harness.md`가 있으면 자동 인식됩니다.

**Q. Hook이 너무 자주 차단해요**
A. `.claude/settings.json`에서 해당 hook을 주석 처리하거나 `tdd-guard.sh`처럼 `exit 0`(경고만)으로 완화.

**Q. Phase를 다시 실행하고 싶어요**
A. `phases/mvp/index.json`에서 해당 phase의 `"status"`를 `"pending"`으로 바꾸고 `python3 scripts/execute.py mvp --phase 2` 처럼 Phase 번호 지정.

**Q. 설계를 크게 바꾸고 싶어요**
A. 코드 수정 **전에** 반드시 `docs/ADR.md`에 새 ADR을 추가(Supersedes 표시). 그러지 않으면 나중에 "왜 이렇게 됐지?" 추적 불가.

**Q. Vercel로 배포하고 싶어요**
A. Vault Kanban은 Electron 데스크톱 앱이라 Vercel 불가. GitHub Actions가 `.dmg`/`.exe`를 빌드해서 Releases로 올립니다 (Phase 8).

---

## 🔗 참고

- [Harness Framework 원본 레포](https://github.com/jha0313/harness_framework)
- [Harness 튜토리얼 (Notion)](https://raspy-roll-970.notion.site/340f7725c9d98176b68bd31c823c7540)
- [OpenAI - Harness Engineering](https://openai.com/index/harness-engineering/)
- [Martin Fowler - Feedback Flywheel](https://martinfowler.com/articles/reduce-friction-ai/feedback-flywheel.html)
