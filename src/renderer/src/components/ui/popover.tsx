import { useEffect, useRef, type ReactNode } from 'react'
import { cn } from '../../lib/utils'

interface PopoverProps {
  open: boolean
  onClose: () => void
  trigger: ReactNode
  children: ReactNode
  className?: string
}

export function Popover({
  open,
  onClose,
  trigger,
  children,
  className
}: PopoverProps): JSX.Element {
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) return
    function handle(e: MouseEvent): void {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        onClose()
      }
    }
    document.addEventListener('mousedown', handle)
    return () => document.removeEventListener('mousedown', handle)
  }, [open, onClose])

  return (
    <div ref={ref} className="relative inline-block">
      {trigger}
      {open && (
        <div
          className={cn(
            'absolute top-full left-1/2 -translate-x-1/2 mt-1 z-50',
            'rounded-md border border-slate-200 dark:border-slate-700',
            'bg-white dark:bg-slate-900 shadow-md p-3',
            className
          )}
        >
          {children}
        </div>
      )}
    </div>
  )
}
