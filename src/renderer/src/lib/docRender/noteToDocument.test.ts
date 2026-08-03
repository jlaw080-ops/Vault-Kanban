import { describe, it, expect } from 'vitest'
import { noteToDocument } from './noteToDocument'
import type { Note } from '@renderer/types'

function makeNote(overrides: Partial<Note> = {}): Note {
  return {
    filePath: 'C:/vault/folder/note.md',
    relativePath: 'folder/note.md',
    title: '설계 검토',
    status: 'in-progress',
    tags: [],
    created: '2026-04-01',
    body: '본문',
    mtime: 1_700_000_000_000,
    ...overrides
  }
}

describe('noteToDocument', () => {
  it('제목과 본문을 그대로 옮긴다', () => {
    const doc = noteToDocument(makeNote({ title: '제목', body: '# 머리글\n\n내용' }))
    expect(doc.title).toBe('제목')
    expect(doc.markdown).toBe('# 머리글\n\n내용')
  })

  it('이미지가 없으면 assets 가 빈 배열이다', () => {
    expect(noteToDocument(makeNote({ body: '이미지 없는 본문' })).assets).toEqual([])
  })

  it('Obsidian 임베드 이미지를 수집한다', () => {
    const doc = noteToDocument(makeNote({ body: '![[평면도.png]] 그리고 ![[입면도.jpg]]' }))
    expect(doc.assets).toEqual(['평면도.png', '입면도.jpg'])
  })

  it('임베드의 크기 지정(|300)을 벗겨낸다', () => {
    expect(noteToDocument(makeNote({ body: '![[도면.png|300]]' })).assets).toEqual(['도면.png'])
  })

  it('이미지가 아닌 임베드는 수집하지 않는다', () => {
    expect(noteToDocument(makeNote({ body: '![[다른노트]]' })).assets).toEqual([])
  })

  it('표준 마크다운 이미지도 수집한다', () => {
    expect(noteToDocument(makeNote({ body: '![캡션](attachments/x.png)' })).assets).toEqual([
      'attachments/x.png'
    ])
  })

  it('원격 URL 이미지는 수집하지 않는다 (업로드 대상이 아님)', () => {
    const body =
      '![a](https://example.com/x.png)\n![b](http://example.com/y.png)\n![c](data:image/png;base64,AAA)'
    expect(noteToDocument(makeNote({ body })).assets).toEqual([])
  })

  it('같은 이미지가 여러 번 나와도 한 번만 수집한다', () => {
    expect(noteToDocument(makeNote({ body: '![[a.png]] ![[a.png]]' })).assets).toEqual(['a.png'])
  })
})
