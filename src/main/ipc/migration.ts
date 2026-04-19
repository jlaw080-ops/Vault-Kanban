import { ipcMain } from 'electron'
import { parseNote, serializeNote } from '../utils/markdown'
import { createBackup, listBackups, restoreBackup } from '../utils/backup'
import * as fs from 'node:fs'
import * as path from 'node:path'

type MappingValue = string | 'skip'

async function scanVaultMd(vaultPath: string, excluded: string[]): Promise<string[]> {
  const results: string[] = []
  const walk = (dir: string) => {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      if (excluded.includes(entry.name)) continue
      if (entry.name === '.vault-backup') continue
      const full = path.join(dir, entry.name)
      if (entry.isDirectory()) walk(full)
      else if (entry.name.endsWith('.md')) results.push(full)
    }
  }
  walk(vaultPath)
  return results
}

export function registerMigrationHandlers(): void {
  ipcMain.handle(
    'migration:execute',
    async (
      _event,
      vaultPath: string,
      mapping: Array<[string | null, MappingValue]>,
      excluded: string[]
    ) => {
      const backupPath = await createBackup(vaultPath)
      const files = await scanVaultMd(vaultPath, excluded)
      const mappingMap = new Map<string | null, MappingValue>(mapping)

      let migrated = 0
      const errors: string[] = []

      for (const filePath of files) {
        try {
          const raw = fs.readFileSync(filePath, 'utf-8')
          const mtime = fs.statSync(filePath).mtimeMs
          const note = parseNote(filePath, raw, mtime)
          const key: string | null =
            note.status === undefined || note.status === null || (note.status as string) === ''
              ? null
              : (note.status as string)
          const mapped = mappingMap.get(key)
          if (mapped === undefined || mapped === 'skip') continue

          const updated = { ...note, status: mapped as typeof note.status }
          const serialized = serializeNote(updated)
          fs.writeFileSync(filePath, serialized, 'utf-8')
          migrated++
        } catch (err) {
          errors.push(`${filePath}: ${err instanceof Error ? err.message : String(err)}`)
        }
      }

      return { ok: true, backupPath, migrated, errors }
    }
  )

  ipcMain.handle('backup:list', async (_event, vaultPath: string) => {
    return await listBackups(vaultPath)
  })

  ipcMain.handle('backup:restore', async (_event, vaultPath: string, backupName: string) => {
    await restoreBackup(vaultPath, backupName)
    return { ok: true }
  })
}
