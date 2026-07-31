# PaperFlow 문서 뷰 흡수 — 설계

- 작성일: 2026-07-31
- 상태: 승인 대기
- 관련: `docs/ADR.md` (ADR-024 신규 필요), `docs/UI_GUIDE.md`, PaperFlow 저장소 `jlaw080-ops/paperflow`

---

## 1. 목적

칸반 보드에서 연 노트를 **인쇄 품질의 A4 문서로 즉시 보는** 기능을 추가한다.
PaperFlow 웹앱의 렌더링·인쇄 레이어만 칸반 앱으로 이식하고, 웹 공유(URL)는
나중에 붙일 수 있도록 경계만 설계에 심어둔다.

### 배경

기존 `NoteEditor`에는 `편집 / 분할 / 미리보기` 3모드가 있으나, 이는 **편집 보조용
미리보기**다. 인쇄 레이아웃·표 잘림 방지·다이어그램이 없고, 로컬 이미지는 렌더러
origin 기준으로 해석되어 **현재 깨진다**.

### 볼트 실측 (1,714개 노트)

| 문법 | 노트 수 | 비중 | 처리 |
|---|---:|---:|---|
| GFM 표 | 838 | 49% | 지원 — 페이지 경계 잘림 방지가 핵심 가치 |
| `[[위키링크]]` | 812 | 47% | 볼드 텍스트로 내림 |
| Obsidian 콜아웃 | 287 | 17% | 최소 처리 (타입별 좌측 색상 바 + 제목 볼드) |
| 표준 `![](경로)` | 97 | 6% | 이미지 표시 |
| `![[임베드]]` | 73 | 4% | 이미지 확장자면 표시, 아니면 텍스트 |
| ` ```mermaid ` | 36 | 2% | 다이어그램 렌더 |
| `$$수식$$` | 10 | 0.6% | **미지원** (범위 제외) |

---

## 2. 범위

### 포함

- 전체화면 문서 뷰 (진입: `NoteEditor` 툴바 버튼)
- 마크다운 렌더링: GFM(표 포함) + soft break + mermaid
- Obsidian 문법 전처리: 이미지 임베드 · 위키링크 · 콜아웃
- 로컬 이미지 실제 표시 (커스텀 프로토콜 경유)
- A4 인쇄 CSS (`window.print()` → 사용자가 PDF로 저장)
- 나중 URL 공유를 위한 리졸버 경계

### 제외 (의도적)

| 항목 | 이유 |
|---|---|
| PaperFlow `FileTree` · `Editor` · `ImportDropzone` | 칸반에 동등 기능 존재 |
| PaperFlow `HtmlView` (DOMPurify + sandbox iframe) | 볼트는 `.md`만 — `format='html'` 경로 자체가 없음 |
| Supabase SDK · 로그인 · 네트워크 | 이번엔 로컬 전용. 4장 경계만 준비 |
| `webContents.printToPDF` | `window.print()`로 충분 (YAGNI) |
| 수식(KaTeX) 렌더링 | 10개(0.6%) |
| **화면상 A4 페이지 분할 표시** | 아래 "알려진 한계" 참조 |

### 알려진 한계 — 화면 페이지 분할

브라우저는 화면 렌더링에서 페이지 경계를 계산하지 않는다. PaperFlow도 동일하게
**화면은 연속 흐름, 인쇄만 A4 분할**이다.

이 설계에서 화면 문서 뷰는 **210mm 폭의 흰 지면 1장에 연속 스크롤**로 표시한다.
지면 폭·여백·타이포그래피는 인쇄 결과와 동일하지만, **페이지가 몇 장으로 나뉘는지는
인쇄 대화상자의 미리보기에서 확인**해야 한다.

화면에 실제 지면 분할을 그리려면 별도 페이지네이션 계산 로직이 필요하며, 이는
범위에서 제외한다.

---

## 3. 구조

```
src/renderer/src/lib/docRender/
├── remarkObsidian.ts          Obsidian 문법 → 표준 mdast 전처리 (순수)
├── remarkObsidian.test.ts
├── resolveAsset.ts            이미지 경로 → src 변환 (교체 가능)
├── resolveAsset.test.ts
├── noteToDocument.ts          Note → { title, markdown, assets } (순수)
├── noteToDocument.test.ts
└── Mermaid.tsx                mermaid 동적 import 렌더러

