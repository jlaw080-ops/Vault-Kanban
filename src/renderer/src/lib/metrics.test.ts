import { describe, it, expect } from 'vitest'
import {
  getStayDays,
  getStayColor,
  computeLeadTime,
  computeCycleTime,
  computeThroughput,
  buildCfd
} from './metrics'
import type { DateRange } from './metrics'
import type { Note, ColumnConfig } from '@renderer/types'

const baseNote: Note = {
  filePath: '/vault/test.md',
  relativePath: 'test.md',
  title: 'Test',
  status: 'in-progress',
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
    const note: Note = { ...baseNote, status: 'in-progress', started: '2024-01-03T00:00:00Z' }
    expect(getStayDays(note, col('in-progress'), now)).toBe(7)
  })

  it('진행중 컬럼: started가 없으면 mtime 기준 반환', () => {
    const note: Note = { ...baseNote, status: 'in-progress', started: null }
    // mtime: Jan 5, now: Jan 10 → 5일
    expect(getStayDays(note, col('in-progress'), now)).toBe(5)
  })

  it('백로그 컬럼: created 기준', () => {
    const note: Note = { ...baseNote, status: 'backlog' }
    // created: Jan 1, now: Jan 10 → 9일
    expect(getStayDays(note, col('backlog'), now)).toBe(9)
  })

  it('예정 컬럼: created 기준', () => {
    const note: Note = { ...baseNote, status: 'planned' }
    expect(getStayDays(note, col('planned'), now)).toBe(9)
  })

  it('검토 컬럼: mtime 기준', () => {
    const note: Note = { ...baseNote, status: 'review' }
    // mtime: Jan 5, now: Jan 10 → 5일
    expect(getStayDays(note, col('review'), now)).toBe(5)
  })

  it('완료 컬럼: mtime 기준', () => {
    const note: Note = { ...baseNote, status: 'done' }
    expect(getStayDays(note, col('done'), now)).toBe(5)
  })

  it('mtime이 created보다 이전인 경우 음수 반환 없음 (최소 0)', () => {
    const note: Note = {
      ...baseNote,
      status: 'review',
      mtime: new Date('2023-12-01T00:00:00Z').getTime()
    }
    const result = getStayDays(note, col('review'), now)
    expect(result).toBeGreaterThanOrEqual(0)
  })

  it('created가 미래인 경우 최소 0 반환', () => {
    const note: Note = {
      ...baseNote,
      status: 'backlog',
      created: '2025-01-01T00:00:00Z'
    }
    const result = getStayDays(note, col('backlog'), now)
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

describe('computeLeadTime', () => {
  it('completed와 created가 모두 있으면 일수 반환', () => {
    const note: Note = {
      ...baseNote,
      created: '2024-01-01T00:00:00Z',
      completed: '2024-01-11T00:00:00Z'
    }
    expect(computeLeadTime(note)).toBe(10)
  })

  it('completed가 없으면 undefined 반환', () => {
    const note: Note = { ...baseNote, completed: null }
    expect(computeLeadTime(note)).toBeUndefined()
  })

  it('같은 날 created와 completed면 0일', () => {
    const note: Note = {
      ...baseNote,
      created: '2024-01-05T00:00:00Z',
      completed: '2024-01-05T23:59:59Z'
    }
    expect(computeLeadTime(note)).toBe(0)
  })

  it('created가 없으면 undefined 반환', () => {
    const note: Note = {
      ...baseNote,
      created: '',
      completed: '2024-01-11T00:00:00Z'
    }
    expect(computeLeadTime(note)).toBeUndefined()
  })

  it('done 상태이고 completed가 없으면 mtime을 완료 시각으로 사용', () => {
    const note: Note = {
      ...baseNote,
      status: 'done',
      created: '2024-01-01T00:00:00Z',
      completed: null,
      mtime: new Date('2024-01-11T00:00:00Z').getTime()
    }
    expect(computeLeadTime(note)).toBe(10)
  })
})

describe('computeCycleTime', () => {
  it('started와 completed가 모두 있으면 일수 반환', () => {
    const note: Note = {
      ...baseNote,
      started: '2024-01-05T00:00:00Z',
      completed: '2024-01-10T00:00:00Z'
    }
    expect(computeCycleTime(note)).toBe(5)
  })

  it('started가 없으면 undefined (done 아닌 경우)', () => {
    const note: Note = { ...baseNote, status: 'in-progress', started: null, completed: '2024-01-10T00:00:00Z' }
    expect(computeCycleTime(note)).toBeUndefined()
  })

  it('done 상태이고 started가 없으면 created를 시작 시각으로 사용', () => {
    const note: Note = {
      ...baseNote,
      status: 'done',
      created: '2024-01-01T00:00:00Z',
      started: null,
      completed: '2024-01-06T00:00:00Z'
    }
    expect(computeCycleTime(note)).toBe(5)
  })

  it('completed가 없으면 undefined', () => {
    const note: Note = { ...baseNote, started: '2024-01-05T00:00:00Z', completed: null }
    expect(computeCycleTime(note)).toBeUndefined()
  })

  it('같은 날 started+completed면 0일', () => {
    const note: Note = {
      ...baseNote,
      started: '2024-01-05T06:00:00Z',
      completed: '2024-01-05T20:00:00Z'
    }
    expect(computeCycleTime(note)).toBe(0)
  })

  it('done 상태이고 completed가 없으면 mtime을 완료 시각으로 사용', () => {
    const note: Note = {
      ...baseNote,
      status: 'done',
      started: '2024-01-05T00:00:00Z',
      completed: null,
      mtime: new Date('2024-01-10T00:00:00Z').getTime()
    }
    expect(computeCycleTime(note)).toBe(5)
  })
})

describe('computeThroughput', () => {
  const range: DateRange = {
    from: new Date('2024-01-01T00:00:00Z'),
    to: new Date('2024-01-07T23:59:59Z')
  }

  it('bucket=day: completed 날짜별 카운트', () => {
    const notes: Note[] = [
      { ...baseNote, completed: '2024-01-02T00:00:00Z' },
      { ...baseNote, completed: '2024-01-02T12:00:00Z' },
      { ...baseNote, completed: '2024-01-05T00:00:00Z' }
    ]
    const result = computeThroughput(notes, range, 'day')
    const jan2 = result.find((r) => r.date === '2024-01-02')
    const jan5 = result.find((r) => r.date === '2024-01-05')
    expect(jan2?.count).toBe(2)
    expect(jan5?.count).toBe(1)
  })

  it('범위 밖 completed는 제외', () => {
    const notes: Note[] = [
      { ...baseNote, completed: '2023-12-31T00:00:00Z' },
      { ...baseNote, completed: '2024-01-08T00:00:00Z' }
    ]
    const result = computeThroughput(notes, range, 'day')
    expect(result.every((r) => r.count === 0)).toBe(true)
  })

  it('completed 없는 노트는 포함되지 않음 (done 아닌 경우)', () => {
    const notes: Note[] = [{ ...baseNote, status: 'in-progress', completed: null }]
    const result = computeThroughput(notes, range, 'day')
    expect(result.every((r) => r.count === 0)).toBe(true)
  })

  it('done 상태이고 completed가 없으면 mtime 기준으로 집계', () => {
    const notes: Note[] = [
      {
        ...baseNote,
        status: 'done',
        completed: null,
        mtime: new Date('2024-01-02T00:00:00Z').getTime()
      }
    ]
    const result = computeThroughput(notes, range, 'day')
    const jan2 = result.find((r) => r.date === '2024-01-02')
    expect(jan2?.count).toBe(1)
  })

  it('bucket=week: 주 단위로 집계', () => {
    const weekRange: DateRange = {
      from: new Date('2024-01-01T00:00:00Z'),
      to: new Date('2024-01-14T23:59:59Z')
    }
    const notes: Note[] = [
      { ...baseNote, completed: '2024-01-03T00:00:00Z' },
      { ...baseNote, completed: '2024-01-10T00:00:00Z' },
      { ...baseNote, completed: '2024-01-11T00:00:00Z' }
    ]
    const result = computeThroughput(notes, weekRange, 'week')
    expect(result.length).toBeGreaterThan(0)
    const total = result.reduce((s, r) => s + r.count, 0)
    expect(total).toBe(3)
  })
})

describe('buildCfd', () => {
  const range: DateRange = {
    from: new Date('2024-01-01T00:00:00Z'),
    to: new Date('2024-01-03T23:59:59Z')
  }

  it('created 이전에는 노트 미존재 (all zero)', () => {
    const notes: Note[] = [
      {
        ...baseNote,
        created: '2024-01-02T00:00:00Z',
        started: null,
        completed: null
      }
    ]
    const result = buildCfd(notes, range, 'day')
    const jan1 = result.find((r) => r.date === '2024-01-01')
    expect(jan1?.backlog).toBe(0)
  })

  it('started 이전에는 백로그로 분류', () => {
    const notes: Note[] = [
      {
        ...baseNote,
        created: '2024-01-01T00:00:00Z',
        started: '2024-01-03T00:00:00Z',
        completed: null
      }
    ]
    const result = buildCfd(notes, range, 'day')
    const jan2 = result.find((r) => r.date === '2024-01-02')
    expect(jan2?.backlog).toBe(1)
    expect(jan2?.['in-progress']).toBe(0)
  })

  it('completed 이후에는 완료로 분류', () => {
    const notes: Note[] = [
      {
        ...baseNote,
        created: '2024-01-01T00:00:00Z',
        started: '2024-01-01T00:00:00Z',
        completed: '2024-01-02T00:00:00Z'
      }
    ]
    const result = buildCfd(notes, range, 'day')
    const jan3 = result.find((r) => r.date === '2024-01-03')
    expect(jan3?.done).toBe(1)
    expect(jan3?.['in-progress']).toBe(0)
  })

  it('started 없이 completed만 있으면 created부터 백로그, completed 이후 완료', () => {
    const notes: Note[] = [
      {
        ...baseNote,
        created: '2024-01-01T00:00:00Z',
        started: null,
        completed: '2024-01-02T00:00:00Z'
      }
    ]
    const result = buildCfd(notes, range, 'day')
    const jan1 = result.find((r) => r.date === '2024-01-01')
    const jan2 = result.find((r) => r.date === '2024-01-02')
    expect(jan1?.backlog).toBe(1)
    expect(jan2?.done).toBe(1)
  })
})
