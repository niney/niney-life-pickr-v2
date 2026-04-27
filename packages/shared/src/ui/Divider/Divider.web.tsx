import { useTheme } from '../../design/ThemeProvider.js';
import type { DividerProps } from './Divider.types.js';

export const Divider = ({ label }: DividerProps) => {
  const theme = useTheme();
  if (!label) {
    return (
      <div
        style={{
          height: 1,
          backgroundColor: theme.colors.border,
          width: '100%',
        }}
      />
    );
  }
  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: theme.space.md,
        color: theme.colors.textMuted,
        fontSize: 14,
      }}
    >
      <div style={{ flex: 1, height: 1, backgroundColor: theme.colors.border }} />
      <span>{label}</span>
      <div style={{ flex: 1, height: 1, backgroundColor: theme.colors.border }} />
    </div>
  );
};
