import { describe, it, expect } from 'vitest'
import { groupNotes, sortNotes, filterNotes } from './viewModel'
import type { Note } from '@renderer/types'

function makeNote(overrides: Partial<Note> & { filePath: string }): Note {
  return {
    relativePath: overrides.filePath,
    title: 'Untitled',
    status: '백로그',
    tags: [],
    body: '',
    created: '2024-01-01T00:00:00Z',
    mtime: new Date('2024-01-05T00:00:00Z').getTime(),
    started: null,
    completed: null,
    ...overrides
  }
}

const notes: Note[] = [
  makeNote({
    filePath: '/vault/A/note1.md',
    relativePath: 'A/note1.md',
    status: '백로그',
    tags: ['alpha'],
    project: 'proj-A',
    title: 'Alpha Note',
    mtime: new Date('2024-01-10').getTime()
  }),
  makeNote({
    filePath: '/vault/A/note2.md',
    relativePath: 'A/note2.md',
    status: '진행중',
    tags: ['beta'],
    project: 'proj-B',
    title: 'Beta Note',
    mtime: new Date('2024-01-08').getTime()
  }),
  makeNote({
    filePath: '/vault/B/note3.md',
    relativePath: 'B/note3.md',
    status: '완료',
    tags: ['alpha', 'gamma'],
    title: 'Gamma Note',
    mtime: new Date('2024-01-06').getTime()
  }),
  makeNote({
    filePath: '/vault/B/note4.md',
    relativePath: 'B/note4.md',
    status: '검토',
    tags: [],
    priority: 'high',
    title: 'Delta Note',
    mtime: new Date('2024-01-04').getTime()
  })
]

describe('groupNotes', () => {
  it('status 그룹핑: 각 상태별로 묶임', () => {
    const groups = groupNotes(notes, 'status')
    expect(groups.get('백로그')?.length).toBe(1)
    expect(groups.get('진행중')?.length).toBe(1)
    expect(groups.get('완료')?.length).toBe(1)
    expect(groups.get('검토')?.length).toBe(1)
  })

  it('tag 그룹핑: 여러 태그가 있으면 중복 포함', () => {
    const groups = groupNotes(notes, 'tag')
    expect(groups.get('alpha')?.length).toBe(2) // note1, note3
    expect(groups.get('beta')?.length).toBe(1)
    expect(groups.get('gamma')?.length).toBe(1)
    expect(groups.get('(태그 없음)')?.length).toBe(1) // note4
  })

  it('folder 그룹핑: 상위 폴더 기준', () => {
    const groups = groupNotes(notes, 'folder')
    expect(groups.get('A')?.length).toBe(2)
    expect(groups.get('B')?.length).toBe(2)
  })

  it('project 그룹핑: project 필드 기준, 없으면 미분류', () => {
    const groups = groupNotes(notes, 'project')
    expect(groups.get('proj-A')?.length).toBe(1)
    expect(groups.get('proj-B')?.length).toBe(1)
    expect(groups.get('(미분류)')?.length).toBe(2) // note3, note4
  })
})

describe('sortNotes', () => {
  it('modifiedDesc: mtime 내림차순', () => {
    const sorted = sortNotes(notes, 'modifiedDesc')
    expect(sorted[0].title).toBe('Alpha Note')
    expect(sorted[3].title).toBe('Delta Note')
  })

  it('modifiedAsc: mtime 오름차순', () => {
    const sorted = sortNotes(notes, 'modifiedAsc')
    expect(sorted[0].title).toBe('Delta Note')
    expect(sorted[3].title).toBe('Alpha Note')
  })

  it('titleAsc: 제목 오름차순', () => {
    const sorted = sortNotes(notes, 'titleAsc')
    expect(sorted[0].title).toBe('Alpha Note')
    expect(sorted[1].title).toBe('Beta Note')
  })

  it('createdDesc: created 내림차순 (동일한 경우 순서 유지)', () => {
    const sorted = sortNotes(notes, 'createdDesc')
    expect(sorted).toHaveLength(4)
  })

  it('dueAsc: due 오름차순, due 없는 노트는 맨 뒤', () => {
    const withDue: Note[] = [
      makeNote({ filePath: '/a.md', due: '2024-03-01' }),
      makeNote({ filePath: '/b.md', due: '2024-01-15' }),
      makeNote({ filePath: '/c.md' })
    ]
    const sorted = sortNotes(withDue, 'dueAsc')
    expect(sorted[0].filePath).toBe('/b.md')
    expect(sorted[1].filePath).toBe('/a.md')
    expect(sorted[2].filePath).toBe('/c.md')
  })
})

describe('filterNotes', () => {
  it('키워드 필터: 제목 포함 검색', () => {
    const result = filterNotes(notes, { tags: [], folders: [], priority: 'all', keyword: 'Alpha' })
    expect(result).toHaveLength(1)
    expect(result[0].title).toBe('Alpha Note')
  })

  it('키워드 필터: 대소문자 무시', () => {
    const result = filterNotes(notes, { tags: [], folders: [], priority: 'all', keyword: 'alpha' })
    expect(result).toHaveLength(1)
  })

  it('태그 AND 필터: 모든 태그 포함된 노트만', () => {
    const result = filterNotes(notes, {
      tags: ['alpha', 'gamma'],
      folders: [],
      priority: 'all',
      keyword: ''
    })
    expect(result).toHaveLength(1) // note3만 alpha + gamma 둘 다 가짐
  })

  it('폴더 OR 필터: 지정 폴더 중 하나라도 일치하면 포함', () => {
    const result = filterNotes(notes, { tags: [], folders: ['A'], priority: 'all', keyword: '' })
    expect(result).toHaveLength(2)
  })

  it('우선순위 필터: high만', () => {
    const result = filterNotes(notes, { tags: [], folders: [], priority: 'high', keyword: '' })
    expect(result).toHaveLength(1)
    expect(result[0].title).toBe('Delta Note')
  })

  it('우선순위 필터: none = 우선순위 없는 노트만', () => {
    const result = filterNotes(notes, { tags: [], folders: [], priority: 'none', keyword: '' })
    expect(result.every((n) => !n.priority)).toBe(true)
  })

  it('all 우선순위 필터: 전체 반환', () => {
    const result = filterNotes(notes, { tags: [], folders: [], priority: 'all', keyword: '' })
    expect(result).toHaveLength(4)
  })

  it('복합 필터: 태그 + 폴더', () => {
    const result = filterNotes(notes, {
      tags: ['alpha'],
      folders: ['A'],
      priority: 'all',
      keyword: ''
    })
    expect(result).toHaveLength(1) // note1: A 폴더에 alpha 태그
  })
})
