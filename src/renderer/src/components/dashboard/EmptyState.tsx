interface EmptyStateProps {
  message?: string
}

export function EmptyState({
  message = '완료 데이터가 아직 부족합니다.'
}: EmptyStateProps): JSX.Element {
  return (
    <div className="flex items-center justify-center h-40 text-sm text-slate-400 dark:text-slate-500">
      {message}
    </div>
  )
}
