import { describe, it, expect } from 'vitest'
import matter from 'gray-matter'
import {
  selectTodoNotes,
  deriveProjectMeta,
  projectFolderKey,
  resolveProjectFolder,
  pruneFolderTree,
  filterFolderTree,
  findSubtree,
  NOISE_FOLDER_NAMES,
  sortTodos,
  filterTodosByKeyword,
  sanitizeTodoTitle,
  buildTodoFilePath,
  buildTodoNoteContent,
  getSubProject
} from './todoModel'
import type { FolderTreeNode } from './todoModel'
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

// ── 폴더 선택 (2026-09-02) ────────────────────────────────────────────
// 실제 볼트 구조를 축약한 트리. 01_Projects 아래 372개·9단까지 있는 볼트에서
// 추천 목록이 폭발했던 회귀를 막는다.
const TREE: FolderTreeNode[] = [
  {
    name: '02_에너빌드',
    path: '01_Projects/02_에너빌드',
    children: [
      {
        name: '03_에너지분석',
        path: '01_Projects/02_에너빌드/03_에너지분석',
        children: [
          { name: '00_note', path: '01_Projects/02_에너빌드/03_에너지분석/00_note', children: [] },
          {
            name: '01_진행업무',
            path: '01_Projects/02_에너빌드/03_에너지분석/01_진행업무',
            children: [
              {
                name: '__pycache__',
                path: '01_Projects/02_에너빌드/03_에너지분석/01_진행업무/__pycache__',
                children: []
              },
              {
                name: '.pytest_cache',
                path: '01_Projects/02_에너빌드/03_에너지분석/01_진행업무/.pytest_cache',
                children: [
                  {
                    name: 'v',
                    path: '01_Projects/02_에너빌드/03_에너지분석/01_진행업무/.pytest_cache/v',
                    children: []
                  }
                ]
              }
            ]
          }
        ]
      },
      {
        name: '02_에너지절약계획서작성기능',
        path: '01_Projects/02_에너빌드/02_에너지절약계획서작성기능',
        children: []
      }
    ]
  },
  {
    name: '01_신재생에너지검토제안(EPC)',
    path: '01_Projects/01_신재생에너지검토제안(EPC)',
    children: [
      {
        name: '0813_데이터센터사업',
        path: '01_Projects/01_신재생에너지검토제안(EPC)/0813_데이터센터사업',
        children: []
      }
    ]
  }
]

const PATHS = [
  '01_Projects/02_에너빌드',
  '01_Projects/02_에너빌드/03_에너지분석',
  '01_Projects/02_에너빌드/03_에너지분석/00_note',
  '01_Projects/02_에너빌드/03_에너지분석/01_진행업무',
  '01_Projects/02_에너빌드/02_에너지절약계획서작성기능',
  '01_Projects/01_신재생에너지검토제안(EPC)',
  '01_Projects/01_신재생에너지검토제안(EPC)/0813_데이터센터사업'
]

describe('projectFolderKey', () => {
  it('project 와 sub_project 를 결합한다', () => {
    expect(projectFolderKey('에너빌드', '에너지분석(에너빌드)')).toBe('에너빌드|에너지분석(에너빌드)')
  })

  it('sub_project 가 없으면 project 만 쓴다', () => {
    expect(projectFolderKey('에너빌드', null)).toBe('에너빌드')
    expect(projectFolderKey('에너빌드', '')).toBe('에너빌드')
  })

  it('project 가 없으면 빈 문자열 — 매핑 대상이 아니다', () => {
    expect(projectFolderKey(undefined, '에너지분석(에너빌드)')).toBe('')
  })
})

