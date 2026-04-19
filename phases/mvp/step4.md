# Phase 4: 노트 에디터 + 파일 감시

## 필수 읽기

1. `CLAUDE.md`
2. `docs/PRD.md` § "핵심 기능 4"
3. `docs/ARCHITECTURE.md` § 2-3 (외부 변경 감지 흐름)
4. `docs/UI_GUIDE.md` § "레이아웃" (에디터 40% 우측 패널)

---

## 범위

우측에 **노트 에디터 패널**을 붙인다. frontmatter는 **폼 UI**로, 본문은 `@uiw/react-md-editor`로 편집한다. 저장은 Cmd/Ctrl+S와 자동저장(유휴 3초). `chokidar`로 vault를 감시해 Obsidian에서의 외부 변경을 실시간 반영한다. Obsidian URI(`obsidian://`) 연동도 포함.

---

## 구현 작업 (순서대로)

### 1. 의존성 설치

```bash
npm install @uiw/react-md-editor
npx shadcn@latest add input select label textarea separator
```

### 2. 순수 함수 테스트 먼저

**`src/renderer/src/lib/obsidianUri.test.ts`**:
- vault 이름 + 파일 경로 → `obsidian://open?vault=...&file=...` 정확히 생성
- 공백/한글 URI 인코딩
- vaultName이 설정에 없을 때 폴더명 fallback

**`src/main/utils/writeGuard.test.ts`**:
- `markSelfWrite(path)` 후 TTL 1000ms 이내에 `isSelfWrite(path)`는 true
- TTL 경과 후 false
- 같은 경로에 여러 번 등록 시 TTL 갱신

### 3. 파일 감시 (메인 프로세스)

`src/main/ipc/watcher.ts`:
- `chokidar.watch(vaultPath, { ignored: excludedFolders, ignoreInitial: true })`
- 이벤트: `add`, `change`, `unlink`
- `change`/`add` 발생 시 `isSelfWrite(path)` 확인 → true면 무시
- 디바운스: 같은 경로에 대한 이벤트는 500ms 내 마지막만 처리
- 재파싱 후 `mainWindow.webContents.send('note:external-change', note)` 전송

### 4. Preload + 렌더러 이벤트 구독

```typescript
// preload
onNoteExternalChange: (cb) => ipcRenderer.on('note:external-change', (_, note) => cb(note));
```

`useFileWatcher` 훅에서 구독 → vaultStore 업데이트.

### 5. 에디터 컴포넌트

**`NoteEditor.tsx`**:
- 상단 frontmatter 폼:
  - title: `Input`
  - status: `Select`
  - priority: `Select` (none 포함)
  - due: shadcn `Calendar` (이번 Phase에서 DatePicker 조합)
  - tags: chips 형태 (`Input` + `Badge` 목록, 엔터/쉼표로 추가)
- 본문: `@uiw/react-md-editor` with preview 모드 토글
- 저장 버튼 + 아이콘 툴바

**`EditorToolbar.tsx`** — 저장 / "Obsidian에서 열기" / "Finder/탐색기에서 보기" / 삭제(휴지통).

### 6. 저장 로직

- Cmd/Ctrl+S: 즉시 저장
- 자동저장: 마지막 편집 후 3000ms idle (lodash `debounce`). 설정으로 on/off + 시간 조절
- 저장 직전 `writeGuard.markSelfWrite(filePath)` 호출
- 저장 후 토스트 "저장됨" (조용히)

### 7. 위키링크 렌더링

`@uiw/react-md-editor`의 preview 커스텀 렌더러로 `[[...]]` 파싱:
- vault 내 제목으로 매칭되는 노트 있으면 `<a>`로 렌더
- 클릭 시 해당 노트 에디터에서 열기
- 매칭 없으면 회색 + 클릭 시 토스트

### 8. 충돌 처리

