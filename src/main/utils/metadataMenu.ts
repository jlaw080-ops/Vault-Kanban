import { promises as fs } from 'fs'
import { join } from 'path'

export interface PresetFieldValues {
  projects: string[]
  subProjects: string[]
  statuses: string[]
  priorities: string[]
}

const FIELD_TO_KEY: Record<string, keyof PresetFieldValues> = {
  project: 'projects',
  sub_project: 'subProjects',
  status: 'statuses',
  priority: 'priorities'
}

const NUMERIC_KEY = /^\d+$/

function extractValues(valuesList: Record<string, unknown>): string[] {
  const keys = Object.keys(valuesList)
  const numericKeys = keys
    .filter((k) => NUMERIC_KEY.test(k))
    .sort((a, b) => Number(a) - Number(b))
  const otherKeys = keys.filter((k) => !NUMERIC_KEY.test(k))

  const out: string[] = []
  for (const key of [...numericKeys, ...otherKeys]) {
    const raw = valuesList[key]
    if (typeof raw !== 'string') continue
    const value = raw.trim()
    if (value.length === 0 || out.includes(value)) continue
    out.push(value)
  }
  return out
}

export function parseMetadataMenuPresets(jsonText: string): PresetFieldValues | null {
  let data: unknown
  try {
    data = JSON.parse(jsonText)
  } catch {
    return null
  }
  if (typeof data !== 'object' || data === null) return null

  const presetFields = (data as { presetFields?: unknown }).presetFields
  if (!Array.isArray(presetFields)) return null

  const result: PresetFieldValues = { projects: [], subProjects: [], statuses: [], priorities: [] }

  for (const field of presetFields) {
    if (typeof field !== 'object' || field === null) continue
    const f = field as {
      name?: unknown
      type?: unknown
      options?: { sourceType?: unknown; valuesList?: unknown }
    }
    const key = typeof f.name === 'string' ? FIELD_TO_KEY[f.name] : undefined
    if (!key) continue
    if (f.type !== 'Select') continue
    const options = f.options
    if (typeof options !== 'object' || options === null) continue
    if (options.sourceType !== 'ValuesList') continue
    const valuesList = options.valuesList
    if (typeof valuesList !== 'object' || valuesList === null) continue
    result[key] = extractValues(valuesList as Record<string, unknown>)
  }

  return result
}

export async function readPresetFields(vaultPath: string): Promise<PresetFieldValues | null> {
  const dataPath = join(vaultPath, '.obsidian', 'plugins', 'metadata-menu', 'data.json')
  let jsonText: string
  try {
    jsonText = await fs.readFile(dataPath, 'utf-8')
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : String(error)
    console.warn(`[metadata-menu] data.json 읽기 실패 — 노트 유도 값으로 폴백: ${message}`)
    return null
  }
  const parsed = parseMetadataMenuPresets(jsonText)
  if (parsed === null) {
    console.warn('[metadata-menu] data.json 파싱 실패 — 노트 유도 값으로 폴백')
  }
  return parsed
}
