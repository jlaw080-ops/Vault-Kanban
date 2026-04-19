# Phase 6: AI 그룹핑 (Anthropic Claude)

## 필수 읽기

1. `CLAUDE.md` (특히 API 키 CRITICAL)
2. `docs/PRD.md` § "핵심 기능 6"
3. `docs/ARCHITECTURE.md` § 2-4 (AI 호출 흐름), § 5 (보안 경계)
4. `docs/ADR.md` ADR-008 (Anthropic 고정), ADR-009 (safeStorage)

---

## 범위

Anthropic Claude API로 두 가지 AI 기능을 제공한다:

- **모드 A (전체 자동 분류)**: vault 전체 노트를 프로젝트로 자동 그룹핑. 결과 미리보기 → 선택 적용 → frontmatter `project` 필드에 저장.
- **모드 B (관련 노트 찾기)**: 한 노트의 관련 노트 Top 5를 우측 패널에 표시.

API 키는 **`safeStorage`로 암호화**해서 OS 키체인에 저장. 렌더러에 절대 전달하지 않는다.

---

## 구현 작업 (순서대로)

### 1. 의존성 설치

```bash
npm install @anthropic-ai/sdk
```

### 2. API 키 관리 (safeStorage)

`src/main/ipc/api-key.ts`:
- `apiKey:set(plain)` — `safeStorage.encryptString(plain)` → Buffer → electron-store에 base64로 저장
- `apiKey:exists()` — 저장 여부만 반환 (키 내용 반환 금지)
- `apiKey:test()` — 내부적으로 키 로드해서 Anthropic에 `messages.create` 최소 호출, 결과 {ok, error?} 반환
- **절대 `apiKey:get`을 노출하지 않는다**. 메인 프로세스 내부에서만 로드 함수 사용.

### 3. AI 클라이언트 (메인)

`src/main/ipc/ai.ts`:
- `ai:groupNotes(notes, onProgress)` — 모드 A
- `ai:findRelated(noteId, candidates)` — 모드 B

공통 래퍼:
```typescript
async function callClaude(model: string, messages: Message[]): Promise<string> {
  const key = loadApiKeyDecrypted();  // 이 함수는 외부 export 금지
  const client = new Anthropic({ apiKey: key });
  return client.messages.create({ model, max_tokens: 4096, messages });
}
```

### 4. 순수 함수 테스트 먼저

**`src/renderer/src/lib/aiPrompts.test.ts`**:
- `buildGroupingPrompt(notes)` — JSON 직렬화 구조, 500자 truncate, 특수문자 이스케이프
- `buildRelatedPrompt(ref, candidates)` — 제목/태그/preview 포함

**`src/main/ipc/ai.test.ts`** (Anthropic SDK 모킹):
- 청크 50개씩 나뉘어 여러 번 호출
- 청크별 결과 머지 (같은 프로젝트명 통합)
- JSON 파싱 실패 시 에러 메시지

### 5. 모드 A UI — `AiGroupingDialog.tsx`

플로우:
1. 상단 "🤖 AI로 프로젝트 분류" 버튼 → 확인 Dialog
   - "노트 N개를 분석합니다. 예상 비용: 약 $X.XX. 계속할까요?"
   - 비용 계산: 노트당 평균 ~600 토큰 * Haiku 입력 단가 추정
2. 500개 초과 시 추가 경고 배너, 1000개 초과 시 **차단**(범위 축소 유도)
3. Progress Dialog — "청크 N/M 처리 중"
4. 완료 후 Preview UI:
   - 프로젝트별 Card (체크박스 + 편집 가능한 이름 + 노트 리스트 + "이유" 텍스트)
   - "선택 항목 적용" 버튼
5. 적용 시 각 노트별로 `vault:writeNote` (frontmatter `project` 필드 세팅)
6. 완료 후 `viewStore.grouping = "project"` 자동 전환

### 6. 모드 B UI — `RelatedNotesPanel.tsx`

트리거:
- 카드 우클릭 → "🔗 관련 노트 찾기"
- 에디터 툴바 🔗 버튼

플로우:
1. 기준 노트 + 후보(=모든 노트의 title + tags + body 앞 200자) 페이로드 생성
2. `ai:findRelated` 호출
3. 우측 패널에 Top 5 표시. 각 항목: 노트명 / 유사도 bar / 이유(한글).
4. 클릭 시 해당 노트 에디터에서 열기.

