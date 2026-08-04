import { useMemo } from 'react'
import Markdown, { defaultUrlTransform } from 'react-markdown'
import remarkGfm from 'remark-gfm'
import remarkBreaks from 'remark-breaks'
import type { Components } from 'react-markdown'
import { remarkObsidian } from '../../lib/docRender/remarkObsidian'
import { VAULT_IMG_URL_PREFIX } from '../../lib/docRender/resolveAsset'
import { Mermaid } from './Mermaid'
import type { AssetResolver } from '@renderer/types'

/**
 * react-markdown 기본 urlTransform 은 허용 프로토콜 화이트리스트
 * (https?|ircs?|mailto|xmpp) 밖의 URL 을 빈 문자열로 지운다.
 * vault-img: 만 예외로 통과시키고, 나머지(javascript: 등)는 기본 동작에 맡긴다.
 */
function documentUrlTransform(url: string): string {
  return url.startsWith(VAULT_IMG_URL_PREFIX) ? url : defaultUrlTransform(url)
}

interface MarkdownDocumentProps {
  markdown: string
  /** 볼트 기준 노트 상대경로 — 이미지 상대경로 해석의 기준점 */
  notePath: string
  resolveAsset: AssetResolver
  onMermaidSettled?: () => void
}

export function MarkdownDocument({
  markdown,
  notePath,
  resolveAsset,
  onMermaidSettled
}: MarkdownDocumentProps): JSX.Element {
  const remarkPlugins = useMemo(
    () => [
      remarkGfm,
      remarkBreaks,
      // 튜플 형태로 등록해야 unified 가 attacher 로 인식한다.
      [remarkObsidian, { notePath, resolveAsset }] as const
    ],
    [notePath, resolveAsset]
  )

  const components = useMemo<Components>(
    () => ({
      code({ className, children, ...props }) {
        const isMermaid = typeof className === 'string' && className.includes('language-mermaid')
        if (isMermaid) {
          return (
            <Mermaid chart={String(children).replace(/\n$/, '')} onSettled={onMermaidSettled} />
          )
        }
        return (
          <code className={className} {...props}>
            {children}
          </code>
        )
      }
    }),
    [onMermaidSettled]
  )

  return (
    <div className="doc-body">
      <Markdown
        remarkPlugins={remarkPlugins as never}
        components={components}
        urlTransform={documentUrlTransform}
        // raw HTML 은 렌더하지 않는다. <!-- pagebreak --> 는 remarkObsidian 이
        // mdast 단계에서 div 로 바꾸므로 raw HTML 활성화가 필요 없다.
      >
        {markdown}
      </Markdown>
    </div>
  )
}
