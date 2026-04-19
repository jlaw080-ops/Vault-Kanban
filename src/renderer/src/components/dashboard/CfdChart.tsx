import { useMemo } from 'react'
import { AreaChart, Area, XAxis, YAxis, Tooltip, ResponsiveContainer, Legend } from 'recharts'
import type { Note } from '@renderer/types'
import type { DateRange } from '../../lib/metrics'
import { buildCfd } from '../../lib/metrics'
import { STATUS_COLORS } from './chartColors'
import { EmptyState } from './EmptyState'

interface CfdChartProps {
  notes: Note[]
  range: DateRange
}

const STATUS_KEYS = ['백로그', '예정', '진행중', '검토', '완료'] as const

export function CfdChart({ notes, range }: CfdChartProps): JSX.Element {
  const data = useMemo(() => {
    if (notes.length < 5) return null
    return buildCfd(notes, range, 'day')
  }, [notes, range])

  if (!data) {
    return <EmptyState message="CFD를 표시하려면 최소 5개의 노트가 필요합니다." />
  }

  return (
    <div>
      <ResponsiveContainer width="100%" height={200}>
        <AreaChart data={data} margin={{ top: 8, right: 8, bottom: 0, left: 0 }}>
          <XAxis dataKey="date" tick={{ fontSize: 10 }} interval="preserveStartEnd" />
          <YAxis allowDecimals={false} tick={{ fontSize: 11 }} />
          <Tooltip />
          <Legend iconSize={10} wrapperStyle={{ fontSize: 11 }} />
          {STATUS_KEYS.map((key) => (
            <Area
              key={key}
              type="monotone"
              dataKey={key}
              stackId="1"
              stroke={STATUS_COLORS[key]}
              fill={STATUS_COLORS[key]}
              fillOpacity={0.7}
            />
          ))}
        </AreaChart>
      </ResponsiveContainer>
      <p className="text-xs text-slate-400 dark:text-slate-500 mt-1">
        ⚠️ 근사치: created/started/completed 3시점 기반. 중간 상태 이력은 반영되지 않습니다.
      </p>
    </div>
  )
}