에디터에 열려있는 노트가 외부에서 변경된 이벤트 수신 시:
- 사용자 편집 내용 없음 → 조용히 재로드
- 편집 내용 있음 → 토스트 (Dismissable): "이 노트가 외부에서 수정되었습니다. [외부 변경 불러오기]" 버튼
  - 사용자 클릭 시에만 덮어씀
  - 현재 편집 내용은 한 번 더 확인하여 별도 변수에 백업 (잃어버리지 않게)

### 9. Obsidian URI 연동

- `window.api.obsidian.open(vaultName, relativePath)` IPC 추가
- 메인에서 `shell.openExternal(uri)` 실행

### 10. 단축키

shadcn 테마에 어긋나지 않게 `react-hotkeys-hook` 또는 수동 `useEffect(document.addEventListener('keydown'))` 중 선택. **추가 라이브러리 설치 시 ADR-015 작성 필요**.

- Cmd/Ctrl+S → 저장
- Esc → 에디터 닫기

---

## 인터페이스 시그니처

```typescript
// src/main/utils/writeGuard.ts
export function markSelfWrite(filePath: string): void;
export function isSelfWrite(filePath: string): boolean;

// src/renderer/src/lib/obsidianUri.ts
export function buildOpenUri(vaultName: string, relativePath: string): string;

// IPC
window.api.watcher.start(vaultPath: string, excluded: string[]): Promise<void>;
window.api.watcher.stop(): Promise<void>;
window.api.watcher.onChange(cb: (note: Note) => void): () => void;  // unsubscribe
window.api.watcher.onUnlink(cb: (filePath: string) => void): () => void;
window.api.obsidian.open(vaultName: string, relativePath: string): Promise<void>;
window.api.system.showInFolder(filePath: string): Promise<void>;
window.api.vault.deleteNote(filePath: string): Promise<{ ok: boolean; error?: string }>;  // 휴지통으로
```

---

## 수락 기준

- [ ] lint/build/test 전부 통과
- [ ] `obsidianUri.test.ts`, `writeGuard.test.ts` 그린
- [ ] 카드 클릭 → 우측에 에디터 열림
- [ ] frontmatter 폼 필드 편집 → Cmd+S → 실제 `.md` 파일 변경 확인
- [ ] Obsidian에서 같은 노트 수정 후 저장 → 1초 내 앱 UI에 반영
- [ ] 앱에서 저장 시 chokidar가 자기 쓰기를 무시 (무한 루프 없음)
- [ ] 자동저장 on/off 동작
- [ ] "Obsidian에서 열기" → Obsidian이 해당 노트를 정확히 연다
- [ ] 삭제 시 휴지통으로 이동 (영구 삭제 금지, `shell.trashItem`)
- [ ] 위키링크 클릭 시 vault 내 노트 이동 동작

---

## 금지 사항

- 본문(body)을 앱이 자동 변환/정리 금지. 사용자 입력 그대로 저장.
- `shell.openPath`로 외부 편집 유도 금지 (의도치 않은 앱 실행 위험). `openExternal` + 명시적 URI만.
- `fs.unlink` 같은 영구 삭제 금지. CRITICAL. `shell.trashItem` 사용.
- chokidar 이벤트 핸들러에서 **동기 파일 I/O 금지**. 반드시 async.
- `change` 이벤트에 디바운스 없이 바로 파싱 금지. 저장 진행 중 파일은 중간 상태일 수 있음.
- 자기 쓰기 가드 TTL을 **500ms 이하**로 설정 금지. 일부 OS에서 chokidar 이벤트가 500ms 후 도착.

---

## 커밋 메시지 예시

```
feat(phase-4): 노트 에디터 + chokidar 파일 감시

- NoteEditor (frontmatter 폼 + @uiw/react-md-editor)
- EditorToolbar (저장/Obsidian/Finder/삭제)
- chokidar watcher + writeGuard TTL Set
- 외부 변경 충돌 처리 토스트
- obsidian:// URI 연동
- 위키링크 렌더링 + 클릭 네비게이션
```
