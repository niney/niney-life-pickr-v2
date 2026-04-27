import {
  KeyboardAvoidingView,
  Platform,
  SafeAreaView,
  ScrollView,
  View,
  type ViewStyle,
} from 'react-native';
import { useTheme } from '../../design/ThemeProvider.js';
import type { ScreenProps } from './Screen.types.js';

export const Screen = ({ centered = true, maxWidth, children }: ScreenProps) => {
  const theme = useTheme();
  const safeStyle: ViewStyle = {
    flex: 1,
    backgroundColor: theme.colors.bg,
  };
  const scrollContent: ViewStyle = {
    flexGrow: 1,
    justifyContent: centered ? 'center' : 'flex-start',
    alignItems: 'center',
    padding: theme.space.lg,
  };
  const inner: ViewStyle = {
    width: '100%',
    maxWidth,
    flexDirection: 'column',
    gap: theme.space.lg,
  };
  return (
    <SafeAreaView style={safeStyle}>
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        style={{ flex: 1 }}
      >
        <ScrollView
          contentContainerStyle={scrollContent}
          keyboardShouldPersistTaps="handled"
        >
          <View style={inner}>{children}</View>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
};
