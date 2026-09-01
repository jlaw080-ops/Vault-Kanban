import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { promises as fs } from 'fs'
import { join } from 'path'
import { tmpdir } from 'os'

vi.mock('../../src/main/ipc/settings', () => ({
  getSettingValue: (key: string) => (key === 'statusFieldName' ? 'status' : undefined)
}))

import { moveNoteToProject, createNote, recentlyWrittenByApp } from '../../src/main/ipc/vault'

const TODO_RAW = [
  '---',
  'project: 이전프로젝트',
  'sub_project: 이전세부',
  'priority: high',
  'category: action',
  'status: planned',
  'works: pending',
  'tags: []',
  'created: 2026-08-31',
  'completed:',
  '---',
  '',
  '## 업무 개요',
  '- 확인'
].join('\n')

describe('moveNoteToProject / createNote', () => {
  let tmpDir: string
  let oldPath: string
  let newPath: string

  beforeEach(async () => {
    tmpDir = await fs.mkdtemp(join(tmpdir(), 'todo-move-'))
    oldPath = join(tmpDir, '06_To Do', '2026-08', 'a.md')
    newPath = join(tmpDir, '01_Projects', '02_에너빌드', '03_에너지분석', 'a.md')
    await fs.mkdir(join(tmpDir, '06_To Do', '2026-08'), { recursive: true })
    await fs.writeFile(oldPath, TODO_RAW, 'utf-8')
    recentlyWrittenByApp.clear()
  })

  afterEach(async () => {
    await fs.rm(tmpDir, { recursive: true, force: true })
  })

  it('파일을 옮기고 project·sub_project 를 갱신한다', async () => {
    const result = await moveNoteToProject(oldPath, newPath, {
      project: '에너빌드',
      subProject: '에너지분석(에너빌드)'
    })
    expect(result).toEqual({ ok: true })

    const moved = await fs.readFile(newPath, 'utf-8')
    expect(moved).toContain('project: 에너빌드')
    expect(moved).toContain('sub_project: 에너지분석(에너빌드)')
    await expect(fs.access(oldPath)).rejects.toThrow()
  })

  it('미지 frontmatter 키를 보존한다', async () => {
    await moveNoteToProject(oldPath, newPath, { project: '에너빌드', subProject: null })
    const moved = await fs.readFile(newPath, 'utf-8')
    expect(moved).toContain('category: action')
    expect(moved).toContain('works: pending')
  })

  it('subProject 가 null 이면 기존 sub_project 를 유지한다', async () => {
    await moveNoteToProject(oldPath, newPath, { project: '에너빌드', subProject: null })
    const moved = await fs.readFile(newPath, 'utf-8')
    expect(moved).toContain('sub_project: 이전세부')
  })

  it('양쪽 경로를 recentlyWrittenByApp 에 등록한다', async () => {
    await moveNoteToProject(oldPath, newPath, { project: '에너빌드', subProject: null })
    expect(recentlyWrittenByApp.has(newPath)).toBe(true)
    expect(recentlyWrittenByApp.has(oldPath)).toBe(true)
  })

  it('목적지에 같은 이름이 있으면 exists 로 실패하고 원본을 남긴다', async () => {
    await fs.mkdir(join(tmpDir, '01_Projects', '02_에너빌드', '03_에너지분석'), {
      recursive: true
    })
    await fs.writeFile(newPath, '기존 파일', 'utf-8')

    const result = await moveNoteToProject(oldPath, newPath, {
      project: '에너빌드',
      subProject: null
    })
    expect(result).toMatchObject({ ok: false, code: 'exists' })
    expect(await fs.readFile(newPath, 'utf-8')).toBe('기존 파일')
    expect(await fs.readFile(oldPath, 'utf-8')).toBe(TODO_RAW)
  })

  it('원본 삭제에 실패하면 새 파일을 지워 롤백한다', async () => {
    const unlinkSpy = vi.spyOn(fs, 'unlink').mockRejectedValueOnce(new Error('EBUSY'))

    const result = await moveNoteToProject(oldPath, newPath, {
      project: '에너빌드',
      subProject: null
    })
    expect(result).toMatchObject({ ok: false, code: 'io' })
    await expect(fs.access(newPath)).rejects.toThrow()
    expect(await fs.readFile(oldPath, 'utf-8')).toBe(TODO_RAW)

    unlinkSpy.mockRestore()
  })

  it('읽을 수 없는 원본이면 io 로 실패한다', async () => {
    const result = await moveNoteToProject(join(tmpDir, '없는파일.md'), newPath, {
      project: '에너빌드',
      subProject: null
    })
    expect(result).toMatchObject({ ok: false, code: 'io' })
  })

  it('createNote 는 폴더를 만들며 파일을 쓴다', async () => {
    const target = join(tmpDir, '06_To Do', '2026-09', '0901_새 할일.md')
    const result = await createNote(target, '---\nstatus: planned\n---\n본문')
    expect(result).toEqual({ ok: true })
    expect(await fs.readFile(target, 'utf-8')).toContain('본문')
    expect(recentlyWrittenByApp.has(target)).toBe(true)
  })

  it('createNote 는 이미 있는 파일을 덮지 않는다', async () => {
    const result = await createNote(oldPath, '새 내용')
    expect(result).toMatchObject({ ok: false, code: 'exists' })
    expect(await fs.readFile(oldPath, 'utf-8')).toBe(TODO_RAW)
  })

  it('pathExists 체크 후 실제 쓰기 전에 파일이 생기면 wx 플래그가 거부한다', async () => {
    // Pre-create the destination file
    await fs.mkdir(join(tmpDir, '01_Projects', '02_에너빌드', '03_에너지분석'), {
      recursive: true
    })
    await fs.writeFile(newPath, '이미 있는 파일', 'utf-8')

    // Mock pathExists to return false (simulate race condition)
    const accessSpy = vi.spyOn(fs, 'access').mockRejectedValueOnce(new Error('ENOENT'))

    const result = await moveNoteToProject(oldPath, newPath, {
      project: '에너빌드',
      subProject: null
    })
    expect(result).toMatchObject({ ok: false, code: 'exists' })
    // Destination file should be untouched by the failed write
    expect(await fs.readFile(newPath, 'utf-8')).toBe('이미 있는 파일')
    expect(await fs.readFile(oldPath, 'utf-8')).toBe(TODO_RAW)

    accessSpy.mockRestore()
  })

  it('원본 삭제와 롤백 둘 다 실패하면 두 에러를 모두 보고한다', async () => {
    // Create destination folder but NOT the file itself
    await fs.mkdir(join(tmpDir, '01_Projects', '02_에너빌드', '03_에너지분석'), {
      recursive: true
    })

    // Mock unlink to fail
    const unlinkSpy = vi.spyOn(fs, 'unlink').mockRejectedValueOnce(new Error('EBUSY: unlink'))

    // Mock rm to fail - use mockRejectedValueOnce which returns a rejected promise
    const rmSpy = vi.spyOn(fs, 'rm').mockRejectedValueOnce(new Error('EPERM: rm'))

    const result = await moveNoteToProject(oldPath, newPath, {
      project: '에너빌드',
      subProject: null
    })

    // Should get both errors in the message
    expect(result).toMatchObject({ ok: false, code: 'io' })
    expect(result.error).toContain('EBUSY: unlink')
    expect(result.error).toContain('EPERM: rm')

    // Original should still exist
    expect(await fs.readFile(oldPath, 'utf-8')).toBe(TODO_RAW)

    // New file should have been created (before unlink failed)
    expect(await fs.readFile(newPath, 'utf-8')).toContain('에너빌드')

    unlinkSpy.mockRestore()
    rmSpy.mockRestore()
  })
})
