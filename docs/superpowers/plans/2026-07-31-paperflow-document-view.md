# PaperFlow 문서 뷰 흡수 — 구현 계획

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 칸반에서 연 노트를 인쇄 품질의 A4 문서로 보고 PDF로 출력할 수 있게 한다.

**Architecture:** PaperFlow(Next.js 웹앱)의 렌더링·인쇄 레이어만 Electron 렌더러로 이식한다. 마크다운은 `react-markdown` + `remark-gfm` + `remark-breaks`로 렌더하고, Obsidian 전용 문법은 자체 remark 플러그인(`remarkObsidian`)이 mdast 레벨에서 표준 노드로 바꾼다. 로컬 이미지는 렌더러가 `fs`를 쓸 수 없으므로 메인 프로세스에 등록한 `vault-img://` 커스텀 프로토콜로 읽는다. 나중 웹 공유를 위해 이미지 URL 생성은 교체 가능한 `AssetResolver`로 주입한다.

**Tech Stack:** Electron 33, React 18, TypeScript strict, Tailwind 3, Vitest + jsdom, react-markdown 10, mermaid 11

**설계 문서:** `docs/superpowers/specs/2026-07-31-paperflow-document-view-design.md`

---

## Global Constraints

이 제약은 **모든 Task에 암묵적으로 포함**된다.

- **렌더러에서 `fs`·`Anthropic SDK`·`safeStorage` 직접 사용 금지.** 반드시 `window.api.*` 또는 커스텀 프로토콜 경유. (`CLAUDE.md` CRITICAL)
- **`contextIsolation: false` 또는 `nodeIntegration: true` 설정 금지.**
- **TDD 강제** — 테스트를 먼저 쓰고 실패를 확인한 뒤 구현한다. 순수 함수는 100% 커버리지. (`CLAUDE.md` CRITICAL, ADR-013)
- **새 라이브러리 추가 시 `docs/ADR.md`에 기록 필수.** 기록 없이 의존성 추가 금지.
- **UI 금지 패턴:** `bg-gradient-*`, `backdrop-blur-*`, `rounded-2xl` 이상의 큰 둥근 모서리, 보라/인디고 브랜드 색. UI 텍스트에 이모지 금지. 아이콘은 `lucide-react` 고정.
- **타입은 `src/renderer/src/types/index.ts`에만 정의.** (ADR-019)
- **zustand 스토어는 `vaultStore`/`viewStore`/`settingsStore` 3개 고정.** 신규 스토어 금지. (ADR-020)
- **본문(마크다운 body)을 앱이 임의 수정 금지.** 이 기능은 전 구간 **읽기 전용**이다.
- **커밋 메시지:** Conventional Commits, 한국어 본문. 예: `feat(doc-view): ...`. **attribution 라인(`Co-Authored-By` 등)을 넣지 않는다** — 이 저장소는 attribution이 비활성화되어 있다 (기존 커밋 이력과 일치시킬 것).
- **의존성 설치는 반드시 `npx -y npm@10.8.2 install …` 로 한다.** 로컬 npm(11.x)으로 설치하면 `package-lock.json`이 npm 11 형식으로 재생성되어 CI(Node 22 = npm 10)의 `npm ci`가 EUSAGE/EBADPLATFORM으로 깨진다. 검증도 `npx -y npm@10.8.2 ci` 로 한다.
- **테스트 실행:** `npm test` (= `vitest run`). 단일 파일: `npx vitest run <경로>`
- **타입 체크:** `npm run typecheck` (node + web 양쪽)
- **경로 별칭:** 렌더러 코드는 `@renderer` → `src/renderer/src`

### 설계 문서 대비 조정 사항 (3건)

구현 편의를 위해 스펙에서 다음을 조정한다. 스펙의 의도는 유지된다.

1. **모달 상태는 `viewStore`가 아니라 `NoteEditor`의 로컬 `useState`로 둔다.** 문서 뷰는 `NoteEditor`에서만 열고 닫히므로 전역 상태가 불필요하다. `viewStore`는 `persist` 미들웨어를 쓰므로 일시적 UI 상태를 넣지 않는 편이 안전하다. (더 보수적인 변경)
2. **스타일을 `document.css`(화면)와 `print.css`(`@media print` 전용)로 분리한다.** 스펙의 "인쇄 스타일이 화면 레이아웃을 깨뜨리지 말 것" 규칙을 구조로 강제한다.
3. **메인 프로세스 경로 해석 로직을 `src/main/utils/assetResolver.ts`로 분리하고, `src/main/ipc/asset.ts`는 프로토콜 등록만 담당한다.** 기존 `src/main/utils/markdown.ts` 패턴과 일치하며 순수 로직을 단위 테스트할 수 있다.

---

## File Structure

### 신규 생성

| 파일 | 책임 |
|---|---|
| `src/renderer/src/lib/docRender/remarkObsidian.ts` | mdast 전처리 — 임베드·위키링크·콜아웃·pagebreak |
| `src/renderer/src/lib/docRender/remarkObsidian.test.ts` | 위 테스트 |
| `src/renderer/src/lib/docRender/resolveAsset.ts` | `AssetResolver` 타입 + `localResolver` (URL 조립) |
| `src/renderer/src/lib/docRender/resolveAsset.test.ts` | 위 테스트 |
| `src/renderer/src/lib/docRender/noteToDocument.ts` | `Note` → `RenderableDocument` (순수) |
| `src/renderer/src/lib/docRender/noteToDocument.test.ts` | 위 테스트 |
| `src/renderer/src/components/document/Mermaid.tsx` | mermaid 동적 import 렌더러 |
| `src/renderer/src/components/document/MarkdownDocument.tsx` | react-markdown 파이프라인 |
| `src/renderer/src/components/document/DocumentView.tsx` | 전체화면 모달 + 지면 + 인쇄 |
| `src/renderer/src/styles/document.css` | 지면·타이포·콜아웃 (화면) |
| `src/renderer/src/styles/print.css` | `@media print` 전용 A4 분할 |
| `src/main/utils/assetResolver.ts` | 볼트 이미지 경로 해석 + 탈출 방지 |
| `src/main/utils/assetResolver.test.ts` | 위 테스트 (보안 테스트 포함) |
| `src/main/ipc/asset.ts` | `vault-img://` 프로토콜 등록 |
| `tests/integration/document-view.test.tsx` | 문서 뷰 통합 테스트 |

### 수정

| 파일 | 변경 내용 |
|---|---|
| `package.json` | 의존성 5종 추가 (Task 1) |
| `docs/ADR.md` | ADR-024 추가 (Task 1) |
| `src/renderer/index.html` | CSP `img-src`에 `vault-img:` 추가 (Task 6) |
| `src/renderer/src/types/index.ts` | `AssetResolver`·`RenderableDocument` 추가 (Task 4) |
| `src/renderer/src/main.tsx` | `document.css`·`print.css` import (Task 7) |
| `src/main/index.ts` | 스킴 특권 등록 + 핸들러 등록 (Task 6) |
| `src/renderer/src/components/editor/NoteEditor.tsx` | 툴바 버튼 + 모달 마운트 (Task 10) |

---

## Task 1: 의존성 선언 + ADR-024

**Files:**
- Modify: `package.json`
- Modify: `docs/ADR.md`

**Interfaces:**
- Consumes: 없음
- Produces: `react-markdown`, `remark-gfm`, `remark-breaks`, `mermaid`, `unist-util-visit` 를 import 가능한 상태로 만든다. `unified`·`remark-parse`는 테스트에서 마크다운을 실제로 파싱하기 위한 devDependency.

**배경 — phantom dependency 정리:** `unist-util-visit@5.1.0`이 `node_modules`에 설치되어 있고 기존 `src/renderer/src/lib/rehypeWikilinks.ts`가 이를 import하고 있으나 `package.json`에 선언되어 있지 않다. `@uiw/react-md-editor`를 통한 전이 설치에 의존 중이며, 그 패키지가 의존성 트리를 바꾸면 기존 편집기 미리보기까지 빌드가 깨진다. 이번에 같은 패키지를 쓰므로 함께 바로잡는다.

- [ ] **Step 1: 현재 상태를 기록해둔다**

```bash
npm test 2>&1 | tail -5
```
Expected: 기존 테스트가 전부 통과. 이 기준선을 Step 5에서 다시 확인한다.

- [ ] **Step 2: 런타임 의존성 설치**

```bash
npx -y npm@10.8.2 install --save react-markdown@^10.1.0 remark-gfm@^4.0.1 remark-breaks@^4.0.0 mermaid@^11.15.0 unist-util-visit@^5.1.0
```

버전은 PaperFlow(`jlaw080-ops/paperflow`)의 `package.json`과 동일하게 맞춘다. 렌더 결과가 웹 공유 시에도 일치해야 하기 때문이다. `unist-util-visit`은 이미 설치된 버전(5.1.0)에 고정한다.

> **`npx -y npm@10.8.2` 를 쓰는 이유 (로컬 `npm` 직접 호출 금지):** 이 저장소의 `package-lock.json`은 CI(Node 22 = npm 10)에 맞춰 npm **10.8.2**로 재생성된 것이다. 로컬 npm 11로 설치하면 락파일이 npm 11 형식으로 재생성되고, CI의 `npm ci`가 EUSAGE/EBADPLATFORM으로 실패한다. 2026-06-01 세션에서 이미 한 번 고친 회귀이므로 반복하지 않는다.

- [ ] **Step 3: 테스트용 devDependency 설치**

```bash
npx -y npm@10.8.2 install --save-dev unified@^11.0.5 remark-parse@^11.0.0
```

`remarkObsidian` 테스트에서 실제 마크다운을 mdast로 파싱하기 위해 필요하다. 손으로 만든 트리로 테스트하면 "코드블록 안의 `[[...]]`는 변환되지 않는다" 같은 회귀 테스트가 무의미해진다(코드블록 노드를 손으로 안 만들면 통과가 보장되므로).

- [ ] **Step 4: `docs/ADR.md` 맨 끝에 ADR-024 추가**

기존 ADR 항목들의 서식(제목 · 결정 · 근거 · 대안 · 트레이드오프)을 그대로 따를 것. 파일을 열어 ADR-023의 형식을 확인한 뒤 같은 구조로 작성한다.

```markdown
## ADR-024: 문서 뷰 렌더링은 react-markdown 계열 채택 (PaperFlow와 동일 구성)

**결정**

문서 뷰(A4 인쇄용 보기)의 마크다운 렌더링에 다음을 도입한다.

| 패키지 | 버전 | 용도 |
|---|---|---|
| `react-markdown` | ^10.1.0 | 마크다운 → React 엘리먼트 |
| `remark-gfm` | ^4.0.1 | GFM 표·취소선·자동링크 |
| `remark-breaks` | ^4.0.0 | 단일 줄바꿈 → `<br>` |
| `mermaid` | ^11.15.0 | 다이어그램 (동적 import) |
| `unist-util-visit` | ^5.1.0 | mdast 순회 (기존 미선언분 정리 겸) |
| `unified` (dev) | ^11.0.5 | 테스트에서 마크다운 파싱 |
| `remark-parse` (dev) | ^11.0.0 | 테스트에서 마크다운 파싱 |

**근거**

- 버전을 PaperFlow 저장소와 동일하게 고정했다. 나중에 같은 노트를 웹으로 공유했을 때
  로컬 문서 뷰와 웹 결과가 어긋나면 인쇄물 검증이 무의미해진다.
- 볼트 실측(1,714개 노트)에서 GFM 표 838개(49%), mermaid 36개(2%)가 실사용 중이다.
  표는 인쇄 시 페이지 경계 잘림 방지가 핵심 가치이므로 `remark-gfm`이 필수다.
- `remark-breaks`는 Obsidian·GitHub 댓글과 동일한 줄바꿈 동작이다. 원본 노트의
  줄나눔을 보존한다. PaperFlow도 같은 이유로 채택했다.
- `unist-util-visit`은 이미 `rehypeWikilinks.ts`가 쓰고 있으나 `package.json`에
  미선언 상태였다(전이 설치 의존). 이번에 직접 의존성으로 명시해 잠재 결함을 제거한다.

**대안**

- *`@uiw/react-md-editor`의 내장 미리보기 재사용* — 기각. 편집기 미리보기와 인쇄용
  문서 뷰는 플러그인 구성 요구가 다르다. 체인을 공유하면 한쪽 변경이 다른 쪽을
  깨뜨린다. 두 파이프라인을 분리해 유지한다.
- *`marked` + `DOMPurify`로 직접 HTML 생성* — 기각. React 트리를 거치지 않으면
  mermaid 컴포넌트 삽입과 콜아웃 스타일링이 문자열 조작이 된다.
- *PaperFlow 웹앱을 webview로 임베드* — 기각. 오프라인 불가, 로그인 필요, 볼트 노트와
  자동 연동 안 됨. (설계 문서 참조)

**트레이드오프**

- `mermaid`는 번들이 크다(수백 KB). 문서에 mermaid 블록이 있을 때만 동적 `import()`로
  로드해 초기 로딩에 영향을 주지 않는다.
- 마크다운 파이프라인이 편집기용·문서용 둘로 늘어난다. 의도적 분리이며,
  각각의 목적이 달라 수렴시킬 이유가 없다.
```

