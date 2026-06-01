export const STATUS_COLORS = {
  backlog: '#6b7280',
  planned: '#60a5fa',
  'in-progress': '#fbbf24',
  review: '#a78bfa',
  done: '#1ed760'
} as const

export type StatusKey = keyof typeof STATUS_COLORS