src/renderer/src/components/document/
├── DocumentView.tsx           전체화면 모달 + 지면 컨테이너 + 인쇄 버튼
└── MarkdownDocument.tsx       react-markdown 파이프라인

src/renderer/src/styles/
└── print.css                  @media print 격리 (PaperFlow에서 이식)

src/main/ipc/asset.ts          vault-img:// 프로토콜 핸들러
```

### 기존 파일 변경 (최소)

| 파일 | 변경 |
|---|---|
| `NoteEditor.tsx` | 툴바에 `[문서 보기]` 버튼 1개 + 모달 마운트. **기존 3모드 토글은 건드리지 않음** |
| `src/main/index.ts` | `registerSchemesAsPrivileged` + `asset.ts` 등록 호출 |
| `src/renderer/src/styles/` | `print.css` import 추가 |

`rehypeWikilinks.ts`는 편집기 미리보기에서 계속 쓰이므로 **수정하지 않는다**.
문서 뷰는 별도의 `remarkObsidian`을 쓴다 (용도가 다름 — 편집기는 클릭 앵커,
문서 뷰는 인쇄용 텍스트).

---

## 4. 데이터 흐름

```
Note
 └→ noteToDocument()            { title, markdown, assets[] }
     └→ react-markdown
         ├─ remarkGfm            표·취소선·자동링크
         ├─ remarkBreaks         단일 줄바꿈 → <br>
         └─ remarkObsidian       임베드·위키링크·콜아웃  ← 신규
             └→ AssetResolver    이미지 src 결정        ← 교체 지점
                 └→ 지면 컨테이너 (210mm)
                     └→ window.print()  →  print.css가 A4 분할
```

---

## 5. `remarkObsidian` — 전처리 규칙

mdast(마크다운 AST) 레벨에서 동작한다. **문자열 치환을 쓰지 않는다** — 코드블록
내부의 `[[...]]`나 `![[...]]`까지 변환되는 것을 막기 위해서다. mdast에서 코드블록은
`code`, 인라인 코드는 `inlineCode` 노드이므로 `text` 노드만 방문하면 자동으로 제외된다.

### 시그니처 — 리졸버는 주입받는다

이미지 URL을 만들려면 리졸버가 필요하므로, 플러그인 팩토리로 만들어 호출부에서
주입받는다. 플러그인 안에서 `localResolver`를 직접 참조하지 않는다 (7장의 교체 지점이
무의미해지기 때문).

```ts
export interface RemarkObsidianOptions {
  notePath: string          // 볼트 기준 노트 상대경로
  resolveAsset: AssetResolver
}

