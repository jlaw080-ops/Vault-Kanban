import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, cleanup, fireEvent, waitFor } from '@testing-library/react'
import { createJSONStorage } from 'zustand/middleware'
import { useViewStore } from '../../src/renderer/src/stores/viewStore'
import { MoveToProjectDialog } from '../../src/renderer/src/components/todo/MoveToProjectDialog'
import type { Note } from '../../src/renderer/src/types'

const memoryStore = new Map<string, string>()
useViewStore.persist.setOptions({
  storage: createJSONStorage(() => ({
    getItem: (k: string) => memoryStore.get(k) ?? null,
    setItem: (k: string, v: string) => void memoryStore.set(k, v),
    removeItem: (k: string) => void memoryStore.delete(k)
  }))
})

const PRESET = {
  projects: ['에너빌드', 'BIPV특허기획'],
  subProjects: ['에너지분석(에너빌드)']
}

const FOLDER_TREE = [
  {
    name: '01_Projects',
    path: '01_Projects',
    children: [
      {
        name: '02_에너빌드',
        path: '01_Projects/02_에너빌드',
        children: [
          {
            name: '03_에너지분석',
            path: '01_Projects/02_에너빌드/03_에너지분석',
            children: [
              {
                name: '__pycache__',
                path: '01_Projects/02_에너빌드/03_에너지분석/__pycache__',
                children: []
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
        children: []
      }
    ]
  }
]

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
    project: '에너빌드',
    extraFrontmatter: { sub_project: '이전세부' },
    ...overrides
  }
}

let moveNoteToProject: ReturnType<typeof vi.fn>
let settingsGet: ReturnType<typeof vi.fn>
let settingsSet: ReturnType<typeof vi.fn>

function installApi(folderMap: Record<string, string> = {}): void {
  moveNoteToProject = vi.fn().mockResolvedValue({ ok: true })
  settingsGet = vi.fn().mockResolvedValue(folderMap)
  settingsSet = vi.fn().mockResolvedValue(undefined)
  // @ts-expect-error 테스트용 부분 구현
  window.api = {
    vault: {
      listFolders: vi.fn().mockResolvedValue(FOLDER_TREE),
      moveNoteToProject
    },
    settings: { get: settingsGet, set: settingsSet }
  }
}

beforeEach(() => {
  installApi()
})

afterEach(() => {
  cleanup()
  vi.restoreAllMocks()
})

async function openDialogAndPickFolder(): Promise<void> {
  render(
    <MoveToProjectDialog
      note={makeNote()}
      vaultPath="C:/v"
      projectsFolder="01_Projects"
      preset={PRESET}
      open
      onOpenChange={() => {}}
      onMoved={() => {}}
    />
  )
  await waitFor(() => expect(screen.getByText('03_에너지분석')).toBeInTheDocument())
  fireEvent.click(screen.getByText('03_에너지분석'))
}

describe('MoveToProjectDialog', () => {
  it('폴더를 고르면 preset 으로 보정한 값을 미리보기에 채운다', async () => {
    await openDialogAndPickFolder()
    await waitFor(() =>
      expect(screen.getByLabelText('project')).toHaveValue('에너빌드')
    )
    expect(screen.getByLabelText('sub_project')).toHaveValue('에너지분석(에너빌드)')
  })

  it('확인을 누르면 목적지 경로와 patch 로 IPC 를 부른다', async () => {
    await openDialogAndPickFolder()
    fireEvent.click(screen.getByRole('button', { name: '이동' }))

    await waitFor(() => expect(moveNoteToProject).toHaveBeenCalledTimes(1))
    expect(moveNoteToProject).toHaveBeenCalledWith(
      'C:/v/06_To Do/2026-08/a.md',
      'C:/v/01_Projects/02_에너빌드/03_에너지분석/a.md',
      { project: '에너빌드', subProject: '에너지분석(에너빌드)' }
    )
  })

  it('preset 에 없는 값이면 경고를 보여준다', async () => {
    render(
      <MoveToProjectDialog
        note={makeNote()}
        vaultPath="C:/v"
        projectsFolder="01_Projects"
        preset={{ projects: [], subProjects: [] }}
        open
        onOpenChange={() => {}}
        onMoved={() => {}}
      />
    )
    await waitFor(() => expect(screen.getByText('02_에너빌드')).toBeInTheDocument())
    fireEvent.click(screen.getByText('02_에너빌드'))
    await waitFor(() =>
      expect(screen.getByText(/preset에 없는 값/)).toBeInTheDocument()
    )
  })

  it('project 를 폴더로 못 찾으면 아무것도 선택되지 않아 이동 버튼이 비활성이다', async () => {
    render(
      <MoveToProjectDialog
        note={makeNote({ project: '이름이어긋난프로젝트' })}
        vaultPath="C:/v"
        projectsFolder="01_Projects"
        preset={PRESET}
        open
        onOpenChange={() => {}}
        onMoved={() => {}}
      />
    )
    await waitFor(() => expect(screen.getByText('02_에너빌드')).toBeInTheDocument())
    expect(screen.getByRole('button', { name: '이동' })).toBeDisabled()
  })

  it('이동 실패 시 오류 토스트를 띄우고 onMoved 를 부르지 않는다', async () => {
    moveNoteToProject.mockResolvedValue({
      ok: false,
      code: 'exists',
      error: '이미 같은 이름의 파일이 있습니다'
    })
    const onMoved = vi.fn()
    render(
      <MoveToProjectDialog
        note={makeNote()}
        vaultPath="C:/v"
        projectsFolder="01_Projects"
        preset={PRESET}
        open
        onOpenChange={() => {}}
        onMoved={onMoved}
      />
    )
    await waitFor(() => expect(screen.getByText('03_에너지분석')).toBeInTheDocument())
    fireEvent.click(screen.getByText('03_에너지분석'))
    fireEvent.click(screen.getByRole('button', { name: '이동' }))

    await waitFor(() =>
      expect(useViewStore.getState().toasts.at(-1)?.variant).toBe('error')
    )
    expect(onMoved).not.toHaveBeenCalled()
  })

  it('이동 성공 시 되돌리기 버튼이 달린 토스트를 띄운다', async () => {
    await openDialogAndPickFolder()
    fireEvent.click(screen.getByRole('button', { name: '이동' }))

    await waitFor(() =>
      expect(useViewStore.getState().toasts.at(-1)?.action?.label).toBe('되돌리기')
    )

    const undo = useViewStore.getState().toasts.at(-1)!.action!
    undo.onClick()
    await waitFor(() => expect(moveNoteToProject).toHaveBeenCalledTimes(2))
    expect(moveNoteToProject).toHaveBeenLastCalledWith(
      'C:/v/01_Projects/02_에너빌드/03_에너지분석/a.md',
      'C:/v/06_To Do/2026-08/a.md',
      { project: '에너빌드', subProject: '이전세부' }
    )
  })
})

// ── 폴더 선택 개선 (2026-09-02) ──────────────────────────────────────
describe('MoveToProjectDialog — 범위·검색·매핑', () => {
  function renderDialog(note = makeNote()): void {
    render(
      <MoveToProjectDialog
        note={note}
        vaultPath="C:/v"
        projectsFolder="01_Projects"
        preset={PRESET}
        open
        onOpenChange={() => {}}
        onMoved={() => {}}
      />
    )
  }

  it('project·sub_project 로 찾은 폴더로 범위를 좁히고 미리 선택한다', async () => {
    renderDialog(makeNote({ extraFrontmatter: { sub_project: '에너지분석(에너빌드)' } }))
    await waitFor(() =>
      expect(screen.getByText('01_Projects/02_에너빌드/03_에너지분석')).toBeInTheDocument()
    )
    // 범위 밖 형제는 트리에 없다
    expect(screen.queryByText('01_신재생에너지검토제안(EPC)')).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: '이동' })).not.toBeDisabled()
  })

  it('저장된 매핑이 이름 매칭을 이긴다', async () => {
    installApi({ '에너빌드|이전세부': '01_Projects/01_신재생에너지검토제안(EPC)' })
    renderDialog()
    await waitFor(() =>
      expect(screen.getByText('01_Projects/01_신재생에너지검토제안(EPC)')).toBeInTheDocument()
    )
  })

  it('전체 보기 토글로 범위를 넓힌다', async () => {
    renderDialog()
    await waitFor(() => expect(screen.getByText('02_에너빌드')).toBeInTheDocument())
    expect(screen.queryByText('01_신재생에너지검토제안(EPC)')).not.toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: '전체 보기' }))
    await waitFor(() =>
      expect(screen.getByText('01_신재생에너지검토제안(EPC)')).toBeInTheDocument()
    )
  })

  it('캐시 폴더는 트리에 나오지 않는다', async () => {
    renderDialog(makeNote({ extraFrontmatter: { sub_project: '에너지분석(에너빌드)' } }))
    await waitFor(() => expect(screen.getByText('03_에너지분석')).toBeInTheDocument())
    expect(screen.queryByText('__pycache__')).not.toBeInTheDocument()
  })

  it('검색으로 트리를 좁힌다', async () => {
    renderDialog()
    await waitFor(() => expect(screen.getByText('03_에너지분석')).toBeInTheDocument())

    fireEvent.change(screen.getByLabelText('폴더 검색'), { target: { value: '절약' } })
    await waitFor(() => expect(screen.queryByText('03_에너지분석')).not.toBeInTheDocument())
    expect(screen.getByText('02_에너지절약계획서작성기능')).toBeInTheDocument()
  })

  it('맞는 폴더가 없으면 안내를 보여준다', async () => {
    renderDialog()
    await waitFor(() => expect(screen.getByText('03_에너지분석')).toBeInTheDocument())
    fireEvent.change(screen.getByLabelText('폴더 검색'), { target: { value: '없는이름' } })
    await waitFor(() => expect(screen.getByText('맞는 폴더가 없습니다.')).toBeInTheDocument())
  })

  it('이동에 성공하면 노트의 원래 project·sub_project 를 키로 매핑을 저장한다', async () => {
    renderDialog()
    await waitFor(() => expect(screen.getByText('03_에너지분석')).toBeInTheDocument())
    fireEvent.click(screen.getByText('03_에너지분석'))
    fireEvent.click(screen.getByRole('button', { name: '이동' }))

    await waitFor(() => expect(settingsSet).toHaveBeenCalledTimes(1))
    expect(settingsSet).toHaveBeenCalledWith('projectFolderMap', {
      '에너빌드|이전세부': '01_Projects/02_에너빌드/03_에너지분석'
    })
  })

  it('이동에 실패하면 매핑을 저장하지 않는다', async () => {
    renderDialog()
    await waitFor(() => expect(screen.getByText('03_에너지분석')).toBeInTheDocument())
    moveNoteToProject.mockResolvedValue({ ok: false, code: 'exists', error: '이미 있음' })
    fireEvent.click(screen.getByText('03_에너지분석'))
    fireEvent.click(screen.getByRole('button', { name: '이동' }))

    await waitFor(() => expect(moveNoteToProject).toHaveBeenCalled())
    expect(settingsSet).not.toHaveBeenCalled()
  })
})