**캐싱**: 동일 기준 노트 결과는 메모리에 5분 유지. 기준 노트 `mtime` 변경 시 무효.

### 7. 설정 화면 일부 선반영

`SettingsPanel.tsx`에 AI 섹션만:
- API 키 Input (type="password")
- "저장" 버튼 → `apiKey:set`
- "키 테스트" 버튼 → `apiKey:test` → 결과 토스트
- 모델 Select (기본 `claude-haiku-4-5-20251001`, `claude-sonnet-4-6` 선택지)

### 8. 에러 처리

- 키 없음 → "API 키를 설정에서 입력하세요" 링크로 이동
- 401 무효 → "키가 잘못되었습니다. 재발급 후 다시 시도하세요"
- 429 과금 한도 → "크레딧을 충전하거나 잠시 후 시도하세요"
- 네트워크 실패 → "네트워크 연결을 확인하세요"
- JSON 파싱 실패 → 해당 청크만 스킵하고 나머지 진행, 실패 카운트 표시

### 9. 비용/사용 로깅 (선택, 여유 있으면)

- 호출마다 input/output 토큰 수 집계해 `~/.vault-kanban-usage.log`에 append
- 설정 화면 AI 섹션 하단에 "이번 달 호출: N회, 추정 $X.XX"

---

## 인터페이스 시그니처

```typescript
// src/main/ipc/ai.ts (렌더러에서 접근할 형태)
window.api.ai.groupNotes(notes: AiNoteInput[]): Promise<AiGroupResult>;
window.api.ai.findRelated(reference: AiNoteInput, candidates: AiNoteInput[]): Promise<RelatedResult>;
window.api.ai.onProgress(cb: (pct: number, label: string) => void): () => void;

window.api.apiKey.set(plain: string): Promise<{ ok: boolean; error?: string }>;
window.api.apiKey.exists(): Promise<boolean>;
window.api.apiKey.test(): Promise<{ ok: boolean; error?: string }>;

// 타입
interface AiNoteInput { id: string; title: string; tags: string[]; folder: string; preview: string; }
interface AiGroupResult { projects: Array<{ name: string; noteIds: string[]; reason: string }>; }
interface RelatedResult { related: Array<{ noteId: string; score: number; reason: string }>; }
```

---

## 수락 기준

- [ ] lint/build/test 전부 통과
- [ ] API 키 입력 후 "키 테스트" 성공
- [ ] 모드 A 실행 → 프로젝트 제안 → 선택 적용 → frontmatter `project` 필드 기록됨 (Obsidian에서 확인)
- [ ] 모드 B 실행 → 관련 노트 5개 표시, 점수 높은 순 정렬
- [ ] API 키 평문이 `settings.json`, localStorage, React devtools, 로그 어디에도 나타나지 않음 (확인)
- [ ] API 에러(키 무효/네트워크) 시 사용자에게 명확한 메시지
- [ ] 1000개 초과 요청 시 차단 + 범위 축소 안내
- [ ] 모드 B 캐시 동작 (같은 기준 노트 재요청 시 API 미호출)

---

## 금지 사항

- 렌더러에서 `new Anthropic({ apiKey })` 직접 사용 금지. **CRITICAL**.
- API 키를 IPC로 렌더러에 반환 금지. `apiKey:get` 같은 핸들러 만들지 말 것.
- API 키를 URL 파라미터, 로그, 에러 메시지 본문, 백업 파일에 포함 금지.
- OpenAI/Gemini SDK 설치 금지 (ADR-008).
- AI 결과를 `project` 필드 외의 frontmatter 필드에 자동 기록 금지.
- 모드 A 적용 전 "미리보기 → 사용자 확정" 단계 건너뛰기 금지. **반드시 사람이 결정**.
- 비용 경고 없이 대량 호출 금지.
- 본문 전체를 API에 전송 금지. 반드시 앞 500자(모드 A) / 200자(모드 B)로 truncate.

---

## 커밋 메시지 예시

```
feat(phase-6): AI 그룹핑 (Anthropic Claude) - 모드 A/B

- safeStorage 기반 API 키 관리 (렌더러 노출 금지)
- ai:groupNotes / ai:findRelated IPC
- AiGroupingDialog (미리보기 + 선택 적용)
- RelatedNotesPanel (5분 캐시)
- SettingsPanel AI 섹션 (키 입력/테스트/모델 선택)
- 비용 경고 + 1000개 초과 차단
```
