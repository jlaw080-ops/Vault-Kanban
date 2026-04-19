import { describe, expect, it } from 'vitest'
import type { Note, Status } from '../types'
import { apply } from './statusTransition'

const NOW = new Date('2026-04-19T10:00:00.000Z')
const NOW_ISO = NOW.toISOString()
const PRIOR_ISO = '2026-03-01T08:30:00.000Z'

function makeNote(overrides: Partial<Note> = {}): Note {
  return {
    filePath: '/vault/sample.md',
    relativePath: 'sample.md',
    title: 'Sample',
    status: '백로그',
    tags: [],
    created: '2026-02-01T00:00:00.000Z',
    body: '',
    mtime: 0,
    ...overrides
  }
}

describe('statusTransition.apply', () => {
  describe('진행중으로 이동', () => {
    it('started가 null이면 현재시각을 기록한다', () => {
      const note = makeNote({ status: '백로그', started: null })

      const result = apply(note, '진행중', NOW)

      expect(result.status).toBe('진행중')
      expect(result.started).toBe(NOW_ISO)
    })

    it('started가 undefined이면 현재시각을 기록한다', () => {
      const note = makeNote({ status: '예정', started: undefined })

      const result = apply(note, '진행중', NOW)

      expect(result.started).toBe(NOW_ISO)
    })

    it('started가 이미 있으면 보존한다', () => {
      const note = makeNote({ status: '검토', started: PRIOR_ISO })

      const result = apply(note, '진행중', NOW)

      expect(result.started).toBe(PRIOR_ISO)
    })
  })

  describe('완료로 이동', () => {
    it('completed에 항상 현재시각을 기록한다', () => {
      const note = makeNote({ status: '검토', completed: null })

      const result = apply(note, '완료', NOW)

      expect(result.status).toBe('완료')
      expect(result.completed).toBe(NOW_ISO)
    })

    it('completed에 이미 값이 있어도 현재시각으로 덮어쓴다', () => {
      const note = makeNote({ status: '진행중', completed: PRIOR_ISO })

      const result = apply(note, '완료', NOW)

      expect(result.completed).toBe(NOW_ISO)
    })

    it('진행중 상태에서 완료로 이동해도 started는 보존한다', () => {
      const note = makeNote({ status: '진행중', started: PRIOR_ISO })

      const result = apply(note, '완료', NOW)

      expect(result.started).toBe(PRIOR_ISO)
      expect(result.completed).toBe(NOW_ISO)
    })
  })

  describe('완료에서 다른 컬럼으로 이동', () => {
    const fromCompleted: Status[] = ['백로그', '예정', '진행중', '검토']

    fromCompleted.forEach((target) => {
      it(`완료 → ${target} 이동 시 completed를 null로 초기화한다`, () => {
        const note = makeNote({
          status: '완료',
          started: PRIOR_ISO,
          completed: PRIOR_ISO
        })

        const result = apply(note, target, NOW)

        expect(result.status).toBe(target)
        expect(result.completed).toBeNull()
      })
    })

    it('완료 → 진행중 이동 시 started는 그대로 보존한다', () => {
      const note = makeNote({
        status: '완료',
        started: PRIOR_ISO,
        completed: PRIOR_ISO
      })

      const result = apply(note, '진행중', NOW)

      expect(result.started).toBe(PRIOR_ISO)
      expect(result.completed).toBeNull()
    })
  })

  describe('그 외 컬럼 간 이동', () => {
    it('백로그 → 예정 이동 시 started/completed는 변경되지 않는다', () => {
      const note = makeNote({
        status: '백로그',
        started: null,
        completed: null
      })

      const result = apply(note, '예정', NOW)

      expect(result.status).toBe('예정')
      expect(result.started).toBeNull()
      expect(result.completed).toBeNull()
    })

    it('검토 → 백로그 이동 시 기존 started를 보존한다', () => {
      const note = makeNote({
        status: '검토',
        started: PRIOR_ISO,
        completed: null
      })

      const result = apply(note, '백로그', NOW)

      expect(result.status).toBe('백로그')
      expect(result.started).toBe(PRIOR_ISO)
      expect(result.completed).toBeNull()
    })

    it('예정 → 검토 이동 시 started/completed 둘 다 변경되지 않는다', () => {
      const note = makeNote({
        status: '예정',
        started: undefined,
        completed: undefined
      })

      const result = apply(note, '검토', NOW)

      expect(result.status).toBe('검토')
      expect(result.started).toBeUndefined()
      expect(result.completed).toBeUndefined()
    })
  })

  describe('동일 컬럼 이동', () => {
    it('같은 status로 이동하면 started/completed 모두 변경되지 않는다', () => {
      const note = makeNote({
        status: '진행중',
        started: PRIOR_ISO,
        completed: null
      })

      const result = apply(note, '진행중', NOW)

      expect(result.started).toBe(PRIOR_ISO)
      expect(result.completed).toBeNull()
    })
  })

  describe('불변성', () => {
    it('원본 note 객체를 수정하지 않는다', () => {
      const note = makeNote({ status: '백로그', started: null })

      apply(note, '진행중', NOW)

      expect(note.status).toBe('백로그')
      expect(note.started).toBeNull()
    })
  })
})
