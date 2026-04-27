import { create } from 'zustand';
import type { User } from '@repo/api-contract';

interface AuthState {
  user: User | null;
  token: string | null;
  isGuest: boolean;
  setSession: (user: User, token: string) => void;
  enterGuest: () => void;
  clearSession: () => void;
}

export const useAuthStore = create<AuthState>((set) => ({
  user: null,
  token: null,
  isGuest: false,
  setSession: (user, token) => set({ user, token, isGuest: false }),
  enterGuest: () => set({ user: null, token: null, isGuest: true }),
  clearSession: () => set({ user: null, token: null, isGuest: false }),
}));
