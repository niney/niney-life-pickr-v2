import {
  ActivityIndicator,
  Pressable,
  Text,
  type PressableStateCallbackType,
  type ViewStyle,
  type TextStyle,
} from 'react-native';
import { useTheme } from '../../design/ThemeProvider.js';
import type { ButtonProps, ButtonSize, ButtonVariant } from './Button.types.js';
import type { Theme } from '../../design/theme.js';

const sizeMap = (theme: Theme, size: ButtonSize) => {
  const fontSize = size === 'sm' ? 14 : size === 'lg' ? 17 : 16;
  const py = size === 'sm' ? theme.space.xs : size === 'lg' ? theme.space.md : theme.space.sm;
  const px = size === 'sm' ? theme.space.md : size === 'lg' ? theme.space.xl : theme.space.lg;
  return { fontSize, py, px };
};

const variantBg = (theme: Theme, variant: ButtonVariant, pressed: boolean): ViewStyle => {
  switch (variant) {
    case 'primary':
      return {
        backgroundColor: pressed ? theme.colors.primaryHover : theme.colors.primary,
        borderWidth: 0,
      };
    case 'secondary':
      return {
        backgroundColor: pressed ? theme.colors.surfaceAlt : 'transparent',
        borderWidth: 1,
        borderColor: theme.colors.border,
      };
    case 'ghost':
      return {
        backgroundColor: pressed ? theme.colors.surfaceAlt : 'transparent',
        borderWidth: 0,
      };
  }
};

const variantText = (theme: Theme, variant: ButtonVariant): TextStyle => ({
  color: variant === 'primary' ? theme.colors.primaryText : theme.colors.text,
});

export const Button = ({
  variant = 'primary',
  size = 'md',
  fullWidth,
  disabled,
  loading,
  onPress,
  children,
}: ButtonProps) => {
  const theme = useTheme();
  const { fontSize, py, px } = sizeMap(theme, size);
  const isDisabled = disabled || loading;

  return (
    <Pressable
      onPress={onPress}
      disabled={isDisabled}
      style={({ pressed }: PressableStateCallbackType): ViewStyle => ({
        ...variantBg(theme, variant, pressed && !isDisabled),
        paddingVertical: py,
        paddingHorizontal: px,
        borderRadius: theme.radius.md,
        alignSelf: fullWidth ? 'stretch' : 'flex-start',
        alignItems: 'center',
        justifyContent: 'center',
        opacity: isDisabled ? 0.6 : 1,
      })}
    >
      {loading ? (
        <ActivityIndicator color={variant === 'primary' ? theme.colors.primaryText : theme.colors.text} />
      ) : (
        <Text style={{ ...variantText(theme, variant), fontSize, fontWeight: '600' }}>
          {children}
        </Text>
      )}
    </Pressable>
  );
};
