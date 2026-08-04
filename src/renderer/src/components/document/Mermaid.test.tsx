import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, cleanup, waitFor } from '@testing-library/react'
import { Mermaid } from './Mermaid'

const renderMock = vi.fn()
const initializeMock = vi.fn()

vi.mock('mermaid', () => ({
  default: {
    initialize: (...args: unknown[]) => initializeMock(...args),
    render: (...args: unknown[]) => renderMock(...args)
  }
}))

beforeEach(() => {
  renderMock.mockReset()
  initializeMock.mockReset()
})

afterEach(() => {
  cleanup()
})

describe('Mermaid', () => {
  it('렌더에 성공하면 mermaid 가 만든 SVG 를 넣는다', async () => {
    renderMock.mockResolvedValue({ svg: '<svg data-testid="diagram"></svg>' })
    const { container } = render(<Mermaid chart="graph TD;A-->B;" />)
    await waitFor(() => {
      expect(container.querySelector('svg')).not.toBeNull()
    })
    expect(container.querySelector('.mermaid-figure')).not.toBeNull()
  })

  it('렌더에 실패하면 원본 코드를 그대로 보여준다', async () => {
    renderMock.mockRejectedValue(new Error('parse error'))
    render(<Mermaid chart="graph TD;깨진문법" />)
    await waitFor(() => {
      expect(screen.getByText('graph TD;깨진문법').tagName).toBe('CODE')
    })
  })

  it('성공하면 onSettled 를 한 번 호출한다', async () => {
    renderMock.mockResolvedValue({ svg: '<svg></svg>' })
    const onSettled = vi.fn()
    render(<Mermaid chart="graph TD;A-->B;" onSettled={onSettled} />)
    await waitFor(() => {
      expect(onSettled).toHaveBeenCalledTimes(1)
    })
  })

  it('실패해도 onSettled 를 한 번 호출한다 (인쇄 버튼이 영영 잠기지 않게)', async () => {
    renderMock.mockRejectedValue(new Error('boom'))
    const onSettled = vi.fn()
    render(<Mermaid chart="깨진문법" onSettled={onSettled} />)
    await waitFor(() => {
      expect(onSettled).toHaveBeenCalledTimes(1)
    })
  })

  it('렌더가 끝나기 전에 언마운트돼도 onSettled 가 호출된다', async () => {
    let resolveRender: ((value: { svg: string }) => void) | undefined
    renderMock.mockReturnValue(
      new Promise<{ svg: string }>((res) => {
        resolveRender = res
      })
    )
    const onSettled = vi.fn()
    const { unmount } = render(<Mermaid chart="graph TD;A-->B;" onSettled={onSettled} />)
    expect(onSettled).not.toHaveBeenCalled()

    unmount()
    expect(onSettled).toHaveBeenCalledTimes(1)

    // 뒤늦게 렌더가 끝나도 다시 호출되지 않는다.
    resolveRender?.({ svg: '<svg></svg>' })
    await waitFor(() => {
      expect(onSettled).toHaveBeenCalledTimes(1)
    })
  })

  it('securityLevel strict 로 초기화한다 (웹 공유 시 렌더 결과 일치)', async () => {
    renderMock.mockResolvedValue({ svg: '<svg></svg>' })
    render(<Mermaid chart="graph TD;A-->B;" />)
    await waitFor(() => {
      expect(initializeMock).toHaveBeenCalledWith(
        expect.objectContaining({ securityLevel: 'strict', theme: 'default', startOnLoad: false })
      )
    })
  })
})
