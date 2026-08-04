import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { promises as fs } from 'fs'
import { join } from 'path'
import { tmpdir } from 'os'
import { protocol } from 'electron'
import { registerAssetProtocol, VAULT_IMG_SCHEME } from './asset'
import { getSettingValue } from './settings'
import { clearAssetIndex } from '../utils/assetResolver'

vi.mock('./settings', () => ({ getSettingValue: vi.fn() }))

type ProtocolHandler = (request: { url: string }) => Promise<Response>

let vaultPath = ''
let outsidePath = ''

/** registerAssetProtocol() 이 protocol.handle 에 넘긴 콜백을 꺼낸다. */
function capturedHandler(): ProtocolHandler {
  const calls = vi.mocked(protocol.handle).mock.calls
  const last = calls[calls.length - 1]
  return last[1] as unknown as ProtocolHandler
}

function assetUrl(notePath: string, target: string): string {
  return `${VAULT_IMG_SCHEME}://asset/?note=${encodeURIComponent(notePath)}&target=${encodeURIComponent(target)}`
}

beforeEach(async () => {
  vi.mocked(protocol.handle).mockClear()
  clearAssetIndex()

  vaultPath = await fs.mkdtemp(join(tmpdir(), 'vk-proto-vault-'))
  outsidePath = await fs.mkdtemp(join(tmpdir(), 'vk-proto-outside-'))
  await fs.mkdir(join(vaultPath, 'folder'), { recursive: true })
  await fs.writeFile(join(vaultPath, 'folder', 'note.md'), '# 노트')
  await fs.writeFile(join(vaultPath, 'folder', 'sibling.png'), 'PNGDATA')
  await fs.writeFile(join(vaultPath, 'folder', 'photo.JPG'), 'JPGDATA')
  await fs.writeFile(join(outsidePath, 'secret.png'), 'SECRET')

  vi.mocked(getSettingValue).mockReturnValue(vaultPath)
  registerAssetProtocol()
})

afterEach(async () => {
  clearAssetIndex()
  await fs.rm(vaultPath, { recursive: true, force: true })
  await fs.rm(outsidePath, { recursive: true, force: true })
})

describe('registerAssetProtocol', () => {
  it('vault-img 스킴으로 핸들러를 등록한다', () => {
    expect(vi.mocked(protocol.handle).mock.calls[0][0]).toBe('vault-img')
  })
})

describe('vault-img 핸들러', () => {
  it('볼트 안 이미지를 200 과 파일 내용으로 돌려준다', async () => {
    const res = await capturedHandler()({ url: assetUrl('folder/note.md', 'sibling.png') })
    expect(res.status).toBe(200)
    expect(await res.text()).toBe('PNGDATA')
  })

  it('확장자에 맞는 Content-Type 을 붙인다', async () => {
    const res = await capturedHandler()({ url: assetUrl('folder/note.md', 'sibling.png') })
    expect(res.headers.get('Content-Type')).toBe('image/png')
  })

  it('확장자 대소문자를 가리지 않는다', async () => {
    const res = await capturedHandler()({ url: assetUrl('folder/note.md', 'photo.JPG') })
    expect(res.headers.get('Content-Type')).toBe('image/jpeg')
  })

  it('볼트 밖을 가리키면 404 를 돌려준다', async () => {
    const escape = '../'.repeat(10) + 'secret.png'
    const res = await capturedHandler()({ url: assetUrl('folder/note.md', escape) })
    expect(res.status).toBe(404)
  })

  it('없는 파일이면 404 를 돌려준다', async () => {
    const res = await capturedHandler()({ url: assetUrl('folder/note.md', '없는파일.png') })
    expect(res.status).toBe(404)
  })

  it('이미지가 아닌 볼트 파일도 돌려준다 (의도된 동작)', async () => {
    // 2026-08-04 결정: 확장자로 좁히지 않는다. Obsidian 은 `![[file.pdf]]` 같은
    // 비이미지 임베드를 지원하므로 나중에 붙일 여지를 남긴다. 볼트 경계는
    // resolveVaultAsset 이 지키므로 볼트 밖 파일은 나가지 않는다.
    // 이 테스트가 깨진다면 누군가 확장자 제한을 넣은 것이다 — 되돌리기 전에 결정을 확인할 것.
    const res = await capturedHandler()({ url: assetUrl('folder/note.md', 'note.md') })
    expect(res.status).toBe(200)
    expect(res.headers.get('Content-Type')).toBe('application/octet-stream')
  })

  it('쿼리 파라미터가 없으면 404 를 돌려준다', async () => {
    const res = await capturedHandler()({ url: `${VAULT_IMG_SCHEME}://asset/` })
    expect(res.status).toBe(404)
  })
})
