import { cva, type VariantProps } from 'class-variance-authority'

export const buttonVariants = cva(
  'inline-flex items-center justify-center rounded-md text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:pointer-events-none disabled:opacity-50',
  {
    variants: {
      variant: {
        default:
          'bg-foreground text-background hover:bg-foreground/90 dark:bg-foreground dark:text-background',
        outline:
          'border border-input bg-background hover:bg-muted hover:text-foreground dark:bg-background dark:hover:bg-muted',
        ghost: 'hover:bg-muted hover:text-foreground dark:hover:bg-muted'
      },
      size: {
        default: 'h-10 px-4 py-2',
        sm: 'h-9 px-3',
        lg: 'h-11 px-6'
      }
    },
    defaultVariants: {
      variant: 'default',
      size: 'default'
    }
  }
)

export type ButtonVariantProps = VariantProps<typeof buttonVariants>
