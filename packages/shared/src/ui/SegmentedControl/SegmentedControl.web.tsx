import type { CSSProperties } from 'react';
import { useTheme } from '../../design/ThemeProvider.js';
import type { SegmentedControlProps } from './SegmentedControl.types.js';

export const SegmentedControl = <T extends string>({
  value,
  options,
  onChange,
  fullWidth = true,
}: SegmentedControlProps<T>) => {
  const theme = useTheme();

  const wrapperStyle: CSSProperties = {
    display: 'grid',
    gridTemplateColumns: `repeat(${options.length}, 1fr)`,
    backgroundColor: theme.colors.surfaceAlt,
    borderRadius: theme.radius.md,
    padding: 4,
    gap: 4,
    width: fullWidth ? '100%' : undefined,
  };

  const itemStyle = (active: boolean): CSSProperties => ({
    backgroundColor: active ? theme.colors.surface : 'transparent',
    color: active ? theme.colors.text : theme.colors.textMuted,
    fontWeight: active ? 600 : 500,
    fontSize: 14,
    border: 'none',
    padding: `${theme.space.sm}px ${theme.space.md}px`,
    borderRadius: theme.radius.sm,
    cursor: 'pointer',
    boxShadow: active ? '0 1px 2px rgba(0,0,0,0.08)' : 'none',
    transition: 'all 150ms',
  });

  return (
    <div style={wrapperStyle}>
      {options.map((opt) => (
        <button
          key={opt.value}
          type="button"
          onClick={() => onChange(opt.value)}
          style={itemStyle(opt.value === value)}
          aria-selected={opt.value === value}
        >
          {opt.label}
        </button>
      ))}
    </div>
  );
};
