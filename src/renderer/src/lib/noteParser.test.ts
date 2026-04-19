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

describe('parseNote — originalKeyOrder 캡처', () => {
  it('parseNote는 frontmatter의 원본 키 순서를 originalKeyOrder에 보존한다', () => {
    const raw = `---
status: 진행중
title: 키순서 테스트
tags: [a]
created: 2026-04-01
priority: mid
---
본문`
    const note = parseNote('/v/t.md', raw, MTIME)
    expect(note.originalKeyOrder).toEqual(['status', 'title', 'tags', 'created', 'priority'])
  })

  it('frontmatter가 없으면 originalKeyOrder는 빈 배열 또는 undefined이다', () => {
    const note = parseNote('/v/t.md', '본문만', MTIME)
    expect(note.originalKeyOrder ?? []).toEqual([])
  })

  it('알려지지 않은 사용자 정의 키도 originalKeyOrder에 포함된다', () => {
    const raw = `---
title: t
status: 백로그
custom_field: hello
another_custom: world
---
본문`
    const note = parseNote('/v/t.md', raw, MTIME)
    expect(note.originalKeyOrder).toContain('custom_field')
    expect(note.originalKeyOrder).toContain('another_custom')
  })
})

describe('serializeNote — YAML 키 순서 보존', () => {
  it('originalKeyOrder가 있으면 그 순서대로 키를 출력한다', () => {
    const raw = `---
status: 진행중
title: 순서보존
created: 2026-04-01
tags: [x]
---
본문`
    const note = parseNote('/v/t.md', raw, MTIME)
    const out = serializeNote(note)

    const statusIdx = out.indexOf('status:')
    const titleIdx = out.indexOf('title:')
    const createdIdx = out.indexOf('created:')
    const tagsIdx = out.indexOf('tags:')

    expect(statusIdx).toBeGreaterThan(0)
    expect(statusIdx).toBeLessThan(titleIdx)
    expect(titleIdx).toBeLessThan(createdIdx)
    expect(createdIdx).toBeLessThan(tagsIdx)
  })

  it('새 필드(started/completed)가 원본에 없었다면 마지막에 추가된다', () => {
    const raw = `---
title: t
status: 백로그
created: 2026-04-01
tags: [a]
---
본문`
    const note = parseNote('/v/t.md', raw, MTIME)
    const updated = { ...note, status: '진행중' as const, started: '2026-04-19T10:00:00.000Z' }
    const out = serializeNote(updated)

    const tagsIdx = out.indexOf('tags:')
    const startedIdx = out.indexOf('started:')

    expect(startedIdx).toBeGreaterThan(0)
    expect(startedIdx).toBeGreaterThan(tagsIdx)
  })

  it('round-trip parse → serialize → parse 시 키 순서가 유지된다', () => {
    const raw = `---
status: 검토
title: 라운드트립
priority: high
tags: [zeb, passive]
created: 2026-04-01
project: ENERGINNO
---
본문 그대로`
    const first = parseNote('/v/t.md', raw, MTIME)
    const out = serializeNote(first)
    const second = parseNote('/v/t.md', out, MTIME)

    expect(second.originalKeyOrder).toEqual(first.originalKeyOrder)
    expect(second.title).toBe(first.title)
    expect(second.status).toBe(first.status)
    expect(second.priority).toBe(first.priority)
    expect(second.tags).toEqual(first.tags)
    expect(second.created).toBe(first.created)
    expect(second.project).toBe(first.project)
  })

  it('originalKeyOrder가 없으면 기본 순서로 폴백한다', () => {
    const note = {
      filePath: '/v/t.md',
      relativePath: 't.md',
      title: 'no-order',
      status: '백로그' as const,
      tags: ['x'],
      created: '2026-04-01',
      body: '본문',
      mtime: MTIME
    }
    const out = serializeNote(note)
    expect(out).toContain('title:')
    expect(out).toContain('status:')
    expect(out).toContain('tags:')
    expect(out).toContain('created:')
    expect(out).toContain('본문')
  })

  it('본문(body)은 직렬화 후에도 변하지 않는다', () => {
    const raw = `---
title: t
status: 백로그
tags: []
created: 2026-04-01
---
첫 줄

두 번째 줄
- 목록 항목`
    const note = parseNote('/v/t.md', raw, MTIME)
    const out = serializeNote(note)
    const reparsed = parseNote('/v/t.md', out, MTIME)
    expect(reparsed.body).toBe(note.body)
  })
})
