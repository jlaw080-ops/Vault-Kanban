import { useEffect, useId, useRef, useState } from 'react'

interface MermaidProps {
  chart: string
  /** 렌더가 끝나면(성공·실패 무관) 정확히 한 번 호출된다. */
  onSettled?: () => void
}

export function Mermaid({ chart, onSettled }: MermaidProps): JSX.Element {
  const [svg, setSvg] = useState<string | null>(null)
  const [failed, setFailed] = useState(false)
  const reactId = useId()
  const settledRef = useRef(false)
  const onSettledRef = useRef(onSettled)

  // 콜백이 매 렌더마다 새 함수여도 effect 가 재실행되지 않게 ref 에 보관한다.
  useEffect(() => {
    onSettledRef.current = onSettled
  }, [onSettled])

  useEffect(() => {
    let cancelled = false

    function settle(): void {
      if (settledRef.current) return
      settledRef.current = true
      onSettledRef.current?.()
    }

    async function render(): Promise<void> {
      // chart 가 바뀌면 이전 다이어그램이 남지 않도록 먼저 비운다.
      // (effect 본문에서 직접 호출하면 react-hooks/set-state-in-effect 에 걸린다)
      setSvg(null)
      setFailed(false)
      try {
        const mermaid = (await import('mermaid')).default
        mermaid.initialize({
          startOnLoad: false,
          // PaperFlow 와 동일 설정 — 웹 공유 시 렌더 결과를 일치시키기 위함
          securityLevel: 'strict',
          // 지면이 흰 배경이므로 밝은 테마를 쓴다
          theme: 'default'
        })
        // mermaid 가 요구하는 유효한 DOM id 로 정규화한다 (useId 는 ':' 를 포함)
        const domId = `mermaid-${reactId.replace(/[^a-zA-Z0-9-]/g, '')}`
        const { svg: rendered } = await mermaid.render(domId, chart)
        if (cancelled) return
        setSvg(rendered)
        setFailed(false)
      } catch {
        if (cancelled) return
        setFailed(true)
      } finally {
        if (!cancelled) settle()
      }
    }

    settledRef.current = false
    void render()

    return () => {
      cancelled = true
      // 언마운트로 렌더가 중단돼도 인쇄 버튼이 영영 잠기지 않게 한다.
      settle()
    }
  }, [chart, reactId])

  if (failed) {
    // 조용히 숨기지 않는다 — 원본 코드를 그대로 보여준다.
    return (
      <pre>
        <code>{chart}</code>
      </pre>
    )
  }

  if (!svg) {
    return <div className="mermaid-figure text-sm text-muted-foreground">다이어그램 렌더 중…</div>
  }

  // mermaid 가 생성한 SVG 문자열. securityLevel:'strict' 로 스크립트가 제거된 상태다.
  return <div className="mermaid-figure" dangerouslySetInnerHTML={{ __html: svg }} />
}
