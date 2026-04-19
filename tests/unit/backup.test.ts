import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import * as fs from 'node:fs'
import * as path from 'node:path'
import * as os from 'node:os'
import { createBackup, listBackups, restoreBackup } from '../../src/main/utils/backup'

let tmpDir: string

beforeEach(() => {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'vk-backup-test-'))
  // create sample vault files
  fs.writeFileSync(path.join(tmpDir, 'note1.md'), '---\nstatus: TBD\n---\n# Note 1')
  fs.mkdirSync(path.join(tmpDir, 'sub'))
  fs.writeFileSync(path.join(tmpDir, 'sub', 'note2.md'), '---\nstatus: done\n---\n# Note 2')
})

afterEach(() => {
  fs.rmSync(tmpDir, { recursive: true, force: true })
})

describe('createBackup', () => {
  it('creates a backup folder under .vault-backup/', async () => {
    const backupPath = await createBackup(tmpDir)
    expect(backupPath).toContain('.vault-backup')
    expect(fs.existsSync(backupPath)).toBe(true)
  })

  it('backup folder name matches backup-YYYYMMDD-HHmmss pattern', async () => {
    const backupPath = await createBackup(tmpDir)
    const name = path.basename(backupPath)
    expect(name).toMatch(/^backup-\d{8}-\d{6}$/)
  })

  it('copies files into backup including subdirectories', async () => {
    const backupPath = await createBackup(tmpDir)
    expect(fs.existsSync(path.join(backupPath, 'note1.md'))).toBe(true)
    expect(fs.existsSync(path.join(backupPath, 'sub', 'note2.md'))).toBe(true)
  })

  it('does not copy .vault-backup itself (no recursion)', async () => {
    await createBackup(tmpDir)
    const backupDir = path.join(tmpDir, '.vault-backup')
    const backupPath = await createBackup(tmpDir)
    const inner = path.join(backupPath, '.vault-backup')
    expect(fs.existsSync(inner)).toBe(false)
  })

  it('calls onProgress during backup', async () => {
    const calls: number[] = []
    await createBackup(tmpDir, (current, total) => calls.push(current / total))
    expect(calls.length).toBeGreaterThan(0)
    expect(calls[calls.length - 1]).toBe(1)
  })
})

describe('listBackups', () => {
  it('returns empty array when no backups exist', async () => {
    const result = await listBackups(tmpDir)
    expect(result).toEqual([])
  })

  it('returns backups sorted newest first', async () => {
    await createBackup(tmpDir)
    await new Promise((r) => setTimeout(r, 1100))
    await createBackup(tmpDir)
    const result = await listBackups(tmpDir)
    expect(result.length).toBe(2)
    expect(result[0].createdAt.getTime()).toBeGreaterThan(result[1].createdAt.getTime())
  })

  it('each entry has name, createdAt, sizeMb', async () => {
    await createBackup(tmpDir)
    const result = await listBackups(tmpDir)
    expect(result[0]).toHaveProperty('name')
    expect(result[0]).toHaveProperty('createdAt')
    expect(result[0]).toHaveProperty('sizeMb')
    expect(typeof result[0].sizeMb).toBe('number')
  })
})

describe('restoreBackup', () => {
  it('restores files from backup to vault', async () => {
    const backupPath = await createBackup(tmpDir)
    const backupName = path.basename(backupPath)
    // modify a file after backup
    fs.writeFileSync(path.join(tmpDir, 'note1.md'), 'MODIFIED')
    await restoreBackup(tmpDir, backupName)
    const content = fs.readFileSync(path.join(tmpDir, 'note1.md'), 'utf-8')
    expect(content).toContain('# Note 1')
  })

  it('throws if backup name does not exist', async () => {
    await expect(restoreBackup(tmpDir, 'backup-99991231-999999')).rejects.toThrow()
  })
})