- [ ] **Step 5: 기존 테스트가 여전히 통과하는지 확인**

```bash
npm test
npm run typecheck
```
Expected: 둘 다 통과. 의존성 추가만으로 기존 동작이 깨지지 않아야 한다.

- [ ] **Step 5b: 락파일이 CI에서도 통하는지 검증한다**

```bash
npx -y npm@10.8.2 ci
```
Expected: 성공. 이것이 CI(`.github/workflows`, Node 22 = npm 10)가 실제로 실행하는 명령이다.
로컬 npm 11의 `npm ci` 는 락파일 불일치에 관대해서 검증 도구로 쓸 수 없으므로 **반드시
`npx -y npm@10.8.2 ci` 로 확인한다.** 여기서 EUSAGE/EBADPLATFORM 이 나면 Step 2·3을
`npx -y npm@10.8.2` 로 다시 수행한 것이 맞는지 확인할 것.

이 명령은 `node_modules` 를 지우고 재설치하므로 몇 분 걸린다. 완료 후 Step 1의 `npm test`
기준선을 한 번 더 확인한다.

- [ ] **Step 6: 커밋**

```bash
git add package.json package-lock.json docs/ADR.md
git commit -m "chore(doc-view): 문서 뷰 렌더링 의존성 추가 + ADR-024

- react-markdown/remark-gfm/remark-breaks/mermaid 를 PaperFlow와 동일 버전으로 고정.
  웹 공유 시 로컬 문서 뷰와 렌더 결과가 어긋나지 않게 하기 위함.
- unist-util-visit: rehypeWikilinks.ts가 이미 import 중이나 package.json에
  미선언 상태였음(전이 설치 의존). 직접 의존성으로 명시해 잠재 빌드 결함 제거.
- unified/remark-parse: 테스트에서 실제 마크다운 파싱용 devDependency."
```

---

## Task 2: `remarkObsidian` — 이미지 임베드 + 위키링크

**Files:**
- Create: `src/renderer/src/lib/docRender/remarkObsidian.ts`
- Create: `src/renderer/src/lib/docRender/remarkObsidian.test.ts`
- Modify: `src/renderer/src/types/index.ts`

**Interfaces:**
- Consumes: `unist-util-visit`, `unified`+`remark-parse`(테스트)
- Produces:
  ```ts
  // types/index.ts — 타입 정본은 반드시 여기에만 둔다 (Global Constraint / ADR-019)
  export type AssetResolver = (notePath: string, target: string) => string

  // remarkObsidian.ts
  export interface RemarkObsidianOptions {
    notePath: string
    resolveAsset: AssetResolver
  }
  export function remarkObsidian(options: RemarkObsidianOptions): (tree: Root) => void
  ```
  Task 3이 이 파일에 콜아웃·pagebreak 처리를 **추가**한다. Task 4가 `localResolver`로 이 타입을 구현한다. Task 9가 `remarkPlugins`에 **튜플 형태**로 등록한다: `[remarkObsidian, { notePath, resolveAsset }]`

> **중요 — unified 플러그인 등록 형태:** `remarkObsidian`은 *옵션을 받아 transformer를 반환하는* 함수다. `remarkPlugins={[remarkObsidian({...})]}` 처럼 직접 호출한 결과를 넣으면 unified가 그것을 다시 attacher로 취급해 transformer를 얻지 못하고 **아무 변환도 일어나지 않는다.** 반드시 튜플 `[remarkObsidian, options]` 형태로 등록한다. 기존 `NoteEditor.tsx`의 `rehypePlugins: [[rehypeWikilinks]]` 와 같은 방식이다.

- [ ] **Step 1: `AssetResolver` 타입을 정본 위치에 추가한다**

`src/renderer/src/types/index.ts` **맨 끝에** 추가한다. 타입은 이 파일에만 정의한다는 것이 프로젝트 규칙(ADR-019)이므로, `remarkObsidian.ts` 안에 따로 정의하지 않는다.

```ts
/**
 * 문서 뷰에서 이미지 target 을 실제 src 로 바꾸는 함수.
 * 로컬 뷰는 vault-img:// 를, 나중 웹 공유는 https URL 을 돌려주도록 갈아끼운다.
 */
export type AssetResolver = (notePath: string, target: string) => string
```

- [ ] **Step 2: 실패하는 테스트를 작성한다**

`src/renderer/src/lib/docRender/remarkObsidian.test.ts`:

```ts
import { describe, it, expect } from 'vitest'
import { unified } from 'unified'
import remarkParse from 'remark-parse'
import type { Root } from 'mdast'
import type { AssetResolver } from '@renderer/types'
import { remarkObsidian } from './remarkObsidian'

const stubResolver: AssetResolver = (notePath, target) => `test://${notePath}::${target}`

/** 마크다운을 파싱하고 remarkObsidian을 적용한 mdast를 돌려준다. */
function transform(markdown: string, notePath = 'folder/노트.md'): Root {
  const tree = unified().use(remarkParse).parse(markdown) as Root
  remarkObsidian({ notePath, resolveAsset: stubResolver })(tree)
  return tree
}

/** 트리에서 특정 타입 노드를 전부 모은다. */
function collect(tree: Root, type: string): Record<string, unknown>[] {
  const found: Record<string, unknown>[] = []
  const walk = (node: Record<string, unknown>): void => {
    if (node.type === type) found.push(node)
    const children = node.children as Record<string, unknown>[] | undefined
    if (Array.isArray(children)) children.forEach(walk)
  }
  walk(tree as unknown as Record<string, unknown>)
  return found
}

describe('remarkObsidian — 이미지 임베드', () => {
  it('이미지 확장자 임베드를 image 노드로 바꾸고 리졸버 결과를 url로 쓴다', () => {
    const images = collect(transform('![[도면.png]]'), 'image')
    expect(images).toHaveLength(1)
    expect(images[0].url).toBe('test://folder/노트.md::도면.png')
  })

  it('크기 지정(|300)은 무시하고 파일명만 해석한다', () => {
    const images = collect(transform('![[도면.png|300]]'), 'image')
    expect(images).toHaveLength(1)
    expect(images[0].url).toBe('test://folder/노트.md::도면.png')
  })

  it('대문자 확장자도 이미지로 인식한다', () => {
    expect(collect(transform('![[사진.JPG]]'), 'image')).toHaveLength(1)
  })

  it('이미지 확장자가 아닌 임베드는 strong 텍스트로 내린다 (노트 임베드 미지원)', () => {
    const tree = transform('![[다른노트]]')
    expect(collect(tree, 'image')).toHaveLength(0)
    const strongs = collect(tree, 'strong')
    expect(strongs).toHaveLength(1)
    expect((strongs[0].children as { value: string }[])[0].value).toBe('다른노트')
  })
})

describe('remarkObsidian — 위키링크', () => {
  it('위키링크를 strong 노드로 바꾼다', () => {
    const strongs = collect(transform('[[ZEB 설계기준]]'), 'strong')
    expect(strongs).toHaveLength(1)
    expect((strongs[0].children as { value: string }[])[0].value).toBe('ZEB 설계기준')
  })

  it('별칭이 있으면 별칭을 표시한다', () => {
    const strongs = collect(transform('[[노트경로|별칭]]'), 'strong')
    expect((strongs[0].children as { value: string }[])[0].value).toBe('별칭')
  })

  it('한 줄에 위키링크가 여러 개면 각각 변환하고 사이 텍스트를 보존한다', () => {
    const tree = transform('앞 [[가]] 중간 [[나]] 뒤')
    expect(collect(tree, 'strong')).toHaveLength(2)
    const texts = collect(tree, 'text').map((n) => n.value)
    expect(texts).toContain(' 중간 ')
    expect(texts).toContain('앞 ')
    expect(texts).toContain(' 뒤')
  })

  it('위키링크가 없는 텍스트는 건드리지 않는다', () => {
    const tree = transform('평범한 문단입니다')
    expect(collect(tree, 'strong')).toHaveLength(0)
    expect(collect(tree, 'text')[0].value).toBe('평범한 문단입니다')
  })
})

describe('remarkObsidian — 코드 안에서는 변환하지 않는다 (회귀 방지)', () => {
  it('코드블록 안의 위키링크·임베드는 변환되지 않는다', () => {
    const tree = transform('```\n[[가]] 그리고 ![[나.png]]\n```')
    expect(collect(tree, 'strong')).toHaveLength(0)
    expect(collect(tree, 'image')).toHaveLength(0)
    expect(collect(tree, 'code')[0].value).toBe('[[가]] 그리고 ![[나.png]]')
  })

  it('인라인 코드 안의 위키링크는 변환되지 않는다', () => {
    const tree = transform('`[[가]]` 는 위키링크 문법이다')
    expect(collect(tree, 'strong')).toHaveLength(0)
    expect(collect(tree, 'inlineCode')[0].value).toBe('[[가]]')
  })
})
```

- [ ] **Step 3: 테스트를 실행해 실패를 확인한다**

```bash
npx vitest run src/renderer/src/lib/docRender/remarkObsidian.test.ts
```
Expected: FAIL — `Failed to resolve import "./remarkObsidian"` (파일이 아직 없음)

- [ ] **Step 4: 최소 구현을 작성한다**

`src/renderer/src/lib/docRender/remarkObsidian.ts`:

```ts
import { visit, SKIP } from 'unist-util-visit'
import type { Root, Text, PhrasingContent, Parent } from 'mdast'
import type { AssetResolver } from '@renderer/types'

export interface RemarkObsidianOptions {
  /** 볼트 루트 기준 노트 상대경로 (이미지 상대경로 해석의 기준점) */
  notePath: string
  resolveAsset: AssetResolver
}

const IMAGE_EXT = /\.(png|jpe?g|gif|svg|webp|bmp|avif)$/i

/** `![[..]]` 또는 `[[..]]` 를 찾는다. 선행 `!` 여부로 임베드/링크를 구분한다. */
const WIKI_RE = /(!?)\[\[([^\]]+)\]\]/g

interface WikiMatch {
  start: number
  end: number
  isEmbed: boolean
  target: string
  alias?: string
}

function findMatches(value: string): WikiMatch[] {
  const matches: WikiMatch[] = []
  WIKI_RE.lastIndex = 0
  let m: RegExpExecArray | null
  while ((m = WIKI_RE.exec(value)) !== null) {
    const [target, alias] = m[2].split('|')
    matches.push({
      start: m.index,
      end: m.index + m[0].length,
      isEmbed: m[1] === '!',
      target: target.trim(),
      alias: alias?.trim()
    })
  }
  return matches
}

function strongText(value: string): PhrasingContent {
  return { type: 'strong', children: [{ type: 'text', value }] }
}

/**
 * 텍스트 노드 하나를 위키 문법 기준으로 쪼갠다.
 * 변환할 것이 없으면 null 을 돌려 호출부가 원본을 유지하게 한다.
 */
function splitWikiSyntax(
  value: string,
  options: RemarkObsidianOptions
): PhrasingContent[] | null {
  const matches = findMatches(value)
  if (matches.length === 0) return null

  const out: PhrasingContent[] = []
  let cursor = 0

  for (const match of matches) {
    if (cursor < match.start) {
      out.push({ type: 'text', value: value.slice(cursor, match.start) })
    }

    if (match.isEmbed && IMAGE_EXT.test(match.target)) {
      out.push({
        type: 'image',
        url: options.resolveAsset(options.notePath, match.target),
        alt: match.target
      })
    } else {
      // 노트 임베드(transclusion)는 지원하지 않는다 — 텍스트로 내린다.
      out.push(strongText(match.alias ?? match.target))
    }

    cursor = match.end
  }

  if (cursor < value.length) {
    out.push({ type: 'text', value: value.slice(cursor) })
  }

  return out
}

