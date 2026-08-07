import { describe, it, expect } from 'vitest'
import {
  groupNotes,
  sortNotes,
  filterNotes,
  groupNotesBySwimlane,
  ETC_LANE,
  makeSwimlaneDroppableId,
  parseSwimlaneDroppableId,
  decideSwimlaneDrop,
  mergeProjectOptions,
  presetMismatchMessage
} from './viewModel'
import type { Note } from '@renderer/types'

function makeNote(overrides: Partial<Note> & { filePath: string }): Note {
  return {
    relativePath: overrides.filePath,
    title: 'Untitled',
    status: 'backlog',
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
    status: 'backlog',
    tags: ['alpha'],
    project: 'proj-A',
    title: 'Alpha Note',
    mtime: new Date('2024-01-10').getTime()
  }),
  makeNote({
    filePath: '/vault/A/note2.md',
    relativePath: 'A/note2.md',
    status: 'in-progress',
    tags: ['beta'],
    project: 'proj-B',
    title: 'Beta Note',
    mtime: new Date('2024-01-08').getTime()
  }),
  makeNote({
    filePath: '/vault/B/note3.md',
    relativePath: 'B/note3.md',
    status: 'done',
    tags: ['alpha', 'gamma'],
    title: 'Gamma Note',
    mtime: new Date('2024-01-06').getTime()
  }),
  makeNote({
    filePath: '/vault/B/note4.md',
    relativePath: 'B/note4.md',
    status: 'review',
    tags: [],
    priority: 'high',
    title: 'Delta Note',
    mtime: new Date('2024-01-04').getTime()
  })
]

describe('groupNotes', () => {
  it('status 그룹핑: 각 상태별로 묶임', () => {
    const groups = groupNotes(notes, 'status')
    expect(groups.get('backlog')?.length).toBe(1)
    expect(groups.get('in-progress')?.length).toBe(1)
    expect(groups.get('done')?.length).toBe(1)
    expect(groups.get('review')?.length).toBe(1)
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
    const result = filterNotes(notes, { tags: [], folders: [], projects: [], priority: 'all', keyword: 'Alpha' })
    expect(result).toHaveLength(1)
    expect(result[0].title).toBe('Alpha Note')
  })

  it('키워드 필터: 대소문자 무시', () => {
    const result = filterNotes(notes, { tags: [], folders: [], projects: [], priority: 'all', keyword: 'alpha' })
    expect(result).toHaveLength(1)
  })

  it('태그 AND 필터: 모든 태그 포함된 노트만', () => {
    const result = filterNotes(notes, {
      tags: ['alpha', 'gamma'],
      folders: [],
      projects: [],
      priority: 'all',
      keyword: ''
    })
    expect(result).toHaveLength(1) // note3만 alpha + gamma 둘 다 가짐
  })

  it('폴더 OR 필터: 지정 폴더 중 하나라도 일치하면 포함', () => {
    const result = filterNotes(notes, { tags: [], folders: ['A'], projects: [], priority: 'all', keyword: '' })
    expect(result).toHaveLength(2)
  })

  it('우선순위 필터: high만', () => {
    const result = filterNotes(notes, { tags: [], folders: [], projects: [], priority: 'high', keyword: '' })
    expect(result).toHaveLength(1)
    expect(result[0].title).toBe('Delta Note')
  })

  it('우선순위 필터: none = 우선순위 없는 노트만', () => {
    const result = filterNotes(notes, { tags: [], folders: [], projects: [], priority: 'none', keyword: '' })
    expect(result.every((n) => !n.priority)).toBe(true)
  })

  it('all 우선순위 필터: 전체 반환', () => {
    const result = filterNotes(notes, { tags: [], folders: [], projects: [], priority: 'all', keyword: '' })
    expect(result).toHaveLength(4)
  })

  it('복합 필터: 태그 + 폴더', () => {
    const result = filterNotes(notes, {
      tags: ['alpha'],
      folders: ['A'],
      projects: [],
      priority: 'all',
      keyword: ''
    })
    expect(result).toHaveLength(1) // note1: A 폴더에 alpha 태그
  })
})

