import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, cleanup, fireEvent, waitFor } from '@testing-library/react'
import { createJSONStorage } from 'zustand/middleware'
import { useViewStore } from '../../src/renderer/src/stores/viewStore'
import { NewTodoDialog } from '../../src/renderer/src/components/todo/NewTodoDialog'
import type { Note } from '../../src/renderer/src/types'

const memoryStore = new Map<string, string>()
useViewStore.persist.setOptions({
  storage: createJSONStorage(() => ({
    getItem: (k: string) => memoryStore.get(k) ?? null,
    setItem: (k: string, v: string) => void memoryStore.set(k, v),
    removeItem: (k: string) => void memoryStore.delete(k)
  }))
})

const PRESET = { projects: ['에너빌드'], subProjects: ['에너지분석(에너빌드)'] }

let createNote: ReturnType<typeof vi.fn>
let readNote: ReturnType<typeof vi.fn>

function makeCreatedNote(): Note {
  return {
    filePath: 'C:/v/06_To Do/2026-09/0901_새 할일.md',
    relativePath: '06_To Do/2026-09/0901_새 할일.md',
    title: '0901_새 할일',
    status: 'planned',
    tags: [],
    created: '2026-09-01',
    body: '',
    mtime: 1
  }
}

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date'] })
  vi.setSystemTime(new Date(2026, 8, 1))
  createNote = vi.fn().mockResolvedValue({ ok: true })
  readNote = vi.fn().mockResolvedValue(makeCreatedNote())
  // @ts-expect-error 테스트용 부분 구현
  window.api = { vault: { createNote, readNote } }
})

afterEach(() => {
  vi.useRealTimers()
  cleanup()
  vi.restoreAllMocks()
})

function renderDialog(onCreated = vi.fn(), onOpenChange = vi.fn()): [ReturnType<typeof vi.fn>, ReturnType<typeof vi.fn>] {
  render(
    <NewTodoDialog
      vaultPath="C:/v"
      todoFolder="06_To Do"
      preset={PRESET}
      open
      onOpenChange={onOpenChange}
      onCreated={onCreated}
    />
  )
  return [onCreated, onOpenChange]
}

describe('NewTodoDialog', () => {
  it('제목이 비면 만들기 버튼이 비활성이다', () => {
    renderDialog()
    expect(screen.getByRole('button', { name: '만들기' })).toBeDisabled()
  })

  it('경로와 내용으로 createNote 를 부른다', async () => {
    const [, onOpenChange] = renderDialog()
    fireEvent.change(screen.getByLabelText('제목'), { target: { value: '새 할일' } })
    fireEvent.change(screen.getByLabelText('project'), { target: { value: '에너빌드' } })
    fireEvent.click(screen.getByRole('button', { name: '만들기' }))

    await waitFor(() => expect(createNote).toHaveBeenCalledTimes(1))
    const [path, content] = createNote.mock.calls[0]
    expect(path).toBe('C:/v/06_To Do/2026-09/0901_새 할일.md')
    expect(content).toContain('project: 에너빌드')
    expect(content).toContain('category: action')
    expect(onOpenChange).toHaveBeenCalledWith(false)
  })

  it('생성 후 읽어온 노트를 onCreated 로 넘긴다', async () => {
    const [onCreated] = renderDialog()
    fireEvent.change(screen.getByLabelText('제목'), { target: { value: '새 할일' } })
    fireEvent.click(screen.getByRole('button', { name: '만들기' }))

    await waitFor(() => expect(onCreated).toHaveBeenCalledTimes(1))
    expect(onCreated.mock.calls[0][0].filePath).toBe('C:/v/06_To Do/2026-09/0901_새 할일.md')
  })

  it('이미 있는 파일이면 오류 토스트를 띄운다', async () => {
    createNote.mockResolvedValue({ ok: false, code: 'exists', error: '이미 존재합니다' })
    const [onCreated, onOpenChange] = renderDialog()
    fireEvent.change(screen.getByLabelText('제목'), { target: { value: '새 할일' } })
    fireEvent.click(screen.getByRole('button', { name: '만들기' }))

    await waitFor(() =>
      expect(useViewStore.getState().toasts.at(-1)?.variant).toBe('error')
    )
    expect(onCreated).not.toHaveBeenCalled()
    expect(onOpenChange).not.toHaveBeenCalledWith(false)
  })

  it('readNote 실패 시 오류 토스트를 띄우고 대화상자를 닫는다', async () => {
    readNote.mockRejectedValue(new Error('읽기 실패'))
    const [onCreated, onOpenChange] = renderDialog()
    fireEvent.change(screen.getByLabelText('제목'), { target: { value: '새 할일' } })
    fireEvent.click(screen.getByRole('button', { name: '만들기' }))

    await waitFor(() =>
      expect(useViewStore.getState().toasts.at(-1)?.variant).toBe('error')
    )
    expect(useViewStore.getState().toasts.at(-1)?.message).toContain('생성은 됐지만 읽지 못했습니다')
    expect(onCreated).not.toHaveBeenCalled()
    expect(onOpenChange).toHaveBeenCalledWith(false)
  })
})
