import * as React from 'react';
import { cva, type VariantProps } from 'class-variance-authority';
import { cn } from '~/lib/utils';

const badgeVariants = cva(
  'inline-flex items-center rounded-md border px-2 py-0.5 text-xs font-medium transition-colors',
  {
    variants: {
      variant: {
        default: 'border-transparent bg-primary text-primary-foreground',
        secondary: 'border-transparent bg-secondary text-secondary-foreground',
        destructive: 'border-transparent bg-destructive text-destructive-foreground',
        outline: 'text-foreground',
        // Soft tonal — Button 과 동일 토큰(tailwind.css). 무테두리 + 틴트배경 + 같은 hue 텍스트.
        blue: 'border-transparent bg-[var(--tonal-blue-bg)] text-[var(--tonal-blue-fg)]',
        amber: 'border-transparent bg-[var(--tonal-amber-bg)] text-[var(--tonal-amber-fg)]',
        violet: 'border-transparent bg-[var(--tonal-violet-bg)] text-[var(--tonal-violet-fg)]',
        green: 'border-transparent bg-[var(--tonal-green-bg)] text-[var(--tonal-green-fg)]',
        red: 'border-transparent bg-[var(--tonal-red-bg)] text-[var(--tonal-red-fg)]',
        teal: 'border-transparent bg-[var(--tonal-teal-bg)] text-[var(--tonal-teal-fg)]',
      },
    },
    defaultVariants: { variant: 'default' },
  },
);

interface BadgeProps
  extends React.HTMLAttributes<HTMLSpanElement>,
    VariantProps<typeof badgeVariants> {}

export const Badge = ({ className, variant, ...props }: BadgeProps) => (
  <span className={cn(badgeVariants({ variant }), className)} {...props} />
);
