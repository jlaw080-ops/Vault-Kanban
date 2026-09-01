import { describe, it, expect } from 'vitest'
import matter from 'gray-matter'
import {
  selectTodoNotes,
  deriveProjectMeta,
  suggestProjectFolders,
  sortTodos,
  filterTodosByKeyword,
  sanitizeTodoTitle,
  buildTodoFilePath,
  buildTodoNoteContent,
  getSubProject
} from './todoModel'
import type { Note } from '@renderer/types'

function makeNote(overrides: Partial<Note> = {}): Note {
  return {
    filePath: 'C:/v/06_To Do/2026-08/a.md',
    relativePath: '06_To Do/2026-08/a.md',
    title: 'a',
    status: 'planned',
    tags: [],
    created: '2026-08-31',
    body: '',
    mtime: 1,
    ...overrides
  }
}

const PRESET = {
  projects: ['신재생에너지제안(EPC)', '에너빌드', 'BIPV특허기획'],
  subProjects: ['디벨로퍼(에너빌드)', '에너지분석(에너빌드)', 'RTU개발및시제품제작']
}

describe('selectTodoNotes', () => {
  it('todoFolder 아래 노트만 고른다', () => {
    const notes = [
      makeNote({ relativePath: '06_To Do/2026-08/a.md' }),
      makeNote({ relativePath: '06_To Do/무제.md' }),
      makeNote({ relativePath: '01_Projects/02_에너빌드/b.md' })
    ]
    expect(selectTodoNotes(notes, '06_To Do').map((n) => n.relativePath)).toEqual([
      '06_To Do/2026-08/a.md',
      '06_To Do/무제.md'
    ])
  })

  it('역슬래시 경로도 처리한다', () => {
    const notes = [makeNote({ relativePath: '06_To Do\\2026-08\\a.md' })]
    expect(selectTodoNotes(notes, '06_To Do')).toHaveLength(1)
  })

  it('이름이 접두사로 겹치는 다른 폴더는 제외한다', () => {
    const notes = [makeNote({ relativePath: '06_To Done/a.md' })]
    expect(selectTodoNotes(notes, '06_To Do')).toHaveLength(0)
  })

  it('todoFolder 가 비면 빈 배열이다', () => {
    expect(selectTodoNotes([makeNote()], '')).toEqual([])
  })
})

describe('deriveProjectMeta', () => {
  it('숫자 접두를 떼고 preset 표기로 보정한다', () => {
    const r = deriveProjectMeta('01_Projects/02_에너빌드/03_에너지분석', '01_Projects', PRESET)
    expect(r.project).toBe('에너빌드')
    expect(r.subProject).toBe('에너지분석(에너빌드)')
    expect(r.offPreset).toEqual({ project: false, subProject: false })
  })

  it('1단 폴더면 subProject 는 null 이다', () => {
    const r = deriveProjectMeta('01_Projects/BIPV특허기획', '01_Projects', PRESET)
    expect(r.project).toBe('BIPV특허기획')
    expect(r.subProject).toBeNull()
    expect(r.offPreset.project).toBe(false)
  })

  it('project 보정 실패 시 파생값을 쓰고 offPreset 을 세운다', () => {
    const r = deriveProjectMeta('01_Projects/01_신재생에너지검토제안(EPC)', '01_Projects', PRESET)
    expect(r.project).toBe('신재생에너지검토제안(EPC)')
    expect(r.offPreset.project).toBe(true)
  })

  it('subProject 보정 실패 시 값을 지어내지 않고 null 을 준다', () => {
    const r = deriveProjectMeta(
      '01_Projects/01_신재생에너지검토제안(EPC)/0813_데이터센터사업',
      '01_Projects',
      PRESET
    )
    expect(r.subProject).toBeNull()
    expect(r.offPreset.subProject).toBe(true)
  })

  it('부분 일치 후보가 둘 이상이면 보정하지 않는다', () => {
    const preset = { projects: [], subProjects: ['분석(A)', '분석(B)'] }
    const r = deriveProjectMeta('01_Projects/X/분석', '01_Projects', preset)
    expect(r.subProject).toBeNull()
  })

  it('projectsFolder 자체를 고르면 project 가 비고 offPreset 이 선다', () => {
    const r = deriveProjectMeta('01_Projects', '01_Projects', PRESET)
    expect(r.project).toBe('')
    expect(r.offPreset.project).toBe(true)
  })
})

describe('suggestProjectFolders', () => {
  it('현재 project 와 겹치는 폴더만 돌려준다', () => {
    const folders = [
      '01_Projects/02_에너빌드',
      '01_Projects/02_에너빌드/03_에너지분석',
      '01_Projects/11_BIPV화재진단기술'
    ]
    expect(suggestProjectFolders(folders, '에너빌드')).toEqual([
      '01_Projects/02_에너빌드',
      '01_Projects/02_에너빌드/03_에너지분석'
    ])
  })

  it('currentProject 가 없으면 빈 배열이다', () => {
    expect(suggestProjectFolders(['01_Projects/02_에너빌드'], undefined)).toEqual([])
  })
})

