import * as React from 'react';
import { cn } from '~/lib/utils';

export const Input = React.forwardRef<HTMLInputElement, React.InputHTMLAttributes<HTMLInputElement>>(
  ({ className, type, ...props }, ref) => (
    <input
      ref={ref}
      type={type}
      className={cn(
        // iOS Safari 는 focus 된 input 의 font-size 가 16px 미만이면 자동 줌인
        // 한다. 모바일에서는 text-base(16px), sm+ 에서는 text-sm(14px) 로 분기.
        'flex h-9 w-full min-w-0 rounded-md border border-input bg-background px-3 py-1 text-base shadow-xs transition-colors sm:text-sm',
        'placeholder:text-muted-foreground',
        'focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50 focus-visible:border-ring',
        'disabled:cursor-not-allowed disabled:opacity-50',
        'aria-invalid:border-destructive aria-invalid:ring-destructive/20',
        'file:border-0 file:bg-transparent file:text-sm file:font-medium',
        className,
      )}
      {...props}
    />
  ),
);
Input.displayName = 'Input';
