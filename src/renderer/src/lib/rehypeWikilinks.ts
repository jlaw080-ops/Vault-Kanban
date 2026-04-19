import { visit } from 'unist-util-visit'
import type { Root, Text, Element, RootContent } from 'hast'

const WIKILINK_RE = /\[\[([^\]]+)\]\]/g

export function rehypeWikilinks() {
  return (tree: Root): void => {
    visit(tree, 'text', (node: Text, index: number | undefined, parent) => {
      if (!parent || index === undefined) return

      const matches: { start: number; end: number; label: string; target: string }[] = []
      let match: RegExpExecArray | null

      WIKILINK_RE.lastIndex = 0
      while ((match = WIKILINK_RE.exec(node.value)) !== null) {
        const inner = match[1]
        const [target, alias] = inner.split('|')
        matches.push({
          start: match.index,
          end: match.index + match[0].length,
          label: (alias ?? target).trim(),
          target: target.trim()
        })
      }

      if (matches.length === 0) return

      const nodes: RootContent[] = []
      let cursor = 0

      for (const m of matches) {
        if (cursor < m.start) {
          nodes.push({ type: 'text', value: node.value.slice(cursor, m.start) })
        }
        const link: Element = {
          type: 'element',
          tagName: 'a',
          properties: {
            href: `#wikilink-${encodeURIComponent(m.target)}`,
            className: ['wikilink'],
            'data-target': m.target
          },
          children: [{ type: 'text', value: m.label }]
        }
        nodes.push(link)
        cursor = m.end
      }

      if (cursor < node.value.length) {
        nodes.push({ type: 'text', value: node.value.slice(cursor) })
      }

      ;(parent.children as RootContent[]).splice(index, 1, ...nodes)
    })
  }
}
