# /review

> 현재 코드베이스가 `docs/`와 `CLAUDE.md` 규칙을 준수하는지 체크한다.
> 사용자가 `/review`를 입력하면 아래 4가지를 자동 검토한다.

---

## 검토 항목

### 1. 폴더 구조 준수 (`docs/ARCHITECTURE.md` 1장과 비교)

- 정의되지 않은 최상위 폴더가 있는가?
- 정의된 폴더 중 누락된 것이 있는가?
- 잘못된 위치에 파일이 있는가? (예: 렌더러 쪽에 `fs` import)

체크 방법:
```bash
# 렌더러에서 fs/node 직접 import 검색
grep -rE "import .*from ['\"]fs" src/renderer/ && echo "❌ 렌더러에서 fs 직접 사용 감지"
grep -rE "require\('fs" src/renderer/ && echo "❌ 렌더러에서 fs 직접 사용 감지"

# Anthropic SDK 렌더러 직접 사용 감지
grep -rE "from ['\"]@anthropic-ai/sdk" src/renderer/ && echo "❌ 렌더러에서 Anthropic SDK 직접 사용 감지"
```

### 2. ADR 기술 스택 준수

- `package.json`에 **ADR에 기록되지 않은** 의존성이 추가됐는가?
- 버전이 ADR과 어긋나는가?

체크 방법:
- `package.json`의 dependencies/devDependencies 리스트를 뽑아, 각 항목이 `docs/ADR.md`에 언급되는지 확인.
- 누락된 항목 발견 시: "새 의존성 `X`가 추가됐는데 ADR에 없습니다. 결정 근거를 ADR에 추가하거나 의존성을 제거하세요."

### 3. 테스트 작성 여부 (TDD 강제)

- `src/renderer/src/lib/` 하위 각 `.ts` 파일에 대응하는 `.test.ts`가 있는가?
- `src/main/utils/` 하위 각 파일에 대응하는 테스트가 있는가?

체크 방법:
```bash
# 순수 함수 파일 나열
for f in src/renderer/src/lib/*.ts src/main/utils/*.ts; do
  base="${f%.ts}"
  if [[ ! -f "${base}.test.ts" && "$f" != *.test.ts && "$f" != *.d.ts ]]; then
    echo "❌ 테스트 누락: $f"
  fi
done
```

### 4. CLAUDE.md CRITICAL 규칙 준수

각 CRITICAL 항목을 자동 검증:

| CRITICAL 항목 | 검증 방법 |
|--------------|-----------|
| 렌더러에서 fs/Anthropic 직접 사용 금지 | `grep` (위 참조) |
| API 키 평문 저장 금지 | `settings.json`, 코드에 `sk-ant-` 문자열 검색 |
| gray-matter만 사용 | frontmatter 정규식 파싱 코드(`---\n[\s\S]*?---`) 검색 |
| contextIsolation 반드시 true | `src/main/index.ts`에서 `contextIsolation: true`, `nodeIntegration: false` 확인 |
| `rounded-2xl` 이상 금지 | `grep -rE "rounded-(2xl\|3xl\|full)" src/renderer/` 결과가 장식용인지 수동 검토 |
| `bg-gradient-*` 금지 | `grep -rE "bg-gradient" src/renderer/` |
| `backdrop-blur` 금지 | `grep -rE "backdrop-blur" src/renderer/` |

### 5. 문서 일치성

- PRD.md의 기능 목록과 실제 구현된 컴포넌트 수가 매치되는가?
- ADR에 "지원 안 함"으로 명시된 것이 코드에 있는가? (예: SQLite import)

---

## 출력 포맷

```
==================================================
  /review — Vault Kanban
==================================================

✅ 폴더 구조: 통과
⚠️  ADR 미기록 의존성: 1건
    - "react-hotkeys-hook" (package.json에 추가됐지만 ADR 없음)
❌ 테스트 누락: 3건
    - src/renderer/src/lib/obsidianUri.ts
    - src/renderer/src/lib/aiClient.ts
    - src/main/utils/backup.ts
✅ CRITICAL 규칙: 통과
    - 렌더러 fs 직접 사용: 0건
    - API 키 평문: 0건
    - UI 안티패턴: 0건

==================================================
  결론: 2건의 위반 사항이 있습니다.
  CLAUDE.md 업데이트 또는 코드 수정이 필요합니다.
==================================================

[권장 조치]
1. react-hotkeys-hook 추가 이유를 docs/ADR.md에 ADR-015로 기록
2. obsidianUri.test.ts, aiClient.test.ts, backup.test.ts 작성
```

---

## 실행 트리거

- 사용자가 `/review` 직접 입력
- 주간 정기 점검 (가비지 컬렉션) 시
- 큰 Phase 완료 후 (execute.py가 자동 실행 가능)
- PR 생성 시 (향후 GitHub Actions로 자동화)

---

## 위반 사항 처리 정책

| 심각도 | 예시 | 처리 |
|--------|------|------|
| 🟥 차단 | 렌더러에서 fs 직접 사용 | 즉시 수정 필수. 다음 Phase 진행 차단 |
| 🟧 경고 | ADR 미기록 의존성 | 24시간 내 ADR 추가 요구 |
| 🟨 안내 | UI 안티패턴 의심 | 수동 검토 권장 |