export function remarkObsidian(options: RemarkObsidianOptions): Plugin
```

호출 경로: `DocumentView` → `MarkdownDocument`(prop으로 `AssetResolver` 수신)
→ `remarkObsidian({ notePath, resolveAsset })`

### 5.1 이미지 임베드 — `text` 노드 방문

```
![[도면.png]]        → image 노드, url = resolveAsset(notePath, '도면.png')
![[도면.png|300]]    → 위와 동일 (| 뒤 크기 지정은 무시)
![[다른노트]]         → strong 노드 '다른노트'  (이미지 확장자가 아니므로 텍스트 폴백)
```

이미지 확장자 판정: `png · jpg · jpeg · gif · svg · webp · bmp · avif` (대소문자 무시).
그 외는 노트 임베드로 보고 텍스트로 내린다. 노트 임베드(transclusion)는 구현하지 않는다.

### 5.2 위키링크 — `text` 노드 방문

```
[[ZEB 설계기준]]      → strong 노드 'ZEB 설계기준'
[[노트|별칭]]         → strong 노드 '별칭'
```

`!`가 앞에 붙은 경우는 5.1에서 이미 소비되므로 여기 도달하지 않는다.

### 5.3 콜아웃 — `blockquote` 노드 방문

`blockquote`의 첫 `paragraph` 첫 `text`가 `[!type]`으로 시작하면 콜아웃으로 본다.

```
> [!warning] 설계 주의
> 단열재 두께 확인 필요
```
→ `blockquote`에 `data-callout="warning"` 부여, `[!warning]` 마커 제거,
   같은 줄의 나머지(`설계 주의`)를 `strong`으로 승격.

| type | 좌측 바 색 |
|---|---|
| `note`, `info`, `abstract`, `summary` | 파랑 |
| `tip`, `success`, `check`, `done` | 초록 |
| `warning`, `caution`, `attention` | 주황 |
| `danger`, `error`, `failure`, `bug` | 빨강 |
| 그 외 / `quote`, `cite` | 회색 |

접기 문법(`> [!note]-`)은 마커만 제거하고 항상 펼친 상태로 렌더한다 (인쇄물이므로).
아이콘은 넣지 않는다.

---

## 6. 이미지 해석 — 메인 프로세스

렌더러는 `fs`를 직접 쓸 수 없다 (`CLAUDE.md` CRITICAL). 커스텀 프로토콜로 처리한다.

### URL 형식

```
vault-img://asset/?note=<encoded 노트 상대경로>&target=<encoded 타겟>
```

host는 `asset`으로 고정한다. 한글 파일명이 많으므로 값은 반드시 `encodeURIComponent`
한다. (host 자리에 경로를 넣으면 한글·슬래시에서 파싱이 깨진다.)

### 등록

`app.whenReady()` **이전에** 스킴을 특권 등록해야 한다.

```ts
protocol.registerSchemesAsPrivileged([
  { scheme: 'vault-img', privileges: { standard: true, secure: true, supportFetchAPI: true } }
])
```

ready 이후 `protocol.handle('vault-img', handler)`로 핸들러를 붙인다.

### 해석 순서

1. **노트 기준 상대경로** — `dirname(볼트루트/note) + target` 이 존재하면 그것
2. **볼트 전체 파일명 매칭** — 1이 실패하면 파일명으로 검색 (Obsidian 기본 동작)
3. 둘 다 실패하면 404 반환 (렌더러는 깨진 이미지 표시)

2번은 매 요청마다 볼트를 스캔하면 느리므로 **지연 인덱스**를 쓴다: 첫 실패 검색이
발생할 때 이미지 파일 인덱스(`파일명 → 절대경로[]`)를 1회 구축하고 이후 재사용한다.
볼트 경로가 바뀌면 인덱스를 버린다.

### CSP 허용 (필수 — 빠뜨리면 기능 전체가 죽는다)

`src/renderer/index.html`의 Content-Security-Policy가 현재 `img-src 'self' data:` 이므로,
이 상태로는 `vault-img://` 이미지가 **브라우저 단계에서 전부 차단된다.**

```
img-src 'self' data: vault-img:
```

로 확장해야 한다. 다른 지시어(`default-src`·`script-src`·`style-src`)는 건드리지 않는다.
이 단계를 빠뜨리면 이미지가 조용히 안 뜨고, 프로토콜 핸들러가 정상인지 아닌지
구분되지 않아 원인 추적이 어려워진다.

### 보안 — 경로 탈출 방지 (필수)

해석된 절대경로가 볼트 루트 밖이면 **거부한다**. `path.resolve` 후 볼트 루트로
시작하는지 검사하며, 심링크를 고려해 `fs.realpath` 결과로 비교한다.
`target`에 `../../../Windows/System32/...` 같은 값이 와도 볼트 밖 파일을 읽지 못한다.

이 검사는 `resolveAsset.test.ts`의 필수 테스트 항목이다.

---

## 7. 나중 URL 공유를 위한 경계

이번 범위에서 Supabase 코드는 **한 줄도 들어가지 않는다.** 대신 나중에 갈아끼울
지점만 인터페이스로 고정한다.

```ts
// resolveAsset.ts
export type AssetResolver = (notePath: string, target: string) => string

export const localResolver: AssetResolver = (notePath, target) =>
  `vault-img://asset/?note=${encodeURIComponent(notePath)}&target=${encodeURIComponent(target)}`
```

```ts
// noteToDocument.ts — 순수 함수
export interface RenderableDocument {
  title: string
  markdown: string   // 본문 (frontmatter 제외)
  assets: string[]   // 본문이 참조하는 이미지 target 목록 (중복 제거)
}

