export type InputType = 'text' | 'email' | 'password' | 'number';

export interface InputProps {
  value: string;
  onChangeText: (value: string) => void;
  placeholder?: string;
  type?: InputType;
  autoFocus?: boolean;
  disabled?: boolean;
  fullWidth?: boolean;
  onSubmit?: () => void;
}
