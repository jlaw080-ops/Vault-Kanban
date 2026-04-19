import { ipcMain, BrowserWindow } from 'electron'
import { loadApiKeyDecrypted } from './api-key'

export interface AiNoteInput {
  id: string
  title: string
  tags: string[]
  folder: string
  preview: string
}

export interface AiGroupResult {
  projects: Array<{ name: string; noteIds: string[]; reason: string }>
}

export interface RelatedResult {
  related: Array<{ noteId: string; score: number; reason: string }>
}

const CHUNK_SIZE = 50

function truncate(text: string, max: number): string {
  return text.length <= max ? text : text.slice(0, max)
}

function buildGroupingPrompt(notes: AiNoteInput[]): string {
  const truncated = notes.map((n) => ({ ...n, preview: truncate(n.preview, 500) }))
  const json = JSON.stringify(truncated, null, 2)

  return `다음은 Obsidian vault의 노트 목록입니다. 각 노트를 의미 있는 프로젝트(주제)로 그룹핑해주세요.

노트 목록:
${json}

아래 JSON 형식으로만 응답하세요. 설명 없이 JSON만 출력하세요:
{
  "projects": [
    {
      "name": "프로젝트명",
      "noteIds": ["노트 id 배열"],
      "reason": "그룹핑 이유 (한국어)"
    }
  ]
}`
}

function buildRelatedPrompt(reference: AiNoteInput, candidates: AiNoteInput[]): string {
  const truncatedCandidates = candidates.map((n) => ({ ...n, preview: truncate(n.preview, 200) }))
  const refJson = JSON.stringify(
    { ...reference, preview: truncate(reference.preview, 200) },
    null,
    2
  )
  const candidatesJson = JSON.stringify(truncatedCandidates, null, 2)

  return `다음 기준 노트와 가장 관련 있는 노트 Top 5를 찾아주세요.

기준 노트:
${refJson}

후보 노트 목록 (title, tags, preview 포함):
${candidatesJson}

아래 JSON 형식으로만 응답하세요. 설명 없이 JSON만 출력하세요:
{
  "related": [
    {
      "noteId": "노트 id",
      "score": 0.95,
      "reason": "관련 이유 (한국어)"
    }
  ]
}`
}

function mapApiError(e: unknown): string {
  const msg = e instanceof Error ? e.message : String(e)
  if (msg.includes('401') || msg.includes('authentication')) {
    return '키가 잘못되었습니다. 재발급 후 다시 시도하세요.'
  }
  if (msg.includes('429')) {
    return '크레딧을 충전하거나 잠시 후 시도하세요.'
  }
  if (msg.includes('fetch') || msg.includes('network') || msg.includes('ENOTFOUND')) {
    return '네트워크 연결을 확인하세요.'
  }
  return msg
}

function emitProgress(pct: number, label: string): void {
  BrowserWindow.getAllWindows().forEach((win) => {
    win.webContents.send('ai:progress', pct, label)
  })
}

function mergeGroupResults(chunks: AiGroupResult[]): AiGroupResult {
  const projectMap = new Map<string, { noteIds: string[]; reason: string }>()

  for (const chunk of chunks) {
    for (const project of chunk.projects) {
      const existing = projectMap.get(project.name)
      if (existing) {
        existing.noteIds.push(...project.noteIds)
      } else {
        projectMap.set(project.name, { noteIds: [...project.noteIds], reason: project.reason })
      }
    }
  }

  return {
    projects: Array.from(projectMap.entries()).map(([name, { noteIds, reason }]) => ({
      name,
      noteIds,
      reason
    }))
  }
}

export function registerAiHandlers(): void {
  ipcMain.handle(
    'ai:groupNotes',
    async (_event, notes: AiNoteInput[]): Promise<AiGroupResult | { error: string }> => {
      const key = loadApiKeyDecrypted()
      if (!key) return { error: 'API 키를 설정에서 입력하세요.' }

      try {
        const Anthropic = (await import('@anthropic-ai/sdk')).default
        const client = new Anthropic({ apiKey: key })

        const { default: Store } = await import('electron-store')
        const keyStore = new Store<{ anthropicModel?: string }>({ name: 'api-keys' })
        const model = keyStore.get('anthropicModel') ?? 'claude-haiku-4-5-20251001'

        const chunks: AiNoteInput[][] = []
        for (let i = 0; i < notes.length; i += CHUNK_SIZE) {
          chunks.push(notes.slice(i, i + CHUNK_SIZE))
        }

        const successfulResults: AiGroupResult[] = []
        let failCount = 0

        for (let i = 0; i < chunks.length; i++) {
          const pct = Math.round((i / chunks.length) * 100)
          emitProgress(pct, `청크 ${i + 1}/${chunks.length} 처리 중`)

          try {
            const response = await client.messages.create({
              model,
              max_tokens: 4096,
              messages: [{ role: 'user', content: buildGroupingPrompt(chunks[i]) }]
            })

            const text = response.content[0].type === 'text' ? response.content[0].text : ''
            const jsonMatch = text.match(/\{[\s\S]*\}/)
            if (!jsonMatch) throw new Error('JSON not found in response')

            const parsed: AiGroupResult = JSON.parse(jsonMatch[0])
            if (parsed.projects && Array.isArray(parsed.projects)) {
              successfulResults.push(parsed)
            } else {
              failCount++
            }
          } catch {
            failCount++
          }
        }

        emitProgress(100, '완료')

        const merged = mergeGroupResults(successfulResults)
        if (failCount > 0) {
          return {
            projects: merged.projects,
            // @ts-ignore — extra field for UI notification
            failedChunks: failCount
          }
        }
        return merged
      } catch (e: unknown) {
        return { error: mapApiError(e) }
      }
    }
  )

  ipcMain.handle(
    'ai:findRelated',
    async (
      _event,
      reference: AiNoteInput,
      candidates: AiNoteInput[]
    ): Promise<RelatedResult | { error: string }> => {
      const key = loadApiKeyDecrypted()
      if (!key) return { error: 'API 키를 설정에서 입력하세요.' }

      try {
        const Anthropic = (await import('@anthropic-ai/sdk')).default
        const client = new Anthropic({ apiKey: key })

        const { default: Store } = await import('electron-store')
        const keyStore = new Store<{ anthropicModel?: string }>({ name: 'api-keys' })
        const model = keyStore.get('anthropicModel') ?? 'claude-haiku-4-5-20251001'

        const response = await client.messages.create({
          model,
          max_tokens: 2048,
          messages: [{ role: 'user', content: buildRelatedPrompt(reference, candidates) }]
        })

        const text = response.content[0].type === 'text' ? response.content[0].text : ''
        const jsonMatch = text.match(/\{[\s\S]*\}/)
        if (!jsonMatch) return { error: 'AI 응답을 파싱할 수 없습니다.' }

        const parsed: RelatedResult = JSON.parse(jsonMatch[0])
        if (!parsed.related || !Array.isArray(parsed.related)) {
          return { error: 'AI 응답 형식이 올바르지 않습니다.' }
        }

        const sorted = [...parsed.related].sort((a, b) => b.score - a.score).slice(0, 5)
        return { related: sorted }
      } catch (e: unknown) {
        return { error: mapApiError(e) }
      }
    }
  )
}
