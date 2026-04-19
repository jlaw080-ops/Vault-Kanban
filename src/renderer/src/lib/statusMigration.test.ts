import { describe, it, expect } from 'vitest'
import { scanStatusValues, suggestMapping, applyMapping } from './statusMigration'
import type { Note } from '@renderer/types'

function makeNote(overrides: Omit<Partial<Note>, 'status'> & { status?: string | null }): Note {
  return {
    filePath: '/vault/test.md',
    relativePath: 'test.md',
    title: 'Test',
    status: (overrides.status ?? '백로그') as Note['status'],
    tags: [],
    created: '2024-01-01',
    body: '',
    mtime: 0,
    ...overrides
  } as Note
}

describe('scanStatusValues', () => {
  it('counts occurrences of each status value', () => {
    const notes = [
      makeNote({ status: '진행중' }),
      makeNote({ status: '진행중' }),
      makeNote({ status: '백로그' }),
      makeNote({ status: 'TBD' })
    ]
    const result = scanStatusValues(notes)
    expect(result.get('진행중')).toBe(2)
    expect(result.get('백로그')).toBe(1)
    expect(result.get('TBD')).toBe(1)
  })

  it('counts null/empty status as null key', () => {
    const notes = [makeNote({ status: '' }), makeNote({ status: undefined as unknown as string })]
    const result = scanStatusValues(notes)
    expect(result.get(null)).toBeGreaterThanOrEqual(1)
  })

  it('returns empty map for empty notes array', () => {
    expect(scanStatusValues([]).size).toBe(0)
  })

  it('includes already-standard values in the scan', () => {
    const notes = ['백로그', '예정', '진행중', '검토', '완료'].map((s) => makeNote({ status: s }))
    const result = scanStatusValues(notes)
    expect(result.size).toBe(5)
  })
})

describe('suggestMapping', () => {
  it('maps already-standard values to themselves', () => {
    expect(suggestMapping('백로그')).toBe('백로그')
    expect(suggestMapping('예정')).toBe('예정')
    expect(suggestMapping('진행중')).toBe('진행중')
    expect(suggestMapping('검토')).toBe('검토')
    expect(suggestMapping('완료')).toBe('완료')
  })

  it('maps common English values', () => {
    expect(suggestMapping('in progress')).toBe('진행중')
    expect(suggestMapping('In Progress')).toBe('진행중')
    expect(suggestMapping('done')).toBe('완료')
    expect(suggestMapping('Done')).toBe('완료')
    expect(suggestMapping('todo')).toBe('백로그')
    expect(suggestMapping('TODO')).toBe('백로그')
    expect(suggestMapping('backlog')).toBe('백로그')
    expect(suggestMapping('review')).toBe('검토')
    expect(suggestMapping('planned')).toBe('예정')
  })

  it('maps common Korean variants', () => {
    expect(suggestMapping('진행')).toBe('진행중')
    expect(suggestMapping('완료됨')).toBe('완료')
    expect(suggestMapping('검토중')).toBe('검토')
  })

  it('returns ask for unrecognized values', () => {
    expect(suggestMapping('TBD')).toBe('ask')
    expect(suggestMapping('홀드')).toBe('ask')
    expect(suggestMapping('somerandvalue')).toBe('ask')
  })

  it('returns skip for null/empty', () => {
    expect(suggestMapping(null)).toBe('skip')
    expect(suggestMapping('')).toBe('skip')
  })
})

describe('applyMapping', () => {
  it('transforms note status per mapping', () => {
    const note = makeNote({ status: 'TBD' })
    const mapping = new Map<string | null, Note['status'] | 'skip'>([['TBD', '백로그']])
    const result = applyMapping(note, mapping)
    expect(result.status).toBe('백로그')
  })

  it('leaves note unchanged when mapping is skip', () => {
    const note = makeNote({ status: 'TBD' })
    const mapping = new Map<string | null, Note['status'] | 'skip'>([['TBD', 'skip']])
    const result = applyMapping(note, mapping)
    expect(result.status).toBe('TBD')
  })

  it('leaves note unchanged when value is not in mapping', () => {
    const note = makeNote({ status: '백로그' })
    const mapping = new Map<string | null, Note['status'] | 'skip'>()
    const result = applyMapping(note, mapping)
    expect(result.status).toBe('백로그')
  })

  it('does not mutate the original note', () => {
    const note = makeNote({ status: 'TBD' })
    const mapping = new Map<string | null, Note['status'] | 'skip'>([['TBD', '백로그']])
    applyMapping(note, mapping)
    expect(note.status).toBe('TBD')
  })

  it('preserves all other note fields', () => {
    const note = makeNote({ status: 'done', title: 'My Note', tags: ['a', 'b'] })
    const mapping = new Map<string | null, Note['status'] | 'skip'>([['done', '완료']])
    const result = applyMapping(note, mapping)
    expect(result.title).toBe('My Note')
    expect(result.tags).toEqual(['a', 'b'])
  })

  it('keeps status unchanged if already standard and in mapping as itself', () => {
    const note = makeNote({ status: '완료' })
    const mapping = new Map<string | null, Note['status'] | 'skip'>([['완료', '완료']])
    const result = applyMapping(note, mapping)
    expect(result.status).toBe('완료')
  })
})
