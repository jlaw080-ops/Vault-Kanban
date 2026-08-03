import { visit, SKIP } from 'unist-util-visit'
import type { Root, Text, PhrasingContent, Parent } from 'mdast'
import type { AssetResolver } from '@renderer/types'

export interface RemarkObsidianOptions {
  /** 볼트 루트 기준 노트 상대경로 (이미지 상대경로 해석의 기준점) */
  notePath: string
  resolveAsset: AssetResolver
}

const IMAGE_EXT = /\.(png|jpe?g|gif|svg|webp|bmp|avif)$/i

/** `![[..]]` 또는 `[[..]]` 를 찾는다. 선행 `!` 여부로 임베드/링크를 구분한다. */
const WIKI_RE = /(!?)\[\[([^\]]+)\]\]/g

interface WikiMatch {
  start: number
  end: number
  isEmbed: boolean
  target: string
  alias?: string
}

function findMatches(value: string): WikiMatch[] {
  const matches: WikiMatch[] = []
  WIKI_RE.lastIndex = 0
  let m: RegExpExecArray | null
  while ((m = WIKI_RE.exec(value)) !== null) {
    const [target, alias] = m[2].split('|')
    matches.push({
      start: m.index,
      end: m.index + m[0].length,
      isEmbed: m[1] === '!',
      target: target.trim(),
      alias: alias?.trim()
    })
  }
  return matches
}

function strongText(value: string): PhrasingContent {
  return { type: 'strong', children: [{ type: 'text', value }] }
}

/**
 * 텍스트 노드 하나를 위키 문법 기준으로 쪼갠다.
 * 변환할 것이 없으면 null 을 돌려 호출부가 원본을 유지하게 한다.
 */
function splitWikiSyntax(value: string, options: RemarkObsidianOptions): PhrasingContent[] | null {
  const matches = findMatches(value)
  if (matches.length === 0) return null

  const out: PhrasingContent[] = []
  let cursor = 0

  for (const match of matches) {
    if (cursor < match.start) {
      out.push({ type: 'text', value: value.slice(cursor, match.start) })
    }

    if (match.isEmbed && IMAGE_EXT.test(match.target)) {
      out.push({
        type: 'image',
        url: options.resolveAsset(options.notePath, match.target),
        alt: match.target
      })
    } else {
      // 노트 임베드(transclusion)는 지원하지 않는다 — 텍스트로 내린다.
      out.push(strongText(match.alias ?? match.target))
    }

    cursor = match.end
  }

  if (cursor < value.length) {
    out.push({ type: 'text', value: value.slice(cursor) })
  }

  return out
}

export function remarkObsidian(options: RemarkObsidianOptions) {
  return (tree: Root): void => {
    // 'text' 노드만 방문하므로 code / inlineCode 노드는 자동으로 제외된다.
    visit(tree, 'text', (node: Text, index, parent) => {
      if (!parent || index === undefined) return
      const replacement = splitWikiSyntax(node.value, options)
      if (!replacement) return
      ;(parent as Parent).children.splice(index, 1, ...replacement)
      // 새로 넣은 노드를 다시 방문하지 않도록 커서를 건너뛴다.
      return [SKIP, index + replacement.length]
    })
  }
}
