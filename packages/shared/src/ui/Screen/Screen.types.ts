import type { ReactNode } from 'react';

export interface ScreenProps {
  centered?: boolean;
  maxWidth?: number;
  children: ReactNode;
}