describe('sortTodos', () => {
  const STATUS_ORDER = ['backlog', 'planned', 'in-progress', 'review', 'done']

  it('createdDesc: 최신 우선, 값 없는 노트는 뒤로', () => {
    const notes = [
      makeNote({ title: 'old', created: '2026-01-01' }),
      makeNote({ title: 'none', created: '' }),
      makeNote({ title: 'new', created: '2026-08-31' })
    ]
    expect(sortTodos(notes, 'createdDesc', STATUS_ORDER).map((n) => n.title)).toEqual([
      'new',
      'old',
      'none'
    ])
  })

  it('dueAsc: 임박 우선, 마감 없는 노트는 뒤로', () => {
    const notes = [
      makeNote({ title: 'none' }),
      makeNote({ title: 'late', due: '2026-12-31' }),
      makeNote({ title: 'soon', due: '2026-09-02' })
    ]
    expect(sortTodos(notes, 'dueAsc', STATUS_ORDER).map((n) => n.title)).toEqual([
      'soon',
      'late',
      'none'
    ])
  })

  it('priorityDesc: high → mid → low → 없음', () => {
    const notes = [
      makeNote({ title: 'none' }),
      makeNote({ title: 'low', priority: 'low' }),
      makeNote({ title: 'high', priority: 'high' }),
      makeNote({ title: 'mid', priority: 'mid' })
    ]
    expect(sortTodos(notes, 'priorityDesc', STATUS_ORDER).map((n) => n.title)).toEqual([
      'high',
      'mid',
      'low',
      'none'
    ])
  })

  it('status: statusOrder 순서, 목록 밖 상태는 뒤로', () => {
    const notes = [
      makeNote({ title: 'weird', status: '알수없음' as Note['status'] }),
      makeNote({ title: 'done', status: 'done' }),
      makeNote({ title: 'backlog', status: 'backlog' })
    ]
    expect(sortTodos(notes, 'status', STATUS_ORDER).map((n) => n.title)).toEqual([
      'backlog',
      'done',
      'weird'
    ])
  })

  it('원본 배열을 바꾸지 않는다', () => {
    const notes = [makeNote({ title: 'b' }), makeNote({ title: 'a' })]
    const before = notes.map((n) => n.title)
    sortTodos(notes, 'priorityDesc', STATUS_ORDER)
    expect(notes.map((n) => n.title)).toEqual(before)
  })
})

describe('filterTodosByKeyword', () => {
  it('제목·project·sub_project 를 대소문자 무시로 찾는다', () => {
    const notes = [
      makeNote({ title: 'BIPV 조달 확인' }),
      makeNote({ title: '다른 건', project: '에너빌드' }),
      makeNote({ title: '또 다른 건', extraFrontmatter: { sub_project: '에너지분석(에너빌드)' } }),
      makeNote({ title: '무관' })
    ]
    expect(filterTodosByKeyword(notes, '에너빌드')).toHaveLength(2)
    expect(filterTodosByKeyword(notes, 'bipv')).toHaveLength(1)
  })

  it('키워드가 비면 전부 돌려준다', () => {
    const notes = [makeNote(), makeNote()]
    expect(filterTodosByKeyword(notes, '   ')).toHaveLength(2)
  })
})

describe('getSubProject', () => {
  it('문자열 sub_project 만 돌려준다', () => {
    expect(getSubProject(makeNote({ extraFrontmatter: { sub_project: 'X' } }))).toBe('X')
    expect(getSubProject(makeNote({ extraFrontmatter: { sub_project: null } }))).toBeNull()
    expect(getSubProject(makeNote())).toBeNull()
  })
})

describe('sanitizeTodoTitle', () => {
  it('파일명 금지 문자를 지운다', () => {
    expect(sanitizeTodoTitle('a/b:c*d?e"f<g>h|i')).toBe('abcdefghi')
  })

  it('빈 제목은 무제로 바꾼다', () => {
    expect(sanitizeTodoTitle('   ')).toBe('무제')
  })

  it('120자로 자른다', () => {
    expect(sanitizeTodoTitle('가'.repeat(200))).toHaveLength(120)
  })
})

describe('buildTodoFilePath', () => {
  it('월 폴더와 MMDD 접두를 붙인다', () => {
    const path = buildTodoFilePath('C:/v', '06_To Do', 'BIPV 확인', new Date(2026, 8, 1))
    expect(path).toBe('C:/v/06_To Do/2026-09/0901_BIPV 확인.md')
  })

  it('역슬래시 볼트 경로를 정규화한다', () => {
    const path = buildTodoFilePath('C:\\v\\', '06_To Do', 'x', new Date(2026, 11, 25))
    expect(path).toBe('C:/v/06_To Do/2026-12/1225_x.md')
  })
})

describe('buildTodoNoteContent', () => {
  it('볼트 관례와 같은 키 순서로 frontmatter 를 만든다', () => {
    const content = buildTodoNoteContent({
      title: 'x',
      project: '에너빌드',
      subProject: '에너지분석(에너빌드)',
      priority: 'high',
      now: new Date(2026, 8, 1)
    })
    const parsed = matter(content)
    expect(Object.keys(parsed.data)).toEqual([
      'project',
      'sub_project',
      'priority',
      'category',
      'status',
      'works',
      'tags',
      'created',
      'updated',
      'completed'
    ])
    expect(parsed.data.category).toBe('action')
    expect(parsed.data.status).toBe('planned')
    expect(parsed.data.created).toBe('2026-09-01')
    expect(parsed.content).toContain('## 업무 개요')
  })

  it('project 를 안 주면 빈 값으로 둔다', () => {
    const parsed = matter(
      buildTodoNoteContent({ title: 'x', priority: 'mid', now: new Date(2026, 8, 1) })
    )
    expect(parsed.data.project).toBeNull()
    expect(parsed.data.sub_project).toBeNull()
  })
})