export function noteToDocument(note: Note): RenderableDocument
```

`MarkdownDocument`는 `AssetResolver`를 **prop으로 받는다**. 하드코딩하지 않는다.

### 나중에 공유를 붙일 때 필요한 작업

1. `assets`를 Supabase Storage에 업로드하고 `{ target → https URL }` 맵을 얻는다
2. `remoteResolver`를 만들어 그 맵을 참조하게 한다
3. `markdown`과 함께 `documents` 테이블에 INSERT

**렌더링 코드는 수정하지 않는다.** 위키링크는 이미 볼드 텍스트라 웹에서도 그대로
동작하므로 폴백 분기가 필요 없다 (이것이 "이미지만 해석" 선택의 이점이다).

---

## 8. 인쇄

`window.print()`를 호출하고, `print.css`가 `@media print`에서 A4로 분할한다.
PaperFlow의 `styles/print.css`를 이식한다.

```css
@media print {
  @page { size: A4; margin: 20mm; }
  .no-print { display: none; }
  table, pre, img, figure { break-inside: avoid; }
  h1, h2, h3 { break-after: avoid; }
  .page-break { break-before: page; }
}
```

- 본문의 `<!-- pagebreak -->` 주석은 강제 페이지 나눔 요소로 변환한다 (PaperFlow 동일)
- 인쇄 스타일이 화면 레이아웃에 새지 않도록 `@media print` 안에만 둔다
- **mermaid가 SVG로 렌더되기 전에 인쇄되면 다이어그램이 비어 나온다.** 문서에
  mermaid 블록이 있으면 렌더 완료 전까지 `[인쇄/PDF]` 버튼을 비활성화한다

---

## 9. mermaid

번들이 크므로(수백 KB) **동적 `import()`** 로 로드한다. 문서에 ` ```mermaid ` 블록이
하나라도 있을 때만 불러온다.

PaperFlow와 동일하게 `securityLevel: 'strict'`를 유지한다. 볼트가 로컬 파일이라
공개 뷰만큼의 위험은 없지만, 나중 웹 공유 시 동일 설정이어야 결과가 일치한다.

렌더 실패 시 원본 코드블록을 그대로 표시한다 (조용히 숨기지 않는다).

---

## 10. UI

`docs/UI_GUIDE.md` 및 `CLAUDE.md` UI 규칙을 따른다.

- `bg-gradient-*` · `backdrop-blur-*` · `rounded-2xl` 이상 · 보라/인디고 **금지**
- 모든 색상 클래스에 `dark:` 변형 병기
- 아이콘은 `lucide-react` (`FileText` 진입, `Printer` 인쇄, `X` 닫기)
- 애니메이션은 모달 열림/닫힘에만

### 지면

지면 자체는 **다크 모드에서도 흰 배경**을 유지한다 (인쇄물의 실제 모습이므로).
모달 배경만 테마를 따른다. 이는 UI 규칙의 `dark:` 병기 원칙에 대한 의도적 예외이며,
"인쇄 미리보기"라는 목적상 정당하다.

### 키보드

- `Esc` — 모달 닫기
- `Ctrl+P` — 인쇄 (모달이 열려 있을 때만 가로챔)

---

## 11. 의존성 — ADR-024 필요

`CLAUDE.md`: *"새 라이브러리 추가 시 `docs/ADR.md`에 의사결정 기록 추가. 기록 없이
의존성 추가 금지."*

| 패키지 | 용도 | 근거 |
|---|---|---|
| `react-markdown` | 마크다운 → React | PaperFlow와 동일 파이프라인. 결과 일치 보장 |
| `remark-gfm` | 표·취소선 | 볼트의 49%가 표 사용 |
| `remark-breaks` | soft break → `<br>` | Obsidian 줄나눔 보존. PaperFlow 채택 결정과 동일 |
| `mermaid` | 다이어그램 | 볼트 36개 노트에서 실사용 확인. 동적 import |
| `unist-util-visit` | mdast 순회 | 아래 참조 — **선언 누락 상태를 이번에 바로잡는다** |

### `unist-util-visit` — 기존 결함 정리

`unist-util-visit@5.1.0`이 `node_modules`에 설치되어 있고 `rehypeWikilinks.ts`가 이를
import하고 있으나, **`package.json`에 선언되어 있지 않다.** 현재는 `@uiw/react-md-editor`를
통해 전이 설치된 것에 의존하고 있다(phantom dependency).

이 상태에서 `@uiw/react-md-editor`가 의존성 트리를 바꾸면 기존 편집기 미리보기까지
빌드가 깨진다. `remarkObsidian`도 같은 패키지를 쓰므로, 이번 작업에서 **직접 의존성으로
명시 선언**한다. 버전은 설치본과 동일한 `^5.1.0`으로 고정한다.