export function remarkObsidian(options: RemarkObsidianOptions) {
  return (tree: Root): void => {
    // 'text' 노드만 방문하므로 code / inlineCode 노드는 자동으로 제외된다.
    visit(tree, 'text', (node: Text, index, parent) => {
      if (!parent || index === undefined) return
      const replacement = splitWikiSyntax(node.value, options)
      if (!replacement) return
      ;(parent as Parent).children.splice(index, 1, ...replacement)
      // 새로 넣은 노드를 다시 방문하지 않도록 커서를 건너뛴다.
      return [SKIP, index + replacement.length]
    })
  }
}
```

- [ ] **Step 5: 테스트를 실행해 통과를 확인한다**

```bash
npx vitest run src/renderer/src/lib/docRender/remarkObsidian.test.ts
```
Expected: PASS — 10개 테스트 전부 통과

- [ ] **Step 6: 타입 체크**

```bash
npm run typecheck
```
Expected: 오류 없음

- [ ] **Step 7: 커밋**

```bash
git add src/renderer/src/types/index.ts src/renderer/src/lib/docRender/remarkObsidian.ts src/renderer/src/lib/docRender/remarkObsidian.test.ts
git commit -m "feat(doc-view): Obsidian 이미지 임베드·위키링크 mdast 전처리

- ![[img.png]] -> image 노드 (리졸버 주입으로 url 결정)
- ![[노트]] -> strong 텍스트 (노트 임베드 미지원, 이미지 확장자로 판별)
- [[링크]]/[[링크|별칭]] -> strong 텍스트 (인쇄물에서 클릭 불가하므로)
- text 노드만 방문하여 코드블록·인라인코드 내부는 변환하지 않음(회귀 테스트 포함)"
```

---

## Task 3: `remarkObsidian` — 콜아웃 + 강제 페이지 나눔

**Files:**
- Modify: `src/renderer/src/lib/docRender/remarkObsidian.ts`
- Modify: `src/renderer/src/lib/docRender/remarkObsidian.test.ts`

**Interfaces:**
- Consumes: Task 2의 `remarkObsidian(options)`
- Produces: 같은 함수가 blockquote에 `data-callout="<type>"` 속성을 부여하고, `<!-- pagebreak -->` 를 `<div class="page-break">` 로 바꾼다. Task 7의 CSS가 이 두 훅을 스타일링한다.

**배경:** 볼트 1,714개 중 287개(17%)가 Obsidian 콜아웃(`> [!note]`)을 쓴다. 표준 GFM으로 렌더하면 인용문 안에 `[!note]` 문자열이 그대로 노출된다.

**mdast → hast 속성 전달 방법:** mdast 노드의 `data.hProperties`에 넣은 값은 `mdast-util-to-hast`가 HTML 속성으로 옮긴다. `react-markdown`이 내부적으로 이 변환을 쓰므로 별도 rehype 플러그인이 필요 없다.

- [ ] **Step 1: 실패하는 테스트를 추가한다**

`remarkObsidian.test.ts` 파일 **끝에** 다음을 덧붙인다 (기존 describe 블록은 그대로 둔다):

```ts
describe('remarkObsidian — 콜아웃', () => {
  it('타입을 data-callout 속성으로 부여하고 [!type] 마커를 제거한다', () => {
    const tree = transform('> [!warning] 설계 주의\n> 단열재 두께 확인 필요')
    const quotes = collect(tree, 'blockquote')
    expect(quotes).toHaveLength(1)
    const data = quotes[0].data as { hProperties?: Record<string, string> }
    expect(data.hProperties?.['data-callout']).toBe('warning')

    const texts = collect(tree, 'text').map((n) => n.value)
    expect(texts.join('')).not.toContain('[!warning]')
  })

  it('마커 뒤 제목을 strong 으로 승격한다', () => {
    const tree = transform('> [!warning] 설계 주의\n> 단열재 두께 확인 필요')
    const strongs = collect(tree, 'strong')
    expect(strongs).toHaveLength(1)
    expect((strongs[0].children as { value: string }[])[0].value).toBe('설계 주의')
  })

  it('타입을 소문자로 정규화한다', () => {
    const tree = transform('> [!WARNING] 제목')
    const data = collect(tree, 'blockquote')[0].data as {
      hProperties?: Record<string, string>
    }
    expect(data.hProperties?.['data-callout']).toBe('warning')
  })

  it('접기 문법(-/+)도 마커를 제거하고 펼친 상태로 둔다', () => {
    const tree = transform('> [!note]- 접힌 제목\n> 본문')
    const data = collect(tree, 'blockquote')[0].data as {
      hProperties?: Record<string, string>
    }
    expect(data.hProperties?.['data-callout']).toBe('note')
    expect(collect(tree, 'text').map((n) => n.value).join('')).not.toContain('[!note]')
  })

  it('제목이 없는 콜아웃도 처리한다', () => {
    const tree = transform('> [!tip]\n> 본문만 있음')
    const data = collect(tree, 'blockquote')[0].data as {
      hProperties?: Record<string, string>
    }
    expect(data.hProperties?.['data-callout']).toBe('tip')
    expect(collect(tree, 'strong')).toHaveLength(0)
  })

  it('알 수 없는 타입도 그대로 속성에 넣는다 (CSS가 회색으로 폴백)', () => {
    const tree = transform('> [!무언가] 제목')
    const data = collect(tree, 'blockquote')[0].data as {
      hProperties?: Record<string, string>
    }
    expect(data.hProperties?.['data-callout']).toBe('무언가')
  })

  it('콜아웃이 아닌 일반 인용문은 변경하지 않는다', () => {
    const tree = transform('> 그냥 인용문입니다')
    const quotes = collect(tree, 'blockquote')
    expect(quotes[0].data).toBeUndefined()
    expect(collect(tree, 'text')[0].value).toBe('그냥 인용문입니다')
  })
})

describe('remarkObsidian — 강제 페이지 나눔', () => {
  it('<!-- pagebreak --> 주석을 page-break div 로 바꾼다', () => {
    const tree = transform('앞 문단\n\n<!-- pagebreak -->\n\n뒤 문단')
    const breaks = (tree.children as Record<string, unknown>[]).filter((n) => {
      const data = n.data as { hName?: string } | undefined
      return data?.hName === 'div'
    })
    expect(breaks).toHaveLength(1)
    const props = (breaks[0].data as { hProperties?: { className?: string[] } }).hProperties
    expect(props?.className).toContain('page-break')
  })

  it('공백이 들어간 형태도 인식한다', () => {
    const tree = transform('<!--   pagebreak   -->')
    const breaks = (tree.children as Record<string, unknown>[]).filter((n) => {
      const data = n.data as { hName?: string } | undefined
      return data?.hName === 'div'
    })
    expect(breaks).toHaveLength(1)
  })

  it('다른 HTML 주석은 건드리지 않는다', () => {
    const tree = transform('<!-- 그냥 메모 -->')
    const htmlNodes = collect(tree, 'html')
    expect(htmlNodes).toHaveLength(1)
  })
})
```

- [ ] **Step 2: 테스트를 실행해 실패를 확인한다**

```bash
npx vitest run src/renderer/src/lib/docRender/remarkObsidian.test.ts
```
Expected: 콜아웃·페이지나눔 10개 테스트 FAIL, 기존 10개는 PASS

- [ ] **Step 3: 구현을 추가한다**

`remarkObsidian.ts` 상단 import 를 다음으로 교체한다:

```ts
import { visit, SKIP } from 'unist-util-visit'
import type { Root, Text, PhrasingContent, Parent, Blockquote, Html } from 'mdast'
```

파일 하단 `remarkObsidian` 함수 **바로 앞에** 다음 헬퍼들을 추가한다:

```ts
/** `[!type]` + 선택적 접기 마커(-/+) + 같은 줄의 제목 */
const CALLOUT_RE = /^\[!([^\]]+)\][-+]?[ \t]*([^\n]*)/

/** `<!-- pagebreak -->` (앞뒤 공백 허용, 대소문자 무시) */
const PAGEBREAK_RE = /^<!--\s*pagebreak\s*-->$/i

function applyCallout(node: Blockquote): void {
  const firstBlock = node.children[0]
  if (!firstBlock || firstBlock.type !== 'paragraph') return

  const firstInline = firstBlock.children[0]
  if (!firstInline || firstInline.type !== 'text') return

  const match = CALLOUT_RE.exec(firstInline.value)
  if (!match) return

  const type = match[1].trim().toLowerCase()
  const title = match[2].trim()
  const rest = firstInline.value.slice(match[0].length)

  const replacement: PhrasingContent[] = []
  if (title) replacement.push({ type: 'strong', children: [{ type: 'text', value: title }] })
  if (rest) replacement.push({ type: 'text', value: rest })

  firstBlock.children.splice(0, 1, ...replacement)

  node.data = {
    ...node.data,
    hProperties: { ...(node.data?.hProperties ?? {}), 'data-callout': type }
  }
}

function applyPagebreak(node: Html): void {
  if (!PAGEBREAK_RE.test(node.value.trim())) return
  node.data = {
    ...node.data,
    hName: 'div',
    hProperties: { ...(node.data?.hProperties ?? {}), className: ['page-break'] }
  }
}
```

그리고 `remarkObsidian`의 반환 함수 안, 기존 `visit(tree, 'text', ...)` **뒤에** 다음 두 순회를 추가한다:

```ts
    visit(tree, 'blockquote', (node: Blockquote) => {
      applyCallout(node)
    })

    visit(tree, 'html', (node: Html) => {
      applyPagebreak(node)
    })
```

> **왜 `html` 노드에 `hName`만 바꾸는가:** `react-markdown`은 기본적으로 raw HTML을 렌더하지 않으므로 `html` 노드는 화면에서 사라진다. `data.hName`/`data.hProperties`를 주면 `mdast-util-to-hast`가 해당 노드를 지정한 엘리먼트로 변환하므로, raw HTML을 활성화하지 않고도 빈 `<div class="page-break">`를 얻을 수 있다.

- [ ] **Step 4: 테스트를 실행해 통과를 확인한다**

```bash
npx vitest run src/renderer/src/lib/docRender/remarkObsidian.test.ts
```
Expected: PASS — 20개 전부 통과

- [ ] **Step 5: 타입 체크**

```bash
npm run typecheck
```
Expected: 오류 없음

- [ ] **Step 6: 커밋**

```bash
git add src/renderer/src/lib/docRender/remarkObsidian.ts src/renderer/src/lib/docRender/remarkObsidian.test.ts
git commit -m "feat(doc-view): Obsidian 콜아웃 + 강제 페이지 나눔 전처리

- > [!type] 제목 -> blockquote에 data-callout 부여, 마커 제거, 제목 strong 승격
  (볼트 1714개 중 287개(17%)가 콜아웃 사용 — 미처리 시 [!type] 문자열 노출)
- 접기 문법(-/+) 마커도 제거하고 항상 펼친 상태 (인쇄물이므로)
- <!-- pagebreak --> -> data.hName='div' + page-break 클래스.
  raw HTML을 켜지 않고 페이지 나눔 요소를 얻기 위한 방식."
```

---

## Task 4: `resolveAsset` + `noteToDocument` + 타입 정의

**Files:**
- Create: `src/renderer/src/lib/docRender/resolveAsset.ts`
- Create: `src/renderer/src/lib/docRender/resolveAsset.test.ts`
- Create: `src/renderer/src/lib/docRender/noteToDocument.ts`
- Create: `src/renderer/src/lib/docRender/noteToDocument.test.ts`
- Modify: `src/renderer/src/types/index.ts`

**Interfaces:**
- Consumes: `Note`, `AssetResolver` (둘 다 `@renderer/types` — `AssetResolver`는 **Task 2에서 이미 추가됨. 다시 정의하지 말 것**)
- Produces:
  ```ts
  // types/index.ts — RenderableDocument 만 새로 추가한다
  export interface RenderableDocument {
    title: string
    markdown: string
    assets: string[]
  }
  // resolveAsset.ts
  export const localResolver: AssetResolver
  // noteToDocument.ts
  export function noteToDocument(note: Note): RenderableDocument
  ```
  Task 9(`MarkdownDocument`)와 Task 10(`DocumentView`)이 이것들을 쓴다.

**이 Task가 "나중 URL 공유"의 경계다.** `localResolver`를 다른 리졸버로 갈아끼우면 렌더링 코드를 수정하지 않고 웹 공유로 확장된다. `assets`는 그때 업로드할 파일 목록이다.

- [ ] **Step 1: 실패하는 테스트를 작성한다 — resolveAsset**

`src/renderer/src/lib/docRender/resolveAsset.test.ts`:

```ts
import { describe, it, expect } from 'vitest'
import { localResolver } from './resolveAsset'

