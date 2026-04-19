import { describe, it, expect, beforeEach, vi } from 'vitest'
import { markSelfWrite, isSelfWrite, clearSelfWrite } from './writeGuard'

describe('writeGuard', () => {
  beforeEach(() => {
    clearSelfWrite()
    vi.useFakeTimers()
  })

  it('returns false for unknown path', () => {
    expect(isSelfWrite('/vault/note.md')).toBe(false)
  })

  it('returns true immediately after marking', () => {
    markSelfWrite('/vault/note.md')
    expect(isSelfWrite('/vault/note.md')).toBe(true)
  })

  it('expires after TTL (1000ms)', () => {
    markSelfWrite('/vault/note.md')
    vi.advanceTimersByTime(999)
    expect(isSelfWrite('/vault/note.md')).toBe(true)
    vi.advanceTimersByTime(1)
    expect(isSelfWrite('/vault/note.md')).toBe(false)
  })

  it('resets timer on repeated mark', () => {
    markSelfWrite('/vault/note.md')
    vi.advanceTimersByTime(800)
    markSelfWrite('/vault/note.md')
    vi.advanceTimersByTime(800)
    expect(isSelfWrite('/vault/note.md')).toBe(true)
    vi.advanceTimersByTime(200)
    expect(isSelfWrite('/vault/note.md')).toBe(false)
  })

  it('marks and expires independently per path', () => {
    markSelfWrite('/vault/a.md')
    vi.advanceTimersByTime(500)
    markSelfWrite('/vault/b.md')
    vi.advanceTimersByTime(600)
    expect(isSelfWrite('/vault/a.md')).toBe(false)
    expect(isSelfWrite('/vault/b.md')).toBe(true)
  })
})