이는 "요청에 없는 개선"이 아니라 **이번에 사용할 패키지의 선언을 바로잡는 것**이므로
규칙 3(외과수술 같은 변경)에 부합한다.

`@uiw/react-md-editor`의 내장 미리보기를 재사용하지 않는 이유: 편집기 미리보기는
플러그인 구성이 편집 보조에 맞춰져 있고, 문서 뷰와 인쇄용 플러그인 체인을 공유하면
한쪽 변경이 다른 쪽을 깨뜨린다. 두 파이프라인을 분리해 유지한다.

---

## 12. 테스트 (TDD — 구현보다 먼저 작성)

`CLAUDE.md`: *"순수 함수는 100% 테스트 작성"*, *"테스트 없는 구현은 Hook이 차단"*.

### `remarkObsidian.test.ts`

- `![[도면.png]]` → image 노드, url이 리졸버 결과와 일치
- `![[도면.png|300]]` → 크기 지정 무시하고 동일 처리
- `![[다른노트]]` → strong 노드 (이미지 확장자 아님)
- `[[노트]]` → strong 노드
- `[[노트|별칭]]` → strong 노드, 텍스트는 `별칭`
- 한 줄에 위키링크 2개 이상 → 각각 변환, 사이 텍스트 보존
- **코드블록 안의 `[[..]]`·`![[..]]`는 변환되지 않는다** (회귀 방지)
- **인라인 코드 안의 `[[..]]`도 변환되지 않는다**
- `> [!warning] 제목` → `data-callout="warning"`, 마커 제거, 제목 strong
- `> [!note]-` (접기) → 마커 제거, 펼친 상태
- 알 수 없는 타입 `> [!무언가]` → 회색 폴백
- 콜아웃이 아닌 일반 인용문은 변경되지 않는다

### `resolveAsset.test.ts`

- 노트 기준 상대경로 우선 해석
- 상대경로 실패 시 파일명 검색으로 폴백
- 둘 다 실패 시 null
- **볼트 루트 밖 경로(`../..`)는 거부** ← 보안 필수
- **심링크로 볼트 밖을 가리켜도 거부**
- 한글 파일명 인코딩 왕복

### `noteToDocument.test.ts`

- frontmatter가 본문에 섞이지 않는다
- `assets`에 중복 없이 수집된다
- 이미지가 없는 노트는 `assets`가 빈 배열

### 통합 (`tests/integration/`)

- 문서 뷰를 열면 지면이 렌더된다
- mermaid 블록이 있으면 렌더 완료 전까지 인쇄 버튼이 비활성이다
- `Esc`로 닫힌다

---

## 13. 아키텍처 규칙 준수 확인

| 규칙 | 준수 |
|---|---|
| 렌더러에서 `fs` 직접 사용 금지 | ✓ 이미지는 메인 프로세스 프로토콜 핸들러 경유 |
| frontmatter 수정 시 `gray-matter`만 | ✓ 해당 없음 — 문서 뷰는 **읽기 전용** |
| `recentlyWrittenByApp` 자기 쓰기 방지 | ✓ 해당 없음 — 쓰기 없음 |
| 파괴적 작업 전 백업 | ✓ 해당 없음 — 파괴적 작업 없음 |
| ADR-007 (`.md`가 Single Source of Truth) | ✓ 위반 없음. 별도 DB 도입 없음 |
| zustand 스토어 3개 고정 | ✓ 신규 스토어 없음. 모달 상태는 `viewStore` |
| 타입은 `types/index.ts`에만 | ✓ `RenderableDocument`·`AssetResolver` 를 거기 정의 |
| `contextIsolation` 유지 | ✓ 변경 없음 |
| Conventional Commits | ✓ `feat(doc-view): ...` |

---

## 14. 미해결 / 후속

| 항목 | 처리 |
|---|---|
| 화면상 실제 A4 페이지 분할 표시 | 범위 제외. 필요해지면 별도 Phase |
| 웹 URL 공유 | 7장 경계만 준비. 별도 Phase |
| 수식(KaTeX) | 볼트 10개(0.6%). 필요해지면 추가 |
| 노트 임베드(transclusion) | 미구현. 텍스트로 폴백 |
| `printToPDF` 직접 저장 | `window.print()`로 충분. 불편하면 재검토 |
