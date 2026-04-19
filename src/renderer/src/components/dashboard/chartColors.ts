export const STATUS_COLORS = {
  백로그: '#94a3b8',
  예정: '#3b82f6',
  진행중: '#f59e0b',
  검토: '#8b5cf6',
  완료: '#10b981'
} as const

export type StatusKey = keyof typeof STATUS_COLORS