describe('groupNotesBySwimlane', () => {
  it('레인 순서 = selectedProjects 순서, 기타 레인은 항상 마지막', () => {
    const lanes = groupNotesBySwimlane(notes, ['proj-B', 'proj-A'])
    expect(lanes.map((l) => l.lane)).toEqual(['proj-B', 'proj-A', ETC_LANE])
  })

  it('선택된 프로젝트의 노트는 해당 레인으로 분배된다', () => {
    const lanes = groupNotesBySwimlane(notes, ['proj-A', 'proj-B'])
    expect(lanes[0].notes.map((n) => n.filePath)).toEqual(['/vault/A/note1.md'])
    expect(lanes[1].notes.map((n) => n.filePath)).toEqual(['/vault/A/note2.md'])
  })

  it('미선택 프로젝트·프로젝트 없는 노트는 기타 레인으로 간다', () => {
    const lanes = groupNotesBySwimlane(notes, ['proj-A'])
    const etc = lanes[lanes.length - 1]
    expect(etc.lane).toBe(ETC_LANE)
    // note2(proj-B, 미선택) + note3·note4(project 없음)
    expect(etc.notes.map((n) => n.filePath)).toEqual([
      '/vault/A/note2.md',
      '/vault/B/note3.md',
      '/vault/B/note4.md'
    ])
  })

  it('노트가 0개인 선택 프로젝트도 빈 레인으로 유지된다', () => {
    const lanes = groupNotesBySwimlane(notes, ['proj-A', 'proj-없음'])
    expect(lanes[1].lane).toBe('proj-없음')
    expect(lanes[1].notes).toEqual([])
  })

  it('선택이 비어 있으면 기타 레인 하나만 반환한다', () => {
    const lanes = groupNotesBySwimlane(notes, [])
    expect(lanes).toHaveLength(1)
    expect(lanes[0].lane).toBe(ETC_LANE)
    expect(lanes[0].notes).toHaveLength(notes.length)
  })

  it('입력 배열을 변형하지 않는다', () => {
    const before = [...notes]
    groupNotesBySwimlane(notes, ['proj-A'])
    expect(notes).toEqual(before)
  })
})

describe('swimlane droppable id', () => {
  it('make → parse 왕복', () => {
    const id = makeSwimlaneDroppableId(2, 'in-progress')
    expect(id).toBe('2::in-progress')
    expect(parseSwimlaneDroppableId(id)).toEqual({ laneIndex: 2, status: 'in-progress' })
  })

  it('단일키(기존 status id)는 null', () => {
    expect(parseSwimlaneDroppableId('in-progress')).toBeNull()
    expect(parseSwimlaneDroppableId('done')).toBeNull()
  })

  it('레인 부분이 숫자가 아니면 null (파일 경로 등 오인 방지)', () => {
    expect(parseSwimlaneDroppableId('C::/Users/x/note.md')).toBeNull()
    expect(parseSwimlaneDroppableId('abc::done')).toBeNull()
  })

  it('status 부분이 비어 있으면 null', () => {
    expect(parseSwimlaneDroppableId('1::')).toBeNull()
  })
})

