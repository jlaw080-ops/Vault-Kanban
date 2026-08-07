import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { promises as fs } from 'fs'
import { join } from 'path'
import { tmpdir } from 'os'
import { readPresetFields } from '../../src/main/utils/metadataMenu'

describe('readPresetFields — MM data.json 읽기', () => {
  let tmpDir: string

  beforeEach(async () => {
    tmpDir = await fs.mkdtemp(join(tmpdir(), 'mm-preset-'))
  })

  afterEach(async () => {
    await fs.rm(tmpDir, { recursive: true, force: true })
  })

  async function writeDataJson(content: string): Promise<void> {
    const pluginDir = join(tmpDir, '.obsidian', 'plugins', 'metadata-menu')
    await fs.mkdir(pluginDir, { recursive: true })
    await fs.writeFile(join(pluginDir, 'data.json'), content, 'utf-8')
  }

  it('정상 data.json에서 preset을 읽는다', async () => {
    await writeDataJson(
      JSON.stringify({
        presetFields: [
          {
            name: 'project',
            type: 'Select',
            options: { sourceType: 'ValuesList', valuesList: { '1': '에너빌드', '2': 'Private' } }
          }
        ]
      })
    )
    const result = await readPresetFields(tmpDir)
    expect(result?.projects).toEqual(['에너빌드', 'Private'])
  })

  it('data.json 파일 없음 → null (MM 미설치 볼트)', async () => {
    const result = await readPresetFields(tmpDir)
    expect(result).toBeNull()
  })

  it('data.json 깨짐 → null', async () => {
    await writeDataJson('{broken json')
    const result = await readPresetFields(tmpDir)
    expect(result).toBeNull()
  })
})
