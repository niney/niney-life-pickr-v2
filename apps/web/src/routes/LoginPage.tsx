import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Button,
  Divider,
  ErrorBanner,
  Input,
  Screen,
  SegmentedControl,
  Stack,
  Text,
  useAuthStore,
  useLogin,
  useRegister,
} from '@repo/shared';

type Mode = 'login' | 'register';

const modeOptions = [
  { value: 'login' as const, label: '로그인' },
  { value: 'register' as const, label: '회원가입' },
];

export const LoginPage = () => {
  const [mode, setMode] = useState<Mode>('login');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const login = useLogin();
  const register = useRegister();
  const enterGuest = useAuthStore((s) => s.enterGuest);
  const navigate = useNavigate();

  const mutation = mode === 'login' ? login : register;

  const submit = () => {
    mutation.mutate(
      { email, password },
      { onSuccess: () => navigate('/') },
    );
  };

  const onGuest = () => {
    enterGuest();
    navigate('/');
  };

  return (
    <Screen>
      <Stack gap="md" align="center">
        <Text variant="display" align="center">🎲</Text>
        <Text variant="h1" align="center">Life Pickr</Text>
        <Text variant="body" color="textMuted" align="center">
          고민될 땐, 대신 골라드릴게요
        </Text>
      </Stack>

      <Button variant="primary" size="lg" fullWidth onPress={onGuest}>
        바로 시작하기 →
      </Button>

      <Divider label="또는" />

      <SegmentedControl value={mode} options={modeOptions} onChange={setMode} />

      <Stack gap="md">
        <Input
          value={email}
          onChangeText={setEmail}
          placeholder="email"
          type="email"
        />
        <Input
          value={password}
          onChangeText={setPassword}
          placeholder={mode === 'register' ? 'password (8자 이상)' : 'password'}
          type="password"
          onSubmit={submit}
        />
        {mutation.isError && <ErrorBanner message={mutation.error.message} />}
        <Button
          variant="secondary"
          fullWidth
          loading={mutation.isPending}
          onPress={submit}
        >
          {mode === 'login' ? '로그인' : '가입하기'}
        </Button>
      </Stack>
    </Screen>
  );
};
