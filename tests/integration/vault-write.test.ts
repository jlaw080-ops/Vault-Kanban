import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { promises as fs } from 'fs'
import { join } from 'path'
import { tmpdir } from 'os'
import {
  writeNoteToDisk,
  recentlyWrittenByApp,
  isRecentlyWrittenByApp,
  RECENT_WRITE_TTL_MS
} from '../../src/main/ipc/vault'
import type { Note } from '../../src/main/utils/markdown'

const MTIME = 1_700_000_000_000

function makeNote(overrides: Partial<Note> = {}): Note {
  return {
    filePath: '',
    relativePath: 't.md',
    title: '테스트 노트',
    status: '진행중',
    tags: ['zeb'],
    created: '2026-04-01',
    body: '본문 내용',
    mtime: MTIME,
    originalKeyOrder: ['title', 'status', 'tags', 'created'],
    ...overrides
  }
}

describe('writeNoteToDisk — recentlyWrittenByApp self-write guard', () => {
  let tmpDir: string

  beforeEach(async () => {
    tmpDir = await fs.mkdtemp(join(tmpdir(), 'vault-write-'))
    recentlyWrittenByApp.clear()
    vi.useFakeTimers()
  })

  afterEach(async () => {
    vi.useRealTimers()
    recentlyWrittenByApp.clear()
    await fs.rm(tmpDir, { recursive: true, force: true })
  })

  it('파일을 UTF-8로 디스크에 쓴다', async () => {
    const filePath = join(tmpDir, 'note.md')
    const note = makeNote({ filePath })

    await writeNoteToDisk(note)

    const written = await fs.readFile(filePath, 'utf-8')
    expect(written).toContain('title: 테스트 노트')
    expect(written).toContain('status: 진행중')
    expect(written).toContain('본문 내용')
  })

  it('serializeNote 결과를 그대로 디스크에 쓴다 (key 순서 보존)', async () => {
    const filePath = join(tmpDir, 'order.md')
    const note = makeNote({
      filePath,
      originalKeyOrder: ['status', 'title', 'tags', 'created']
    })

    await writeNoteToDisk(note)

    const written = await fs.readFile(filePath, 'utf-8')
    const statusIdx = written.indexOf('status:')
    const titleIdx = written.indexOf('title:')
    expect(statusIdx).toBeGreaterThan(0)
    expect(statusIdx).toBeLessThan(titleIdx)
  })

  it('fs.writeFile 직전에 recentlyWrittenByApp Set에 경로를 추가한다', async () => {
    const filePath = join(tmpDir, 'guard.md')
    const note = makeNote({ filePath })

    await writeNoteToDisk(note)

    expect(isRecentlyWrittenByApp(filePath)).toBe(true)
  })

  it(`recentlyWrittenByApp 항목은 ${RECENT_WRITE_TTL_MS}ms 후 자동 삭제된다`, async () => {
    const filePath = join(tmpDir, 'ttl.md')
    const note = makeNote({ filePath })

    await writeNoteToDisk(note)
    expect(isRecentlyWrittenByApp(filePath)).toBe(true)

    vi.advanceTimersByTime(RECENT_WRITE_TTL_MS - 1)
    expect(isRecentlyWrittenByApp(filePath)).toBe(true)

    vi.advanceTimersByTime(2)
    expect(isRecentlyWrittenByApp(filePath)).toBe(false)
  })

  it('동일 경로에 연속 쓰기 시 TTL이 갱신된다', async () => {
    const filePath = join(tmpDir, 'refresh.md')
    const note = makeNote({ filePath })

    await writeNoteToDisk(note)
    vi.advanceTimersByTime(RECENT_WRITE_TTL_MS - 100)

    await writeNoteToDisk(note)
    vi.advanceTimersByTime(200)

    expect(isRecentlyWrittenByApp(filePath)).toBe(true)
  })

  it('filePath가 비어있으면 에러를 던진다', async () => {
    const note = makeNote({ filePath: '' })
    await expect(writeNoteToDisk(note)).rejects.toThrow()
  })

  it('isRecentlyWrittenByApp는 등록되지 않은 경로에 대해 false를 반환한다', () => {
    expect(isRecentlyWrittenByApp(join(tmpDir, 'missing.md'))).toBe(false)
  })
})
