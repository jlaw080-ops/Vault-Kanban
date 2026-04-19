import { useMemo, useState } from 'react'
import type { Note } from '@renderer/types'
import type { DateRange } from '../../lib/metrics'
import { LeadTimeChart } from './LeadTimeChart'
import { CycleTimeChart } from './CycleTimeChart'
import { ThroughputChart } from './ThroughputChart'
import { CfdChart } from './CfdChart'

interface DashboardProps {
  notes: Note[]
}

type Period = 7 | 30 | 90 | 'all'

const PERIODS: { label: string; value: Period }[] = [
  { label: '7일', value: 7 },
  { label: '30일', value: 30 },
  { label: '90일', value: 90 },
  { label: '전체', value: 'all' }
]

function toRange(period: Period): DateRange {
  const to = new Date()
  if (period === 'all') {
    return { from: new Date('2000-01-01T00:00:00Z'), to }
  }
  const from = new Date(to)
  from.setDate(from.getDate() - period)
  return { from, to }
}

function SectionTitle({ children }: { children: React.ReactNode }): JSX.Element {
  return (
    <h2 className="text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wide mb-2">
      {children}
    </h2>
  )
}

export function Dashboard({ notes }: DashboardProps): JSX.Element {
  const [period, setPeriod] = useState<Period>(30)
  const range = useMemo(() => toRange(period), [period])

  const filteredNotes = useMemo(() => {
    if (period === 'all') return notes
    return notes.filter((n) => {
      if (!n.completed) return true
      const d = new Date(n.completed)
      return !isNaN(d.getTime()) && d >= range.from
    })
  }, [notes, period, range])

  return (
    <div className="flex flex-col h-full overflow-y-auto p-4 gap-4">
      <div className="flex items-center gap-2">
        <span className="text-sm font-medium text-slate-700 dark:text-slate-300">기간</span>
        <div className="flex gap-1">
          {PERIODS.map(({ label, value }) => (
            <button
              key={value}
              onClick={() => setPeriod(value)}
              className={`text-xs px-2.5 py-1 rounded-md ${
                period === value
                  ? 'bg-slate-800 dark:bg-slate-100 text-white dark:text-slate-900'
                  : 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400 hover:bg-slate-200 dark:hover:bg-slate-700'
              }`}
            >
              {label}
            </button>
          ))}
        </div>
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-lg p-3">
          <SectionTitle>리드타임 (Lead Time)</SectionTitle>
          <LeadTimeChart notes={filteredNotes} />
        </div>

        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-lg p-3">
          <SectionTitle>사이클타임 (Cycle Time)</SectionTitle>
          <CycleTimeChart notes={filteredNotes} />
        </div>

        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-lg p-3">
          <SectionTitle>처리량 (Throughput)</SectionTitle>
          <ThroughputChart notes={filteredNotes} range={range} />
        </div>

        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-lg p-3">
          <SectionTitle>누적 흐름도 (CFD)</SectionTitle>
          <CfdChart notes={notes} range={range} />
        </div>
      </div>
    </div>
  )
}