describe('decideSwimlaneDrop', () => {
  const note = makeNote({
    filePath: '/vault/A/note1.md',
    status: 'backlog',
    project: 'proj-A'
  })

  it('같은 레인 + 같은 상태 = null (no-op)', () => {
    expect(decideSwimlaneDrop(note, 'proj-A', 'backlog')).toBeNull()
  })

  it('같은 레인 + 다른 상태 = status만 변경', () => {
    const d = decideSwimlaneDrop(note, 'proj-A', 'done')
    expect(d).toEqual({
      statusChanged: true,
      nextStatus: 'done',
      projectChanged: false,
      nextProject: 'proj-A'
    })
  })

  it('다른 레인 + 같은 상태 = project만 변경', () => {
    const d = decideSwimlaneDrop(note, 'proj-B', 'backlog')
    expect(d).toEqual({
      statusChanged: false,
      nextStatus: 'backlog',
      projectChanged: true,
      nextProject: 'proj-B'
    })
  })

  it('대각선 드롭 = status + project 동시 변경', () => {
    const d = decideSwimlaneDrop(note, 'proj-B', 'in-progress')
    expect(d).toEqual({
      statusChanged: true,
      nextStatus: 'in-progress',
      projectChanged: true,
      nextProject: 'proj-B'
    })
  })

  it('기타 레인 드롭 = project 보존, status만 변경', () => {
    const d = decideSwimlaneDrop(note, ETC_LANE, 'review')
    expect(d).toEqual({
      statusChanged: true,
      nextStatus: 'review',
      projectChanged: false,
      nextProject: 'proj-A'
    })
  })

  it('기타 레인 + 같은 상태 = null', () => {
    expect(decideSwimlaneDrop(note, ETC_LANE, 'backlog')).toBeNull()
  })

  it('project 없는 노트를 프로젝트 레인에 드롭 = project 부여', () => {
    const noProject = makeNote({ filePath: '/vault/B/note3.md', status: 'done' })
    const d = decideSwimlaneDrop(noProject, 'proj-A', 'done')
    expect(d).toEqual({
      statusChanged: false,
      nextStatus: 'done',
      projectChanged: true,
      nextProject: 'proj-A'
    })
  })
})

describe('mergeProjectOptions — MM preset ∪ 노트 유도 값', () => {
  it('preset 순서를 그대로 유지한다 (정렬하지 않음)', () => {
    expect(mergeProjectOptions(['다', '가', '나'], [])).toEqual(['다', '가', '나'])
  })

  it('derived에만 있는 값은 뒤에 ko 가나다순으로 붙인다', () => {
    expect(mergeProjectOptions(['에너빌드'], ['하나', '가나', '에너빌드'])).toEqual([
      '에너빌드',
      '가나',
      '하나'
    ])
  })

  it('중복 제거 — preset과 derived 양쪽 중복 모두', () => {
    expect(mergeProjectOptions(['A', 'A', 'B'], ['B', 'C', 'C'])).toEqual(['A', 'B', 'C'])
  })

  it('preset 빈 배열이면 derived만 ko 정렬로 반환 (현재 동작과 동일)', () => {
    expect(mergeProjectOptions([], ['나', '가'])).toEqual(['가', '나'])
  })

  it('양쪽 빈 배열 → 빈 배열', () => {
    expect(mergeProjectOptions([], [])).toEqual([])
  })
})

describe('presetMismatchMessage — status/priority 일치 검증', () => {
  const APP_STATUSES = ['backlog', 'planned', 'in-progress', 'review', 'done']

  it('둘 다 일치하면 null', () => {
    expect(
      presetMismatchMessage({ statuses: APP_STATUSES, priorities: ['low', 'mid', 'high'] })
    ).toBeNull()
  })

  it('순서가 달라도 집합이 같으면 null', () => {
    expect(
      presetMismatchMessage({
        statuses: ['done', 'backlog', 'planned', 'review', 'in-progress'],
        priorities: ['high', 'low', 'mid']
      })
    ).toBeNull()
  })

  it('빈 배열은 검증 대상이 아니다 (MM에 해당 필드가 없는 경우) → null', () => {
    expect(presetMismatchMessage({ statuses: [], priorities: [] })).toBeNull()
  })

  it('statuses 불일치 → 경고 메시지에 status 차이 포함', () => {
    const msg = presetMismatchMessage({
      statuses: ['todo', 'doing', 'done'],
      priorities: ['low', 'mid', 'high']
    })
    expect(msg).toContain('status')
    expect(msg).toContain('todo')
    expect(msg).not.toContain('priority:')
  })

  it('priorities 불일치 → 경고 메시지에 priority 차이 포함', () => {
    const msg = presetMismatchMessage({
      statuses: [],
      priorities: ['낮음', '중간', '높음']
    })
    expect(msg).toContain('priority')
    expect(msg).toContain('낮음')
  })
})
