import { describe, it, expect } from 'vitest'
import { parseNote, serializeNote } from './noteParser'

const MTIME = 1_700_000_000_000

describe('parseNote', () => {
  it('frontmatter가 있는 노트의 모든 필드를 파싱한다', () => {
    const raw = `---
title: ZEB 인증 검토
status: 진행중
priority: high
due: 2026-05-01
tags: [zeb, passive]
project: ENERGINNO
created: 2026-04-01
started: 2026-04-10
completed: null
---
본문 내용입니다.

여러 줄.`

    const note = parseNote('C:/vault/01_Projects/zeb.md', raw, MTIME)

    expect(note.filePath).toBe('C:/vault/01_Projects/zeb.md')
    expect(note.title).toBe('ZEB 인증 검토')
    expect(note.status).toBe('진행중')
    expect(note.priority).toBe('high')
    expect(note.due).toBe('2026-05-01')
    expect(note.tags).toEqual(['zeb', 'passive'])
    expect(note.project).toBe('ENERGINNO')
    expect(note.created).toBe('2026-04-01')
    expect(note.started).toBe('2026-04-10')
    expect(note.completed).toBeNull()
    expect(note.body).toBe('본문 내용입니다.\n\n여러 줄.')
    expect(note.mtime).toBe(MTIME)
    expect(note.parseError).toBeUndefined()
  })

  it('frontmatter가 없는 노트는 백로그 + 파일명을 title로 사용한다', () => {
    const raw = '본문만 있는 노트.'

    const note = parseNote('C:/vault/notes/quick-idea.md', raw, MTIME)

    expect(note.status).toBe('백로그')
    expect(note.title).toBe('quick-idea')
    expect(note.tags).toEqual([])
    expect(note.body).toBe('본문만 있는 노트.')
    expect(note.parseError).toBeUndefined()
  })

  it('frontmatter 파싱 실패 시 parseError 필드를 세팅한다', () => {
    const raw = `---
title: broken
status: : : invalid yaml :
  - item without proper structure
    bad indent
---
본문`

    const note = parseNote('C:/vault/notes/broken.md', raw, MTIME)

    expect(note.parseError).toBeDefined()
    expect(typeof note.parseError).toBe('string')
    expect(note.title).toBe('broken')
    expect(note.status).toBe('백로그')
  })

  it('title이 없으면 파일명(확장자 제외)을 사용한다', () => {
    const raw = `---
status: 예정
tags: [idea]
---
본문`

    const note = parseNote('C:/vault/inbox/2026-04-19 회의.md', raw, MTIME)

    expect(note.title).toBe('2026-04-19 회의')
    expect(note.status).toBe('예정')
  })

  it('relativePath가 비어있으면 filePath의 basename을 사용한다', () => {
    const raw = '본문'
    const note = parseNote('C:/vault/file.md', raw, MTIME)
    expect(note.relativePath).toBeDefined()
  })

  it('tags가 문자열이면 배열로 정규화한다', () => {
    const raw = `---
title: t
tags: zeb
---`
    const note = parseNote('/v/t.md', raw, MTIME)
    expect(note.tags).toEqual(['zeb'])
  })

  it('알 수 없는 status는 백로그로 폴백한다', () => {
    const raw = `---
title: t
status: 알수없음
---`
    const note = parseNote('/v/t.md', raw, MTIME)
    expect(note.status).toBe('백로그')
  })
})

describe('serializeNote (Phase 2 stub)', () => {
  it('Note 객체를 마크다운 문자열로 직렬화한다', () => {
    const note = parseNote(
      '/v/t.md',
      `---
title: hello
status: 진행중
tags: [a, b]
---
본문`,
      MTIME
    )
    const out = serializeNote(note)
    expect(out).toContain('---')
    expect(out).toContain('title: hello')
    expect(out).toContain('본문')
  })
})
