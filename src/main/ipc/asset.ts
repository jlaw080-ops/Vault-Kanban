import { protocol } from 'electron'
import { promises as fs } from 'fs'
import { extname } from 'path'
import { resolveVaultAsset } from '../utils/assetResolver'
import { getSettingValue } from './settings'

export const VAULT_IMG_SCHEME = 'vault-img'

const MIME_BY_EXT: Record<string, string> = {
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif': 'image/gif',
  '.svg': 'image/svg+xml',
  '.webp': 'image/webp',
  '.bmp': 'image/bmp',
  '.avif': 'image/avif'
}

function mimeFor(filePath: string): string {
  return MIME_BY_EXT[extname(filePath).toLowerCase()] ?? 'application/octet-stream'
}

/**
 * 문서 뷰가 로컬 볼트 이미지를 읽는 통로.
 * 렌더러는 fs 를 직접 쓸 수 없으므로(CLAUDE.md CRITICAL) 이 프로토콜을 경유한다.
 *
 * app.whenReady() 이후에 호출할 것.
 */
export function registerAssetProtocol(): void {
  protocol.handle(VAULT_IMG_SCHEME, async (request) => {
    try {
      const url = new URL(request.url)
      const notePath = url.searchParams.get('note') ?? ''
      const target = url.searchParams.get('target') ?? ''
      const vaultPath = getSettingValue('vaultPath')

      const absolutePath = await resolveVaultAsset(vaultPath, notePath, target)
      if (!absolutePath) {
        return new Response(null, { status: 404 })
      }

      const data = await fs.readFile(absolutePath)
      return new Response(data, {
        status: 200,
        headers: { 'Content-Type': mimeFor(absolutePath) }
      })
    } catch {
      return new Response(null, { status: 404 })
    }
  })
}