describe('localResolver', () => {
  it('vault-img 스킴 URL을 만든다', () => {
    const url = localResolver('folder/note.md', 'img.png')
    expect(url.startsWith('vault-img://asset/?')).toBe(true)
  })

  it('note 와 target 을 쿼리 파라미터로 넣는다', () => {
    const url = new URL(localResolver('folder/note.md', 'img.png'))
    expect(url.searchParams.get('note')).toBe('folder/note.md')
    expect(url.searchParams.get('target')).toBe('img.png')
  })

  it('한글 파일명이 인코딩 왕복을 견딘다', () => {
    const url = new URL(localResolver('01_프로젝트/설계 노트.md', '평면도 (최종).png'))
    expect(url.searchParams.get('note')).toBe('01_프로젝트/설계 노트.md')
    expect(url.searchParams.get('target')).toBe('평면도 (최종).png')
  })

  it('& 와 = 가 들어간 파일명도 깨지지 않는다', () => {
    const url = new URL(localResolver('a.md', 'a&b=c.png'))
    expect(url.searchParams.get('target')).toBe('a&b=c.png')
  })

  it('상대경로 구분자를 보존한다', () => {
    const url = new URL(localResolver('a/b.md', '../assets/img.png'))
    expect(url.searchParams.get('target')).toBe('../assets/img.png')
  })
})
```

- [ ] **Step 2: 실패하는 테스트를 작성한다 — noteToDocument**

`src/renderer/src/lib/docRender/noteToDocument.test.ts`:

```ts
import { describe, it, expect } from 'vitest'
import { noteToDocument } from './noteToDocument'
import type { Note } from '@renderer/types'

function makeNote(overrides: Partial<Note> = {}): Note {
  return {
    filePath: 'C:/vault/folder/note.md',
    relativePath: 'folder/note.md',
    title: '설계 검토',
    status: 'in-progress',
    tags: [],
    created: '2026-04-01',
    body: '본문',
    mtime: 1_700_000_000_000,
    ...overrides
  }
}

describe('noteToDocument', () => {
  it('제목과 본문을 그대로 옮긴다', () => {
    const doc = noteToDocument(makeNote({ title: '제목', body: '# 머리글\n\n내용' }))
    expect(doc.title).toBe('제목')
    expect(doc.markdown).toBe('# 머리글\n\n내용')
  })

  it('이미지가 없으면 assets 가 빈 배열이다', () => {
    expect(noteToDocument(makeNote({ body: '이미지 없는 본문' })).assets).toEqual([])
  })

  it('Obsidian 임베드 이미지를 수집한다', () => {
    const doc = noteToDocument(makeNote({ body: '![[평면도.png]] 그리고 ![[입면도.jpg]]' }))
    expect(doc.assets).toEqual(['평면도.png', '입면도.jpg'])
  })

  it('임베드의 크기 지정(|300)을 벗겨낸다', () => {
    expect(noteToDocument(makeNote({ body: '![[도면.png|300]]' })).assets).toEqual(['도면.png'])
  })

  it('이미지가 아닌 임베드는 수집하지 않는다', () => {
    expect(noteToDocument(makeNote({ body: '![[다른노트]]' })).assets).toEqual([])
  })

  it('표준 마크다운 이미지도 수집한다', () => {
    expect(noteToDocument(makeNote({ body: '![캡션](attachments/x.png)' })).assets).toEqual([
      'attachments/x.png'
    ])
  })

  it('원격 URL 이미지는 수집하지 않는다 (업로드 대상이 아님)', () => {
    const body = '![a](https://example.com/x.png)\n![b](http://example.com/y.png)\n![c](data:image/png;base64,AAA)'
    expect(noteToDocument(makeNote({ body })).assets).toEqual([])
  })

  it('같은 이미지가 여러 번 나와도 한 번만 수집한다', () => {
    expect(noteToDocument(makeNote({ body: '![[a.png]] ![[a.png]]' })).assets).toEqual(['a.png'])
  })
})
```

- [ ] **Step 3: 테스트를 실행해 실패를 확인한다**

```bash
npx vitest run src/renderer/src/lib/docRender/resolveAsset.test.ts src/renderer/src/lib/docRender/noteToDocument.test.ts
```
Expected: FAIL — 두 모듈 모두 import 해결 실패

- [ ] **Step 4: `RenderableDocument` 타입을 추가한다**

`src/renderer/src/types/index.ts` **맨 끝에** 추가한다. `AssetResolver`는 Task 2에서 이미 이 파일에 추가되어 있으므로 **다시 정의하지 않는다.**

```ts
/** 문서 뷰가 렌더할 단위. 웹 공유 시에도 같은 형태를 그대로 올린다. */
export interface RenderableDocument {
  title: string
  /** 본문 마크다운 (frontmatter 제외) */
  markdown: string
  /** 본문이 참조하는 로컬 이미지 target 목록 (중복 제거, 원격 URL 제외) */
  assets: string[]
}
```

- [ ] **Step 5: `resolveAsset.ts` 를 구현한다**

```ts
import type { AssetResolver } from '@renderer/types'

/**
 * 로컬 볼트 이미지를 가리키는 커스텀 프로토콜 URL 을 만든다.
 * 실제 파일 해석은 메인 프로세스(src/main/utils/assetResolver.ts)가 담당한다.
 *
 * host 를 'asset' 으로 고정하고 값을 쿼리로 넘기는 이유: host 자리에 경로를 넣으면
 * 한글·공백·슬래시에서 URL 파싱이 깨진다.
 */
export const localResolver: AssetResolver = (notePath, target) =>
  `vault-img://asset/?note=${encodeURIComponent(notePath)}&target=${encodeURIComponent(target)}`
```

- [ ] **Step 6: `noteToDocument.ts` 를 구현한다**

```ts
import type { Note, RenderableDocument } from '@renderer/types'

const IMAGE_EXT = /\.(png|jpe?g|gif|svg|webp|bmp|avif)$/i

/** `![[파일명]]` / `![[파일명|크기]]` */
const EMBED_RE = /!\[\[([^\]|]+)(?:\|[^\]]*)?\]\]/g

/** `![캡션](경로)` — 경로 뒤 선택적 title 은 무시 */
const MD_IMAGE_RE = /!\[[^\]]*\]\(\s*([^)\s]+)(?:\s+"[^"]*")?\s*\)/g

const REMOTE_RE = /^(https?:|data:)/i

/**
 * 본문이 참조하는 로컬 이미지 target 을 수집한다.
 * 나중 웹 공유 시 업로드해야 할 파일 목록으로 쓴다.
 */
function collectAssets(body: string): string[] {
  const found = new Set<string>()

  EMBED_RE.lastIndex = 0
  let m: RegExpExecArray | null
  while ((m = EMBED_RE.exec(body)) !== null) {
    const target = m[1].trim()
    if (IMAGE_EXT.test(target)) found.add(target)
  }

  MD_IMAGE_RE.lastIndex = 0
  while ((m = MD_IMAGE_RE.exec(body)) !== null) {
    const target = m[1].trim()
    if (!REMOTE_RE.test(target)) found.add(target)
  }

  return [...found]
}

export function noteToDocument(note: Note): RenderableDocument {
  return {
    title: note.title,
    markdown: note.body,
    assets: collectAssets(note.body)
  }
}
```

- [ ] **Step 7: 테스트를 실행해 통과를 확인한다**

```bash
npx vitest run src/renderer/src/lib/docRender/
```
Expected: PASS — resolveAsset 5개 + noteToDocument 8개 + remarkObsidian 20개

- [ ] **Step 8: 타입 체크**

```bash
npm run typecheck
```
Expected: 오류 없음

- [ ] **Step 9: 커밋**

```bash
git add src/renderer/src/types/index.ts src/renderer/src/lib/docRender/resolveAsset.ts src/renderer/src/lib/docRender/resolveAsset.test.ts src/renderer/src/lib/docRender/noteToDocument.ts src/renderer/src/lib/docRender/noteToDocument.test.ts
git commit -m "feat(doc-view): AssetResolver 경계 + noteToDocument 순수 함수

- AssetResolver: 이미지 target -> src 변환을 주입 가능하게 만든 지점.
  로컬은 vault-img://, 나중 웹 공유는 https URL 로 갈아끼우면 렌더링 코드 수정 불필요.
- localResolver: host 를 'asset' 으로 고정하고 값은 쿼리로 전달.
  host 자리에 경로를 넣으면 한글·공백·슬래시에서 URL 파싱이 깨지기 때문.
- noteToDocument: 본문이 참조하는 로컬 이미지를 수집(원격 URL 제외, 중복 제거).
  웹 공유 시 업로드 대상 목록이 된다."
```

---

## Task 5: 메인 프로세스 이미지 경로 해석 + 볼트 탈출 방지

**Files:**
- Create: `src/main/utils/assetResolver.ts`
- Create: `src/main/utils/assetResolver.test.ts`

**Interfaces:**
- Consumes: 없음 (Node `fs`/`path`만)
- Produces:
  ```ts
  export async function resolveVaultAsset(
    vaultPath: string,
    notePath: string,
    target: string
  ): Promise<string | null>
  export function clearAssetIndex(): void
  ```
  Task 6의 프로토콜 핸들러가 `resolveVaultAsset`을 호출한다.

**보안이 이 Task의 핵심이다.** 렌더러가 보내는 `target`은 신뢰할 수 없는 입력이다. `../../../Windows/System32/config/SAM` 같은 값이 와도 볼트 밖 파일을 읽으면 안 된다.

**해석 순서:** ① 노트 기준 상대경로 → ② 볼트 전체 파일명 매칭(Obsidian 기본 동작) → ③ 실패 시 null. ②는 매번 스캔하면 느리므로 첫 필요 시 1회만 인덱스를 만들고 재사용한다.

- [ ] **Step 1: 실패하는 테스트를 작성한다**

`src/main/utils/assetResolver.test.ts`:

```ts
import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { promises as fs } from 'fs'
import { join, resolve } from 'path'
import { tmpdir } from 'os'
import { resolveVaultAsset, clearAssetIndex } from './assetResolver'

let vaultPath = ''
let outsidePath = ''

beforeEach(async () => {
  clearAssetIndex()
  vaultPath = await fs.mkdtemp(join(tmpdir(), 'vk-vault-'))
  outsidePath = await fs.mkdtemp(join(tmpdir(), 'vk-outside-'))

  await fs.mkdir(join(vaultPath, 'folder'), { recursive: true })
  await fs.mkdir(join(vaultPath, 'attachments'), { recursive: true })
  await fs.mkdir(join(vaultPath, '깊은/경로'), { recursive: true })

  await fs.writeFile(join(vaultPath, 'folder', 'note.md'), '# 노트')
  await fs.writeFile(join(vaultPath, 'folder', 'sibling.png'), 'PNG')
  await fs.writeFile(join(vaultPath, 'attachments', 'shared.png'), 'PNG')
  await fs.writeFile(join(vaultPath, '깊은/경로', '한글 이미지.png'), 'PNG')

  await fs.writeFile(join(outsidePath, 'secret.png'), 'SECRET')
})

afterEach(async () => {
  clearAssetIndex()
  await fs.rm(vaultPath, { recursive: true, force: true })
  await fs.rm(outsidePath, { recursive: true, force: true })
})

describe('resolveVaultAsset — 정상 해석', () => {
  it('노트와 같은 폴더의 이미지를 상대경로로 찾는다', async () => {
    const got = await resolveVaultAsset(vaultPath, 'folder/note.md', 'sibling.png')
    expect(got).toBe(resolve(vaultPath, 'folder', 'sibling.png'))
  })

  it('노트 기준 상대경로(../)를 따라간다', async () => {
    const got = await resolveVaultAsset(vaultPath, 'folder/note.md', '../attachments/shared.png')
    expect(got).toBe(resolve(vaultPath, 'attachments', 'shared.png'))
  })

  it('상대경로로 못 찾으면 볼트 전체에서 파일명으로 찾는다', async () => {
    const got = await resolveVaultAsset(vaultPath, 'folder/note.md', 'shared.png')
    expect(got).toBe(resolve(vaultPath, 'attachments', 'shared.png'))
  })

  it('한글·공백이 든 파일명을 찾는다', async () => {
    const got = await resolveVaultAsset(vaultPath, 'folder/note.md', '한글 이미지.png')
    expect(got).toBe(resolve(vaultPath, '깊은/경로', '한글 이미지.png'))
  })

  it('없는 파일이면 null 을 돌려준다', async () => {
    expect(await resolveVaultAsset(vaultPath, 'folder/note.md', '없는파일.png')).toBeNull()
  })
})

