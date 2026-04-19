# /harness

> Harness 프레임워크의 원스톱 실행 명령.
> 사용자가 Claude Code에 `/harness`를 입력하면 아래 5단계를 수행한다.

---

## 목적

docs/ 문서와 CLAUDE.md를 기반으로 **Phase를 설계하고 순차 실행**한다.
사용자가 할 일은 `docs/`를 채우고 `/harness`를 치는 것뿐이다.

---

## 실행 절차 (A → E)

### A. Exploration (탐색)

1. 아래 파일을 **순서대로** 전부 읽는다:
   - `CLAUDE.md`
   - `docs/PRD.md`
   - `docs/ARCHITECTURE.md`
   - `docs/ADR.md`
   - `docs/UI_GUIDE.md` (존재 시)
2. 현재 리포지토리 상태를 확인한다:
   - `package.json` 존재 여부
   - `src/` 폴더 구조
   - `phases/` 폴더에 이미 생성된 task가 있는지
3. 이해한 내용을 **3~5줄로 요약**해 사용자에게 제시한다. 오해가 있으면 여기서 잡는다.

### B. Discussion (논의)

기술적 결정이 필요한 사항을 사용자에게 **한 번에 3개 이하**로 질문한다. 예:

- "첫 Phase는 MVP 전체인가요, 아니면 Phase 1(프로젝트 뼈대)만 실행할까요?"
- "개발 중 `npm run dev`로 수시 확인이 가능한 환경인가요? 아니면 헤드리스로만 실행하시나요?"
- "현재 테스트하기에 쓸 Obsidian vault 경로가 있나요? (없으면 임시 더미 vault를 만들겠습니다.)"

**주의**: 질문은 반드시 선택지(버튼)로 제시한다. 비개발자가 타이핑 답변을 하게 만들지 않는다.

### C. Step Design (Phase 설계)

논의 결과를 바탕으로 구현 계획을 Phase로 분리한다.

**Phase 설계 원칙**:
- 한 Phase = **한 레이어/모듈**. 여러 레이어 섞지 않는다.
- Phase 간 **외부 참조 없이 자기 완결적**으로 작성.
- 필수 문서 읽기를 Phase 지시서에 명시.
- 검증 기준은 **실행 가능한 명령어**로 ("테스트 통과" ❌ / "`npm run test` 통과" ✅).
- MVP는 5~7개 Phase가 적정. 8개 이상이면 통합/분할 검토.

### D. File Generation (Phase 파일 생성)

다음 경로에 파일을 만든다:

```
phases/{task-name}/
├── index.json           # 전체 Phase 목록 + 상태
├── step1.md
├── step2.md
└── ...
```

**`index.json` 스키마**:
```json
{
  "task": "mvp",
  "created": "2026-04-18T10:00:00+09:00",
  "phases": [
    { "id": 1, "title": "프로젝트 뼈대 + Vault 로드", "file": "step1.md", "status": "pending" },
    { "id": 2, "title": "칸반 보드 + 드래그앤드롭", "file": "step2.md", "status": "pending" }
  ]
}
```

**`step{N}.md` 템플릿**:
```markdown
# Phase {N}: {제목}

## 필수 읽기 (이 순서로)
- CLAUDE.md
- docs/PRD.md (관련 섹션만)
- docs/ARCHITECTURE.md (관련 섹션만)
- docs/ADR.md (해당 ADR 번호만)

## 범위
{이 Phase에서 다루는 레이어/모듈 한 줄 요약}

## 구현 작업 (순서대로)
1. {구체적 작업 지시}
2. {구체적 작업 지시}
...

## 인터페이스 시그니처 (외부에 노출할 형태)
```typescript
// 예시
export interface Note { ... }
export function parseNote(filePath: string): Promise<Note>;
```

## 수락 기준 (모두 체크)
- [ ] `npm run lint` 통과
- [ ] `npm run build` 통과 (타입 에러 0)
- [ ] `npm run test` 통과
- [ ] {기능별 검증 명령 예: `npm run test -- metrics` 통과}
- [ ] {수동 검증 항목}

## 금지 사항 (이 Phase에서 하지 말 것)
- {금지 + 이유}
- {금지 + 이유}
```

사용자에게 "Phase N개를 설계했습니다. 보시겠습니까?"로 확인받고, 수정 요청이 있으면 반영한다.

### E. Execution (실행)

사용자 확인 후 `scripts/execute.py`를 호출해 순차 실행한다:

```bash
python3 scripts/execute.py {task-name}
```

실행 중:
- 각 Phase 시작 시 "Phase N 시작" 안내
- 완료 시 자동 커밋 (Conventional Commits)
- 에러 시 최대 3회 자동 재시도, 실패 시 사용자에게 보고
- 모든 Phase 완료 시 요약 리포트 출력

---

## 호출 예시

```
/harness
```

자주 쓰는 변형:

```
/harness mvp              # task 이름 명시
/harness resume mvp       # 중단된 task 재개
/harness plan-only mvp    # Phase 파일만 생성하고 실행은 사용자에게 맡김
```

---

## 주의사항

- 이 명령은 **docs/ 가 채워져 있어야** 제대로 작동한다. PRD가 비어있으면 A단계에서 중단하고 사용자에게 채우라고 요청한다.
- Phase 실행 중 사용자가 중단하면 `phases/{task-name}/index.json`의 상태가 `in-progress`로 남는다. 다음 실행 시 자동 이어서 진행.
- Phase 중간에 설계가 틀렸다고 판단되면 중단하고 사용자에게 ADR 수정을 요청한다. AI가 임의로 설계를 바꾸지 않는다.
