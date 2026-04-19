import { cva, type VariantProps } from 'class-variance-authority'

export const badgeVariants = cva(
  'inline-flex items-center rounded-md border px-2 py-0.5 text-xs font-medium transition-colors focus:outline-none focus:ring-2 focus:ring-ring',
  {
    variants: {
      variant: {
        default:
          'border-transparent bg-foreground text-background dark:bg-foreground dark:text-background',
        secondary:
          'border-transparent bg-muted text-muted-foreground dark:bg-muted dark:text-muted-foreground',
        outline: 'border-border text-foreground dark:text-foreground',
        destructive:
          'border-transparent bg-destructive text-destructive-foreground dark:bg-destructive dark:text-destructive-foreground',
        success:
          'border-transparent bg-success text-success-foreground dark:bg-success dark:text-success-foreground'
      }
    },
    defaultVariants: {
      variant: 'default'
    }
  }
)

export type BadgeVariantProps = VariantProps<typeof badgeVariants>
