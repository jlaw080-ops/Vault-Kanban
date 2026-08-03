import { describe, it, expect } from 'vitest'
import { unified } from 'unified'
import remarkParse from 'remark-parse'
import type { Root } from 'mdast'
import type { AssetResolver } from '@renderer/types'
import { remarkObsidian } from './remarkObsidian'

const stubResolver: AssetResolver = (notePath, target) => `test://${notePath}::${target}`

/** 마크다운을 파싱하고 remarkObsidian을 적용한 mdast를 돌려준다. */
function transform(markdown: string, notePath = 'folder/노트.md'): Root {
  const tree = unified().use(remarkParse).parse(markdown) as Root
  remarkObsidian({ notePath, resolveAsset: stubResolver })(tree)
  return tree
}

/** 트리에서 특정 타입 노드를 전부 모은다. */
function collect(tree: Root, type: string): Record<string, unknown>[] {
  const found: Record<string, unknown>[] = []
  const walk = (node: Record<string, unknown>): void => {
    if (node.type === type) found.push(node)
    const children = node.children as Record<string, unknown>[] | undefined
    if (Array.isArray(children)) children.forEach(walk)
  }
  walk(tree as unknown as Record<string, unknown>)
  return found
}

describe('remarkObsidian — 이미지 임베드', () => {
  it('이미지 확장자 임베드를 image 노드로 바꾸고 리졸버 결과를 url로 쓴다', () => {
    const images = collect(transform('![[도면.png]]'), 'image')
    expect(images).toHaveLength(1)
    expect(images[0].url).toBe('test://folder/노트.md::도면.png')
  })

  it('크기 지정(|300)은 무시하고 파일명만 해석한다', () => {
    const images = collect(transform('![[도면.png|300]]'), 'image')
    expect(images).toHaveLength(1)
    expect(images[0].url).toBe('test://folder/노트.md::도면.png')
  })

  it('대문자 확장자도 이미지로 인식한다', () => {
    expect(collect(transform('![[사진.JPG]]'), 'image')).toHaveLength(1)
  })

  it('이미지 확장자가 아닌 임베드는 strong 텍스트로 내린다 (노트 임베드 미지원)', () => {
    const tree = transform('![[다른노트]]')
    expect(collect(tree, 'image')).toHaveLength(0)
    const strongs = collect(tree, 'strong')
    expect(strongs).toHaveLength(1)
    expect((strongs[0].children as { value: string }[])[0].value).toBe('다른노트')
  })
})

describe('remarkObsidian — 위키링크', () => {
  it('위키링크를 strong 노드로 바꾼다', () => {
    const strongs = collect(transform('[[ZEB 설계기준]]'), 'strong')
    expect(strongs).toHaveLength(1)
    expect((strongs[0].children as { value: string }[])[0].value).toBe('ZEB 설계기준')
  })

  it('별칭이 있으면 별칭을 표시한다', () => {
    const strongs = collect(transform('[[노트경로|별칭]]'), 'strong')
    expect((strongs[0].children as { value: string }[])[0].value).toBe('별칭')
  })

  it('한 줄에 위키링크가 여러 개면 각각 변환하고 사이 텍스트를 보존한다', () => {
    const tree = transform('앞 [[가]] 중간 [[나]] 뒤')
    expect(collect(tree, 'strong')).toHaveLength(2)
    const texts = collect(tree, 'text').map((n) => n.value)
    expect(texts).toContain(' 중간 ')
    expect(texts).toContain('앞 ')
    expect(texts).toContain(' 뒤')
  })

  it('위키링크가 없는 텍스트는 건드리지 않는다', () => {
    const tree = transform('평범한 문단입니다')
    expect(collect(tree, 'strong')).toHaveLength(0)
    expect(collect(tree, 'text')[0].value).toBe('평범한 문단입니다')
  })
})

describe('remarkObsidian — 코드 안에서는 변환하지 않는다 (회귀 방지)', () => {
  it('코드블록 안의 위키링크·임베드는 변환되지 않는다', () => {
    const tree = transform('```\n[[가]] 그리고 ![[나.png]]\n```')
    expect(collect(tree, 'strong')).toHaveLength(0)
    expect(collect(tree, 'image')).toHaveLength(0)
    expect(collect(tree, 'code')[0].value).toBe('[[가]] 그리고 ![[나.png]]')
  })

  it('인라인 코드 안의 위키링크는 변환되지 않는다', () => {
    const tree = transform('`[[가]]` 는 위키링크 문법이다')
    expect(collect(tree, 'strong')).toHaveLength(0)
    expect(collect(tree, 'inlineCode')[0].value).toBe('[[가]]')
  })
})
