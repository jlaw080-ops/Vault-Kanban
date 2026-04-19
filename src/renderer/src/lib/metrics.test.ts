import { describe, it, expect } from 'vitest'
import { getStayDays, getStayColor } from './metrics'
import type { Note, ColumnConfig } from '@renderer/types'

const baseNote: Note = {
  filePath: '/vault/test.md',
  relativePath: 'test.md',
  title: 'Test',
  status: '진행중',
  tags: [],
  body: '',
  created: '2024-01-01T00:00:00Z',
  mtime: new Date('2024-01-05T00:00:00Z').getTime(),
  started: null,
  completed: null
}

const col = (name: string): ColumnConfig => ({ name, wipLimit: null, policy: '' })

describe('getStayDays', () => {
  const now = new Date('2024-01-10T00:00:00Z')

  it('진행중 컬럼: started가 있으면 (now - started)일 반환', () => {
    const note: Note = { ...baseNote, status: '진행중', started: '2024-01-03T00:00:00Z' }
    expect(getStayDays(note, col('진행중'), now)).toBe(7)
  })

  it('진행중 컬럼: started가 없으면 mtime 기준 반환', () => {
    const note: Note = { ...baseNote, status: '진행중', started: null }
    // mtime: Jan 5, now: Jan 10 → 5일
    expect(getStayDays(note, col('진행중'), now)).toBe(5)
  })

  it('백로그 컬럼: created 기준', () => {
    const note: Note = { ...baseNote, status: '백로그' }
    // created: Jan 1, now: Jan 10 → 9일
    expect(getStayDays(note, col('백로그'), now)).toBe(9)
  })

  it('예정 컬럼: created 기준', () => {
    const note: Note = { ...baseNote, status: '예정' }
    expect(getStayDays(note, col('예정'), now)).toBe(9)
  })

  it('검토 컬럼: mtime 기준', () => {
    const note: Note = { ...baseNote, status: '검토' }
    // mtime: Jan 5, now: Jan 10 → 5일
    expect(getStayDays(note, col('검토'), now)).toBe(5)
  })

  it('완료 컬럼: mtime 기준', () => {
    const note: Note = { ...baseNote, status: '완료' }
    expect(getStayDays(note, col('완료'), now)).toBe(5)
  })

  it('mtime이 created보다 이전인 경우 음수 반환 없음 (최소 0)', () => {
    const note: Note = {
      ...baseNote,
      status: '검토',
      mtime: new Date('2023-12-01T00:00:00Z').getTime()
    }
    const result = getStayDays(note, col('검토'), now)
    expect(result).toBeGreaterThanOrEqual(0)
  })

  it('created가 미래인 경우 최소 0 반환', () => {
    const note: Note = {
      ...baseNote,
      status: '백로그',
      created: '2025-01-01T00:00:00Z'
    }
    const result = getStayDays(note, col('백로그'), now)
    expect(result).toBe(0)
  })
})

describe('getStayColor', () => {
  const warn = { yellow: 3, red: 7 }

  it('3일 미만: default', () => {
    expect(getStayColor(0, warn)).toBe('default')
    expect(getStayColor(2, warn)).toBe('default')
  })

  it('3일 이상 7일 미만: yellow', () => {
    expect(getStayColor(3, warn)).toBe('yellow')
    expect(getStayColor(6, warn)).toBe('yellow')
  })

  it('7일 이상: red', () => {
    expect(getStayColor(7, warn)).toBe('red')
    expect(getStayColor(30, warn)).toBe('red')
  })

  it('임계값 변경 시 반영', () => {
    expect(getStayColor(5, { yellow: 5, red: 10 })).toBe('yellow')
    expect(getStayColor(4, { yellow: 5, red: 10 })).toBe('default')
  })
})
