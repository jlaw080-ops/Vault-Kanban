import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, cleanup, fireEvent, waitFor } from '@testing-library/react'
import { createJSONStorage } from 'zustand/middleware'
import { useViewStore } from '../../src/renderer/src/stores/viewStore'
import { TodoView } from '../../src/renderer/src/components/todo/TodoView'
import type { Note } from '../../src/renderer/src/types'

// Node 22+ 실험적 webstorage 대응 (viewStore.test.ts 와 같은 패턴)
const memoryStore = new Map<string, string>()
useViewStore.persist.setOptions({
  storage: createJSONStorage(() => ({
    getItem: (k: string) => memoryStore.get(k) ?? null,
    setItem: (k: string, v: string) => void memoryStore.set(k, v),
    removeItem: (k: string) => void memoryStore.delete(k)
  }))
})

const STATUS_ORDER = ['backlog', 'planned', 'in-progress', 'review', 'done']

function makeNote(overrides: Partial<Note> = {}): Note {
  return {
    filePath: 'C:/v/06_To Do/2026-08/a.md',
    relativePath: '06_To Do/2026-08/a.md',
    title: 'BIPV 조달 확인',
    status: 'planned',
    priority: 'high',
    tags: [],
    created: '2026-08-31',
    body: '',
    mtime: 1,
    project: 'BIPV특허기획',
    ...overrides
  }
}

beforeEach(() => {
  useViewStore.getState().setTodoSort('createdDesc')
  useViewStore.getState().setTodoKeyword('')
})

afterEach(() => {
  cleanup()
  vi.restoreAllMocks()
})

describe('TodoView', () => {
  it('To Do 폴더 노트만 행으로 그린다', () => {
    const notes = [
      makeNote(),
      makeNote({
        filePath: 'C:/v/01_Projects/b.md',
        relativePath: '01_Projects/b.md',
        title: '프로젝트 노트'
      })
    ]
    render(
      <TodoView
        notes={notes}
        todoFolder="06_To Do"
        statusOrder={STATUS_ORDER}
        onNoteUpdate={() => {}}
        onOpenNote={() => {}}
      />
    )
    expect(screen.getByText('BIPV 조달 확인')).toBeInTheDocument()
    expect(screen.queryByText('프로젝트 노트')).not.toBeInTheDocument()
  })

  it('검색어로 행을 거른다', async () => {
    const notes = [
      makeNote({ title: 'BIPV 조달 확인' }),
      makeNote({
        filePath: 'C:/v/06_To Do/2026-08/b.md',
        relativePath: '06_To Do/2026-08/b.md',
        title: '데이터센터 대안',
        project: 'DC특허기획'
      })
    ]
    render(
      <TodoView
        notes={notes}
        todoFolder="06_To Do"
        statusOrder={STATUS_ORDER}
        onNoteUpdate={() => {}}
        onOpenNote={() => {}}
      />
    )
    fireEvent.change(screen.getByPlaceholderText('검색'), { target: { value: 'BIPV' } })
    await waitFor(() => {
      expect(screen.getByText('BIPV 조달 확인')).toBeInTheDocument()
      expect(screen.queryByText('데이터센터 대안')).not.toBeInTheDocument()
    })
  })

  it('할일이 없으면 안내를 보여준다', () => {
    render(
      <TodoView
        notes={[]}
        todoFolder="06_To Do"
        statusOrder={STATUS_ORDER}
        onNoteUpdate={() => {}}
        onOpenNote={() => {}}
      />
    )
    expect(screen.getByText(/할일이 없습니다/)).toBeInTheDocument()
  })

  it('제목을 누르면 onOpenNote 를 부른다', () => {
    const onOpenNote = vi.fn()
    render(
      <TodoView
        notes={[makeNote()]}
        todoFolder="06_To Do"
        statusOrder={STATUS_ORDER}
        onNoteUpdate={() => {}}
        onOpenNote={onOpenNote}
      />
    )
    fireEvent.click(screen.getByText('BIPV 조달 확인'))
    expect(onOpenNote).toHaveBeenCalledTimes(1)
  })

  it('상태를 바꾸면 statusTransition 을 거쳐 저장한다', async () => {
    const writeNote = vi.fn().mockResolvedValue(undefined)
    // @ts-expect-error 테스트용 부분 구현
    window.api = { vault: { writeNote } }
    const onNoteUpdate = vi.fn()

    render(
      <TodoView
        notes={[makeNote()]}
        todoFolder="06_To Do"
        statusOrder={STATUS_ORDER}
        onNoteUpdate={onNoteUpdate}
        onOpenNote={() => {}}
      />
    )

    fireEvent.change(screen.getByLabelText('상태'), { target: { value: 'in-progress' } })

    await waitFor(() => expect(writeNote).toHaveBeenCalledTimes(1))
    const saved = writeNote.mock.calls[0][0] as Note
    expect(saved.status).toBe('in-progress')
    expect(saved.started).toBeTruthy()
    expect(onNoteUpdate).toHaveBeenCalled()
  })

  it('파싱 오류 노트는 편집 컨트롤을 비활성화한다', () => {
    render(
      <TodoView
        notes={[makeNote({ parseError: 'YAML 오류' })]}
        todoFolder="06_To Do"
        statusOrder={STATUS_ORDER}
        onNoteUpdate={() => {}}
        onOpenNote={() => {}}
      />
    )
    expect(screen.getByLabelText('상태')).toBeDisabled()
    expect(screen.getByRole('button', { name: '프로젝트로 이동' })).toBeDisabled()
  })
})
