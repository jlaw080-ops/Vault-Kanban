import { useMemo, useState } from 'react'
import { HelpCircle } from 'lucide-react'
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
    return { from: new Date('2026-01-01T00:00:00Z'), to }
  }
  const from = new Date(to)
  from.setDate(from.getDate() - period)
  return { from, to }
}

function SectionTitle({
  children,
  hint
}: {
  children: React.ReactNode
  hint?: string
}): JSX.Element {
  return (
    <h2 className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-2 flex items-center gap-1">
      {children}
      {hint && (
        <span className="relative group/hint">
          <HelpCircle className="w-3.5 h-3.5 text-muted-foreground/40 cursor-help hover:text-muted-foreground transition-colors" />
          <span className="absolute left-0 top-full mt-1.5 w-56 p-2 text-xs font-normal normal-case tracking-normal leading-relaxed text-foreground bg-popover border border-border rounded shadow-lg pointer-events-none opacity-0 group-hover/hint:opacity-100 transition-opacity duration-150 z-20 whitespace-normal">
            {hint}
          </span>
        </span>
      )}
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
    <div className="flex flex-col h-full overflow-hidden p-4 gap-4">
      <div className="flex items-center gap-2 flex-shrink-0">
        <span className="text-sm font-medium text-foreground">기간</span>
        <div className="flex gap-1">
          {PERIODS.map(({ label, value }) => (
            <button
              key={value}
              onClick={() => setPeriod(value)}
              className={`text-xs px-2.5 py-1 rounded-md transition-colors ${
                period === value
                  ? 'bg-accent text-accent-foreground'
                  : 'bg-muted text-muted-foreground hover:bg-muted/70 hover:text-foreground'
              }`}
            >
              {label}
            </button>
          ))}
        </div>
      </div>

      <div className="grid grid-cols-2 grid-rows-2 gap-4 flex-1 min-h-0">
        <div className="bg-card border border-border rounded-lg p-3 flex flex-col min-h-0">
          <SectionTitle hint="노트가 생성된 시점부터 완료될 때까지 걸린 총 시간입니다. 아이디어 발생부터 최종 완료까지 전체 흐름의 속도를 나타냅니다.">
            리드타임 (Lead Time)
          </SectionTitle>
          <div className="flex-1 min-h-0">
            <LeadTimeChart notes={filteredNotes} />
          </div>
        </div>

        <div className="bg-card border border-border rounded-lg p-3 flex flex-col min-h-0">
          <SectionTitle hint="작업이 실제로 시작(in-progress)된 시점부터 완료될 때까지 걸린 시간입니다. 순수한 작업 처리 속도를 나타냅니다.">
            사이클타임 (Cycle Time)
          </SectionTitle>
          <div className="flex-1 min-h-0">
            <CycleTimeChart notes={filteredNotes} />
          </div>
        </div>

        <div className="bg-card border border-border rounded-lg p-3 flex flex-col min-h-0">
          <SectionTitle hint="주 단위로 완료된 작업 수와 4주 이동평균을 함께 표시합니다. 생산성 추세와 처리 속도의 변화를 파악할 수 있습니다.">
            처리량 (Throughput)
          </SectionTitle>
          <div className="flex-1 min-h-0">
            <ThroughputChart notes={filteredNotes} range={range} />
          </div>
        </div>

        <div className="bg-card border border-border rounded-lg p-3 flex flex-col min-h-0">
          <SectionTitle hint="시간 흐름에 따라 각 상태별 작업 수를 누적 면적으로 표시합니다. 특정 상태에 작업이 쌓이면 병목이 발생한 것입니다.">
            누적 흐름도 (CFD)
          </SectionTitle>
          <div className="flex-1 min-h-0">
            <CfdChart notes={notes} range={range} />
          </div>
        </div>
      </div>
    </div>
  )
}
