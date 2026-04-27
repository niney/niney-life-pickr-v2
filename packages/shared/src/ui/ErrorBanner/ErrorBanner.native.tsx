import { Text, View } from 'react-native';
import { useTheme } from '../../design/ThemeProvider.js';
import type { ErrorBannerProps } from './ErrorBanner.types.js';

export const ErrorBanner = ({ message }: ErrorBannerProps) => {
  const theme = useTheme();
  return (
    <View
      style={{
        backgroundColor: theme.colors.dangerBg,
        padding: theme.space.md,
        borderRadius: theme.radius.md,
        borderLeftWidth: 4,
        borderLeftColor: theme.colors.danger,
        alignSelf: 'stretch',
      }}
    >
      <Text style={{ color: theme.colors.danger, fontSize: 14 }}>{message}</Text>
    </View>
  );
};