describe('resolveVaultAsset — 보안: 볼트 탈출 방지', () => {
  it('상위로 빠져나가는 상대경로를 거부한다', async () => {
    const escape = '../'.repeat(10) + 'Windows/System32/config/SAM'
    expect(await resolveVaultAsset(vaultPath, 'folder/note.md', escape)).toBeNull()
  })

  it('볼트 바깥의 실재 파일도 거부한다', async () => {
    const rel = resolve(outsidePath, 'secret.png')
    expect(await resolveVaultAsset(vaultPath, 'folder/note.md', rel)).toBeNull()
  })

  it('절대경로 입력을 거부한다', async () => {
    const abs = process.platform === 'win32' ? 'C:/Windows/win.ini' : '/etc/passwd'
    expect(await resolveVaultAsset(vaultPath, 'folder/note.md', abs)).toBeNull()
  })

  it('원격 URL 입력을 거부한다', async () => {
    expect(await resolveVaultAsset(vaultPath, 'folder/note.md', 'https://x.com/a.png')).toBeNull()
    expect(await resolveVaultAsset(vaultPath, 'folder/note.md', 'data:image/png;base64,AA')).toBeNull()
  })

  it('볼트 밖을 가리키는 심링크를 거부한다', async () => {
    // Windows 는 개발자 모드/관리자 권한이 없으면 심링크 생성이 EPERM 으로 실패한다.
    // 그런 환경에서는 이 테스트를 건너뛴다 (다른 탈출 경로는 위 테스트들이 막는다).
    const linkPath = join(vaultPath, 'link.png')
    try {
      await fs.symlink(join(outsidePath, 'secret.png'), linkPath)
    } catch {
      return
    }
    clearAssetIndex()
    expect(await resolveVaultAsset(vaultPath, 'folder/note.md', 'link.png')).toBeNull()
  })
})

describe('resolveVaultAsset — 방어적 입력 처리', () => {
  it('볼트 경로가 비어 있으면 null', async () => {
    expect(await resolveVaultAsset('', 'folder/note.md', 'a.png')).toBeNull()
  })

  it('target 이 비어 있으면 null', async () => {
    expect(await resolveVaultAsset(vaultPath, 'folder/note.md', '')).toBeNull()
  })
})
```

- [ ] **Step 2: 테스트를 실행해 실패를 확인한다**

```bash
npx vitest run src/main/utils/assetResolver.test.ts
```
Expected: FAIL — `Failed to resolve import "./assetResolver"`

- [ ] **Step 3: 구현을 작성한다**

`src/main/utils/assetResolver.ts`:

```ts
import { promises as fs } from 'fs'
import { basename, dirname, isAbsolute, join, relative, resolve } from 'path'

const IMAGE_EXT = /\.(png|jpe?g|gif|svg|webp|bmp|avif)$/i
const REMOTE_RE = /^(https?:|data:|file:)/i

/** 볼트 경로별 { 소문자 파일명 -> 절대경로[] } 인덱스. 첫 필요 시 1회만 만든다. */
let indexedVault: string | null = null
let assetIndex: Map<string, string[]> | null = null

export function clearAssetIndex(): void {
  indexedVault = null
  assetIndex = null
}

/** 해석된 절대경로가 볼트 루트 안에 있는지 심링크까지 풀어서 확인한다. */
async function isInsideVault(vaultRealPath: string, candidate: string): Promise<boolean> {
  try {
    const real = await fs.realpath(candidate)
    const rel = relative(vaultRealPath, real)
    return rel !== '' && !rel.startsWith('..') && !isAbsolute(rel)
  } catch {
    return false
  }
}

async function isReadableFile(candidate: string): Promise<boolean> {
  try {
    const stat = await fs.stat(candidate)
    return stat.isFile()
  } catch {
    return false
  }
}

async function buildIndex(vaultPath: string): Promise<Map<string, string[]>> {
  const index = new Map<string, string[]>()

  async function walk(dir: string): Promise<void> {
    let entries: Awaited<ReturnType<typeof fs.readdir>>
    try {
      entries = await fs.readdir(dir, { withFileTypes: true })
    } catch {
      return
    }
    for (const entry of entries) {
      if (entry.name.startsWith('.')) continue
      const full = join(dir, entry.name)
      if (entry.isDirectory()) {
        await walk(full)
      } else if (entry.isFile() && IMAGE_EXT.test(entry.name)) {
        const key = entry.name.toLowerCase()
        const bucket = index.get(key)
        if (bucket) bucket.push(full)
        else index.set(key, [full])
      }
    }
  }

  await walk(vaultPath)
  return index
}

async function getIndex(vaultPath: string): Promise<Map<string, string[]>> {
  if (indexedVault !== vaultPath || !assetIndex) {
    assetIndex = await buildIndex(vaultPath)
    indexedVault = vaultPath
  }
  return assetIndex
}

/**
 * 볼트 안의 이미지 파일 절대경로를 해석한다.
 *
 * ① 노트 기준 상대경로 → ② 볼트 전체 파일명 매칭 → ③ 실패 시 null.
 * 어느 경로든 볼트 루트를 벗어나면 거부한다(심링크 포함).
 *
 * @param vaultPath 볼트 루트 절대경로
 * @param notePath  볼트 기준 노트 상대경로 (상대 이미지 경로의 기준점)
 * @param target    노트 본문이 참조한 이미지 경로 또는 파일명 — 신뢰할 수 없는 입력
 */
export async function resolveVaultAsset(
  vaultPath: string,
  notePath: string,
  target: string
): Promise<string | null> {
  const cleanTarget = target.trim()
  if (!vaultPath || !cleanTarget) return null
  if (REMOTE_RE.test(cleanTarget)) return null
  if (isAbsolute(cleanTarget)) return null

  let vaultRealPath: string
  try {
    vaultRealPath = await fs.realpath(vaultPath)
  } catch {
    return null
  }

  // ① 노트 기준 상대경로
  const noteDir = dirname(resolve(vaultPath, notePath))
  const relativeCandidate = resolve(noteDir, cleanTarget)
  if (
    (await isReadableFile(relativeCandidate)) &&
    (await isInsideVault(vaultRealPath, relativeCandidate))
  ) {
    return relativeCandidate
  }

  // ② 볼트 전체 파일명 매칭 (Obsidian 기본 동작)
  const index = await getIndex(vaultPath)
  const matches = index.get(basename(cleanTarget).toLowerCase())
  if (matches) {
    for (const candidate of matches) {
      if (await isInsideVault(vaultRealPath, candidate)) return candidate
    }
  }

  return null
}
```

- [ ] **Step 4: 테스트를 실행해 통과를 확인한다**

```bash
npx vitest run src/main/utils/assetResolver.test.ts
```
Expected: PASS — 12개 전부 통과 (Windows에서 심링크 테스트는 조용히 건너뛸 수 있음)

- [ ] **Step 5: 타입 체크**

```bash
npm run typecheck
```
Expected: 오류 없음

- [ ] **Step 6: 커밋**

```bash
git add src/main/utils/assetResolver.ts src/main/utils/assetResolver.test.ts
git commit -m "feat(doc-view): 볼트 이미지 경로 해석 + 탈출 방지

- 해석 순서: 노트 기준 상대경로 -> 볼트 전체 파일명 매칭(Obsidian 기본 동작) -> null
- 파일명 매칭용 인덱스는 첫 필요 시 1회만 구축하고 볼트 경로가 바뀌면 폐기
  (1714개 노트 규모에서 매 요청 전체 스캔을 피하기 위함)
- 보안: target 은 렌더러가 보내는 신뢰할 수 없는 입력이므로
  절대경로·원격 스킴을 거부하고, realpath 로 심링크를 푼 뒤
  볼트 루트 밖이면 거부한다. 탈출 시나리오 5종을 테스트로 고정."
```

---

## Task 6: `vault-img://` 프로토콜 등록 + CSP 허용

**Files:**
- Create: `src/main/ipc/asset.ts`
- Modify: `src/main/index.ts`
- Modify: `src/renderer/index.html`

**Interfaces:**
- Consumes: `resolveVaultAsset` (Task 5), `getSettingValue` (`src/main/ipc/settings.ts`)
- Produces: `export function registerAssetProtocol(): void` — 렌더러에서 `vault-img://asset/?note=…&target=…` 로 이미지를 불러올 수 있게 된다.

> **차단 요인 — CSP:** `src/renderer/index.html`의 CSP는 현재 `img-src 'self' data:` 다. 이 상태로는 `vault-img://` 이미지가 **브라우저 단계에서 전부 차단**된다. 반드시 `vault-img:` 를 허용 목록에 추가해야 한다. 이 단계를 빠뜨리면 Task 9·10에서 이미지가 조용히 안 뜨고 원인 추적이 어려워진다.

> **등록 시점:** `protocol.registerSchemesAsPrivileged`는 **`app.whenReady()` 이전**, 모듈 최상위에서 호출해야 한다. ready 이후에 호출하면 무시된다. `protocol.handle`은 ready 이후에 호출한다.

- [ ] **Step 1: 프로토콜 핸들러를 작성한다**

`src/main/ipc/asset.ts`:

```ts
import { protocol } from 'electron'
import { promises as fs } from 'fs'
import { extname } from 'path'
import { resolveVaultAsset } from '../utils/assetResolver'
import { getSettingValue } from './settings'

export const VAULT_IMG_SCHEME = 'vault-img'

const MIME_BY_EXT: Record<string, string> = {
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif': 'image/gif',
  '.svg': 'image/svg+xml',
  '.webp': 'image/webp',
  '.bmp': 'image/bmp',
  '.avif': 'image/avif'
}

function mimeFor(filePath: string): string {
  return MIME_BY_EXT[extname(filePath).toLowerCase()] ?? 'application/octet-stream'
}

/**
 * 문서 뷰가 로컬 볼트 이미지를 읽는 통로.
 * 렌더러는 fs 를 직접 쓸 수 없으므로(CLAUDE.md CRITICAL) 이 프로토콜을 경유한다.
 *
 * app.whenReady() 이후에 호출할 것.
 */
export function registerAssetProtocol(): void {
  protocol.handle(VAULT_IMG_SCHEME, async (request) => {
    try {
      const url = new URL(request.url)
      const notePath = url.searchParams.get('note') ?? ''
      const target = url.searchParams.get('target') ?? ''
      const vaultPath = getSettingValue('vaultPath')

      const absolutePath = await resolveVaultAsset(vaultPath, notePath, target)
      if (!absolutePath) {
        return new Response(null, { status: 404 })
      }

      const data = await fs.readFile(absolutePath)
      return new Response(data, {
        status: 200,
        headers: { 'Content-Type': mimeFor(absolutePath) }
      })
    } catch {
      return new Response(null, { status: 404 })
    }
  })
}
```

- [ ] **Step 2: `src/main/index.ts` 에 스킴 특권 등록과 핸들러 등록을 추가한다**

import 블록 끝(9번째 줄 `registerMigrationHandlers` 다음)에 추가:

```ts
import { registerAssetProtocol, VAULT_IMG_SCHEME } from './ipc/asset'
```

1번째 줄의 electron import 에 `protocol` 을 추가:

```ts
import { app, shell, BrowserWindow, protocol } from 'electron'
```

import 블록 **바로 뒤, `function createWindow()` 앞에** 추가:

```ts
// app.whenReady() 이전에 호출해야 한다. ready 이후에는 무시된다.
protocol.registerSchemesAsPrivileged([
  {
    scheme: VAULT_IMG_SCHEME,
    privileges: { standard: true, secure: true, supportFetchAPI: true }
  }
])
```

`app.whenReady().then(...)` 안, `registerMigrationHandlers()` 다음 줄에 추가:

```ts
  registerAssetProtocol()
```

- [ ] **Step 3: CSP 에 `vault-img:` 를 허용한다**

`src/renderer/index.html` 의 CSP `content` 속성에서 `img-src` 만 바꾼다. 다른 지시어는 건드리지 않는다.

변경 전:
```
img-src 'self' data:
```
변경 후:
```
img-src 'self' data: vault-img:
```

- [ ] **Step 4: 타입 체크와 빌드를 확인한다**

```bash
npm run typecheck
npm run build
```
Expected: 둘 다 통과. 빌드가 깨지면 프로토콜 등록 위치(ready 이전/이후)를 다시 확인한다.

- [ ] **Step 5: 기존 테스트가 깨지지 않았는지 확인한다**

```bash
npm test
```
Expected: 전부 통과

- [ ] **Step 6: 커밋**

```bash
git add src/main/ipc/asset.ts src/main/index.ts src/renderer/index.html
git commit -m "feat(doc-view): vault-img 프로토콜 등록 + CSP 허용

- 렌더러는 fs 직접 접근 불가(CLAUDE.md CRITICAL)이므로 메인 프로세스
  커스텀 프로토콜로 볼트 이미지를 제공한다.
- registerSchemesAsPrivileged 는 app.whenReady() 이전에 호출해야 적용된다.
- index.html CSP 의 img-src 에 vault-img: 추가.
  이게 없으면 이미지가 CSP 단계에서 조용히 전부 차단된다."
```

