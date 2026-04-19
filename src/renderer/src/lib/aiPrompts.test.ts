import { describe, it, expect } from 'vitest'
import { buildGroupingPrompt, buildRelatedPrompt } from './aiPrompts'
import type { AiNoteInput } from './aiPrompts'

const baseNote: AiNoteInput = {
  id: '/vault/note1.md',
  title: '태양광 설계 기초',
  tags: ['태양광', '설계'],
  folder: 'Projects',
  preview: '태양광 패널 설계의 기본 원리를 설명한다.'
}

describe('buildGroupingPrompt', () => {
  it('노트 배열을 JSON 직렬화해서 프롬프트에 포함', () => {
    const notes: AiNoteInput[] = [baseNote]
    const prompt = buildGroupingPrompt(notes)
    expect(prompt).toContain('태양광 설계 기초')
    expect(prompt).toContain('태양광')
  })

  it('preview를 500자로 truncate', () => {
    const longBody = 'a'.repeat(1000)
    const note: AiNoteInput = { ...baseNote, preview: longBody }
    const prompt = buildGroupingPrompt([note])
    expect(prompt).not.toContain('a'.repeat(501))
    expect(prompt).toContain('a'.repeat(500))
  })

  it('여러 노트를 모두 포함', () => {
    const notes: AiNoteInput[] = [
      baseNote,
      { ...baseNote, id: '/vault/note2.md', title: '연료전지 원리' }
    ]
    const prompt = buildGroupingPrompt(notes)
    expect(prompt).toContain('태양광 설계 기초')
    expect(prompt).toContain('연료전지 원리')
  })

  it('JSON 응답 형식 지시 포함', () => {
    const prompt = buildGroupingPrompt([baseNote])
    expect(prompt).toContain('JSON')
    expect(prompt).toContain('projects')
  })
})

describe('buildRelatedPrompt', () => {
  it('기준 노트와 후보 노트를 포함', () => {
    const ref: AiNoteInput = baseNote
    const candidates: AiNoteInput[] = [
      { ...baseNote, id: '/vault/cand1.md', title: '연료전지 기초' }
    ]
    const prompt = buildRelatedPrompt(ref, candidates)
    expect(prompt).toContain('태양광 설계 기초')
    expect(prompt).toContain('연료전지 기초')
  })

  it('candidate preview를 200자로 truncate', () => {
    const longPreview = 'b'.repeat(600)
    const cand: AiNoteInput = { ...baseNote, id: '/c.md', preview: longPreview }
    const prompt = buildRelatedPrompt(baseNote, [cand])
    // 600자짜리 원본이 프롬프트에 없고, 200자 truncate된 값만 있어야 함
    expect(prompt).not.toContain('b'.repeat(201))
    expect(prompt).toContain('b'.repeat(200))
  })

  it('score/reason 포함하는 JSON 응답 지시', () => {
    const prompt = buildRelatedPrompt(baseNote, [baseNote])
    expect(prompt).toContain('score')
    expect(prompt).toContain('reason')
  })

  it('제목, 태그 포함', () => {
    const prompt = buildRelatedPrompt(baseNote, [baseNote])
    expect(prompt).toContain('tags')
    expect(prompt).toContain('title')
  })
})
