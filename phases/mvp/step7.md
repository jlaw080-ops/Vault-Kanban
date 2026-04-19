# Phase 7: status 마이그레이션 도구

## 필수 읽기

1. `CLAUDE.md` (파괴적 작업 백업 CRITICAL)
2. `docs/PRD.md` § "핵심 기능 7"
3. `docs/ARCHITECTURE.md` § 1 (`src/main/utils/backup.ts` 위치)
4. `docs/ADR.md` ADR-011 (상태 5단계)

---

## 범위

기존 vault의 자유형 상태값("TBD", "홀드", "in progress" 등)을 표준 5단계로 **일괄 변환**하는 위저드. 필드명 통일(`상태`→`status`) 옵션. **자동 백업 + 롤백** 필수.

UI는 6단계 스텝 위저드. 사이드바 "🔄 상태 마이그레이션" 메뉴로 진입.

---

## 구현 작업 (순서대로)

### 1. 순수 함수 테스트 먼저

**`src/renderer/src/lib/statusMigration.test.ts`**:
- `scanStatusValues(notes)` → Map<string, number> (값별 카운트, "" / null / undefined 포함)
- `suggestMapping(value: string)` → 기본 매핑 규칙 (PRD/작업지시서의 규칙표 그대로)
- `applyMapping(note, mapping, unifyFieldName)` → 변환된 새 Note 객체
- 경계 케이스:
  - 이미 표준 5단계 값 → 그대로 유지
  - 매핑 미지정 → 변환 안 함
  - 필드명 통일 시 `상태` 키 제거 + `status` 추가

### 2. 백업 유틸리티

**`src/main/utils/backup.test.ts`**:
- `createBackup(vaultPath)` → `<vault>/.vault-backup/backup-YYYYMMDD-HHmmss/` 경로로 재귀 복사
- `listBackups(vaultPath)` → 백업 폴더 목록 (timestamp 역순)
- `restoreBackup(vaultPath, backupName)` → 백업 폴더 내용을 vaultPath로 복사 (기존 파일 덮어쓰기)
- 디스크 용량 체크: 백업 대상 크기 계산 후 free space 부족하면 예외

`src/main/utils/backup.ts` 구현:
- Node 18+ `fs.cp({ recursive: true })` 사용
- `.vault-backup` 자체는 백업에서 제외 (순환 방지)
- 진행률 콜백 `onProgress(current, total)`

### 3. 위저드 UI

**`StatusMigrationWizard.tsx`** — 6 Step:

**Step 1. 스캔**
- "스캔 시작" 버튼 → `scanStatusValues` 호출
- 결과 테이블: 값 | 노트 수. 상단에 "총 N개 고유값 발견"

**Step 2. 필드명 통일**
- 현재 사용 중인 필드명 표시 (`status` / `상태` / 둘 다)
- 라디오: "`status`로 통일(권장)" / "`상태` 유지" / "혼재 유지(비권장)"
- 선택 저장은 `settingsStore.statusFieldName`에 반영

**Step 3. 매핑**
- 발견된 각 값 옆에 `Select`(5단계 중 하나 또는 "건드리지 않음")
- 기본값은 `suggestMapping()` 결과로 미리 채움
- 미지정 항목은 경고 표시

**Step 4. 확인**
- 변환 요약 테이블 ("진행중 → 진행중: 42개", "TBD → 백로그: 8개", ...)
- 백업 크기 추정 표시 — "약 N MB를 `<vault>/.vault-backup/backup-20260418-153000/`로 백업합니다"
- 체크박스: "이 작업은 되돌릴 수 있지만 신중히 진행하겠습니다" (눌러야 실행 버튼 활성화)

**Step 5. 실행**
- 백업 생성 (Progress Bar)
- 노트 일괄 업데이트 (Progress Bar, 현재 노트명 표시)
- 실패 항목은 계속 진행하되 집계
- 완료 화면: "347개 중 347개 성공, 0개 실패" + 실패 목록