---

## Task 7: 문서 스타일 — 지면 · 타이포 · 콜아웃 · 인쇄

**Files:**
- Create: `src/renderer/src/styles/document.css`
- Create: `src/renderer/src/styles/print.css`
- Modify: `src/renderer/src/main.tsx`

**Interfaces:**
- Consumes: Task 3이 만든 `[data-callout]` 속성과 `.page-break` 클래스
- Produces: `.doc-sheet`(지면), `.doc-body`(타이포 스코프), `.doc-overlay`(모달 배경), `.no-print` 클래스. Task 10의 `DocumentView`가 이 클래스들을 쓴다.

**맥락:** 이 앱은 다크 테마 전용이다(`globals.css`가 `:root`와 `.dark` 양쪽에 같은 어두운 팔레트를 적용). 지면만 흰 배경으로 두는 것은 **인쇄물 실물을 보여주기 위한 의도적 예외**이며 설계 문서 10장에 기록돼 있다.

Tailwind Typography 플러그인을 쓰지 않으므로(의존성 추가를 피함) 문서 타이포그래피를 직접 작성한다. Tailwind base reset이 `h1`·`table` 등의 기본 스타일을 지우기 때문에 반드시 필요하다.

- [ ] **Step 1: `document.css` 를 작성한다**

`src/renderer/src/styles/document.css`:

```css
/* 문서 뷰 — 화면 표시용. 인쇄 전용 규칙은 print.css 에 둔다. */

/* 모달 배경 (앱 테마를 따름) */
.doc-overlay {
  background-color: rgb(0 0 0 / 0.6);
}

/*
 * 지면. 앱은 다크 전용이지만 지면은 흰 배경을 유지한다 —
 * 인쇄물의 실제 모습을 보여주는 것이 이 화면의 목적이기 때문.
 * 화면에서는 연속 스크롤이고, 페이지 분할은 인쇄 시 print.css 가 담당한다.
 */
.doc-sheet {
  width: 210mm;
  max-width: 100%;
  margin: 0 auto;
  padding: 20mm;
  background-color: #ffffff;
  color: #1a1a1a;
  box-shadow: 0 1px 3px rgb(0 0 0 / 0.4);
}

/* ---- 문서 타이포그래피 (Tailwind base reset 을 되돌린다) ---- */

.doc-body {
  font-size: 10.5pt;
  line-height: 1.7;
  word-break: keep-all;
  overflow-wrap: break-word;
}

.doc-body h1,
.doc-body h2,
.doc-body h3,
.doc-body h4,
.doc-body h5,
.doc-body h6 {
  font-weight: 700;
  line-height: 1.35;
  margin-top: 1.6em;
  margin-bottom: 0.6em;
}

.doc-body > :first-child {
  margin-top: 0;
}

.doc-body h1 { font-size: 1.9em; }
.doc-body h2 { font-size: 1.5em; }
.doc-body h3 { font-size: 1.25em; }
.doc-body h4 { font-size: 1.1em; }
.doc-body h5,
.doc-body h6 { font-size: 1em; }

.doc-body h1,
.doc-body h2 {
  padding-bottom: 0.25em;
  border-bottom: 1px solid #e0e0e0;
}

.doc-body p {
  margin: 0 0 1em;
}

.doc-body a {
  color: #1a4fa0;
  text-decoration: underline;
}

.doc-body ul,
.doc-body ol {
  margin: 0 0 1em;
  padding-left: 1.5em;
}

.doc-body ul { list-style: disc; }
.doc-body ol { list-style: decimal; }
.doc-body li { margin: 0.25em 0; }
.doc-body li > ul,
.doc-body li > ol { margin-bottom: 0; }

.doc-body hr {
  border: 0;
  border-top: 1px solid #d8d8d8;
  margin: 2em 0;
}

/* 표 — 볼트의 49% 가 표를 쓴다. 인쇄 품질의 핵심. */
.doc-body table {
  width: 100%;
  border-collapse: collapse;
  margin: 0 0 1.2em;
  font-size: 0.92em;
}

.doc-body th,
.doc-body td {
  border: 1px solid #cfcfcf;
  padding: 0.45em 0.7em;
  text-align: left;
  vertical-align: top;
}

.doc-body th {
  background-color: #f4f4f4;
  font-weight: 700;
}

/* 코드 */
.doc-body code {
  font-family: ui-monospace, SFMono-Regular, Consolas, monospace;
  font-size: 0.88em;
  background-color: #f2f2f2;
  padding: 0.15em 0.35em;
  border-radius: 3px;
}

.doc-body pre {
  background-color: #f6f6f6;
  border: 1px solid #e2e2e2;
  border-radius: 4px;
  padding: 0.9em 1em;
  margin: 0 0 1.2em;
  overflow-x: auto;
}

.doc-body pre code {
  background-color: transparent;
  padding: 0;
  font-size: 0.85em;
  line-height: 1.55;
}

.doc-body img {
  max-width: 100%;
  height: auto;
  display: block;
  margin: 1em auto;
}

/* ---- 콜아웃 (remarkObsidian 이 data-callout 을 부여한다) ---- */

.doc-body blockquote {
  margin: 0 0 1.2em;
  padding: 0.6em 1em;
  border-left: 3px solid #c9c9c9;
  background-color: #fafafa;
}

.doc-body blockquote > :last-child {
  margin-bottom: 0;
}

/* 알 수 없는 타입은 위 기본값(회색)으로 폴백된다. */
.doc-body blockquote[data-callout='note'],
.doc-body blockquote[data-callout='info'],
.doc-body blockquote[data-callout='abstract'],
.doc-body blockquote[data-callout='summary'] {
  border-left-color: #2b6cb0;
  background-color: #eef4fb;
}

.doc-body blockquote[data-callout='tip'],
.doc-body blockquote[data-callout='success'],
.doc-body blockquote[data-callout='check'],
.doc-body blockquote[data-callout='done'] {
  border-left-color: #2f855a;
  background-color: #edf7f1;
}

.doc-body blockquote[data-callout='warning'],
.doc-body blockquote[data-callout='caution'],
.doc-body blockquote[data-callout='attention'] {
  border-left-color: #c05621;
  background-color: #fdf3ec;
}

.doc-body blockquote[data-callout='danger'],
.doc-body blockquote[data-callout='error'],
.doc-body blockquote[data-callout='failure'],
.doc-body blockquote[data-callout='bug'] {
  border-left-color: #c53030;
  background-color: #fdeded;
}

/* mermaid 다이어그램 */
.doc-body .mermaid-figure {
  margin: 1.2em 0;
  text-align: center;
}

.doc-body .mermaid-figure svg {
  max-width: 100%;
  height: auto;
}

/* 화면에서는 페이지 나눔 표식을 옅은 구분선으로 보여준다. */
.doc-body .page-break {
  height: 0;
  margin: 1.6em 0;
  border-top: 1px dashed #c0c0c0;
}
```

- [ ] **Step 2: `print.css` 를 작성한다**

`src/renderer/src/styles/print.css`:

```css
/*
 * 인쇄 전용. 모든 규칙은 반드시 @media print 안에 둔다.
 * (CLAUDE.md/PaperFlow 규칙: 인쇄 스타일이 화면 레이아웃을 깨뜨리지 말 것)
 */
@media print {
  @page {
    size: A4;
    margin: 20mm;
  }

  /* 문서 뷰가 열려 있으면 앱 UI 와 모달 배경을 숨기고 지면만 인쇄한다. */
  body.doc-view-open #root,
  body.doc-view-open .doc-overlay,
  body.doc-view-open .no-print {
    display: none !important;
  }

  /* @page 여백을 쓰므로 지면 자체 여백·폭·그림자를 해제한다. */
  body.doc-view-open .doc-sheet {
    width: auto;
    max-width: none;
    margin: 0;
    padding: 0;
    box-shadow: none;
  }

  body.doc-view-open .doc-modal {
    position: static !important;
    overflow: visible !important;
    inset: auto !important;
  }

  /* 요소 보호 — 페이지 경계에서 잘리면 안 되는 것들 */
  table,
  pre,
  img,
  figure,
  blockquote,
  .mermaid-figure {
    break-inside: avoid;
  }

  /* 제목이 페이지 끝에 홀로 남지 않게 한다 */
  h1,
  h2,
  h3,
  h4,
  h5,
  h6 {
    break-after: avoid;
  }

  /* 표 머리행을 페이지마다 반복한다 */
  thead {
    display: table-header-group;
  }

  /* 본문의 <!-- pagebreak --> 는 강제로 새 장에서 시작한다 */
  .page-break {
    break-before: page;
    border-top: 0 !important;
    margin: 0 !important;
  }
}
```

- [ ] **Step 3: `main.tsx` 에서 스타일을 불러온다**

`src/renderer/src/main.tsx` 의 첫 줄 다음에 두 줄을 추가한다. `globals.css` 뒤에 와야 Tailwind base reset을 덮어쓸 수 있다.

```ts
import './styles/globals.css'
import './styles/document.css'
import './styles/print.css'
```

- [ ] **Step 4: 빌드로 CSS 가 유효한지 확인한다**

```bash
npm run build
```
Expected: 통과. PostCSS 파싱 오류가 나면 해당 줄을 고친다.

- [ ] **Step 5: 커밋**

```bash
git add src/renderer/src/styles/document.css src/renderer/src/styles/print.css src/renderer/src/main.tsx
git commit -m "feat(doc-view): 지면·문서 타이포그래피·인쇄 CSS

- document.css: 210mm 지면 + 문서 타이포. 앱은 다크 전용이나 지면만 흰 배경
  (인쇄물 실물을 보여주는 것이 목적 — 설계 문서 10장의 의도적 예외).
  Tailwind Typography 플러그인 대신 직접 작성해 의존성 추가를 피함.
- print.css: 모든 규칙을 @media print 안에 격리. A4 20mm 여백,
  표/이미지/코드/콜아웃 break-inside:avoid, 제목 break-after:avoid,
  표 머리행 반복, .page-break 강제 개시.
- 인쇄 시 #root 와 모달 배경을 숨겨 지면만 출력되게 한다."
```

---

## Task 8: `Mermaid` 컴포넌트

**Files:**
- Create: `src/renderer/src/components/document/Mermaid.tsx`

**Interfaces:**
- Consumes: `mermaid` (동적 import)
- Produces:
  ```tsx
  interface MermaidProps {
    chart: string
    /** 렌더가 끝나면(성공·실패 무관) 정확히 한 번 호출된다. 인쇄 버튼 활성화 판단용. */
    onSettled?: () => void
  }
  export function Mermaid(props: MermaidProps): JSX.Element
  ```
  Task 9(`MarkdownDocument`)가 `language-mermaid` 코드블록을 만나면 이걸 쓴다.

**설계 근거:** `mermaid` 번들이 크므로 mermaid 블록이 실제로 있을 때만 `import()`한다. `securityLevel: 'strict'`는 PaperFlow와 동일하게 유지한다 — 나중에 같은 노트를 웹으로 공유했을 때 렌더 결과가 달라지면 안 되기 때문이다. 테마는 `default`(밝은 테마)를 쓴다. 지면이 흰 배경이기 때문이다.

**렌더 실패 시 원본 코드를 그대로 보여준다.** 조용히 숨기지 않는다(`CLAUDE.md` 규칙 12: 큰 소리로 실패).

- [ ] **Step 1: 컴포넌트를 작성한다**

`src/renderer/src/components/document/Mermaid.tsx`:

