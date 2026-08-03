import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { promises as fs } from 'fs'
import { join, resolve } from 'path'
import { tmpdir } from 'os'
import { resolveVaultAsset, clearAssetIndex } from './assetResolver'

let vaultPath = ''
let outsidePath = ''

beforeEach(async () => {
  clearAssetIndex()
  vaultPath = await fs.mkdtemp(join(tmpdir(), 'vk-vault-'))
  outsidePath = await fs.mkdtemp(join(tmpdir(), 'vk-outside-'))

  await fs.mkdir(join(vaultPath, 'folder'), { recursive: true })
  await fs.mkdir(join(vaultPath, 'attachments'), { recursive: true })
  await fs.mkdir(join(vaultPath, '깊은/경로'), { recursive: true })

  await fs.writeFile(join(vaultPath, 'folder', 'note.md'), '# 노트')
  await fs.writeFile(join(vaultPath, 'folder', 'sibling.png'), 'PNG')
  await fs.writeFile(join(vaultPath, 'attachments', 'shared.png'), 'PNG')
  await fs.writeFile(join(vaultPath, '깊은/경로', '한글 이미지.png'), 'PNG')

  await fs.writeFile(join(outsidePath, 'secret.png'), 'SECRET')
})

afterEach(async () => {
  clearAssetIndex()
  await fs.rm(vaultPath, { recursive: true, force: true })
  await fs.rm(outsidePath, { recursive: true, force: true })
})

describe('resolveVaultAsset — 정상 해석', () => {
  it('노트와 같은 폴더의 이미지를 상대경로로 찾는다', async () => {
    const got = await resolveVaultAsset(vaultPath, 'folder/note.md', 'sibling.png')
    expect(got).toBe(resolve(vaultPath, 'folder', 'sibling.png'))
  })

  it('노트 기준 상대경로(../)를 따라간다', async () => {
    const got = await resolveVaultAsset(vaultPath, 'folder/note.md', '../attachments/shared.png')
    expect(got).toBe(resolve(vaultPath, 'attachments', 'shared.png'))
  })

  it('상대경로로 못 찾으면 볼트 전체에서 파일명으로 찾는다', async () => {
    const got = await resolveVaultAsset(vaultPath, 'folder/note.md', 'shared.png')
    expect(got).toBe(resolve(vaultPath, 'attachments', 'shared.png'))
  })

  it('한글·공백이 든 파일명을 찾는다', async () => {
    const got = await resolveVaultAsset(vaultPath, 'folder/note.md', '한글 이미지.png')
    expect(got).toBe(resolve(vaultPath, '깊은/경로', '한글 이미지.png'))
  })

  it('없는 파일이면 null 을 돌려준다', async () => {
    expect(await resolveVaultAsset(vaultPath, 'folder/note.md', '없는파일.png')).toBeNull()
  })
})

describe('resolveVaultAsset — 보안: 볼트 탈출 방지', () => {
  it('상위로 빠져나가는 상대경로를 거부한다', async () => {
    const escape = '../'.repeat(10) + 'Windows/System32/config/SAM'
    expect(await resolveVaultAsset(vaultPath, 'folder/note.md', escape)).toBeNull()
  })

  it('볼트 바깥의 실재 파일도 거부한다', async () => {
    const rel = resolve(outsidePath, 'secret.png')
    expect(await resolveVaultAsset(vaultPath, 'folder/note.md', rel)).toBeNull()
  })

  it('절대경로 입력을 거부한다', async () => {
    const abs = process.platform === 'win32' ? 'C:/Windows/win.ini' : '/etc/passwd'
    expect(await resolveVaultAsset(vaultPath, 'folder/note.md', abs)).toBeNull()
  })

  it('원격 URL 입력을 거부한다', async () => {
    expect(await resolveVaultAsset(vaultPath, 'folder/note.md', 'https://x.com/a.png')).toBeNull()
    expect(
      await resolveVaultAsset(vaultPath, 'folder/note.md', 'data:image/png;base64,AA')
    ).toBeNull()
  })

  it('볼트 밖을 가리키는 심링크를 거부한다', async () => {
    // Windows 는 개발자 모드/관리자 권한이 없으면 심링크 생성이 EPERM 으로 실패한다.
    // 그런 환경에서는 이 테스트를 건너뛴다 (다른 탈출 경로는 위 테스트들이 막는다).
    const linkPath = join(vaultPath, 'link.png')
    try {
      await fs.symlink(join(outsidePath, 'secret.png'), linkPath)
    } catch {
      return
    }
    clearAssetIndex()
    expect(await resolveVaultAsset(vaultPath, 'folder/note.md', 'link.png')).toBeNull()
  })

  it('볼트 밖을 가리키는 디렉터리 정션을 거부한다', async () => {
    // Windows 는 파일 심링크에 권한이 필요하지만 디렉터리 정션은 권한 없이 만들 수 있다.
    // 위 심링크 테스트가 Windows 에서 통째로 건너뛰어지므로, realpath 기반 탈출 방지
    // 가드가 실사용 플랫폼에서도 실제로 실행되도록 이 테스트를 둔다.
    const junctionPath = join(vaultPath, 'linkdir')
    try {
      await fs.symlink(outsidePath, junctionPath, 'junction')
    } catch {
      return
    }
    clearAssetIndex()
    expect(await resolveVaultAsset(vaultPath, 'folder/note.md', '../linkdir/secret.png')).toBeNull()
  })
})

describe('resolveVaultAsset — 방어적 입력 처리', () => {
  it('볼트 경로가 비어 있으면 null', async () => {
    expect(await resolveVaultAsset('', 'folder/note.md', 'a.png')).toBeNull()
  })

  it('target 이 비어 있으면 null', async () => {
    expect(await resolveVaultAsset(vaultPath, 'folder/note.md', '')).toBeNull()
  })
})
