import type { Note, RenderableDocument } from '@renderer/types'

const IMAGE_EXT = /\.(png|jpe?g|gif|svg|webp|bmp|avif)$/i

/** `![[파일명]]` / `![[파일명|크기]]` */
const EMBED_RE = /!\[\[([^\]|]+)(?:\|[^\]]*)?\]\]/g

/** `![캡션](경로)` — 경로 뒤 선택적 title 은 무시 */
const MD_IMAGE_RE = /!\[[^\]]*\]\(\s*([^)\s]+)(?:\s+"[^"]*")?\s*\)/g

const REMOTE_RE = /^(https?:|data:)/i

/**
 * 본문이 참조하는 로컬 이미지 target 을 수집한다.
 * 나중 웹 공유 시 업로드해야 할 파일 목록으로 쓴다.
 */
function collectAssets(body: string): string[] {
  const found = new Set<string>()

  EMBED_RE.lastIndex = 0
  let m: RegExpExecArray | null
  while ((m = EMBED_RE.exec(body)) !== null) {
    const target = m[1].trim()
    if (IMAGE_EXT.test(target)) found.add(target)
  }

  MD_IMAGE_RE.lastIndex = 0
  while ((m = MD_IMAGE_RE.exec(body)) !== null) {
    const target = m[1].trim()
    if (!REMOTE_RE.test(target)) found.add(target)
  }

  return [...found]
}

export function noteToDocument(note: Note): RenderableDocument {
  return {
    title: note.title,
    markdown: note.body,
    assets: collectAssets(note.body)
  }
}
