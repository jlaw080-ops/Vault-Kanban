import { useState, useMemo } from 'react'
import { ChevronLeft, ChevronRight } from 'lucide-react'
import { cn } from '../../lib/utils'
import { useVaultStore } from '../../stores/vaultStore'
import type { Note } from '@renderer/types'

const WEEKDAYS = ['일', '월', '화', '수', '목', '금', '토']

function toYMD(date: Date): string {
  const y = date.getFullYear()
  const m = String(date.getMonth() + 1).padStart(2, '0')
  const d = String(date.getDate()).padStart(2, '0')
  return `${y}-${m}-${d}`
}

function isDailyNote(note: Note): boolean {
  const base = note.filePath.replace(/\\/g, '/').split('/').pop() ?? ''
  return /^\d{4}-\d{2}-\d{2}\.md$/.test(base)
}

function dateKey(note: Note): string {
  const base = note.filePath.replace(/\\/g, '/').split('/').pop() ?? ''
  return base.replace('.md', '')
}

export function DailyCalendar(): JSX.Element {
  const notes = useVaultStore((s) => s.notes)
  const openNote = useVaultStore((s) => s.openNote)

  const today = new Date()
  const [year, setYear] = useState(today.getFullYear())
  const [month, setMonth] = useState(today.getMonth())

  const dailyMap = useMemo(() => {
    const map = new Map<string, Note>()
    for (const note of notes) {
      if (isDailyNote(note)) {
        map.set(dateKey(note), note)
      }
    }
    return map
  }, [notes])

  function prevMonth(): void {
    if (month === 0) { setYear(y => y - 1); setMonth(11) }
    else setMonth(m => m - 1)
  }

  function nextMonth(): void {
    if (month === 11) { setYear(y => y + 1); setMonth(0) }
    else setMonth(m => m + 1)
  }

  const firstDay = new Date(year, month, 1)
  const daysInMonth = new Date(year, month + 1, 0).getDate()
  const startWeekday = firstDay.getDay()

  const cells: Array<{ day: number | null; key: string | null }> = []
  for (let i = 0; i < startWeekday; i++) cells.push({ day: null, key: null })
  for (let d = 1; d <= daysInMonth; d++) {
    const key = toYMD(new Date(year, month, d))
    cells.push({ day: d, key })
  }

  const todayKey = toYMD(today)
  const monthLabel = `${year}년 ${month + 1}월`

  return (
    <div className="flex flex-col h-[68vh] p-6 overflow-auto">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <h2 className="text-base font-bold text-foreground uppercase tracking-widest">
          Daily Notes
        </h2>
        <div className="flex items-center gap-3">
          <button
            onClick={prevMonth}
            className="p-1 rounded-full hover:bg-muted text-muted-foreground transition-colors"
          >
            <ChevronLeft size={16} />
          </button>
          <span className="text-sm font-medium text-foreground w-28 text-center">
            {monthLabel}
          </span>
          <button
            onClick={nextMonth}
            className="p-1 rounded-full hover:bg-muted text-muted-foreground transition-colors"
          >
            <ChevronRight size={16} />
          </button>
        </div>
      </div>

      {/* Weekday headers */}
      <div className="grid grid-cols-7 mb-1">
        {WEEKDAYS.map((wd, i) => (
          <div
            key={wd}
            className={cn(
              'text-center text-sm font-medium py-1',
              i === 0 ? 'text-destructive' : i === 6 ? 'text-accent' : 'text-foreground'
            )}
          >
            {wd}
          </div>
        ))}
      </div>

      {/* Calendar grid */}
      <div className="grid grid-cols-7 gap-1 flex-1 min-h-0" style={{ gridAutoRows: '1fr' }}>
        {cells.map((cell, idx) => {
          if (!cell.day || !cell.key) {
            return <div key={`empty-${idx}`} />
          }

          const note = dailyMap.get(cell.key)
          const isToday = cell.key === todayKey
          const weekday = (startWeekday + cell.day - 1) % 7
          const isSun = weekday === 0
          const isSat = weekday === 6

          return (
            <button
              key={cell.key}
              onClick={() => note && openNote(note)}
              disabled={!note}
              className={cn(
                'relative flex flex-col items-center justify-start pt-1.5 pb-2 rounded-md',
                'text-xs transition-colors',
                note
                  ? 'cursor-pointer hover:bg-muted'
                  : 'cursor-default opacity-40',
                isToday && 'ring-1 ring-accent',
                !isToday && isSun && 'text-destructive/80',
                !isToday && isSat && 'text-accent/80',
                !isToday && !isSun && !isSat && 'text-foreground'
              )}
            >
              <span
                className={cn(
                  'w-6 h-6 flex items-center justify-center rounded-full text-xs font-medium',
                  isToday && 'bg-accent text-accent-foreground font-bold'
                )}
              >
                {cell.day}
              </span>
              {note && (
                <span className="mt-1 w-1.5 h-1.5 rounded-full bg-accent" />
              )}
            </button>
          )
        })}
      </div>

      {/* Stats */}
      <div className="mt-6 pt-4 border-t border-border">
        <p className="text-xs text-muted-foreground">
          이번 달 {cells.filter(c => c.key && dailyMap.has(c.key)).length}개 / {daysInMonth}일
        </p>
      </div>
    </div>
  )
}
