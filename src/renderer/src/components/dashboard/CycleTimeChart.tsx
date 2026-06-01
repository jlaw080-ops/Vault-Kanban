import { useMemo } from 'react'
import { BarChart, Bar, XAxis, YAxis, Tooltip, ReferenceLine, ResponsiveContainer } from 'recharts'
import type { Note } from '@renderer/types'
import { computeCycleTime } from '../../lib/metrics'
import { EmptyState } from './EmptyState'

interface CycleTimeChartProps {
  notes: Note[]
}

export function CycleTimeChart({ notes }: CycleTimeChartProps): JSX.Element {
  const data = useMemo(() => {
    const times = notes.map((n) => computeCycleTime(n)).filter((v): v is number => v !== undefined)

    if (times.length < 3) return null

    const counts = new Map<number, number>()
    for (const t of times) counts.set(t, (counts.get(t) ?? 0) + 1)
    const avg = times.reduce((a, b) => a + b, 0) / times.length
    const sorted = [...times].sort((a, b) => a - b)
    const median = sorted[Math.floor(sorted.length / 2)]

    return {
      rows: Array.from(counts.entries())
        .sort((a, b) => a[0] - b[0])
        .map(([days, count]) => ({ days: `${days}일`, count })),
      avg,
      median
    }
  }, [notes])

  if (!data) {
    return (
      <EmptyState message="완료 데이터가 아직 부족합니다. 최소 3개의 완료 노트가 필요합니다." />
    )
  }

  return (
    <ResponsiveContainer width="100%" height="100%">
      <BarChart data={data.rows} margin={{ top: 8, right: 8, bottom: 0, left: 0 }}>
        <XAxis dataKey="days" tick={{ fontSize: 11, fill: '#b3b3b3' }} />
        <YAxis allowDecimals={false} tick={{ fontSize: 11, fill: '#b3b3b3' }} />
        <Tooltip
          contentStyle={{ backgroundColor: '#1f1f1f', border: '1px solid #282828', borderRadius: '4px', fontSize: 11 }}
          labelStyle={{ color: '#ffffff', fontWeight: 500 }}
          itemStyle={{ color: '#b3b3b3' }}
        />
        <Bar dataKey="count" fill="#a78bfa" name="건수" radius={[2, 2, 0, 0]} />
        <ReferenceLine
          x={`${data.median}일`}
          stroke="#34d399"
          strokeDasharray="3 3"
          label={(props: { viewBox?: { x?: number; y?: number } }) => (
            <text x={(props.viewBox?.x ?? 0) + 4} y={(props.viewBox?.y ?? 0) + 14} fontSize={10} fill="#34d399">
              중앙값 {data.median}일
            </text>
          )}
        />
        <ReferenceLine
          x={`${Math.round(data.avg)}일`}
          stroke="#f59e0b"
          strokeDasharray="3 3"
          label={(props: { viewBox?: { x?: number; y?: number } }) => (
            <text x={(props.viewBox?.x ?? 0) + 4} y={(props.viewBox?.y ?? 0) + 30} fontSize={10} fill="#f59e0b">
              평균 {data.avg.toFixed(1)}일
            </text>
          )}
        />
      </BarChart>
    </ResponsiveContainer>
  )
}
