import { promises as fs, type Dirent } from 'fs'
import { basename, dirname, isAbsolute, join, relative, resolve } from 'path'

const IMAGE_EXT = /\.(png|jpe?g|gif|svg|webp|bmp|avif)$/i
const REMOTE_RE = /^(https?:|data:|file:)/i

/** 볼트 경로별 { 소문자 파일명 -> 절대경로[] } 인덱스. 첫 필요 시 1회만 만든다. */
let indexedVault: string | null = null
let assetIndex: Map<string, string[]> | null = null

export function clearAssetIndex(): void {
  indexedVault = null
  assetIndex = null
}

/** 해석된 절대경로가 볼트 루트 안에 있는지 심링크까지 풀어서 확인한다. */
async function isInsideVault(vaultRealPath: string, candidate: string): Promise<boolean> {
  try {
    const real = await fs.realpath(candidate)
    const rel = relative(vaultRealPath, real)
    return rel !== '' && !rel.startsWith('..') && !isAbsolute(rel)
  } catch {
    return false
  }
}

async function isReadableFile(candidate: string): Promise<boolean> {
  try {
    const stat = await fs.stat(candidate)
    return stat.isFile()
  } catch {
    return false
  }
}

async function buildIndex(vaultPath: string): Promise<Map<string, string[]>> {
  const index = new Map<string, string[]>()

  async function walk(dir: string): Promise<void> {
    // fs.readdir 은 오버로드가 많아 ReturnType 추론이 Buffer 시그니처로 잡힌다. Dirent[] 로 명시.
    let entries: Dirent[]
    try {
      entries = await fs.readdir(dir, { withFileTypes: true })
    } catch {
      return
    }
    for (const entry of entries) {
      if (entry.name.startsWith('.')) continue
      const full = join(dir, entry.name)
      if (entry.isDirectory()) {
        await walk(full)
      } else if (entry.isFile() && IMAGE_EXT.test(entry.name)) {
        const key = entry.name.toLowerCase()
        const bucket = index.get(key)
        if (bucket) bucket.push(full)
        else index.set(key, [full])
      }
    }
  }

  await walk(vaultPath)
  return index
}

async function getIndex(vaultPath: string): Promise<Map<string, string[]>> {
  if (indexedVault !== vaultPath || !assetIndex) {
    assetIndex = await buildIndex(vaultPath)
    indexedVault = vaultPath
  }
  return assetIndex
}

/**
 * 볼트 안의 이미지 파일 절대경로를 해석한다.
 *
 * ① 노트 기준 상대경로 → ② 볼트 전체 파일명 매칭 → ③ 실패 시 null.
 * 어느 경로든 볼트 루트를 벗어나면 거부한다(심링크 포함).
 *
 * @param vaultPath 볼트 루트 절대경로
 * @param notePath  볼트 기준 노트 상대경로 (상대 이미지 경로의 기준점)
 * @param target    노트 본문이 참조한 이미지 경로 또는 파일명 — 신뢰할 수 없는 입력
 */
export async function resolveVaultAsset(
  vaultPath: string,
  notePath: string,
  target: string
): Promise<string | null> {
  const cleanTarget = target.trim()
  if (!vaultPath || !cleanTarget) return null
  if (REMOTE_RE.test(cleanTarget)) return null
  if (isAbsolute(cleanTarget)) return null

  let vaultRealPath: string
  try {
    vaultRealPath = await fs.realpath(vaultPath)
  } catch {
    return null
  }

  // ① 노트 기준 상대경로
  //
  // 여기서는 일부러 확장자를 제한하지 않는다(2026-08-04 결정). Obsidian 은
  // `![[file.pdf]]` 처럼 이미지가 아닌 임베드도 지원하므로 나중에 붙일 여지를 남긴다.
  // 볼트 경계는 아래 isInsideVault 로 지키므로 볼트 밖 파일은 어차피 나가지 않는다.
  // 이미지로 좁히려면 여기가 아니라 호출자(프로토콜 핸들러)에서 걸러야 한다.
  const noteDir = dirname(resolve(vaultPath, notePath))
  const relativeCandidate = resolve(noteDir, cleanTarget)
  if (
    (await isReadableFile(relativeCandidate)) &&
    (await isInsideVault(vaultRealPath, relativeCandidate))
  ) {
    return relativeCandidate
  }

  // ② 볼트 전체 파일명 매칭 (Obsidian 기본 동작)
  const index = await getIndex(vaultPath)
  const matches = index.get(basename(cleanTarget).toLowerCase())
  if (matches) {
    for (const candidate of matches) {
      if (await isInsideVault(vaultRealPath, candidate)) return candidate
    }
  }

  return null
}
