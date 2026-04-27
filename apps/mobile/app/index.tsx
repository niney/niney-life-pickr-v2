import { Redirect } from 'expo-router';
import { useAuthStore } from '@repo/shared';

export default function Index() {
  const token = useAuthStore((s) => s.token);
  return <Redirect href={token ? '/(tabs)/home' : '/(auth)/login'} />;
}