describe('resolveProjectFolder', () => {
  it('저장된 매핑이 있으면 그 경로를 그대로 쓴다', () => {
    const map = { '신재생에너지제안(EPC)': '01_Projects/01_신재생에너지검토제안(EPC)' }
    const r = resolveProjectFolder(PATHS, '01_Projects', '신재생에너지제안(EPC)', null, map)
    expect(r).toBe('01_Projects/01_신재생에너지검토제안(EPC)')
  })

  it('매핑 경로가 볼트에 더 이상 없으면 무시한다', () => {
    const map = { 에너빌드: '01_Projects/사라진폴더' }
    const r = resolveProjectFolder(PATHS, '01_Projects', '에너빌드', null, map)
    expect(r).toBe('01_Projects/02_에너빌드')
  })

  it('sub_project 키가 없으면 project 키로 물러난다', () => {
    const map = { 에너빌드: '01_Projects/02_에너빌드/02_에너지절약계획서작성기능' }
    const r = resolveProjectFolder(PATHS, '01_Projects', '에너빌드', '없는세부', map)
    expect(r).toBe('01_Projects/02_에너빌드/02_에너지절약계획서작성기능')
  })

  it('매핑이 없으면 이름으로 project 폴더를 찾는다 (숫자 접두 무시)', () => {
    const r = resolveProjectFolder(PATHS, '01_Projects', '에너빌드', null, {})
    expect(r).toBe('01_Projects/02_에너빌드')
  })

  it('sub_project 까지 맞으면 그 하위 폴더를 돌려준다', () => {
    const r = resolveProjectFolder(PATHS, '01_Projects', '에너빌드', '에너지분석(에너빌드)', {})
    expect(r).toBe('01_Projects/02_에너빌드/03_에너지분석')
  })

  it('sub_project 를 못 찾으면 project 폴더까지만 돌려준다', () => {
    const r = resolveProjectFolder(PATHS, '01_Projects', '에너빌드', '없는세부', {})
    expect(r).toBe('01_Projects/02_에너빌드')
  })

  it('project 이름이 어긋나면 null — 전체 트리로 떨어진다', () => {
    const r = resolveProjectFolder(PATHS, '01_Projects', '신재생에너지제안(EPC)', null, {})
    expect(r).toBeNull()
  })

  it('project 가 비면 null', () => {
    expect(resolveProjectFolder(PATHS, '01_Projects', undefined, null, {})).toBeNull()
  })

  it('project 매칭은 1단 폴더에만 건다 — 하위 폴더가 걸려들지 않는다', () => {
    // '진행업무' 는 3단 폴더 이름이지만 project 후보가 될 수 없다
    expect(resolveProjectFolder(PATHS, '01_Projects', '진행업무', null, {})).toBeNull()
  })
})

describe('pruneFolderTree', () => {
  it('점으로 시작하는 폴더와 노이즈 폴더를 지운다', () => {
    const pruned = pruneFolderTree(TREE, NOISE_FOLDER_NAMES)
    const 진행업무 = pruned[0].children[0].children[1]
    expect(진행업무.name).toBe('01_진행업무')
    expect(진행업무.children).toEqual([])
  })

  it('원본 트리를 바꾸지 않는다', () => {
    const before = JSON.stringify(TREE)
    pruneFolderTree(TREE, NOISE_FOLDER_NAMES)
    expect(JSON.stringify(TREE)).toBe(before)
  })
})

describe('filterFolderTree', () => {
  it('이름이 맞는 폴더와 그 조상만 남긴다', () => {
    const r = filterFolderTree(TREE, '에너지분석')
    expect(r).toHaveLength(1)
    expect(r[0].name).toBe('02_에너빌드')
    expect(r[0].children).toHaveLength(1)
    expect(r[0].children[0].name).toBe('03_에너지분석')
  })

  it('맞는 폴더의 하위는 그대로 남긴다', () => {
    const r = filterFolderTree(TREE, '에너지분석')
    expect(r[0].children[0].children.map((c) => c.name)).toEqual(['00_note', '01_진행업무'])
  })

  it('대소문자를 무시한다', () => {
    expect(filterFolderTree(TREE, 'EPC')).toHaveLength(1)
    expect(filterFolderTree(TREE, 'epc')).toHaveLength(1)
  })

  it('키워드가 비면 원본을 그대로 돌려준다', () => {
    expect(filterFolderTree(TREE, '  ')).toEqual(TREE)
  })

  it('맞는 것이 없으면 빈 배열', () => {
    expect(filterFolderTree(TREE, '존재하지않는이름')).toEqual([])
  })
})

describe('findSubtree', () => {
  it('경로로 서브트리를 찾는다', () => {
    const n = findSubtree(TREE, '01_Projects/02_에너빌드/03_에너지분석')
    expect(n?.name).toBe('03_에너지분석')
  })

  it('없으면 null', () => {
    expect(findSubtree(TREE, '01_Projects/없음')).toBeNull()
  })
})
