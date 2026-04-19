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

function truncate(text: string, max: number): string {
  return text.length <= max ? text : text.slice(0, max)
}

export function buildGroupingPrompt(notes: AiNoteInput[]): string {
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

export function buildRelatedPrompt(reference: AiNoteInput, candidates: AiNoteInput[]): string {
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
