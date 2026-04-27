import { useState, type CSSProperties } from 'react';
import { useTheme } from '../../design/ThemeProvider.js';
import type { ButtonProps, ButtonSize, ButtonVariant } from './Button.types.js';
import type { Theme } from '../../design/theme.js';

const sizeMap = (theme: Theme, size: ButtonSize) => {
  const fontSize = size === 'sm' ? 14 : size === 'lg' ? 17 : 16;
  const py = size === 'sm' ? theme.space.xs : size === 'lg' ? theme.space.md : theme.space.sm;
  const px = size === 'sm' ? theme.space.md : size === 'lg' ? theme.space.xl : theme.space.lg;
  return { fontSize, py, px };
};

const variantStyle = (
  theme: Theme,
  variant: ButtonVariant,
  hover: boolean,
): CSSProperties => {
  switch (variant) {
    case 'primary':
      return {
        backgroundColor: hover ? theme.colors.primaryHover : theme.colors.primary,
        color: theme.colors.primaryText,
        border: 'none',
      };
    case 'secondary':
      return {
        backgroundColor: hover ? theme.colors.surfaceAlt : 'transparent',
        color: theme.colors.text,
        border: `1px solid ${theme.colors.border}`,
      };
    case 'ghost':
      return {
        backgroundColor: hover ? theme.colors.surfaceAlt : 'transparent',
        color: theme.colors.text,
        border: 'none',
      };
  }
};

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
  const [hover, setHover] = useState(false);
  const { fontSize, py, px } = sizeMap(theme, size);
  const isDisabled = disabled || loading;

  const style: CSSProperties = {
    ...variantStyle(theme, variant, hover && !isDisabled),
    fontSize,
    fontWeight: 600,
    padding: `${py}px ${px}px`,
    borderRadius: theme.radius.md,
    width: fullWidth ? '100%' : undefined,
    cursor: isDisabled ? 'not-allowed' : 'pointer',
    opacity: isDisabled ? 0.6 : 1,
    transition: 'background-color 150ms, transform 150ms',
    transform: hover && !isDisabled ? 'translateY(-1px)' : undefined,
  };

  return (
    <button
      type="button"
      onClick={onPress}
      disabled={isDisabled}
      style={style}
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
    >
      {loading ? '…' : children}
    </button>
  );
};
