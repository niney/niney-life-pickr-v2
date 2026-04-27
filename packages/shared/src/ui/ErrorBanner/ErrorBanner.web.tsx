import { useTheme } from '../../design/ThemeProvider.js';
import type { ErrorBannerProps } from './ErrorBanner.types.js';

export const ErrorBanner = ({ message }: ErrorBannerProps) => {
  const theme = useTheme();
  return (
    <div
      role="alert"
      style={{
        backgroundColor: theme.colors.dangerBg,
        color: theme.colors.danger,
        padding: theme.space.md,
        borderRadius: theme.radius.md,
        borderLeft: `4px solid ${theme.colors.danger}`,
        fontSize: 14,
      }}
    >
      {message}
    </div>
  );
};
