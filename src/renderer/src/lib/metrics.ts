import type { Note, ColumnConfig } from '@renderer/types'

const MS_PER_DAY = 1000 * 60 * 60 * 24

function daysDiff(fromMs: number, toDate: Date): number {
  return Math.max(0, Math.floor((toDate.getTime() - fromMs) / MS_PER_DAY))
}

export function getStayDays(note: Note, column: ColumnConfig, now: Date): number {
  const colName = column.name

  if (colName === '백로그' || colName === '예정') {
    return daysDiff(new Date(note.created).getTime(), now)
  }

  if (colName === '진행중') {
    if (note.started) {
      return daysDiff(new Date(note.started).getTime(), now)
    }
    return daysDiff(note.mtime, now)
  }

  // 검토, 완료: mtime 기준
  return daysDiff(note.mtime, now)
}

export function getStayColor(
  days: number,
  warn: { yellow: number; red: number }
): 'default' | 'yellow' | 'red' {
  if (days >= warn.red) return 'red'
  if (days >= warn.yellow) return 'yellow'
  return 'default'
}