**Step 6. 롤백 진입점 (위저드 상단에 항상 표시)**
- "이전 백업에서 복원" 버튼
- 백업 목록 Dialog → 선택 → 확인 Dialog ("현재 vault의 모든 파일이 덮어써집니다") → 실행
- 롤백 성공 시 vaultStore 전체 재스캔

### 4. 설정과 연동

- 위저드에서 필드명 통일 선택 시 `settingsStore.statusFieldName` 업데이트
- 앱 재시작/기존 사용자는 settings의 이 값 기반으로 frontmatter 필드명 사용

### 5. 성능/안전장치

- 백업 전 vault 크기 1GB 초과 → 추가 경고 (오래 걸릴 수 있음)
- 백업 시작 후 취소 불가 — UI에서 "진행 중 취소 불가" 명시
- 마이그레이션 실행 중 다른 IPC 호출 블록 (`migrationLock`)

---

## 인터페이스 시그니처

```typescript
// src/renderer/src/lib/statusMigration.ts
export function scanStatusValues(notes: Note[], fieldName: string): Map<string | null, number>;
export function suggestMapping(value: string | null): Status | "skip" | "ask";
export function applyMapping(
  note: Note,
  mapping: Map<string | null, Status | "skip">,
  unifyFieldName: boolean
): Note;

// src/main/utils/backup.ts
export async function createBackup(vaultPath: string, onProgress?: (c: number, t: number) => void): Promise<string>;  // 백업 경로 반환
export async function listBackups(vaultPath: string): Promise<Array<{ name: string; createdAt: Date; sizeMb: number }>>;
export async function restoreBackup(vaultPath: string, backupName: string, onProgress?: (c: number, t: number) => void): Promise<void>;

// IPC
window.api.migration.scan(): Promise<Map<string, number>>;
window.api.migration.execute(mapping, unifyFieldName): Promise<MigrationResult>;
window.api.backup.list(): Promise<BackupInfo[]>;
window.api.backup.restore(name: string): Promise<{ ok: boolean; error?: string }>;
```

---

## 수락 기준

- [ ] lint/build/test 전부 통과
- [ ] `statusMigration.test.ts`, `backup.test.ts` 그린
- [ ] 테스트용 vault(샘플 10개 노트, 자유형 status)로 마이그레이션 실행 → 정확히 변환
- [ ] 변환 전 백업이 `.vault-backup/backup-*/` 경로에 생성됨
- [ ] 롤백 실행 시 정확히 원복 (diff 없음)
- [ ] 실행 중 실패한 노트가 있어도 전체 중단 없이 계속 진행
- [ ] 디스크 용량 부족 시 명확한 에러 메시지
- [ ] 필드명 통일 선택 시 `상태` 키 제거 + `status` 키 추가 (YAML 키 순서 보존 확인)

---

## 금지 사항

- 백업 없이 frontmatter 일괄 수정 금지. **CRITICAL**.
- 롤백 시 기존 vault 전체를 `rm -rf`로 지우고 복원 금지. 재귀 복사로 덮어쓰기만.
- 마이그레이션 실행 중 chokidar 감시 살아있게 두지 말 것 (`watcher.pause()` / `resume()`).
- 자동 매핑만으로 실행 금지. **반드시 사용자가 Step 3에서 명시적으로 확정**.
- `.vault-backup` 내부를 vault 스캔 대상에 포함시키지 말 것 (excludedFolders 자동 추가).
- 백업 경로를 사용자가 vault 외부로 바꿀 수 있게 하지 말 것 (현 단계 범위 밖 — 복잡도만 증가).

---

## 커밋 메시지 예시

```
feat(phase-7): status 마이그레이션 도구 (위저드 + 자동 백업)

- statusMigration.ts (scan/suggest/apply) + 테스트
- backup.ts (create/list/restore, fs.cp 재귀) + 테스트
- StatusMigrationWizard (6 step)
- .vault-backup/backup-YYYYMMDD-HHmmss/ 자동 백업
- 롤백 기능
- excludedFolders에 .vault-backup 자동 포함
```