```tsx
import { useEffect, useId, useRef, useState } from 'react'

interface MermaidProps {
  chart: string
  /** 렌더가 끝나면(성공·실패 무관) 정확히 한 번 호출된다. */
  onSettled?: () => void
}

export function Mermaid({ chart, onSettled }: MermaidProps): JSX.Element {
  const [svg, setSvg] = useState<string | null>(null)
  const [failed, setFailed] = useState(false)
  const reactId = useId()
  const settledRef = useRef(false)
  const onSettledRef = useRef(onSettled)

  // 콜백이 매 렌더마다 새 함수여도 effect 가 재실행되지 않게 ref 에 보관한다.
  useEffect(() => {
    onSettledRef.current = onSettled
  }, [onSettled])

  useEffect(() => {
    let cancelled = false

    function settle(): void {
      if (settledRef.current) return
      settledRef.current = true
      onSettledRef.current?.()
    }

    async function render(): Promise<void> {
      try {
        const mermaid = (await import('mermaid')).default
        mermaid.initialize({
          startOnLoad: false,
          // PaperFlow 와 동일 설정 — 웹 공유 시 렌더 결과를 일치시키기 위함
          securityLevel: 'strict',
          // 지면이 흰 배경이므로 밝은 테마를 쓴다
          theme: 'default'
        })
        // mermaid 가 요구하는 유효한 DOM id 로 정규화한다 (useId 는 ':' 를 포함)
        const domId = `mermaid-${reactId.replace(/[^a-zA-Z0-9-]/g, '')}`
        const { svg: rendered } = await mermaid.render(domId, chart)
        if (cancelled) return
        setSvg(rendered)
        setFailed(false)
      } catch {
        if (cancelled) return
        setFailed(true)
      } finally {
        if (!cancelled) settle()
      }
    }

    setSvg(null)
    setFailed(false)
    settledRef.current = false
    void render()

    return () => {
      cancelled = true
      // 언마운트로 렌더가 중단돼도 인쇄 버튼이 영영 잠기지 않게 한다.
      settle()
    }
  }, [chart, reactId])

  if (failed) {
    // 조용히 숨기지 않는다 — 원본 코드를 그대로 보여준다.
    return (
      <pre>
        <code>{chart}</code>
      </pre>
    )
  }

  if (!svg) {
    return <div className="mermaid-figure text-sm text-muted-foreground">다이어그램 렌더 중…</div>
  }

  // mermaid 가 생성한 SVG 문자열. securityLevel:'strict' 로 스크립트가 제거된 상태다.
  return <div className="mermaid-figure" dangerouslySetInnerHTML={{ __html: svg }} />
}
```

- [ ] **Step 2: 타입 체크**

```bash
npm run typecheck
```
Expected: 오류 없음

- [ ] **Step 3: 린트**

```bash
npm run lint
```
Expected: 오류 없음. `dangerouslySetInnerHTML` 경고가 나오면 해당 줄에만 `eslint-disable-next-line` 주석을 달고 이유를 적는다.

- [ ] **Step 4: 커밋**

```bash
git add src/renderer/src/components/document/Mermaid.tsx
git commit -m "feat(doc-view): mermaid 다이어그램 렌더러

- 번들이 크므로 동적 import() — mermaid 블록이 있는 문서에서만 로드된다.
- securityLevel:'strict' 는 PaperFlow 와 동일 설정 유지.
  나중 웹 공유 시 로컬 문서 뷰와 렌더 결과가 어긋나지 않게 하기 위함.
- theme:'default' — 지면이 흰 배경이므로 밝은 테마.
- 렌더 실패 시 원본 코드블록을 그대로 노출한다(조용히 숨기지 않음).
- onSettled 는 성공·실패·언마운트 모두에서 한 번만 호출 —
  DocumentView 의 인쇄 버튼이 영영 잠기는 것을 방지."
```

---

## Task 9: `MarkdownDocument` — 렌더링 파이프라인

**Files:**
- Create: `src/renderer/src/components/document/MarkdownDocument.tsx`

**Interfaces:**
- Consumes: `remarkObsidian` (Task 2·3), `Mermaid` (Task 8), `AssetResolver` (Task 4), `react-markdown`/`remark-gfm`/`remark-breaks` (Task 1)
- Produces:
  ```tsx
  interface MarkdownDocumentProps {
    markdown: string
    notePath: string
    resolveAsset: AssetResolver
    onMermaidSettled?: () => void
  }
  export function MarkdownDocument(props: MarkdownDocumentProps): JSX.Element
  ```
  Task 10(`DocumentView`)이 지면 안에 이걸 넣는다.

> **플러그인 등록 형태를 반드시 지킬 것:** `remarkObsidian`은 옵션을 받아 transformer를 반환하는 attacher다. 튜플 `[remarkObsidian, options]` 로 등록해야 한다. `remarkObsidian({...})` 를 직접 배열에 넣으면 아무 변환도 일어나지 않는다(Task 2 참조).

- [ ] **Step 1: 컴포넌트를 작성한다**

`src/renderer/src/components/document/MarkdownDocument.tsx`:

```tsx
import { useMemo } from 'react'
import Markdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import remarkBreaks from 'remark-breaks'
import type { Components } from 'react-markdown'
import { remarkObsidian } from '../../lib/docRender/remarkObsidian'
import { Mermaid } from './Mermaid'
import type { AssetResolver } from '@renderer/types'

interface MarkdownDocumentProps {
  markdown: string
  /** 볼트 기준 노트 상대경로 — 이미지 상대경로 해석의 기준점 */
  notePath: string
  resolveAsset: AssetResolver
  onMermaidSettled?: () => void
}

export function MarkdownDocument({
  markdown,
  notePath,
  resolveAsset,
  onMermaidSettled
}: MarkdownDocumentProps): JSX.Element {
  const remarkPlugins = useMemo(
    () => [
      remarkGfm,
      remarkBreaks,
      // 튜플 형태로 등록해야 unified 가 attacher 로 인식한다.
      [remarkObsidian, { notePath, resolveAsset }] as const
    ],
    [notePath, resolveAsset]
  )

  const components = useMemo<Components>(
    () => ({
      code({ className, children, ...props }) {
        const isMermaid = typeof className === 'string' && className.includes('language-mermaid')
        if (isMermaid) {
          return <Mermaid chart={String(children).replace(/\n$/, '')} onSettled={onMermaidSettled} />
        }
        return (
          <code className={className} {...props}>
            {children}
          </code>
        )
      }
    }),
    [onMermaidSettled]
  )

  return (
    <div className="doc-body">
      <Markdown
        remarkPlugins={remarkPlugins as never}
        components={components}
        // raw HTML 은 렌더하지 않는다. <!-- pagebreak --> 는 remarkObsidian 이
        // mdast 단계에서 div 로 바꾸므로 raw HTML 활성화가 필요 없다.
      >
        {markdown}
      </Markdown>
    </div>
  )
}
```

> **`code` 렌더러 주의:** react-markdown 10 에서는 `inline` prop 이 없다. 펜스 코드블록만 `language-*` 클래스를 갖는다는 점을 이용해 mermaid 를 판별한다. mermaid 컴포넌트는 `<pre>` 안에 들어가므로, Task 7 의 `.doc-body .mermaid-figure` 스타일이 `<pre>` 내부에서도 적용된다.

- [ ] **Step 2: 타입 체크**

```bash
npm run typecheck
```
Expected: 오류 없음. `remarkPlugins` 타입이 맞지 않으면 `as never` 캐스트가 이미 들어가 있는지 확인한다(unified 의 `PluggableList` 는 튜플 추론이 까다롭다).

- [ ] **Step 3: 린트**

```bash
npm run lint
```
Expected: 오류 없음

- [ ] **Step 4: 커밋**

```bash
git add src/renderer/src/components/document/MarkdownDocument.tsx
git commit -m "feat(doc-view): react-markdown 렌더링 파이프라인

- remarkGfm(표) + remarkBreaks(줄바꿈) + remarkObsidian(임베드/위키링크/콜아웃)
- remarkObsidian 은 반드시 튜플 [plugin, options] 로 등록.
  직접 호출한 결과를 넣으면 unified 가 attacher 로 재호출해 변환이 사라진다.
- language-mermaid 코드블록만 Mermaid 컴포넌트로 치환.
- raw HTML 비활성 유지 — pagebreak 는 mdast 단계에서 div 로 변환되므로 불필요."
```

---

## Task 10: `DocumentView` 모달 + `NoteEditor` 진입 버튼

**Files:**
- Create: `src/renderer/src/components/document/DocumentView.tsx`
- Create: `tests/integration/document-view.test.tsx`
- Modify: `src/renderer/src/components/editor/NoteEditor.tsx`

**Interfaces:**
- Consumes: `MarkdownDocument` (Task 9), `noteToDocument`·`localResolver` (Task 4), `Dialog` 프리미티브 (`../ui/dialog`)
- Produces:
  ```tsx
  interface DocumentViewProps {
    note: Note
    open: boolean
    onOpenChange: (open: boolean) => void
  }
  export function DocumentView(props: DocumentViewProps): JSX.Element
  ```

**설계 근거 — Radix `DialogPrimitive.Content` 직접 사용:** `ui/dialog.tsx` 의 `DialogContent` 는 `max-w-lg` 중앙 정렬로 고정돼 있어 전체화면에 맞지 않는다. 클래스로 뒤집기보다 `DialogPortal`/`DialogOverlay` 는 재사용하고 `Content` 만 직접 쓰는 편이 명확하다. Radix 가 Esc 처리와 포커스 트랩을 제공하므로 스펙의 Esc 요구가 자동 충족된다.

**인쇄 게이팅:** 본문의 mermaid 블록 개수를 세고, 그만큼 `onMermaidSettled` 가 호출되기 전까지 인쇄 버튼을 비활성화한다. mermaid 가 SVG 로 그려지기 전에 인쇄하면 다이어그램이 빈 채로 출력되기 때문이다.

**`body.doc-view-open`:** `print.css` 가 인쇄 시 `#root` 를 숨기는 데 쓰는 훅이다. 모달이 열릴 때만 붙이고 닫히면 반드시 제거한다.

- [ ] **Step 1: 실패하는 통합 테스트를 작성한다**

`tests/integration/document-view.test.tsx`:

```tsx
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, cleanup } from '@testing-library/react'
import { DocumentView } from '../../src/renderer/src/components/document/DocumentView'
import type { Note } from '../../src/renderer/src/types'

function makeNote(overrides: Partial<Note> = {}): Note {
  return {
    filePath: 'C:/vault/folder/note.md',
    relativePath: 'folder/note.md',
    title: '설계 검토 보고서',
    status: 'in-progress',
    tags: [],
    created: '2026-04-01',
    body: '# 개요\n\n본문 내용입니다.',
    mtime: 1_700_000_000_000,
    ...overrides
  }
}

beforeEach(() => {
  window.print = vi.fn()
})

afterEach(() => {
  cleanup()
  document.body.classList.remove('doc-view-open')
  vi.restoreAllMocks()
})

describe('DocumentView', () => {
  it('열리면 제목과 본문을 지면에 렌더한다', () => {
    render(<DocumentView note={makeNote()} open onOpenChange={() => {}} />)
    expect(screen.getByText('개요')).toBeInTheDocument()
    expect(screen.getByText('본문 내용입니다.')).toBeInTheDocument()
  })

  it('GFM 표를 렌더한다', () => {
    const body = '| 항목 | 값 |\n| --- | --- |\n| 단열 | 0.15 |'
    render(<DocumentView note={makeNote({ body })} open onOpenChange={() => {}} />)
    expect(screen.getByRole('table')).toBeInTheDocument()
    expect(screen.getByText('0.15')).toBeInTheDocument()
  })

  it('위키링크를 볼드 텍스트로 렌더한다', () => {
    render(
      <DocumentView note={makeNote({ body: '[[ZEB 설계기준]] 참조' })} open onOpenChange={() => {}} />
    )
    const strong = screen.getByText('ZEB 설계기준')
    expect(strong.tagName).toBe('STRONG')
  })

  it('콜아웃에 data-callout 속성이 붙는다', () => {
    const body = '> [!warning] 설계 주의\n> 단열재 두께 확인'
    const { container } = render(
      <DocumentView note={makeNote({ body })} open onOpenChange={() => {}} />
    )
    expect(container.querySelector('blockquote[data-callout="warning"]')).not.toBeNull()
  })

  it('mermaid 가 없으면 인쇄 버튼이 즉시 활성화된다', () => {
    render(<DocumentView note={makeNote()} open onOpenChange={() => {}} />)
    expect(screen.getByRole('button', { name: /인쇄/ })).toBeEnabled()
  })

  it('mermaid 블록이 있으면 렌더 완료 전까지 인쇄 버튼이 비활성이다', () => {
    const body = '```mermaid\ngraph TD;\nA-->B;\n```'
    render(<DocumentView note={makeNote({ body })} open onOpenChange={() => {}} />)
    expect(screen.getByRole('button', { name: /인쇄/ })).toBeDisabled()
  })

  it('열려 있으면 body 에 doc-view-open 클래스가 붙는다', () => {
    render(<DocumentView note={makeNote()} open onOpenChange={() => {}} />)
    expect(document.body.classList.contains('doc-view-open')).toBe(true)
  })

  it('닫혀 있으면 doc-view-open 클래스가 없고 본문도 렌더되지 않는다', () => {
    render(<DocumentView note={makeNote()} open={false} onOpenChange={() => {}} />)
    expect(document.body.classList.contains('doc-view-open')).toBe(false)
    expect(screen.queryByText('본문 내용입니다.')).toBeNull()
  })
})
```

