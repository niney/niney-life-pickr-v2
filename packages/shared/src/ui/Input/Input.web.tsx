import { useState, type CSSProperties, type KeyboardEvent } from 'react';
import { useTheme } from '../../design/ThemeProvider.js';
import type { InputProps } from './Input.types.js';

export const Input = ({
  value,
  onChangeText,
  placeholder,
  type = 'text',
  autoFocus,
  disabled,
  fullWidth = true,
  onSubmit,
}: InputProps) => {
  const theme = useTheme();
  const [focus, setFocus] = useState(false);

  const style: CSSProperties = {
    fontSize: 16,
    padding: `${theme.space.md}px ${theme.space.md}px`,
    borderRadius: theme.radius.md,
    border: `1px solid ${focus ? theme.colors.primary : theme.colors.border}`,
    backgroundColor: theme.colors.surface,
    color: theme.colors.text,
    outline: 'none',
    width: fullWidth ? '100%' : undefined,
    boxShadow: focus ? `0 0 0 3px ${theme.colors.primary}33` : undefined,
    transition: 'border-color 150ms, box-shadow 150ms',
    boxSizing: 'border-box',
  };

  const onKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter' && onSubmit) {
      e.preventDefault();
      onSubmit();
    }
  };

  return (
    <input
      value={value}
      onChange={(e) => onChangeText(e.target.value)}
      onFocus={() => setFocus(true)}
      onBlur={() => setFocus(false)}
      onKeyDown={onKeyDown}
      placeholder={placeholder}
      type={type}
      autoFocus={autoFocus}
      disabled={disabled}
      style={style}
    />
  );
};
