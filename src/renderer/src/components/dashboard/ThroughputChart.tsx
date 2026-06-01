import { useMemo } from 'react'
import {
  ComposedChart,
  Bar,
  Line,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  Legend
} from 'recharts'
import type { Note } from '@renderer/types'
import type { DateRange } from '../../lib/metrics'
import { computeThroughput } from '../../lib/metrics'
import { EmptyState } from './EmptyState'

interface ThroughputChartProps {
  notes: Note[]
  range: DateRange
}

export function ThroughputChart({ notes, range }: ThroughputChartProps): JSX.Element {
  const data = useMemo(() => {
    const rows = computeThroughput(notes, range, 'week')
    const total = rows.reduce((s, r) => s + r.count, 0)
    if (total === 0) return null

    const MA_WINDOW = 4
    return rows.map((row, i) => {
      const slice = rows.slice(Math.max(0, i - MA_WINDOW + 1), i + 1)
      const ma = slice.reduce((s, r) => s + r.count, 0) / slice.length
      return { ...row, ma: Math.round(ma * 10) / 10 }
    })
  }, [notes, range])

  if (!data) {
    return <EmptyState message="선택 기간 내 완료 데이터가 없습니다." />
  }

  return (
    <ResponsiveContainer width="100%" height="100%">
      <ComposedChart data={data} margin={{ top: 8, right: 8, bottom: 0, left: 0 }}>
        <XAxis dataKey="date" tick={{ fontSize: 11, fill: '#b3b3b3' }} />
        <YAxis allowDecimals={false} tick={{ fontSize: 11, fill: '#b3b3b3' }} />
        <Tooltip
          contentStyle={{ backgroundColor: '#1f1f1f', border: '1px solid #282828', borderRadius: '4px', fontSize: 11 }}
          labelStyle={{ color: '#ffffff', fontWeight: 500 }}
          itemStyle={{ color: '#b3b3b3' }}
        />
        <Legend iconSize={10} wrapperStyle={{ fontSize: 11, color: '#b3b3b3' }} />
        <Bar dataKey="count" fill="#1ed760" name="주별 완료" radius={[2, 2, 0, 0]} />
        <Line
          dataKey="ma"
          stroke="#f59e0b"
          dot={false}
          strokeWidth={2}
          name="이동평균"
          type="monotone"
        />
      </ComposedChart>
    </ResponsiveContainer>
  )
}