- [ ] **Step 2: 테스트를 실행해 실패를 확인한다**

```bash
npx vitest run tests/integration/document-view.test.tsx
```
Expected: FAIL — `DocumentView` 모듈 없음

- [ ] **Step 3: `DocumentView` 를 구현한다**

`src/renderer/src/components/document/DocumentView.tsx`:

```tsx
import { useCallback, useEffect, useMemo, useState } from 'react'
import * as DialogPrimitive from '@radix-ui/react-dialog'
import { Printer, X } from 'lucide-react'
import { Dialog, DialogPortal, DialogOverlay } from '../ui/dialog'
import { MarkdownDocument } from './MarkdownDocument'
import { noteToDocument } from '../../lib/docRender/noteToDocument'
import { localResolver } from '../../lib/docRender/resolveAsset'
import { cn } from '../../lib/utils'
import type { Note } from '@renderer/types'

interface DocumentViewProps {
  note: Note
  open: boolean
  onOpenChange: (open: boolean) => void
}

const MERMAID_FENCE_RE = /^\s*```mermaid/gm

function countMermaidBlocks(markdown: string): number {
  MERMAID_FENCE_RE.lastIndex = 0
  return markdown.match(MERMAID_FENCE_RE)?.length ?? 0
}

export function DocumentView({ note, open, onOpenChange }: DocumentViewProps): JSX.Element {
  const doc = useMemo(() => noteToDocument(note), [note])
  const mermaidCount = useMemo(() => countMermaidBlocks(doc.markdown), [doc.markdown])
  const [settledCount, setSettledCount] = useState(0)

  const canPrint = settledCount >= mermaidCount

  // 문서가 바뀌면 게이트를 다시 잠근다.
  useEffect(() => {
    setSettledCount(0)
  }, [doc.markdown])

  // print.css 가 인쇄 시 #root 를 숨기는 데 쓰는 훅.
  useEffect(() => {
    if (!open) return
    document.body.classList.add('doc-view-open')
    return () => {
      document.body.classList.remove('doc-view-open')
    }
  }, [open])

  const handleMermaidSettled = useCallback(() => {
    setSettledCount((n) => n + 1)
  }, [])

  const handlePrint = useCallback(() => {
    window.print()
  }, [])

  // Ctrl/Cmd+P 를 가로채 같은 인쇄 경로로 보낸다.
  useEffect(() => {
    if (!open) return
    const onKeyDown = (e: KeyboardEvent): void => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'p') {
        e.preventDefault()
        if (canPrint) window.print()
      }
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [open, canPrint])

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogPortal>
        <DialogOverlay className="doc-overlay" />
        <DialogPrimitive.Content
          className="doc-modal fixed inset-0 z-50 flex flex-col focus-visible:outline-none"
          aria-describedby={undefined}
        >
          <DialogPrimitive.Title className="sr-only">{doc.title}</DialogPrimitive.Title>

          {/* 툴바 — 인쇄에서 제외 */}
          <div className="no-print flex items-center justify-between gap-3 border-b border-border bg-card px-4 py-2">
            <span className="truncate text-sm font-medium text-foreground">{doc.title}</span>
            <div className="flex items-center gap-1">
              <button
                onClick={handlePrint}
                disabled={!canPrint}
                title={canPrint ? '인쇄 / PDF로 저장 (Ctrl+P)' : '다이어그램 렌더 중…'}
                className="flex items-center gap-1.5 rounded-md px-2.5 py-1.5 text-xs text-muted-foreground transition-colors hover:bg-muted hover:text-foreground disabled:opacity-30"
              >
                <Printer size={14} />
                인쇄 / PDF
              </button>
              <DialogPrimitive.Close
                title="닫기 (Esc)"
                aria-label="닫기"
                className="rounded-md p-1.5 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
              >
                <X size={14} />
              </DialogPrimitive.Close>
            </div>
          </div>

          {/* 지면 영역 */}
          <div className={cn('flex-1 min-h-0 overflow-auto bg-muted py-8')}>
            <article className="doc-sheet">
              <MarkdownDocument
                markdown={doc.markdown}
                notePath={note.relativePath}
                resolveAsset={localResolver}
                onMermaidSettled={handleMermaidSettled}
              />
            </article>
          </div>
        </DialogPrimitive.Content>
      </DialogPortal>
    </Dialog>
  )
}
```

- [ ] **Step 4: 테스트를 실행해 통과를 확인한다**

```bash
npx vitest run tests/integration/document-view.test.tsx
```
Expected: PASS — 8개 전부 통과

- [ ] **Step 5: `NoteEditor` 에 진입 버튼을 추가한다**

`src/renderer/src/components/editor/NoteEditor.tsx` 를 **네 군데만** 고친다. 나머지는 건드리지 않는다.

**(1)** lucide 아이콘 import 목록(3–20번 줄)에 `FileText` 를 추가한다.

**(2)** import 블록 끝(`import type { Note, Status, Priority }` 다음)에 추가:

```ts
import { DocumentView } from '../document/DocumentView'
```

**(3)** `const [preview, setPreview] = useState<PreviewMode>('edit')` 다음 줄에 추가:

```ts
  const [docOpen, setDocOpen] = useState(false)
```

**(4)** 툴바에서 미리보기 모드 토글 `</div>` 바로 다음, `저장` 버튼 `<button>` 바로 앞에 추가:

```tsx
          <button
            onClick={() => setDocOpen(true)}
            title="문서 보기 (A4 인쇄용)"
            className="p-1.5 rounded hover:bg-muted text-muted-foreground transition-colors"
          >
            <FileText size={14} />
          </button>
```

**(5)** 컴포넌트의 최상위 반환 `<div className="flex flex-col h-full ...">` 안, 맨 끝(`{/* Scrollable content */}` 블록의 닫는 `</div>` 다음, 최상위 `</div>` 앞)에 추가:

```tsx
      <DocumentView note={draft} open={docOpen} onOpenChange={setDocOpen} />
```

> `draft` 를 넘기는 이유: 저장 전 편집 중인 내용을 그대로 문서로 확인할 수 있어야 한다. `selectedNote` 를 넘기면 마지막 저장본만 보인다.

- [ ] **Step 6: 전체 테스트와 타입 체크**

```bash
npm test
npm run typecheck
npm run lint
```
Expected: 전부 통과

- [ ] **Step 7: 실제 앱에서 육안 확인**

```bash
npm run dev
```

다음을 직접 확인한다. 하나라도 실패하면 커밋하지 말고 원인을 찾는다.

1. 칸반에서 카드를 열고 툴바의 문서 아이콘을 누르면 전체화면 지면이 뜬다
2. 표가 있는 노트에서 표에 테두리가 보인다
3. **이미지가 있는 노트에서 이미지가 실제로 표시된다** — 안 보이면 DevTools 콘솔에서 CSP 위반 메시지를 확인한다 (Task 6 Step 3 누락 여부)
4. 콜아웃이 있는 노트에서 `[!warning]` 문자열이 보이지 않고 좌측에 색상 바가 있다
5. mermaid가 있는 노트에서 다이어그램이 그려지고, 그 전까지 인쇄 버튼이 비활성이다
6. `Esc` 로 닫힌다
7. 인쇄 버튼을 눌러 인쇄 미리보기에서 **칸반 보드가 아니라 지면만** A4로 보인다

- [ ] **Step 8: 커밋**

```bash
git add src/renderer/src/components/document/DocumentView.tsx tests/integration/document-view.test.tsx src/renderer/src/components/editor/NoteEditor.tsx
git commit -m "feat(doc-view): 전체화면 문서 뷰 모달 + 편집기 진입 버튼

- Radix Dialog 프리미티브 직접 사용(DialogContent 는 max-w-lg 고정이라 부적합).
  Esc 처리와 포커스 트랩을 Radix 가 제공한다.
- 인쇄 게이팅: 본문의 mermaid 블록 수만큼 onSettled 가 오기 전까지 인쇄 버튼 비활성.
  SVG 렌더 전에 인쇄하면 다이어그램이 빈 채로 출력되기 때문.
- body.doc-view-open: print.css 가 인쇄 시 #root 를 숨기는 훅. 닫힐 때 반드시 제거.
- NoteEditor 는 아이콘 버튼 1개와 모달 마운트만 추가. 기존 3모드 토글은 그대로 둔다.
- draft 를 넘겨 저장 전 편집 내용도 문서로 확인 가능하게 한다."
```

---

## Self-Review 결과

계획 작성 후 스펙과 대조한 결과다.

### 1. 스펙 커버리지

| 스펙 항목 | 구현 Task |
|---|---|
| 2장 포함 범위 — 전체화면 문서 뷰 | Task 10 |
| 2장 — GFM 표 · soft break | Task 9 |
| 2장 — mermaid | Task 8, 9 |
| 2장 — 이미지 임베드 | Task 2, 5, 6 |
| 2장 — 위키링크 | Task 2 |
| 2장 — 콜아웃 | Task 3, 7 |
| 2장 — A4 인쇄 CSS | Task 7 |
| 2장 — URL 공유 경계 | Task 4 |
| 2장 제외 항목 (HtmlView·printToPDF·수식·페이지 분할 표시) | 어느 Task에도 없음 — 의도대로 |
| 5장 `remarkObsidian` 규칙 전부 | Task 2, 3 |
| 6장 프로토콜 · 해석 순서 · 지연 인덱스 | Task 5, 6 |
| 6장 경로 탈출 방지 | Task 5 (테스트 5종) |
| 7장 `AssetResolver` · `noteToDocument` | Task 4 |
| 8장 인쇄 · pagebreak · mermaid 게이팅 | Task 3, 7, 10 |
| 9장 mermaid 동적 import · strict · 실패 시 원본 노출 | Task 8 |
| 10장 UI 규칙 · 흰 지면 · Esc · Ctrl+P | Task 7, 10 |
| 11장 의존성 + ADR-024 + phantom dep 정리 | Task 1 |
| 12장 테스트 목록 | Task 2·3·4·5·10 |

**보완한 누락 1건:** 스펙에 없던 **CSP `img-src` 수정**을 Task 6 Step 3으로 추가했다. `index.html`의 `img-src 'self' data:` 를 고치지 않으면 `vault-img://` 이미지가 전부 차단되어 6장 전체가 무력화된다.

### 2. 플레이스홀더 점검

"TBD"·"적절히 처리"·"위와 유사" 같은 표현 없음. 모든 코드 단계에 실제 코드가 들어 있다.

### 3. 타입 일관성 점검

- `AssetResolver` — Task 2 Step 1에서 `types/index.ts`에 **한 번만** 정의한다. Task 4는 이를 import해 쓸 뿐 다시 정의하지 않는다. (초안에서는 Task 2가 `remarkObsidian.ts`에 자체 정의하고 Task 4가 옮기는 구조였으나, 이는 Global Constraint "타입은 `types/index.ts`에만 정의"(ADR-019)와 충돌하므로 사전 스캔에서 바로잡았다.)
- `remarkObsidian(options)` 시그니처 — Task 2 정의, Task 3 확장, Task 9 사용. 튜플 등록 형태가 세 곳 모두 일치.
- `onSettled`(Mermaid) ↔ `onMermaidSettled`(MarkdownDocument·DocumentView) — 이름이 다르지만 경계마다 의도적으로 다른 이름이며, Task 8·9·10에서 전달 관계가 명시돼 있다.
- `resolveVaultAsset(vaultPath, notePath, target)` — Task 5 정의, Task 6 호출. 인자 순서 일치.
- `.doc-sheet`·`.doc-body`·`.doc-overlay`·`.doc-modal`·`.no-print`·`.page-break`·`.mermaid-figure` — Task 7 정의, Task 8·10 사용. 전부 일치.

---

## 실행 순서 요약

```
Task 1  의존성 + ADR-024
   ↓
Task 2  remarkObsidian — 임베드·위키링크
   ↓
Task 3  remarkObsidian — 콜아웃·pagebreak
   ↓
Task 4  AssetResolver + noteToDocument + 타입     ← 웹 공유 경계
   ↓
Task 5  메인 경로 해석 + 탈출 방지                 ← 보안
   ↓
Task 6  vault-img 프로토콜 + CSP                  ← 빠뜨리면 이미지 전부 차단
   ↓
Task 7  document.css + print.css
   ↓
Task 8  Mermaid
   ↓
Task 9  MarkdownDocument
   ↓
Task 10 DocumentView + NoteEditor 진입            ← 육안 확인 필수
```

Task 1–7은 앞 Task에만 의존하므로 순서대로 진행한다. Task 8은 Task 1 이후 언제든 가능하다.
