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

const STATUS_KEYS = ['backlog', 'planned', 'in-progress', 'review', 'done'] as const

export function CfdChart({ notes, range }: CfdChartProps): JSX.Element {
  const data = useMemo(() => {
    if (notes.length < 5) return null
    return buildCfd(notes, range, 'day')
  }, [notes, range])

  if (!data) {
    return <EmptyState message="CFD를 표시하려면 최소 5개의 노트가 필요합니다." />
  }

  return (
    <div className="flex flex-col h-full">
      <div className="flex-1 min-h-0">
        <ResponsiveContainer width="100%" height="100%">
          <AreaChart data={data} margin={{ top: 8, right: 8, bottom: 0, left: 0 }}>
            <XAxis dataKey="date" tick={{ fontSize: 10, fill: '#b3b3b3' }} interval="preserveStartEnd" />
            <YAxis allowDecimals={false} tick={{ fontSize: 11, fill: '#b3b3b3' }} />
            <Tooltip
              contentStyle={{ backgroundColor: '#1f1f1f', border: '1px solid #282828', borderRadius: '4px', fontSize: 11 }}
              labelStyle={{ color: '#ffffff', fontWeight: 500 }}
              itemStyle={{ color: '#b3b3b3' }}
            />
            <Legend iconSize={10} wrapperStyle={{ fontSize: 11, color: '#b3b3b3' }} />
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
      </div>
      <p className="text-xs text-slate-400 dark:text-slate-500 mt-1 flex-shrink-0">
        ⚠️ 근사치: created/started/completed 3시점 기반. 중간 상태 이력은 반영되지 않습니다.
      </p>
    </div>
  )
}
