import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, cleanup, waitFor } from '@testing-library/react'
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
      <DocumentView
        note={makeNote({ body: '[[ZEB 설계기준]] 참조' })}
        open
        onOpenChange={() => {}}
      />
    )
    const strong = screen.getByText('ZEB 설계기준')
    expect(strong.tagName).toBe('STRONG')
  })

  it('콜아웃에 data-callout 속성이 붙는다', () => {
    const body = '> [!warning] 설계 주의\n> 단열재 두께 확인'
    render(<DocumentView note={makeNote({ body })} open onOpenChange={() => {}} />)
    // Radix Dialog 는 포털로 document.body 에 붙는다 — render() 의 container 에는 없다.
    const quote = document.body.querySelector('blockquote[data-callout="warning"]')
    expect(quote).not.toBeNull()
    // [!warning] 표식은 제목으로 흡수되고 화면에 남지 않는다.
    expect(quote?.textContent).not.toContain('[!warning]')
  })

  it('이미지 임베드가 vault-img URL 로 렌더된다', () => {
    render(
      <DocumentView note={makeNote({ body: '![[평면도.png]]' })} open onOpenChange={() => {}} />
    )
    const img = document.body.querySelector('.doc-body img')
    expect(img).not.toBeNull()
    // react-markdown 의 기본 urlTransform 은 허용 프로토콜 화이트리스트
    // (https?|ircs?|mailto|xmpp) 밖의 URL 을 빈 문자열로 지운다.
    // vault-img: 를 통과시키지 않으면 src 가 '' 이 되어 이미지가 안 뜬다.
    expect(img?.getAttribute('src')).toMatch(/^vault-img:\/\/asset\/\?/)
  })

  it('위험한 프로토콜은 계속 차단한다', () => {
    render(
      <DocumentView
        note={makeNote({ body: '![x](javascript:alert(1))' })}
        open
        onOpenChange={() => {}}
      />
    )
    const img = document.body.querySelector('.doc-body img')
    expect(img?.getAttribute('src')).toBe('')
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

  it('다른 노트로 바뀌면 인쇄 게이트가 다시 잠긴다', async () => {
    // 첫 노트의 mermaid 가 끝나 버튼이 열린 뒤에 전환해야 재잠금이 검증된다.
    // (첫 노트에 mermaid 가 없으면 카운트가 0이라 재잠금 없이도 비활성이라 무의미하다)
    const first = makeNote({ body: '```mermaid\ngraph TD;\nA-->B;\n```' })
    const { rerender } = render(<DocumentView note={first} open onOpenChange={() => {}} />)
    expect(screen.getByRole('button', { name: /인쇄/ })).toBeDisabled()
    await waitFor(
      () => {
        expect(screen.getByRole('button', { name: /인쇄/ })).toBeEnabled()
      },
      { timeout: 15_000 }
    )

    const second = makeNote({ body: '```mermaid\ngraph LR;\nX-->Y;\n```' })
    rerender(<DocumentView note={second} open onOpenChange={() => {}} />)
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
