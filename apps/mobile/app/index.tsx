import { Redirect } from 'expo-router';
import { useAuthStore } from '@repo/shared';

export default function Index() {
  const token = useAuthStore((s) => s.token);
  const isGuest = useAuthStore((s) => s.isGuest);
  return <Redirect href={token || isGuest ? '/(tabs)/home' : '/(auth)/login'} />;
}
