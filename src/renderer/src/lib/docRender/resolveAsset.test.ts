import { describe, it, expect } from 'vitest'
import { localResolver } from './resolveAsset'

describe('localResolver', () => {
  it('vault-img 스킴 URL을 만든다', () => {
    const url = localResolver('folder/note.md', 'img.png')
    expect(url.startsWith('vault-img://asset/?')).toBe(true)
  })

  it('note 와 target 을 쿼리 파라미터로 넣는다', () => {
    const url = new URL(localResolver('folder/note.md', 'img.png'))
    expect(url.searchParams.get('note')).toBe('folder/note.md')
    expect(url.searchParams.get('target')).toBe('img.png')
  })

  it('한글 파일명이 인코딩 왕복을 견딘다', () => {
    const url = new URL(localResolver('01_프로젝트/설계 노트.md', '평면도 (최종).png'))
    expect(url.searchParams.get('note')).toBe('01_프로젝트/설계 노트.md')
    expect(url.searchParams.get('target')).toBe('평면도 (최종).png')
  })

  it('& 와 = 가 들어간 파일명도 깨지지 않는다', () => {
    const url = new URL(localResolver('a.md', 'a&b=c.png'))
    expect(url.searchParams.get('target')).toBe('a&b=c.png')
  })

  it('상대경로 구분자를 보존한다', () => {
    const url = new URL(localResolver('a/b.md', '../assets/img.png'))
    expect(url.searchParams.get('target')).toBe('../assets/img.png')
  })
})
