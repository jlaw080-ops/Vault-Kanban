import { AlertTriangle, CheckCircle2, Info, X } from 'lucide-react'
import { cn } from '../../lib/utils'
import { useViewStore, type ToastVariant } from '../../stores/viewStore'

const variantStyles: Record<ToastVariant, string> = {
  success:
    'border-success/40 bg-background text-foreground dark:border-success/40 dark:bg-background',
  error:
    'border-destructive/50 bg-background text-foreground dark:border-destructive/60 dark:bg-background',
  info: 'border-border bg-background text-foreground dark:border-border dark:bg-background'
}

const variantIcon: Record<ToastVariant, JSX.Element> = {
  success: <CheckCircle2 className="h-4 w-4 text-success" aria-hidden />,
  error: <AlertTriangle className="h-4 w-4 text-destructive" aria-hidden />,
  info: <Info className="h-4 w-4 text-muted-foreground" aria-hidden />
}

export function Toaster(): JSX.Element {
  const toasts = useViewStore((s) => s.toasts)
  const dismiss = useViewStore((s) => s.dismissToast)

  return (
    <div
      className="pointer-events-none fixed right-4 top-4 z-50 flex w-full max-w-sm flex-col gap-2"
      role="region"
      aria-label="알림"
    >
      {toasts.map((toast) => (
        <div
          key={toast.id}
          role={toast.variant === 'error' ? 'alert' : 'status'}
          className={cn(
            'pointer-events-auto flex items-start gap-2 rounded-md border px-3 py-2 text-sm shadow-sm',
            variantStyles[toast.variant]
          )}
        >
          <div className="mt-0.5 shrink-0">{variantIcon[toast.variant]}</div>
          <div className="flex-1 leading-snug">{toast.message}</div>
          <button
            type="button"
            onClick={() => dismiss(toast.id)}
            className="shrink-0 rounded-md p-1 text-muted-foreground hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            aria-label="알림 닫기"
          >
            <X className="h-3.5 w-3.5" />
          </button>
        </div>
      ))}
    </div>
  )
}
