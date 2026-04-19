import * as fs from 'node:fs'
import * as path from 'node:path'

const BACKUP_DIR = '.vault-backup'
const NAME_RE = /^backup-(\d{4})(\d{2})(\d{2})-(\d{2})(\d{2})(\d{2})$/

function timestamp(): string {
  const d = new Date()
  const pad = (n: number, l = 2): string => String(n).padStart(l, '0')
  return (
    `${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}` +
    `-${pad(d.getHours())}${pad(d.getMinutes())}${pad(d.getSeconds())}`
  )
}

function collectFiles(dir: string, skip: string): string[] {
  const results: string[] = []
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name)
    if (full === skip) continue
    if (entry.isDirectory()) {
      results.push(...collectFiles(full, skip))
    } else {
      results.push(full)
    }
  }
  return results
}

function dirSizeMb(dir: string): number {
  let bytes = 0
  const walk = (d: string): void => {
    for (const entry of fs.readdirSync(d, { withFileTypes: true })) {
      const full = path.join(d, entry.name)
      if (entry.isDirectory()) walk(full)
      else bytes += fs.statSync(full).size
    }
  }
  walk(dir)
  return bytes / 1_048_576
}

export async function createBackup(
  vaultPath: string,
  onProgress?: (current: number, total: number) => void
): Promise<string> {
  const backupRoot = path.join(vaultPath, BACKUP_DIR)
  const backupPath = path.join(backupRoot, `backup-${timestamp()}`)
  fs.mkdirSync(backupPath, { recursive: true })

  const skipDir = path.resolve(backupRoot)
  const files = collectFiles(path.resolve(vaultPath), skipDir)
  const total = files.length

  for (let i = 0; i < total; i++) {
    const src = files[i]
    const rel = path.relative(vaultPath, src)
    const dest = path.join(backupPath, rel)
    fs.mkdirSync(path.dirname(dest), { recursive: true })
    fs.copyFileSync(src, dest)
    onProgress?.(i + 1, total)
  }

  if (total === 0) onProgress?.(1, 1)

  return backupPath
}

export async function listBackups(
  vaultPath: string
): Promise<Array<{ name: string; createdAt: Date; sizeMb: number }>> {
  const backupRoot = path.join(vaultPath, BACKUP_DIR)
  if (!fs.existsSync(backupRoot)) return []

  const entries = fs
    .readdirSync(backupRoot, { withFileTypes: true })
    .filter((e) => e.isDirectory() && NAME_RE.test(e.name))

  return entries
    .map((e) => {
      const m = NAME_RE.exec(e.name)!
      const [, yr, mo, dy, hr, mn, sc] = m
      const createdAt = new Date(`${yr}-${mo}-${dy}T${hr}:${mn}:${sc}`)
      return {
        name: e.name,
        createdAt,
        sizeMb: dirSizeMb(path.join(backupRoot, e.name))
      }
    })
    .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime())
}

export async function restoreBackup(
  vaultPath: string,
  backupName: string,
  onProgress?: (current: number, total: number) => void
): Promise<void> {
  const backupPath = path.join(vaultPath, BACKUP_DIR, backupName)
  if (!fs.existsSync(backupPath)) {
    throw new Error(`Backup not found: ${backupName}`)
  }

  const files = collectFiles(path.resolve(backupPath), '')
  const total = files.length

  for (let i = 0; i < total; i++) {
    const src = files[i]
    const rel = path.relative(backupPath, src)
    const dest = path.join(vaultPath, rel)
    fs.mkdirSync(path.dirname(dest), { recursive: true })
    fs.copyFileSync(src, dest)
    onProgress?.(i + 1, total)
  }
}
