const TTL_MS = 1000

const marked = new Set<string>()
const timers = new Map<string, ReturnType<typeof setTimeout>>()

export function markSelfWrite(filePath: string): void {
  const existing = timers.get(filePath)
  if (existing) clearTimeout(existing)
  marked.add(filePath)
  const timer = setTimeout(() => {
    marked.delete(filePath)
    timers.delete(filePath)
  }, TTL_MS)
  timers.set(filePath, timer)
}

export function isSelfWrite(filePath: string): boolean {
  return marked.has(filePath)
}

export function clearSelfWrite(): void {
  timers.forEach((t) => clearTimeout(t))
  timers.clear()
  marked.clear()
}
