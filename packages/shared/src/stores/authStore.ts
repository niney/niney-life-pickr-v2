import { create } from 'zustand';
import type { User } from '@repo/api-contract';

interface AuthState {
  user: User | null;
  token: string | null;
  setSession: (user: User, token: string) => void;
  clearSession: () => void;
}

export const useAuthStore = create<AuthState>((set) => ({
  user: null,
  token: null,
  setSession: (user, token) => set({ user, token }),
  clearSession: () => set({ user: null, token: null }),
}));
