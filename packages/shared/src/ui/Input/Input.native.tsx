import { useState } from 'react';
import { TextInput, type KeyboardTypeOptions, type TextStyle } from 'react-native';
import { useTheme } from '../../design/ThemeProvider.js';
import type { InputProps, InputType } from './Input.types.js';

const keyboardMap: Record<InputType, KeyboardTypeOptions> = {
  text: 'default',
  email: 'email-address',
  password: 'default',
  number: 'numeric',
};

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

  const style: TextStyle = {
    fontSize: 16,
    paddingVertical: theme.space.md,
    paddingHorizontal: theme.space.md,
    borderRadius: theme.radius.md,
    borderWidth: 1,
    borderColor: focus ? theme.colors.primary : theme.colors.border,
    backgroundColor: theme.colors.surface,
    color: theme.colors.text,
    alignSelf: fullWidth ? 'stretch' : 'flex-start',
  };

  return (
    <TextInput
      value={value}
      onChangeText={onChangeText}
      onFocus={() => setFocus(true)}
      onBlur={() => setFocus(false)}
      onSubmitEditing={onSubmit}
      placeholder={placeholder}
      placeholderTextColor={theme.colors.textMuted}
      keyboardType={keyboardMap[type]}
      secureTextEntry={type === 'password'}
      autoCapitalize={type === 'email' ? 'none' : undefined}
      autoFocus={autoFocus}
      editable={!disabled}
      style={style}
    />
  );
};
