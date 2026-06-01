import type { Note, ColumnConfig } from '@renderer/types'

export type DateRange = { from: Date; to: Date }

const MS_PER_DAY = 1000 * 60 * 60 * 24

function resolveStarted(note: Note): Date | null {
  if (note.started) {
    const d = new Date(note.started)
    if (!isNaN(d.getTime())) return d
  }
  if (note.status === 'done' && note.created) {
    const d = new Date(note.created)
    if (!isNaN(d.getTime())) return d
  }
  return null
}

function resolveCompleted(note: Note): Date | null {
  if (note.completed) {
    const d = new Date(note.completed)
    if (!isNaN(d.getTime())) return d
  }
  if (note.status === 'done') return new Date(note.mtime)
  return null
}

function daysDiff(fromMs: number, toDate: Date): number {
  return Math.max(0, Math.floor((toDate.getTime() - fromMs) / MS_PER_DAY))
}

export function getStayDays(note: Note, column: ColumnConfig, now: Date): number {
  const colName = column.name

  if (colName === 'backlog' || colName === 'planned') {
    return daysDiff(new Date(note.created).getTime(), now)
  }

  if (colName === 'in-progress') {
    if (note.started) {
      return daysDiff(new Date(note.started).getTime(), now)
    }
    return daysDiff(note.mtime, now)
  }

  // 검토, 완료: mtime 기준
  return daysDiff(note.mtime, now)
}

export function computeLeadTime(note: Note): number | undefined {
  if (!note.created) return undefined
  const completed = resolveCompleted(note)
  if (!completed) return undefined
  const from = new Date(note.created).getTime()
  if (isNaN(from)) return undefined
  return Math.floor((completed.getTime() - from) / MS_PER_DAY)
}

export function computeCycleTime(note: Note): number | undefined {
  const started = resolveStarted(note)
  if (!started) return undefined
  const completed = resolveCompleted(note)
  if (!completed) return undefined
  return Math.floor((completed.getTime() - started.getTime()) / MS_PER_DAY)
}

function toDateStr(date: Date): string {
  return date.toISOString().slice(0, 10)
}

function startOfDay(date: Date): Date {
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()))
}

function startOfWeek(date: Date): Date {
  const d = startOfDay(date)
  const day = d.getUTCDay()
  const diff = (day + 6) % 7
  d.setUTCDate(d.getUTCDate() - diff)
  return d
}

function bucketKey(date: Date, bucket: 'day' | 'week'): string {
  return toDateStr(bucket === 'week' ? startOfWeek(date) : startOfDay(date))
}

function eachBucketInRange(range: DateRange, bucket: 'day' | 'week'): string[] {
  const keys: string[] = []
  const seen = new Set<string>()
  const step = bucket === 'week' ? 7 : 1
  const cur = startOfDay(range.from)
  const end = startOfDay(range.to)
  while (cur <= end) {
    const key = bucketKey(cur, bucket)
    if (!seen.has(key)) {
      seen.add(key)
      keys.push(key)
    }
    cur.setUTCDate(cur.getUTCDate() + step)
  }
  return keys
}

export function computeThroughput(
  notes: Note[],
  range: DateRange,
  bucket: 'day' | 'week'
): Array<{ date: string; count: number }> {
  const counts = new Map<string, number>()
  const buckets = eachBucketInRange(range, bucket)
  for (const k of buckets) counts.set(k, 0)

  for (const note of notes) {
    const d = resolveCompleted(note)
    if (!d || isNaN(d.getTime())) continue
    if (d < range.from || d > range.to) continue
    const key = bucketKey(d, bucket)
    if (counts.has(key)) counts.set(key, (counts.get(key) ?? 0) + 1)
  }

  return buckets.map((date) => ({ date, count: counts.get(date) ?? 0 }))
}

type CfdRow = {
  date: string
  backlog: number
  planned: number
  'in-progress': number
  review: number
  done: number
}

export function buildCfd(notes: Note[], range: DateRange, bucket: 'day' | 'week'): CfdRow[] {
  const buckets = eachBucketInRange(range, bucket)
  return buckets.map((dateStr) => {
    const t = new Date(dateStr + 'T00:00:00Z')
    const row: CfdRow = { date: dateStr, backlog: 0, planned: 0, 'in-progress': 0, review: 0, done: 0 }
    for (const note of notes) {
      if (!note.created) continue
      const created = new Date(note.created)
      if (isNaN(created.getTime()) || t < created) continue

      const completed = resolveCompleted(note)
      const started = note.started ? new Date(note.started) : null

      if (completed && !isNaN(completed.getTime()) && t >= completed) {
        row['done']++
      } else if (started && !isNaN(started.getTime()) && t >= started) {
        row['in-progress']++
      } else {
        row['backlog']++
      }
    }
    return row
  })
}

export function getStayColor(
  days: number,
  warn: { yellow: number; red: number }
): 'default' | 'yellow' | 'red' {
  if (days >= warn.red) return 'red'
  if (days >= warn.yellow) return 'yellow'
  return 'default'
}
